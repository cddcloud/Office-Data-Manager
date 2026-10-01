import { z } from 'zod'

const id = z.string().min(1).max(64)
const name = z.string().trim().min(1).max(120)
const description = z.string().trim().max(1000).nullable().optional()

export const treeQuerySchema = z.object({
  search: z.string().trim().max(120).optional().default(''),
  includeArchived: z.enum(['true', 'false']).optional().transform(value => value === 'true'),
})

export const idParamSchema = z.object({ id })
export const createCategorySchema = z.object({ name, description, accessLevel: z.enum(['V1', 'V2', 'V3', 'V4']).default('V4'), parentId: id.nullable().optional(), sortOrder: z.number().int().min(0).max(100000).optional() })
export const updateCategorySchema = z.object({ name: name.optional(), description, accessLevel: z.enum(['V1', 'V2', 'V3', 'V4']).optional(), sortOrder: z.number().int().min(0).max(100000).optional() }).refine(value => Object.keys(value).length > 0, 'At least one field is required')
export const moveCategorySchema = z.object({ parentId: id.nullable() })

