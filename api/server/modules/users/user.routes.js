import { Router } from 'express'
import { z } from 'zod'
import { requireAccountManager } from '../../middleware/auth.js'
import { createUserService } from './user.service.js'

const idSchema = z.object({ id: z.string().cuid() })
const role = z.enum(['ADMIN', 'VIEWER'])
const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120),
  role: role.default('VIEWER'),
  clearance: z.enum(['V1', 'V2', 'V3', 'V4']),
})
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: role.optional(),
  clearance: z.enum(['V1', 'V2', 'V3', 'V4']).optional(),
  isActive: z.boolean().optional(),
}).refine(value => Object.keys(value).length > 0, 'At least one field is required')
const linkSchema = z.object({ token: z.string().min(32).max(512) })
const completeSchema = linkSchema.extend({ password: z.string().min(12).max(128) })

export function userRoutes(prisma) {
  const router = Router()
  const service = createUserService(prisma)
  router.use(requireAccountManager)
  router.get('/', async (req, res) => res.json({ data: await service.list(req.user) }))
  router.get('/access-levels', (req, res) => res.json({ data: ['V1', 'V2', 'V3', 'V4'].map(clearance => ({ clearance, label: clearance, roles: req.user.isPrimaryAdmin && clearance !== 'V4' ? ['ADMIN', 'VIEWER'] : ['VIEWER'] })) }))
  router.post('/', async (req, res) => res.status(201).json({ data: await service.invite(inviteSchema.parse(req.body), req.user.id) }))
  router.post('/invitations', async (req, res) => res.status(201).json({ data: await service.invite(inviteSchema.parse(req.body), req.user.id) }))
  router.post('/invitations/:id/regenerate', async (req, res) => res.json({ data: await service.regenerateInvite(idSchema.parse(req.params).id, req.user.id) }))
  router.post('/invitations/:id/cancel', async (req, res) => {
    await service.cancelInvite(idSchema.parse(req.params).id, req.user.id)
    res.status(204).end()
  })
  router.get('/:id', async (req, res) => res.json({ data: await service.get(idSchema.parse(req.params).id, req.user) }))
  router.patch('/:id', async (req, res) => res.json({ data: await service.update(idSchema.parse(req.params).id, updateSchema.parse(req.body), req.user.id) }))
  router.post('/:id/disable', async (req, res) => res.json({ data: await service.update(idSchema.parse(req.params).id, { isActive: false }, req.user.id) }))
  router.post('/:id/enable', async (req, res) => res.json({ data: await service.update(idSchema.parse(req.params).id, { isActive: true }, req.user.id) }))
  router.post('/:id/reset-login', async (req, res) => res.status(201).json({ data: await service.resetLogin(idSchema.parse(req.params).id, req.user.id) }))
  router.post('/:id/reset-password', async (req, res) => res.status(201).json({ data: await service.resetLogin(idSchema.parse(req.params).id, req.user.id) }))
  return router
}

export function accountLinkRoutes(prisma) {
  const router = Router()
  const service = createUserService(prisma)
  router.post('/account/setup/validate', async (req, res) => res.json({ data: await service.validateSetup(linkSchema.parse(req.body).token) }))
  router.post('/account/setup', async (req, res) => {
    const input = completeSchema.parse(req.body)
    res.json({ data: await service.completeSetup(input.token, input.password) })
  })
  router.post('/account/reset/validate', async (req, res) => res.json({ data: await service.validateReset(linkSchema.parse(req.body).token) }))
  router.post('/account/reset', async (req, res) => {
    const input = completeSchema.parse(req.body)
    res.json({ data: await service.completeReset(input.token, input.password) })
  })
  return router
}
