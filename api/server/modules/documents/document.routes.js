import { contentDisposition } from '../../lib/content-disposition.js'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireRoles } from '../../middleware/auth.js'
import { createDocumentService } from './document.service.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 10 } })
const id = z.string().cuid()
const access = z.enum(['V1', 'V2', 'V3', 'V4'])
const uploadSchema = z.object({ title: z.string().trim().min(1).max(240), description: z.string().trim().max(2000).optional(), categoryId: id, accessLevel: access.default('V4') })
const updateSchema = z.object({ title: z.string().trim().min(1).max(240).optional(), description: z.string().trim().max(2000).nullable().optional(), categoryId: id.optional(), accessLevel: access.optional() }).refine(value => Object.keys(value).length > 0, 'At least one field is required')
const listSchema = z.object({ categoryId: id.optional(), includeDescendants: z.enum(['true', 'false']).optional().transform(value => value !== 'false'), search: z.string().trim().max(200).optional(), accessLevel: access.optional(), mimeType: z.enum(['application/pdf', 'image/jpeg']).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })

export function documentRoutes(prisma, storage) {
  const router = Router()
  const service = createDocumentService(prisma, storage)
  router.get('/', async (req, res) => { const result = await service.list(listSchema.parse(req.query), req.user); res.json(result) })
  router.get('/:id', async (req, res) => res.json({ data: await service.get(id.parse(req.params.id), req.user) }))
  router.get('/:id/download', async (req, res) => {
    const { document, buffer } = await service.download(id.parse(req.params.id), req.user)
    res.set({ 'Content-Type': document.mimeType, 'Content-Length': buffer.length, 'Content-Disposition': contentDisposition('inline', document.fileName), 'Cache-Control': 'private, no-store' }).send(buffer)
  })
  router.post('/', requireRoles('ADMIN'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(422).json({ error: { code: 'FILE_REQUIRED', message: 'A PDF or JPG file is required' } })
    res.status(201).json({ data: await service.upload({ ...uploadSchema.parse(req.body), file: req.file, operationKey: req.get('Idempotency-Key') ? `${req.user.id}:${z.string().uuid().parse(req.get('Idempotency-Key'))}` : undefined }, req.user.id) })
  })
  router.patch('/:id', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.update(id.parse(req.params.id), updateSchema.parse(req.body), req.user.id) }))
  router.post('/:id/archive', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.archive(id.parse(req.params.id), req.user.id) }))
  router.post('/:id/restore', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.restore(id.parse(req.params.id), req.user.id) }))
  return router
}
