import { allowedAccessLevels, authorizedCategoryIds, collectionWhere, contentWhere } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'

const entityModels = { ImportJob: 'importJob', Document: 'document', DataCollection: 'dataCollection', DataRecord: 'dataRecord', Category: 'category' }
const actions = { EXCEL_IMPORTED: 'Import', DOCUMENT_UPLOADED: 'Upload', DOCUMENT_UPDATED: 'Update', DOCUMENT_ARCHIVED: 'Archive', DOCUMENT_RESTORED: 'Restore', CATEGORY_UPDATED: 'Rename', CATEGORY_MOVED: 'Move', CATEGORY_CREATED: 'Create folder', DATA_CREATED: 'Create record', DATA_UPDATED: 'Update', DATA_ARCHIVED: 'Archive', DATA_RESTORED: 'Restore', DATA_COLLECTION_ARCHIVED: 'Archive', DATA_COLLECTION_RESTORED: 'Restore' }
const myanmarOffset = 390 * 60 * 1000

function months(now) {
  const local = new Date(now.getTime() + myanmarOffset)
  return Array.from({ length: 6 }, (_, index) => {
    const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 5 + index, 1))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - myanmarOffset)
    return { month: start.toISOString().slice(0, 7), end }
  })
}

export function createHomeService(prisma) {
  return {
    async overview(actor, now = new Date()) {
      const categoryIds = await authorizedCategoryIds(prisma, actor)
      const [collectionScope, recordScope, documentScope] = await Promise.all([collectionWhere(prisma, actor), contentWhere(prisma, actor, 'record', true), contentWhere(prisma, actor, 'document')])
      // A source workbook is visible only when every associated row is authorized,
      // including archived rows, exactly as for original-workbook downloads.
      const sourceScope = { status: 'COMPLETED', accessLevel: { in: allowedAccessLevels(actor) }, categoryId: { in: categoryIds }, dataCollection: collectionScope, records: { none: { NOT: recordScope } } }
      const [sources, documents, categories, activityPages] = await Promise.all([
        prisma.importJob.findMany({ where: sourceScope, select: { completedAt: true, createdAt: true } }),
        prisma.document.findMany({ where: documentScope, select: { mimeType: true, createdAt: true } }),
        prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, parentId: true } }),
        Promise.all(Object.keys(entityModels).map(entityType => createAuditService(prisma).query({ entityType, limit: 8 }, actor))),
      ])
      const counts = { excel: sources.length, pdf: documents.filter(row => row.mimeType === 'application/pdf').length, jpg: documents.filter(row => row.mimeType === 'image/jpeg').length }
      const byId = new Map(categories.map(row => [row.id, row]))
      function location(id) {
        const names = [], seen = new Set()
        while (id && byId.has(id) && !seen.has(id)) { seen.add(id); const folder = byId.get(id); names.unshift(folder.name); id = folder.parentId }
        return names.join(' > ')
      }
      const recent = activityPages.flatMap(page => page.data).filter(row => actions[row.action]).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5)
      const activity = (await Promise.all(recent.map(async row => {
        // Audit service already reauthorizes each current target. Fetch only display
        // fields, never payloads, source keys, snapshots or account credentials.
        const select = row.entityType === 'ImportJob' ? { originalFileName: true, categoryId: true } : row.entityType === 'Document' ? { fileName: true, mimeType: true, categoryId: true } : row.entityType === 'Category' ? { name: true, parentId: true } : row.entityType === 'DataCollection' ? { name: true, categoryId: true } : { title: true, categoryId: true }
        const target = await prisma[entityModels[row.entityType]].findUnique({ where: { id: row.entityId }, select })
        if (!target) return null
        const type = row.entityType === 'ImportJob' ? 'Excel' : row.entityType === 'Document' ? target.mimeType === 'application/pdf' ? 'PDF' : 'JPG' : row.entityType === 'Category' ? 'Folder' : 'Data'
        return { id: row.id, action: actions[row.action], name: target.originalFileName || target.fileName || target.title || target.name, type, location: location(target.categoryId || target.parentId), actor: row.actor?.name || 'System', createdAt: row.createdAt }
      }))).filter(Boolean)
      const dates = [...sources.map(row => row.completedAt || row.createdAt), ...documents.map(row => row.createdAt)]
      return { counts: { total: counts.excel + counts.pdf + counts.jpg, ...counts }, trend: months(now).map(({ month, end }) => ({ month, total: dates.filter(date => date < end).length })), activity, generatedAt: now }
    },
  }
}
