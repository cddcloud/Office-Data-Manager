import { allowedAccessLevels, assertCategoryAccess, assertInputLevel, contentWhere, resolveActor } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'
import { categoryIds } from '../../lib/categories.js'
import { DomainError, notFound } from '../../lib/errors.js'
import { createOperationNotification } from '../notifications/notification.service.js'
import { makeStorageKey } from '../../lib/storage.js'

const metadataSelect = {
  id: true, title: true, description: true, fileName: true, mimeType: true,
  fileSize: true, accessLevel: true, categoryId: true, createdById: true, updatedById: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  archivedAt: true, createdAt: true, updatedAt: true,
}

const cursor = value => value ? { id: value } : undefined

function hasExpectedSignature(file) {
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  if (file.mimetype === 'image/jpeg') return file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff
  return false
}

export function createDocumentService(prisma, storage) {


  async function internal(id, role, includeArchived = false) {
    const document = await prisma.document.findFirst({ where: { id, ...await contentWhere(prisma, role, 'document', includeArchived) }, include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } } })
    if (!document) throw notFound('Document')
    return document
  }

  return {
    async list(query, role) {
      const take = Math.min(100, Math.max(1, query.limit || 50))
      /** @type {any} */
      const where = { ...await contentWhere(prisma, role, 'document') }
      if (query.categoryId) { await assertCategoryAccess(prisma, role, query.categoryId); const permitted = new Set(where.categoryId.in); where.categoryId = { in: (await categoryIds(prisma, query.categoryId, query.includeDescendants)).filter(id => permitted.has(id)) } }
      if (query.accessLevel) where.accessLevel = { in: allowedAccessLevels(role).filter(level => level === query.accessLevel) }
      if (query.search) where.OR = [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }]
      if (query.mimeType) where.mimeType = query.mimeType
      if (query.cursor && !await prisma.document.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })) throw notFound('Content')
      const rows = await prisma.document.findMany({ where, select: metadataSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, cursor: cursor(query.cursor), skip: query.cursor ? 1 : 0 })
      const hasMore = rows.length > take
      const data = rows.slice(0, take)
      const total = await prisma.document.count({ where })
      return { data, meta: { total, categoryId: query.categoryId || null, nextCursor: hasMore ? data.at(-1).id : null, limit: take } }
    },
    async get(id, role) {
      const document = await internal(id, role)
      return Object.fromEntries(Object.keys(metadataSelect).map(key => [key, document[key]]))
    },
    async download(id, role) {
      const document = await internal(id, role)
      return { document, buffer: await storage.getObject(document.storageKey) }
    },
    async upload({ file, title, description = undefined, categoryId, accessLevel, operationKey }, actorId) {
      const actor = await resolveActor(prisma, actorId)
      assertInputLevel(actor, accessLevel)
      await assertCategoryAccess(prisma, actor, categoryId)
      if (!['application/pdf', 'image/jpeg'].includes(file.mimetype)) throw new DomainError(415, 'UNSUPPORTED_DOCUMENT_TYPE', 'Only PDF and JPG/JPEG documents are supported')
      if (!hasExpectedSignature(file)) throw new DomainError(422, 'INVALID_DOCUMENT_CONTENT', 'The uploaded file content does not match its declared type')
      const category = await prisma.category.findFirst({ where: { id: categoryId, archivedAt: null }, select: { id: true } })
      if (!category) throw new DomainError(422, 'INVALID_CATEGORY', 'The selected category is unavailable')
      if (operationKey) {
        const existing = await prisma.document.findUnique({ where: { operationKey } })
        if (existing) {
          await internal(existing.id, actor)
          if (existing.categoryId !== categoryId || existing.accessLevel !== accessLevel || existing.title !== title || existing.fileName !== file.originalname || existing.mimeType !== file.mimetype || existing.description !== (description || null) || !(await storage.getObject(existing.storageKey)).equals(file.buffer)) throw new DomainError(409, 'IDEMPOTENCY_CONFLICT', 'The retry differs from the original operation')
          return this.get(existing.id, actor)
        }
      }
      const storageKey = makeStorageKey('documents', file.originalname)
      await storage.putObject({ key: storageKey, body: file.buffer, contentType: file.mimetype })
      return prisma.$transaction(async tx => {
        const created = await tx.document.create({ data: { title, description: description || null, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size, storageKey, categoryId, accessLevel, operationKey, createdById: actorId, updatedById: actorId }, select: metadataSelect })
        await createAuditService(tx).record({ actorId, action: 'DOCUMENT_UPLOADED', entityType: 'Document', entityId: created.id, after: created })
        await createOperationNotification(tx, 'DOCUMENT', created.id, `document:${created.id}`)
        return created
      }).catch(async error => {
        await storage.deleteObject(storageKey)
        if (error.code === 'P2002' && operationKey) return this.upload({ file, title, description, categoryId, accessLevel, operationKey }, actorId)
        throw error
      })
    },
    async update(id, input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await internal(id, actor, true)
      if (input.accessLevel) assertInputLevel(actor, input.accessLevel, before.accessLevel)
      if (input.categoryId) {
        await assertCategoryAccess(prisma, actor, input.categoryId)
        const category = await prisma.category.findFirst({ where: { id: input.categoryId, archivedAt: null }, select: { id: true } })
        if (!category) throw new DomainError(422, 'INVALID_CATEGORY', 'The selected category is unavailable')
      }
      return prisma.$transaction(async tx => {
        const after = await tx.document.update({ where: { id }, data: { ...input, updatedById: actorId }, select: metadataSelect })
        await createAuditService(tx).record({ actorId, action: 'DOCUMENT_UPDATED', entityType: 'Document', entityId: id, before, after })
        return after
      })
    },
    async archive(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await internal(id, actor, true)
      if (before.archivedAt) return before
      return prisma.$transaction(async tx => {
        const after = await tx.document.update({ where: { id }, data: { archivedAt: new Date(), updatedById: actorId }, select: metadataSelect })
        await createAuditService(tx).record({ actorId, action: 'DOCUMENT_ARCHIVED', entityType: 'Document', entityId: id, before, after })
        return after
      })
    },
    async restore(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await internal(id, actor, true)
      if (!before.archivedAt) return before
      await assertCategoryAccess(prisma, actor, before.categoryId)
      const category = await prisma.category.findFirst({ where: { id: before.categoryId, archivedAt: null }, select: { id: true } })
      if (!category) throw new DomainError(409, 'ARCHIVED_CATEGORY', 'Restore the containing folder before restoring this document')
      return prisma.$transaction(async tx => {
        const after = await tx.document.update({ where: { id }, data: { archivedAt: null, updatedById: actorId }, select: metadataSelect })
        await createAuditService(tx).record({ actorId, action: 'DOCUMENT_RESTORED', entityType: 'Document', entityId: id, before, after })
        return after
      })
    },
  }
}
