import express from 'express'
import { notificationRoutes } from './modules/notifications/notification.routes.js'
import compression from 'compression'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { logger } from './lib/logger.js'
import { prisma as defaultPrisma } from './lib/prisma.js'
import { requireAuth, requirePasswordChanged, requireRoles } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { categoryRoutes } from './modules/categories/category.routes.js'
import { documentRoutes } from './modules/documents/document.routes.js'
import { dataRoutes } from './modules/data/data.routes.js'
import { accountLinkRoutes, userRoutes } from './modules/users/user.routes.js'
import { importRoutes, sourceWorkbookRoutes } from './modules/imports/import.routes.js'
import { createStorage } from './lib/storage.js'
import { adminDashboardRoutes, viewerDashboardRoutes } from './modules/dashboard/dashboard.routes.js'
import { auditRoutes } from './modules/audit/audit.routes.js'
import { reportRoutes } from './modules/reports/report.routes.js'
import { trashRoutes } from './modules/trash/trash.routes.js'

export function createApp(prisma = defaultPrisma, storage = createStorage()) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
  app.use(cors({ origin: allowedOrigins(), credentials: true }))
  app.use(compression())
  app.use(pinoHttp({ logger, enabled: process.env.NODE_ENV !== 'test', serializers: { req: req => ({ id: req.id, method: req.method, path: req.url?.split('?')[0] }) } }))
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: req => req.path === '/health' || req.path === '/ready',
  }))
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ready', database: 'connected' })
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' })
    }
  })
  app.use('/api/auth', authRoutes(prisma))
  app.use('/api/auth', accountLinkRoutes(prisma))
  app.use('/api', requireAuth(prisma))
  app.use('/api', requirePasswordChanged)
  app.use('/api/admin', requireRoles('ADMIN'))
  app.use('/api/admin/users', userRoutes(prisma))
  app.use('/api/admin/categories', categoryRoutes(prisma))
  app.use('/api/admin/imports', importRoutes(prisma, storage))
  app.use('/api/admin/data', dataRoutes(prisma))
  app.use('/api/admin/documents', documentRoutes(prisma, storage))
  app.use('/api/admin/dashboard-widgets', adminDashboardRoutes(prisma))
  app.use('/api/admin/audit', auditRoutes(prisma))
  app.use('/api/admin/reports', reportRoutes(prisma))
  app.use('/api/admin/trash', trashRoutes(prisma, storage))
  app.use('/api/sources', sourceWorkbookRoutes(prisma, storage))
  app.use('/api/notifications', notificationRoutes(prisma))
  app.use('/api/categories', categoryRoutes(prisma))
  app.use('/api/data', dataRoutes(prisma))
  app.use('/api/documents', documentRoutes(prisma, storage))
  app.use('/api/dashboard', viewerDashboardRoutes(prisma))
  app.use('/api/reports', reportRoutes(prisma))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

function allowedOrigins() {
  const configured = process.env.CORS_ORIGINS
  if (!configured) return ['http://localhost:5173']
  return configured.split(',').map(origin => origin.trim()).filter(Boolean)
}
