import { Router } from 'express'
import { createHomeService } from './home.service.js'

export function homeRoutes(prisma) {
  const router = Router()
  const service = createHomeService(prisma)
  router.get('/', async (req, res) => res.json({ data: await service.overview(req.user) }))
  return router
}
