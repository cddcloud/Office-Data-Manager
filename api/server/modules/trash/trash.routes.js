import { Router } from 'express'
import { z } from 'zod'
import { createTrashService } from './trash.service.js'

const params = z.object({ type: z.enum(['folder', 'data', 'document']), id: z.string().cuid() })

export function trashRoutes(prisma, storage) {
  const router = Router()
  const service = createTrashService(prisma, storage)
  router.get('/', async (req, res) => res.json({ data: await service.list(req.user) }))
  router.post('/:type/:id/restore', async (req, res) => { const value = params.parse(req.params); res.json({ data: await service.restore(value.type, value.id, req.user.id) }) })
  router.delete('/:type/:id', async (req, res) => { const value = params.parse(req.params); res.json({ data: await service.purge(value.type, value.id, req.user.id, { force: true }) }) })
  router.post('/purge-expired', async (req, res) => res.json({ data: await service.purgeExpired(req.user) }))
  return router
}
