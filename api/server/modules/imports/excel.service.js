import { allowedAccessLevels, assertCategoryAccess, assertInputLevel, collectionWhere, contentWhere, resolveActor } from '../../lib/access.js'
import { createOperationNotification } from '../notifications/notification.service.js'
import { basename, extname } from 'node:path'
import ExcelJS from 'exceljs'
import { createAuditService } from '../../lib/audit.js'
import { DomainError, notFound } from '../../lib/errors.js'
import { makeStorageKey } from '../../lib/storage.js'
import { isUnambiguousDateValue, stableFieldKey, validateRecordPayload } from '../data/data.validation.js'

function cellValue(cell) {
  const value = cell?.value
  if (value && typeof value === 'object' && Object.hasOwn(value, 'result')) return value.result
  if (value && typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('')
  return value
}

const empty = value => value === null || value === undefined || String(value).trim() === ''

function inferType(values) {
  const nonEmpty = values.filter(value => !empty(value))
  if (!nonEmpty.length) return 'TEXT'
  if (nonEmpty.every(value => typeof value === 'boolean')) return 'BOOLEAN'
  if (nonEmpty.every(value => typeof value === 'number' && Number.isFinite(value))) return 'NUMBER'
  if (nonEmpty.every(isUnambiguousDateValue)) return 'DATE'
  return 'TEXT'
}

export function inspectSheet(worksheet) {
  let headerRow = null
  for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount); rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values.slice(1).map(value => value && typeof value === 'object' && value.formula ? value.result : value)
    if (values.filter(value => !empty(value)).length >= 2) { headerRow = rowNumber; break }
  }
  if (!headerRow) throw new DomainError(422, 'HEADER_NOT_FOUND', 'No usable header row was detected')

  const rawHeaders = worksheet.getRow(headerRow).values.slice(1).map(value => empty(value) ? null : String(value).trim())
  const activeColumns = rawHeaders.map((label, index) => ({ label, index: index + 1 })).filter(column => column.label)
  const normalized = activeColumns.map(column => column.label.toLocaleLowerCase())
  const duplicates = [...new Set(normalized.filter((label, index) => normalized.indexOf(label) !== index))]
  if (duplicates.length) throw new DomainError(422, 'DUPLICATE_HEADERS', 'Duplicate column headers must be renamed before import', { headers: duplicates })

  const rawRows = []
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = activeColumns.map(column => cellValue(worksheet.getCell(rowNumber, column.index)))
    if (values.every(empty)) continue
    rawRows.push({ rowNumber, values })
  }
  const used = new Set()
  const fields = activeColumns.map((column, index) => ({
    key: stableFieldKey(column.label, used),
    label: column.label,
    type: inferType(rawRows.map(row => row.values[index])),
    position: index,
    required: false,
  }))
  const rows = []
  const errors = []
  for (const raw of rawRows) {
    const input = Object.fromEntries(fields.map((field, index) => [field.key, raw.values[index]]))
    try {
      rows.push({ rowNumber: raw.rowNumber, data: validateRecordPayload(fields, input) })
    } catch (error) {
      errors.push({ row: raw.rowNumber, code: error.code || 'INVALID_ROW', details: error.details })
    }
  }
  return { headerRow, fields, rows, errors, totalRows: rawRows.length, validRows: rows.length, invalidRows: errors.length }
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

