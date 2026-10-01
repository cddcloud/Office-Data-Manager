import { Router } from 'express'
import { z } from 'zod'
import { requireRoles } from '../../middleware/auth.js'
import { createDataService } from './data.service.js'

const id = z.string().cuid()
const access = z.enum(['V1', 'V2', 'V3', 'V4'])
const fieldSchema = z.object({ key: z.string().trim().regex(/^[\p{L}\p{N}_]+$/u).max(80), label: z.string().trim().min(1).max(120), type: z.enum(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'ENUM']), required: z.boolean().default(false), options: z.array(z.union([z.string(), z.number()])).optional() })
const collectionSchema = z.object({ categoryId: id, name: z.string().trim().min(1).max(160), description: z.string().trim().max(1000).nullable().optional(), defaultAccessLevel: access.default('V4'), fields: z.array(fieldSchema).min(1).max(200) })
const collectionUpdateSchema = z.object({ categoryId: id.optional(), name: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(1000).nullable().optional(), defaultAccessLevel: access.optional() }).refine(value => Object.keys(value).length > 0, 'At least one field is required')
const recordSchema = z.object({ title: z.string().trim().min(1).max(240), categoryId: id, dataCollectionId: id, accessLevel: access.optional(), payload: z.record(z.string(), z.unknown()) })
const updateSchema = z.object({ title: z.string().trim().min(1).max(240).optional(), accessLevel: access.optional(), payload: z.record(z.string(), z.unknown()).optional() }).refine(value => Object.keys(value).length > 0, 'At least one field is required')
const jsonObject = z.string().transform((value, context) => { try { const parsed = JSON.parse(value); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(); return parsed } catch { context.addIssue({ code: 'custom', message: 'Expected a JSON object' }); return z.NEVER } }).optional()
const listSchema = z.object({ categoryId: id.optional(), dataCollectionId: id.optional(), includeDescendants: z.enum(['true', 'false']).optional().transform(value => value !== 'false'), search: z.string().trim().max(200).optional(), accessLevel: access.optional(), filters: jsonObject, sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('createdAt'), sortDirection: z.enum(['asc', 'desc']).default('desc'), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })

export function dataRoutes(prisma) {
  const router = Router()
  const service = createDataService(prisma)
  router.get('/', async (req, res) => { const result = await service.list(listSchema.parse(req.query), req.user); res.json(result) })
  router.get('/collections', async (req, res) => res.json({ data: await service.listCollections(req.query.categoryId, req.user) }))
  router.get('/collections/:id', async (req, res) => res.json({ data: await service.getCollection(id.parse(req.params.id), req.user) }))
  router.get('/collections/:id/filter-options/:fieldKey', async (req, res) => res.json({ data: await service.filterOptions(id.parse(req.params.id), req.params.fieldKey, req.user) }))
  router.get('/:id', async (req, res) => res.json({ data: await service.get(id.parse(req.params.id), req.user) }))
  router.post('/collections', requireRoles('ADMIN'), async (req, res) => res.status(201).json({ data: await service.createCollection(collectionSchema.parse(req.body), req.user.id) }))
  router.patch('/collections/:id', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.updateCollection(id.parse(req.params.id), collectionUpdateSchema.parse(req.body), req.user.id) }))
  router.post('/collections/:id/archive', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.archiveCollection(id.parse(req.params.id), req.user.id) }))
  router.post('/collections/:id/restore', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.restoreCollection(id.parse(req.params.id), req.user.id) }))
  router.post('/', requireRoles('ADMIN'), async (req, res) => res.status(201).json({ data: await service.create(recordSchema.parse(req.body), req.user.id) }))
  router.patch('/:id', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.update(id.parse(req.params.id), updateSchema.parse(req.body), req.user.id) }))
  router.post('/:id/archive', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.archive(id.parse(req.params.id), req.user.id) }))
  router.post('/:id/restore', requireRoles('ADMIN'), async (req, res) => res.json({ data: await service.restore(id.parse(req.params.id), req.user.id) }))
  return router
}
