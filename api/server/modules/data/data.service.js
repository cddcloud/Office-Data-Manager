import { allowedAccessLevels, assertCategoryAccess, assertInputLevel, collectionWhere, contentWhere, resolveActor } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'
import { categoryIds } from '../../lib/categories.js'
import { DomainError, notFound } from '../../lib/errors.js'
import { validateRecordPayload } from './data.validation.js'

const collectionInclude = {
  fields: { orderBy: { position: 'asc' } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  _count: { select: { records: { where: { archivedAt: null } } } },
}

function encodeCursor(record) {
  return Buffer.from(JSON.stringify({ id: record.id })).toString('base64url')
}

function decodeCursor(cursor) {
  if (!cursor) return undefined
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!value.id) throw new Error('missing id')
    return { id: value.id }
  } catch {
    throw new DomainError(422, 'INVALID_CURSOR', 'The retrieval cursor is invalid')
  }
}

async function visibleCollectionInclude(db, actor) {
  return { ...collectionInclude, _count: { select: { records: { where: await contentWhere(db, actor, 'record') } } } }
}

export function createDataService(prisma) {
  async function visibleCollection(id, actor, includeArchived = false) {
    const value = await prisma.dataCollection.findFirst({ where: { id, ...await collectionWhere(prisma, actor, includeArchived) }, include: await visibleCollectionInclude(prisma, actor) })
    if (!value) throw notFound('Data collection')
    return value
  }

  async function assertCollectionMutation(id, actor, includeArchived = false) {
    const value = await visibleCollection(id, actor, includeArchived)
    const levels = allowedAccessLevels(actor)
    const [records, widgets, imports] = await Promise.all([
      prisma.dataRecord.count({ where: { dataCollectionId: id, NOT: await contentWhere(prisma, actor, 'record', true) } }),
      prisma.dashboardWidget.count({ where: { dataCollectionId: id, accessLevel: { notIn: levels } } }),
      prisma.importJob.count({ where: { dataCollectionId: id, OR: [{ accessLevel: null }, { accessLevel: { notIn: levels } }, { categoryId: { notIn: (await collectionWhere(prisma, actor, true)).categoryId.in } }] } }),
    ])
    if (records || widgets || imports) throw new DomainError(403, 'FORBIDDEN', 'The dataset includes content outside your clearance')
    return value
  }

  async function recordForUser(id, role, includeArchived = false) {
    const record = await prisma.dataRecord.findFirst({ where: { id, ...await contentWhere(prisma, role, 'record', includeArchived) }, include: { dataCollection: { include: await visibleCollectionInclude(prisma, role) }, createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } } })
    if (!record) throw notFound('Data record')
    return record
  }

  return {
    async createCollection(input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      assertInputLevel(actor, input.defaultAccessLevel)
      await assertCategoryAccess(prisma, actor, input.categoryId)
      const category = await prisma.category.findFirst({ where: { id: input.categoryId, archivedAt: null }, select: { id: true } })
      if (!category) throw new DomainError(422, 'INVALID_CATEGORY', 'The selected category is unavailable')
      return prisma.$transaction(async tx => {
        const created = await tx.dataCollection.create({ data: { categoryId: input.categoryId, name: input.name, description: input.description, defaultAccessLevel: input.defaultAccessLevel, createdById: actorId, updatedById: actorId } })
        await tx.dataField.createMany({ data: input.fields.map((field, position) => ({ ...field, position, dataCollectionId: created.id })) })
        return tx.dataCollection.findUnique({ where: { id: created.id }, include: collectionInclude })
      })
    },
    async updateCollection(id, input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await assertCollectionMutation(id, actor)
      if (input.defaultAccessLevel) assertInputLevel(actor, input.defaultAccessLevel, before.defaultAccessLevel)
      const previousCategoryId = before.categoryId
      const categoryId = input.categoryId || before.categoryId
      if (input.categoryId) {
        await assertCategoryAccess(prisma, actor, input.categoryId)
        const category = await prisma.category.findFirst({ where: { id: input.categoryId, archivedAt: null }, select: { id: true } })
        if (!category) throw new DomainError(422, 'INVALID_CATEGORY', 'The selected category is unavailable')
      }
      const duplicate = await prisma.dataCollection.findFirst({
        where: { id: { not: id }, categoryId, name: input.name || before.name },
        select: { id: true },
      })
      if (duplicate) throw new DomainError(409, 'DUPLICATE_DATA_COLLECTION', 'A structured data item with this name already exists in the selected folder')
      return prisma.$transaction(async tx => {
        const updated = await tx.dataCollection.update({ where: { id }, data: { ...input, updatedById: actorId }, include: collectionInclude })
        if (input.categoryId && input.categoryId !== previousCategoryId) {
          await Promise.all([
            tx.dataRecord.updateMany({ where: { dataCollectionId: id }, data: { categoryId: input.categoryId, updatedById: actorId } }),
            tx.importJob.updateMany({ where: { dataCollectionId: id }, data: { categoryId: input.categoryId } }),
          ])
        }
        return updated
      })
    },
    async listCollections(categoryId, actor) {
      if (categoryId) await assertCategoryAccess(prisma, actor, categoryId)
      return prisma.dataCollection.findMany({ where: { ...await collectionWhere(prisma, actor), ...(categoryId ? { categoryId } : {}) }, include: await visibleCollectionInclude(prisma, actor), orderBy: [{ name: 'asc' }, { id: 'asc' }] })
    },
    getCollection: visibleCollection,
    async archiveCollection(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await assertCollectionMutation(id, actor, true)
      if (!before) throw notFound('Data collection')
      if (before.archivedAt) return before
      const archivedAt = new Date()
      return prisma.$transaction(async tx => {
        const after = await tx.dataCollection.update({ where: { id }, data: { archivedAt, updatedById: actorId }, include: collectionInclude })
        await tx.dataRecord.updateMany({ where: { dataCollectionId: id, archivedAt: null }, data: { archivedAt, updatedById: actorId } })
        await createAuditService(tx).record({ actorId, action: 'DATA_COLLECTION_ARCHIVED', entityType: 'DataCollection', entityId: id, before, after })
        return after
      })
    },
    async restoreCollection(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await assertCollectionMutation(id, actor, true)
      await assertCategoryAccess(prisma, actor, before.categoryId)
      before.category = await prisma.category.findUnique({ where: { id: before.categoryId }, select: { archivedAt: true } })
      if (!before) throw notFound('Data collection')
      if (!before.archivedAt) return before
      if (before.category.archivedAt) throw new DomainError(409, 'ARCHIVED_CATEGORY', 'Restore the containing folder before restoring this structured data')
      const deletedAt = before.archivedAt
      return prisma.$transaction(async tx => {
        const after = await tx.dataCollection.update({ where: { id }, data: { archivedAt: null, updatedById: actorId }, include: collectionInclude })
        await tx.dataRecord.updateMany({ where: { dataCollectionId: id, archivedAt: deletedAt }, data: { archivedAt: null, updatedById: actorId } })
        await createAuditService(tx).record({ actorId, action: 'DATA_COLLECTION_RESTORED', entityType: 'DataCollection', entityId: id, before, after })
        return after
      })
    },
    async list(query, role) {
      const take = Math.min(100, Math.max(1, query.limit || 50))
      /** @type {any} */
      const where = { ...await contentWhere(prisma, role, 'record') }
      if (query.categoryId) { await assertCategoryAccess(prisma, role, query.categoryId); const permitted = new Set(where.categoryId.in); where.categoryId = { in: (await categoryIds(prisma, query.categoryId, query.includeDescendants)).filter(id => permitted.has(id)) } }
      if (query.accessLevel) where.accessLevel = { in: allowedAccessLevels(role).filter(level => level === query.accessLevel) }
      if (query.dataCollectionId) where.dataCollectionId = query.dataCollectionId
      const definitions = query.dataCollectionId ? (await visibleCollection(query.dataCollectionId, role)).fields : []
      if (query.search) {
        const textFields = definitions.filter(field => ['TEXT', 'ENUM'].includes(field.type))
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          ...textFields.map(field => ({ payload: { path: [field.key], string_contains: query.search } })),
        ]
      }
      if (query.filters && definitions.length) {
        const normalized = validateRecordPayload(definitions, query.filters, { partial: true })
        where.AND = Object.entries(normalized).map(([key, value]) => ({ payload: { path: [key], equals: value } }))
      }
      const orderBy = query.sortBy === 'title'
        ? [{ title: query.sortDirection }, { id: query.sortDirection }]
        : [{ [query.sortBy]: query.sortDirection }, { id: query.sortDirection }]
      const pageCursor = decodeCursor(query.cursor)
      if (pageCursor && !await prisma.dataRecord.findFirst({ where: { ...where, id: pageCursor.id }, select: { id: true } })) throw notFound('Content')
      const records = await prisma.dataRecord.findMany({
        where,
        include: { dataCollection: { select: { id: true, name: true } }, category: { select: { id: true, name: true } }, createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
        orderBy,
        take: take + 1,
        cursor: pageCursor,
        skip: query.cursor ? 1 : 0,
      })
      const hasMore = records.length > take
      const data = records.slice(0, take)
      const total = await prisma.dataRecord.count({ where })
      return { data, meta: { total, categoryId: query.categoryId || null, nextCursor: hasMore ? encodeCursor(data.at(-1)) : null, limit: take } }
    },
    get(id, role) {
      return recordForUser(id, role)
    },
    async create(input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const definition = await visibleCollection(input.dataCollectionId, actor)
      await assertCategoryAccess(prisma, actor, input.categoryId)
      assertInputLevel(actor, input.accessLevel || definition.defaultAccessLevel)
      if (definition.categoryId !== input.categoryId) throw new DomainError(422, 'COLLECTION_CATEGORY_MISMATCH', 'The data collection does not belong to the selected category')
      const payload = validateRecordPayload(definition.fields, input.payload)
      return prisma.$transaction(async tx => {
        const created = await tx.dataRecord.create({ data: { title: input.title, payload, categoryId: input.categoryId, dataCollectionId: input.dataCollectionId, accessLevel: input.accessLevel || definition.defaultAccessLevel, sourceType: 'MANUAL', sourceImportId: null, createdById: actorId, updatedById: actorId } })
        await createAuditService(tx).record({ actorId, action: 'DATA_CREATED', entityType: 'DataRecord', entityId: created.id, after: created })
        return created
      })
    },
    async update(id, input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await recordForUser(id, actor, true)
      if (input.accessLevel) assertInputLevel(actor, input.accessLevel, before.accessLevel)
      const merged = input.payload ? { ...before.payload, ...input.payload } : before.payload
      const payload = validateRecordPayload(before.dataCollection.fields, merged)
      return prisma.$transaction(async tx => {
        const after = await tx.dataRecord.update({ where: { id }, data: { ...input, payload, updatedById: actorId } })
        await createAuditService(tx).record({ actorId, action: 'DATA_UPDATED', entityType: 'DataRecord', entityId: id, before, after })
        return after
      })
    },
    async archive(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await recordForUser(id, actor, true)
      if (before.archivedAt) return before
      return prisma.$transaction(async tx => {
        const after = await tx.dataRecord.update({ where: { id }, data: { archivedAt: new Date(), updatedById: actorId } })
        await createAuditService(tx).record({ actorId, action: 'DATA_ARCHIVED', entityType: 'DataRecord', entityId: id, before, after })
        return after
      })
    },
    async restore(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await recordForUser(id, actor, true)
      await visibleCollection(before.dataCollectionId, actor)
      if (!before.archivedAt) return before
      return prisma.$transaction(async tx => {
        const after = await tx.dataRecord.update({ where: { id }, data: { archivedAt: null, updatedById: actorId } })
        await createAuditService(tx).record({ actorId, action: 'DATA_RESTORED', entityType: 'DataRecord', entityId: id, before, after })
        return after
      })
    },
    async filterOptions(dataCollectionId, fieldKey, role) {
      const definition = await visibleCollection(dataCollectionId, role)
      if (!definition.fields.some(field => field.key === fieldKey)) throw new DomainError(422, 'UNKNOWN_DATA_FIELD', 'The requested field is not defined')
      const rows = await prisma.dataRecord.findMany({ where: { dataCollectionId, ...await contentWhere(prisma, role, 'record') }, select: { payload: true }, take: 5000 })
      return [...new Set(rows.map(row => row.payload[fieldKey]).filter(value => value !== null && value !== undefined))].sort()
    },
  }
}
