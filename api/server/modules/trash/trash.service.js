import { allowedAccessLevels, authorizedCategoryIds, assertCategoryAccess, assertSubtreeAccess, collectionWhere, contentWhere, resolveActor } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'
import { DomainError, notFound } from '../../lib/errors.js'
import { createCategoryService } from '../categories/category.service.js'
import { createDataService } from '../data/data.service.js'
import { createDocumentService } from '../documents/document.service.js'

export const TRASH_RETENTION_DAYS = 30
const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

function autoDeleteAt(archivedAt) {
  return new Date(new Date(archivedAt).getTime() + retentionMs)
}

function categoryPath(byId, categoryId, includeSelf = true) {
  const names = []
  const seen = new Set()
  let cursor = includeSelf ? byId.get(categoryId) : byId.get(byId.get(categoryId)?.parentId)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    names.unshift(cursor.name)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null
  }
  return names.length ? `Home / ${names.join(' / ')}` : 'Home'
}

function hasArchivedAncestor(byId, category) {
  const seen = new Set()
  let cursor = category.parentId ? byId.get(category.parentId) : null
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.archivedAt) return true
    seen.add(cursor.id)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null
  }
  return false
}

async function categorySubtree(prisma, id) {
  const root = await prisma.category.findUnique({ where: { id } })
  if (!root) throw notFound('Category')
  const rows = [root]
  const seen = new Set([root.id])
  let frontier = [id]
  while (frontier.length) {
    const children = (await prisma.category.findMany({ where: { parentId: { in: frontier } } })).filter(item => !seen.has(item.id))
    children.forEach(item => seen.add(item.id))
    rows.push(...children)
    frontier = children.map(item => item.id)
  }
  return rows
}

async function deleteStoredObjects(storage, keys) {
  for (const key of new Set(keys.filter(Boolean))) await storage.deleteObject(key)
}

