import { allowedAccessLevels, collectionWhere, contentWhere } from '../../lib/access.js'

async function targetFor(db, actor, notice) {
  if (notice.kind === 'DOCUMENT') {
    const target = await db.document.findFirst({ where: { id: notice.targetId, ...await contentWhere(db, actor, 'document') }, select: { id: true, title: true, categoryId: true } })
    return target && { categoryId: target.categoryId, documentId: target.id, text: `Uploaded: ${target.title}` }
  }
  const job = await db.importJob.findFirst({ where: { id: notice.targetId, status: 'COMPLETED', accessLevel: { in: allowedAccessLevels(actor) }, dataCollection: await collectionWhere(db, actor) }, select: { id: true, dataCollectionId: true, categoryId: true, originalFileName: true } })
  if (!job) return null
  if (await db.dataRecord.count({ where: { sourceImportId: job.id, NOT: await contentWhere(db, actor, 'record', true) } })) return null
  const allowedFolders = (await contentWhere(db, actor, 'document')).categoryId.in
  return allowedFolders.includes(job.categoryId) && { categoryId: job.categoryId, collectionId: job.dataCollectionId, text: `Imported: ${job.originalFileName}` }
}

// Called inside the same transaction as the successful upload/import, never inspection.
export async function createOperationNotification(tx, kind, targetId, operationKey) {
  const notice = await tx.notification.upsert({ where: { operationKey }, update: {}, create: { kind, targetId, operationKey } })
  const candidates = await tx.user.findMany({ where: { isActive: true, loginResetRequired: false }, select: { id: true, role: true, clearance: true, isPrimaryAdmin: true } })
  const recipients = []
  for (const actor of candidates) {
    if (allowedAccessLevels(actor).length && await targetFor(tx, actor, notice)) recipients.push({ notificationId: notice.id, userId: actor.id })
  }
  if (recipients.length) await tx.notificationRead.createMany({ data: recipients, skipDuplicates: true })
  return notice
}

export function createNotificationService(prisma) {
  async function visible(actor) {
    const rows = await prisma.notificationRead.findMany({ where: { userId: actor.id }, include: { notification: true }, orderBy: { notification: { createdAt: 'desc' } } })
    const notices = []
    for (const row of rows) {
      const target = await targetFor(prisma, actor, row.notification)
      if (target) notices.push({ id: row.notificationId, readAt: row.readAt, createdAt: row.notification.createdAt, ...target })
    }
    return notices
  }
  return {
    async list(actor, { cursor = undefined, limit = 50 } = {}) {
      const rows = await visible(actor)
      const offset = cursor ? rows.findIndex(row => row.id === cursor) + 1 : 0
      const data = rows.slice(offset, offset + limit)
      return { data, meta: { unreadCount: rows.filter(row => !row.readAt).length, nextCursor: rows.length > offset + limit ? data.at(-1)?.id : null } }
    },
    async markRead(actor, id) {
      const ids = (await visible(actor)).filter(row => !id || row.id === id).map(row => row.id)
      await prisma.notificationRead.updateMany({ where: { userId: actor.id, notificationId: { in: ids }, readAt: null }, data: { readAt: new Date() } })
      return this.list(actor)
    },
  }
}
