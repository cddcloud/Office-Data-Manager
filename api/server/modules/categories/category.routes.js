import { Router } from 'express'
import { requireRoles } from '../../middleware/auth.js'
import { createCategoryService } from './category.service.js'
import { createCategorySchema, idParamSchema, moveCategorySchema, treeQuerySchema, updateCategorySchema } from './category.validation.js'

const adminOnly = requireRoles('ADMIN')

export function categoryRoutes(prisma) {
  const router = Router()
  const service = createCategoryService(prisma)

  router.get('/', async (req, res) => {
    const query = treeQuerySchema.parse(req.query)
    res.json({ data: await service.tree(query, req.user) })
  })

  router.get('/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    res.json({ data: await service.details(id, req.user) })
  })

  router.post('/', adminOnly, async (req, res) => {
    const input = createCategorySchema.parse(req.body)
    res.status(201).json({ data: await service.create(input, req.user.id) })
  })

  router.patch('/:id', adminOnly, async (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    const input = updateCategorySchema.parse(req.body)
    res.json({ data: await service.update(id, input, req.user.id) })
  })

  router.post('/:id/move', adminOnly, async (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    const { parentId } = moveCategorySchema.parse(req.body)
    res.json({ data: await service.move(id, parentId, req.user.id) })
  })

  router.post('/:id/archive', adminOnly, async (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    res.json({ data: await service.archive(id, req.user.id) })
  })

  router.post('/:id/restore', adminOnly, async (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    res.json({ data: await service.restore(id, req.user.id) })
  })

  return router
}
