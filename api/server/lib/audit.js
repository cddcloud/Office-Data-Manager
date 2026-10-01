import { allowedAccessLevels, authorizedCategoryIds, canManageUsers, collectionWhere, contentWhere, isMainAdmin } from './access.js'
import { notFound } from './errors.js'

const excluded = new Set(['payload', 'inspection', 'storageKey', 'password', 'passwordHash', 'token', 'tokenHash', 'refreshToken', 'setupUrl', 'resetUrl'])
const jsonValue = value => value == null ? value : JSON.parse(JSON.stringify(value, (key, item) => excluded.has(key) ? undefined : item))

async function auditScope(db, actor) {
  const categoryIds = await authorizedCategoryIds(db, actor, { includeArchived: true })
  const collection = await collectionWhere(db, actor, true)
  const account = isMainAdmin(actor) ? {} : { role: 'VIEWER', isPrimaryAdmin: false }
  return {
    Category: id => db.category.findFirst({ where: { id: { equals: id, in: categoryIds } }, select: { id: true } }),
    DataCollection: id => db.dataCollection.findFirst({ where: { id, ...collection }, select: { id: true } }),
    DataRecord: async id => db.dataRecord.findFirst({ where: { id, ...await contentWhere(db, actor, 'record', true) }, select: { id: true } }),
    Document: async id => db.document.findFirst({ where: { id, ...await contentWhere(db, actor, 'document', true) }, select: { id: true } }),
    ImportJob: async id => {
      const job = await db.importJob.findFirst({ where: { id, accessLevel: { in: allowedAccessLevels(actor) }, categoryId: { in: categoryIds }, OR: [{ dataCollectionId: null }, { dataCollection: collection }] }, select: { id: true } })
      return job && !await db.dataRecord.count({ where: { sourceImportId: id, NOT: await contentWhere(db, actor, 'record', true) } }) && job
    },
    DashboardWidget: id => db.dashboardWidget.findFirst({ where: { id, accessLevel: { in: allowedAccessLevels(actor) }, dataCollection: collection }, select: { id: true } }),
    User: id => canManageUsers(actor) && db.user.findFirst({ where: { id, ...account }, select: { id: true } }),
    AccountInvite: id => canManageUsers(actor) && db.accountInvite.findFirst({ where: { id, ...(isMainAdmin(actor) ? {} : { role: 'VIEWER' }) }, select: { id: true } }),
    AccountPasswordResetToken: id => canManageUsers(actor) && db.accountPasswordResetToken.findFirst({ where: { id, user: account }, select: { id: true } }),
  }
}

const safeSnapshot = value => value && Object.fromEntries(Object.entries(value).filter(([key]) => ['role', 'clearance', 'isActive', 'accessLevel', 'defaultAccessLevel', 'archivedAt', 'rows'].includes(key)))

export function createAuditService(prisma) {
  return {
    record({ actorId = null, action, entityType, entityId, before = null, after = null, metadata = null }) {
      return prisma.auditLog.create({
        data: {
          actorId: actorId || null,
          action,
          entityType,
          entityId,
          before: jsonValue(before),
          after: jsonValue(after),
          metadata: jsonValue(metadata),
        },
      })
    },
    async query({ actorId = undefined, action = undefined, entityType = undefined, entityId = undefined, from = undefined, to = undefined, cursor = undefined, limit = 50 }, actor) {
      const take = Math.min(100, Math.max(1, limit))
      const scope = await auditScope(prisma, actor)
      if (cursor) {
        const row = await prisma.auditLog.findUnique({ where: { id: cursor } })
        if (!row || !scope[row.entityType] || !await scope[row.entityType](row.entityId)) throw notFound('Content')
      }
      const visible = []
      let scanCursor = cursor
      let finished = false
      while (visible.length <= take && !finished) {
        const rows = await prisma.auditLog.findMany({
          where: {
            ...(actorId ? { actorId } : {}),
            ...(action ? { action } : {}),
            ...(entityType ? { entityType } : {}),
            ...(entityId ? { entityId } : {}),
            ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
          },
          include: { actor: { select: { name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
          cursor: scanCursor ? { id: scanCursor } : undefined,
          skip: scanCursor ? 1 : 0,
        })
        for (const row of rows) {
          if (!scope[row.entityType] || !await scope[row.entityType](row.entityId)) continue
          visible.push({ ...row, actorId: undefined, before: safeSnapshot(row.before), after: safeSnapshot(row.after), metadata: null })
          if (visible.length > take) break
        }
        finished = rows.length < 100
        scanCursor = rows.at(-1)?.id
      }
      const hasMore = visible.length > take
      const data = visible.slice(0, take)
      return { data, meta: { nextCursor: hasMore ? data.at(-1).id : null, limit: take } }
    },
  }
}
