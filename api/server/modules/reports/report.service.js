import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { allowedAccessLevels, assertCategoryAccess, collectionWhere, contentWhere } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'
import { categoryIds } from '../../lib/categories.js'
import { DomainError, notFound } from '../../lib/errors.js'
import { validateRecordPayload } from '../data/data.validation.js'

const MAX_EXPORT_ROWS = 10_000

async function reportRecords(prisma, query, role) {
  const collection = await prisma.dataCollection.findFirst({ where: { id: query.dataCollectionId, ...await collectionWhere(prisma, role) }, include: { fields: { orderBy: { position: 'asc' } } } })
  if (!collection) throw notFound('Data collection')
  /** @type {any} */
  const where = { dataCollectionId: collection.id, ...await contentWhere(prisma, role, 'record') }
  if (query.accessLevel) where.accessLevel = { in: allowedAccessLevels(role).filter(level => level === query.accessLevel) }
  if (query.categoryId) { await assertCategoryAccess(prisma, role, query.categoryId); const permitted = new Set(where.categoryId.in); where.categoryId = { in: (await categoryIds(prisma, query.categoryId, true)).filter(id => permitted.has(id)) } }
  if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) }
  if (query.filters) {
    const values = validateRecordPayload(collection.fields, query.filters, { partial: true })
    where.AND = Object.entries(values).map(([key, value]) => ({ payload: { path: [key], equals: value } }))
  }
  const records = await prisma.dataRecord.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: MAX_EXPORT_ROWS + 1 })
  if (records.length > MAX_EXPORT_ROWS) throw new DomainError(422, 'EXPORT_TOO_LARGE', `Narrow the report to ${MAX_EXPORT_ROWS} records or fewer`)
  return { collection, records }
}

async function excelBuffer(collection, records) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(collection.name.slice(0, 31))
  sheet.columns = [
    { header: 'Title', key: '_title', width: 30 },
    ...collection.fields.map(field => ({ header: field.label, key: field.key, width: 20 })),
  ]
  records.forEach(record => sheet.addRow({ _title: record.title, ...record.payload }))
  sheet.getRow(1).font = { bold: true }
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(sheet.columnCount).address }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function pdfBuffer(collection, records) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks = []
    document.on('data', chunk => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
    document.fontSize(18).text(collection.name)
    document.moveDown().fontSize(9).text(`Records: ${records.length}`)
    records.forEach((record, index) => {
      if (document.y > 740) document.addPage()
      document.moveDown(0.6).fontSize(11).text(`${index + 1}. ${record.title}`)
      for (const field of collection.fields) document.fontSize(8).text(`${field.label}: ${record.payload[field.key] ?? ''}`)
    })
    document.end()
  })
}

export function createReportService(prisma) {
  return {
    async generate(query, user) {
      const { collection, records } = await reportRecords(prisma, query, user)
      let body
      let mimeType
      let extension
      if (query.format === 'xlsx') { body = await excelBuffer(collection, records); mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; extension = 'xlsx' }
      else if (query.format === 'pdf') { body = await pdfBuffer(collection, records); mimeType = 'application/pdf'; extension = 'pdf' }
      else { body = { collection: { id: collection.id, name: collection.name, fields: collection.fields }, records }; mimeType = 'application/json'; extension = 'json' }
      await createAuditService(prisma).record({ actorId: user.id, action: 'REPORT_EXPORTED', entityType: 'DataCollection', entityId: collection.id, metadata: { format: query.format, rows: records.length, filters: query.filters || null } })
      return { body, mimeType, fileName: `filtered-${collection.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.${extension}` }
    },
  }
}
