import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { allowedAccessLevels } from '../../lib/access.js'
import { createNotificationService } from './notification.service.js'

export function notificationRoutes(prisma) {
  const router = Router()
  const service = createNotificationService(prisma)
  router.get('/', async (req, res) => res.json(await service.list(req.user, z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query))))
  router.post('/read-all', async (req, res) => res.json(await service.markRead(req.user)))
  router.post('/:id/read', async (req, res) => res.json(await service.markRead(req.user, z.string().cuid().parse(req.params.id))))
  // fetch-based SSE uses Authorization headers. No bearer tokens in URLs or cookies.
  router.get('/stream', async (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    let closed = false
    let timer
    let last = ''
    res.on('close', () => { closed = true; clearTimeout(timer) })
    async function tick() {
      try {
        jwt.verify(req.headers.authorization.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] })
        const actor = await prisma.user.findUnique({ where: { id: req.user.id } })
        if (!actor?.isActive || actor.loginResetRequired || actor.mustChangePassword || actor.permissionVersion !== req.user.permissionVersion || !allowedAccessLevels(actor).length) { res.write('event: revoked\ndata: {}\n\n'); res.end(); return }
        const payload = JSON.stringify(await service.list(actor))
        if (!closed && payload !== last) { res.write(`event: notifications\ndata: ${payload}\n\n`); last = payload }
        else if (!closed) res.write(': heartbeat\n\n')
        res.flush?.()
      } catch { if (!closed) res.end(); return }
      if (!closed) timer = setTimeout(tick, 5000)
    }
    await tick()
  })
  return router
}
