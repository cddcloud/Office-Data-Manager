import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { DomainError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'
import multer from 'multer'

export function notFoundHandler(req, _res, next) {
  next(new DomainError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`))
}

export function errorHandler(error, req, res, next) {
  void next
  if (error instanceof ZodError) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten() } })
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422
    return res.status(status).json({ error: { code: error.code, message: error.message } })
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return res.status(409).json({ error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with the same unique value already exists', details: error.meta?.target } })
  }
  if (error instanceof DomainError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } })
  }
  logger.error({ err: error, requestId: req.id }, 'Unhandled request error')
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
}