export function createExcelImportService(prisma, storage) {
  const publicJob = job => { const { storageKey, ...result } = job; void storageKey; return result }
  async function authorizedJob(id, actor) {
    const job = await prisma.importJob.findFirst({ where: { id, accessLevel: { in: allowedAccessLevels(actor) } } })
    if (!job) throw notFound('Import job')
    await assertCategoryAccess(prisma, actor, job.categoryId)
    if (job.dataCollectionId && !await prisma.dataCollection.findFirst({ where: { id: job.dataCollectionId, ...await collectionWhere(prisma, actor) }, select: { id: true } })) throw notFound('Import job')
    return job
  }
  const audit = createAuditService(prisma)
  async function inspectStored(job, requestedSheet) {
    const workbook = await loadWorkbook(await storage.getObject(job.storageKey))
    const sheets = workbook.worksheets.map(sheet => ({ name: sheet.name, rowCount: sheet.rowCount, columnCount: sheet.columnCount }))
    if (!sheets.length) throw new DomainError(422, 'EMPTY_WORKBOOK', 'The workbook does not contain any worksheets')
    if (!requestedSheet && sheets.length > 1) {
      const inspection = { sheets, requiresSheetSelection: true }
      return publicJob(await prisma.importJob.update({ where: { id: job.id }, data: { inspection, status: 'PENDING' } }))
    }
    const sheetName = requestedSheet || sheets[0].name
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet) throw new DomainError(422, 'SHEET_NOT_FOUND', 'The selected worksheet does not exist', { sheets })
    const result = inspectSheet(worksheet)
    const inspection = { sheets, requiresSheetSelection: false, fields: result.fields, preview: result.rows.slice(0, 20), errors: result.errors.slice(0, 100) }
    const updated = await prisma.importJob.update({
      where: { id: job.id },
      data: { sheetName, headerRow: result.headerRow, inspection, totalRows: result.totalRows, validRows: result.validRows, invalidRows: result.invalidRows, status: 'INSPECTED', failureReason: null },
    })
    await audit.record({ actorId: job.createdById, action: 'EXCEL_INSPECTED', entityType: 'ImportJob', entityId: job.id, after: { sheetName, totalRows: result.totalRows, validRows: result.validRows, invalidRows: result.invalidRows } })
    return publicJob(updated)
  }

  return {
    async createInspection({ file, categoryId, dataCollectionId = undefined, sheetName = undefined, accessLevel, operationKey, actorId }) {
      const actor = await resolveActor(prisma, actorId)
      assertInputLevel(actor, accessLevel)
      await assertCategoryAccess(prisma, actor, categoryId)
      if (!['.xlsx'].includes(extname(file.originalname).toLowerCase())) throw new DomainError(415, 'UNSUPPORTED_EXCEL_FILE', 'Only .xlsx workbooks are supported')
      const category = await prisma.category.findFirst({ where: { id: categoryId, archivedAt: null }, select: { id: true } })
      if (!category) throw new DomainError(422, 'INVALID_CATEGORY', 'The selected category is unavailable')
      if (dataCollectionId) {
        const collection = await prisma.dataCollection.findFirst({ where: { id: dataCollectionId, ...await collectionWhere(prisma, actor), categoryId }, select: { id: true } })
        if (!collection) throw new DomainError(422, 'INVALID_DATA_COLLECTION', 'The selected data collection is unavailable')
      }
      if (operationKey) {
        const existing = await prisma.importJob.findUnique({ where: { operationKey } })
        if (existing) {
          await authorizedJob(existing.id, actor)
          if (existing.categoryId !== categoryId || existing.accessLevel !== accessLevel || existing.originalFileName !== file.originalname || !(await storage.getObject(existing.storageKey)).equals(file.buffer)) throw new DomainError(409, 'IDEMPOTENCY_CONFLICT', 'The retry differs from the original workbook')
          return publicJob(existing)
        }
      }
      const storageKey = makeStorageKey('imports', file.originalname)
      await storage.putObject({ key: storageKey, body: file.buffer, contentType: file.mimetype })
      try {
        const job = await prisma.importJob.create({ data: { originalFileName: file.originalname, storageKey, mimeType: file.mimetype, fileSize: file.size, accessLevel, operationKey, categoryId, dataCollectionId: dataCollectionId || null, createdById: actorId } })
        return inspectStored(job, sheetName)
      } catch (error) {
        await storage.deleteObject(storageKey)
        if (operationKey && error.code === 'P2002') return this.createInspection({ file, categoryId, dataCollectionId, sheetName, accessLevel, operationKey, actorId })
        throw error
      }
    },
    async inspectAgain(id, sheetName, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const job = await authorizedJob(id, actor)
      if (!job) throw notFound('Import job')
      if (['COMPLETED', 'CANCELLED'].includes(job.status)) throw new DomainError(409, 'IMPORT_FINALIZED', 'The import job has already been finalized')
      return inspectStored(job, sheetName)
    },
    async get(id, actor) { return publicJob(await authorizedJob(id, actor)) },
    async download(id, actor) {
      const job = await authorizedJob(id, actor)
      if (job.status !== 'COMPLETED') throw notFound('Source workbook')
      const inaccessible = await prisma.dataRecord.count({ where: { sourceImportId: id, NOT: await contentWhere(prisma, actor, 'record', true) } })
      if (inaccessible) throw notFound('Source workbook')
      return { job: publicJob(job), buffer: await storage.getObject(job.storageKey) }
    },
    async commit(id, { collectionName = undefined, defaultAccessLevel = 'V4' }, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const job = await authorizedJob(id, actor)
      if (!job) throw notFound('Import job')
      if (job.status === 'COMPLETED') return publicJob(job)
      assertInputLevel(actor, defaultAccessLevel, job.accessLevel)
      if (job.status !== 'INSPECTED') throw new DomainError(409, 'IMPORT_NOT_READY', 'Inspect the workbook successfully before importing')
      if (job.invalidRows) throw new DomainError(422, 'IMPORT_HAS_INVALID_ROWS', 'Resolve invalid rows before committing the import', { invalidRows: job.invalidRows })
      try {
        const workbook = await loadWorkbook(await storage.getObject(job.storageKey))
        const parsed = inspectSheet(workbook.getWorksheet(job.sheetName))
        const result = await prisma.$transaction(async tx => {
          const currentActor = await resolveActor(tx, actorId)
          assertInputLevel(currentActor, defaultAccessLevel, job.accessLevel)
          await assertCategoryAccess(tx, currentActor, job.categoryId)
          const claimed = await tx.importJob.updateMany({ where: { id, status: 'INSPECTED' }, data: { status: 'IMPORTING' } })
          if (claimed.count !== 1) throw new DomainError(409, 'IMPORT_FINALIZED', 'The import is already being committed')
          let collectionId = job.dataCollectionId
          let fields = job.inspection.fields
          if (!collectionId) {
            const collection = await tx.dataCollection.create({ data: { categoryId: job.categoryId, name: collectionName || basename(job.originalFileName, extname(job.originalFileName)), defaultAccessLevel, createdById: actorId, updatedById: actorId } })
            collectionId = collection.id
            await tx.dataField.createMany({ data: fields.map(field => ({ ...field, dataCollectionId: collectionId })) })
          } else {
            if (!await tx.dataCollection.findFirst({ where: { id: collectionId, ...await collectionWhere(tx, currentActor) }, select: { id: true } })) throw notFound('Data collection')
            const existing = await tx.dataField.findMany({ where: { dataCollectionId: collectionId }, orderBy: { position: 'asc' } })
            const same = existing.length === fields.length && existing.every((field, index) => field.key === fields[index].key && field.type === fields[index].type)
            if (!same) throw new DomainError(422, 'FIELD_MAPPING_REQUIRED', 'Workbook columns do not match the selected data collection')
            fields = existing
          }
          await tx.dataRecord.createMany({ data: parsed.rows.map((row, index) => ({ title: String(row.data[fields[0].key] ?? `Row ${index + 1}`), payload: row.data, categoryId: job.categoryId, dataCollectionId: collectionId, accessLevel: defaultAccessLevel, sourceType: 'EXCEL', sourceImportId: job.id, createdById: actorId, updatedById: actorId })) })
          const completed = await tx.importJob.update({ where: { id }, data: { status: 'COMPLETED', accessLevel: defaultAccessLevel, dataCollectionId: collectionId, totalRows: parsed.totalRows, validRows: parsed.validRows, invalidRows: 0, completedAt: new Date() } })
          await createAuditService(tx).record({ actorId, action: 'EXCEL_IMPORTED', entityType: 'ImportJob', entityId: id, after: { collectionId, rows: parsed.validRows, originalFileName: job.originalFileName } })
          await createOperationNotification(tx, 'IMPORT', id, `import:${id}`)
          return publicJob(completed)
        })
        return result
      } catch (error) {
        if (error instanceof DomainError && error.code === 'IMPORT_FINALIZED') throw error
        await prisma.importJob.updateMany({ where: { id, status: { in: ['INSPECTED', 'IMPORTING'] } }, data: { status: 'FAILED', failureReason: 'Import validation or persistence failed' } })
        await audit.record({ actorId, action: 'IMPORT_FAILED', entityType: 'ImportJob', entityId: id, metadata: { message: error.message } })
        throw error
      }
    },
    async cancel(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const job = await authorizedJob(id, actor)
      if (!job) throw notFound('Import job')
      if (job.status === 'COMPLETED') throw new DomainError(409, 'IMPORT_FINALIZED', 'A completed import cannot be cancelled')
      const updated = await prisma.importJob.update({ where: { id }, data: { status: 'CANCELLED' } })
      await audit.record({ actorId, action: 'IMPORT_CANCELLED', entityType: 'ImportJob', entityId: id })
      return publicJob(updated)
    },
  }
}
