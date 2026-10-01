import { contentDisposition } from '../../lib/content-disposition.js'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireRoles } from '../../middleware/auth.js'
import { createExcelImportService } from './excel.service.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 10 } })
const idSchema = z.object({ id: z.string().cuid() })
const inspectSchema = z.object({ accessLevel: z.enum(['V1', 'V2', 'V3', 'V4']), categoryId: z.string().cuid(), dataCollectionId: z.string().cuid().optional(), sheetName: z.string().trim().min(1).max(120).optional() })
const commitSchema = z.object({ collectionName: z.string().trim().min(1).max(160).optional(), defaultAccessLevel: z.enum(['V1', 'V2', 'V3', 'V4']).default('V4') })

export function importRoutes(prisma, storage) {
  const router = Router()
  const service = createExcelImportService(prisma, storage)
  router.use(requireRoles('ADMIN'))
  router.post('/excel/inspect', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(422).json({ error: { code: 'FILE_REQUIRED', message: 'An Excel file is required' } })
    const input = inspectSchema.parse(req.body)
    res.status(201).json({ data: await service.createInspection({ ...input, file: req.file, operationKey: req.get('Idempotency-Key') ? `${req.user.id}:${z.string().uuid().parse(req.get('Idempotency-Key'))}` : undefined, actorId: req.user.id }) })
  })
  router.post('/:id/inspect', async (req, res) => {
    const { sheetName } = z.object({ sheetName: z.string().trim().min(1).max(120) }).parse(req.body)
    res.json({ data: await service.inspectAgain(idSchema.parse(req.params).id, sheetName, req.user.id) })
  })
  router.get('/:id', async (req, res) => res.json({ data: await service.get(idSchema.parse(req.params).id, req.user) }))
  router.post('/:id/commit', async (req, res) => res.json({ data: await service.commit(idSchema.parse(req.params).id, commitSchema.parse(req.body), req.user.id) }))
  router.post('/:id/cancel', async (req, res) => res.json({ data: await service.cancel(idSchema.parse(req.params).id, req.user.id) }))
  return router
}

export function sourceWorkbookRoutes(prisma, storage) {
  const router = Router()
  const service = createExcelImportService(prisma, storage)
  router.get('/:id/download', async (req, res) => {
    const { job, buffer } = await service.download(idSchema.parse(req.params).id, req.user)
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': contentDisposition('attachment', job.originalFileName), 'Cache-Control': 'private, no-store' }).send(buffer)
  })
  return router
}
