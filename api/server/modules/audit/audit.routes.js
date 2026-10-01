import { Router } from 'express'
import { z } from 'zod'
import { createAuditService } from '../../lib/audit.js'
import { requireRoles } from '../../middleware/auth.js'

const querySchema = z.object({ actorId: z.string().cuid().optional(), action: z.string().trim().max(80).optional(), entityType: z.string().trim().max(80).optional(), entityId: z.string().trim().max(120).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })

export function auditRoutes(prisma) {
  const router = Router()
  const service = createAuditService(prisma)
  router.use(requireRoles('ADMIN'))
  router.get('/', async (req, res) => res.json(await service.query(querySchema.parse(req.query), req.user)))
  return router
}
