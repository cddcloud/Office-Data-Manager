import { contentDisposition } from '../../lib/content-disposition.js'
import { Router } from 'express'
import { z } from 'zod'
import { createReportService } from './report.service.js'

const jsonObject = z.string().transform((value, context) => { try { const parsed = JSON.parse(value); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(); return parsed } catch { context.addIssue({ code: 'custom', message: 'Expected a JSON object' }); return z.NEVER } }).optional()
const querySchema = z.object({ dataCollectionId: z.string().cuid(), categoryId: z.string().cuid().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), filters: jsonObject, accessLevel: z.enum(['V1', 'V2', 'V3', 'V4']).optional(), format: z.enum(['json', 'xlsx', 'pdf']).default('json') })

export function reportRoutes(prisma) {
  const router = Router()
  const service = createReportService(prisma)
  router.get('/export', async (req, res) => {
    const result = await service.generate(querySchema.parse(req.query), req.user)
    if (result.mimeType === 'application/json') return res.json({ data: result.body })
    res.set({ 'Content-Type': result.mimeType, 'Content-Disposition': contentDisposition('attachment', result.fileName), 'Content-Length': result.body.length }).send(result.body)
  })
  return router
}