export function createTrashService(prisma, storage) {
  const categories = createCategoryService(prisma)
  const data = createDataService(prisma)
  const documents = createDocumentService(prisma, storage)

  async function list(actor) {
    const ids = actor ? await authorizedCategoryIds(prisma, actor, { includeArchived: true }) : null
    const categoryScope = ids ? { id: { in: ids } } : {}
    const datasetScope = actor ? await collectionWhere(prisma, actor, true) : {}
    const documentScope = actor ? await contentWhere(prisma, actor, 'document', true) : {}
    const [categoryRows, collectionRows, documentRows] = await Promise.all([
      prisma.category.findMany({ where: categoryScope, select: { mainSlot: true, id: true, name: true, parentId: true, archivedAt: true, updatedAt: true } }),
      prisma.dataCollection.findMany({ where: { ...datasetScope, archivedAt: { not: null } }, select: { id: true, name: true, categoryId: true, archivedAt: true, updatedAt: true, _count: { select: { records: actor ? { where: { accessLevel: { in: allowedAccessLevels(actor) } } } : true } } } }),
      prisma.document.findMany({ where: { ...documentScope, archivedAt: { not: null } }, select: { id: true, title: true, categoryId: true, archivedAt: true, updatedAt: true, fileSize: true, mimeType: true } }),
    ])
    const byId = new Map(categoryRows.map(item => [item.id, item]))
    const items = []
    for (const category of categoryRows) {
      if (!category.parentId || category.mainSlot || !category.archivedAt || hasArchivedAncestor(byId, category)) continue
      items.push({ id: category.id, itemType: 'FOLDER', name: category.name, typeLabel: 'Folder', originalLocation: categoryPath(byId, category.id, false), archivedAt: category.archivedAt, autoDeleteAt: autoDeleteAt(category.archivedAt) })
    }
    for (const collection of collectionRows) {
      const category = byId.get(collection.categoryId)
      if (!category || category.archivedAt || hasArchivedAncestor(byId, category)) continue
      items.push({ id: collection.id, itemType: 'DATA', name: collection.name, typeLabel: 'Structured Data', originalLocation: categoryPath(byId, collection.categoryId), archivedAt: collection.archivedAt, autoDeleteAt: autoDeleteAt(collection.archivedAt), recordCount: collection._count.records })
    }
    for (const document of documentRows) {
      const category = byId.get(document.categoryId)
      if (!category || category.archivedAt || hasArchivedAncestor(byId, category)) continue
      items.push({ id: document.id, itemType: 'DOCUMENT', name: document.title, typeLabel: document.mimeType === 'application/pdf' ? 'PDF' : 'JPG', originalLocation: categoryPath(byId, document.categoryId), archivedAt: document.archivedAt, autoDeleteAt: autoDeleteAt(document.archivedAt), fileSize: document.fileSize })
    }
    return items.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime())
  }

  async function restore(type, id, actorId) {
    if (type === 'folder') return categories.restore(id, actorId)
    if (type === 'data') return data.restoreCollection(id, actorId)
    if (type === 'document') return documents.restore(id, actorId)
    throw new DomainError(422, 'INVALID_TRASH_TYPE', 'Unsupported trash item type')
  }

  async function purgeCollection(id, actorId, force) {
    const collection = await prisma.dataCollection.findUnique({ where: { id } })
    if (actorId) {
      const actor = await resolveActor(prisma, actorId)
      if (!await prisma.dataCollection.findFirst({ where: { id, ...await collectionWhere(prisma, actor, true) } })) throw notFound('Content')
      const levels = allowedAccessLevels(actor)
      const denied = await Promise.all([prisma.dataRecord.count({ where: { dataCollectionId: id, accessLevel: { notIn: levels } } }), prisma.dashboardWidget.count({ where: { dataCollectionId: id, accessLevel: { notIn: levels } } }), prisma.importJob.count({ where: { dataCollectionId: id, OR: [{ accessLevel: null }, { accessLevel: { notIn: levels } }] } })])
      if (denied.some(Boolean)) throw new DomainError(403, 'FORBIDDEN', 'The dataset includes content outside your clearance')
    }
    if (!collection || !collection.archivedAt) throw notFound('Deleted structured data')
    if (!force && autoDeleteAt(collection.archivedAt) > new Date()) throw new DomainError(409, 'RETENTION_ACTIVE', 'This item is still inside its 30 day retention period')
    const imports = await prisma.importJob.findMany({ where: { dataCollectionId: id }, select: { storageKey: true } })
    await deleteStoredObjects(storage, imports.map(item => item.storageKey))
    await prisma.$transaction(async tx => {
      await tx.dashboardWidget.deleteMany({ where: { dataCollectionId: id } })
      await tx.dataRecord.deleteMany({ where: { dataCollectionId: id } })
      await tx.importJob.deleteMany({ where: { dataCollectionId: id } })
      await tx.dataField.deleteMany({ where: { dataCollectionId: id } })
      await tx.dataCollection.delete({ where: { id } })
      await createAuditService(tx).record({ actorId, action: 'DATA_COLLECTION_PURGED', entityType: 'DataCollection', entityId: id, before: collection, metadata: { automatic: !force } })
    })
    return { id, itemType: 'DATA' }
  }

  async function purgeDocument(id, actorId, force) {
    const document = await prisma.document.findUnique({ where: { id } })
    if (actorId) { const actor = await resolveActor(prisma, actorId); if (!await prisma.document.findFirst({ where: { id, ...await contentWhere(prisma, actor, 'document', true) } })) throw notFound('Content') }
    if (!document || !document.archivedAt) throw notFound('Deleted document')
    if (!force && autoDeleteAt(document.archivedAt) > new Date()) throw new DomainError(409, 'RETENTION_ACTIVE', 'This item is still inside its 30 day retention period')
    await deleteStoredObjects(storage, [document.storageKey])
    await prisma.$transaction(async tx => {
      await tx.document.delete({ where: { id } })
      await createAuditService(tx).record({ actorId, action: 'DOCUMENT_PURGED', entityType: 'Document', entityId: id, before: document, metadata: { automatic: !force } })
    })
    return { id, itemType: 'DOCUMENT' }
  }

  async function purgeFolder(id, actorId, force) {
    const subtree = await categorySubtree(prisma, id)
    const root = subtree[0]
    if (!root.parentId || root.mainSlot) throw new DomainError(409, 'PROTECTED_ROOTS', 'Main folders cannot be purged')
    if (actorId) { const actor = await resolveActor(prisma, actorId); await assertCategoryAccess(prisma, actor, id, { includeArchived: true }); await assertSubtreeAccess(prisma, actor, subtree.map(row => row.id)) }
    if (!root.archivedAt) throw notFound('Deleted folder')
    if (!force && autoDeleteAt(root.archivedAt) > new Date()) throw new DomainError(409, 'RETENTION_ACTIVE', 'This item is still inside its 30 day retention period')
    const ids = subtree.map(item => item.id)
    const collections = await prisma.dataCollection.findMany({ where: { categoryId: { in: ids } }, select: { id: true } })
    const collectionIds = collections.map(item => item.id)
    const [storedDocuments, storedImports] = await Promise.all([
      prisma.document.findMany({ where: { categoryId: { in: ids } }, select: { storageKey: true } }),
      prisma.importJob.findMany({ where: { categoryId: { in: ids } }, select: { storageKey: true } }),
    ])
    await deleteStoredObjects(storage, [...storedDocuments, ...storedImports].map(item => item.storageKey))
    await prisma.$transaction(async tx => {
      await tx.dashboardWidget.deleteMany({ where: { dataCollectionId: { in: collectionIds } } })
      await tx.dataRecord.deleteMany({ where: { categoryId: { in: ids } } })
      await tx.document.deleteMany({ where: { categoryId: { in: ids } } })
      await tx.importJob.deleteMany({ where: { categoryId: { in: ids } } })
      await tx.dataField.deleteMany({ where: { dataCollectionId: { in: collectionIds } } })
      await tx.dataCollection.deleteMany({ where: { id: { in: collectionIds } } })
      for (const category of [...subtree].reverse()) await tx.category.delete({ where: { id: category.id } })
      await createAuditService(tx).record({ actorId, action: 'CATEGORY_PURGED', entityType: 'Category', entityId: id, before: root, metadata: { automatic: !force, subtreeCategories: ids.length } })
    })
    return { id, itemType: 'FOLDER' }
  }

  async function purge(type, id, actorId, { force = false } = {}) {
    if (type === 'folder') return purgeFolder(id, actorId, force)
    if (type === 'data') return purgeCollection(id, actorId, force)
    if (type === 'document') return purgeDocument(id, actorId, force)
    throw new DomainError(422, 'INVALID_TRASH_TYPE', 'Unsupported trash item type')
  }

  async function purgeExpired(actor) {
    const items = await list(actor)
    const eligible = items.filter(item => new Date(item.autoDeleteAt) <= new Date())
    const purged = []
    for (const item of eligible) purged.push(await purge(item.itemType.toLowerCase(), item.id, actor?.id || null))
    return purged
  }

  return { list, restore, purge, purgeExpired }
}
