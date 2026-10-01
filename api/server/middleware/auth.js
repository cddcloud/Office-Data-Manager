import jwt from 'jsonwebtoken'
import { canManageUsers, isContentAdmin, isMainAdmin } from '../lib/access.js'
import { DomainError } from '../lib/errors.js'
import { findAuthUser } from '../modules/auth/auth-user.js'

const bearerToken = (header = '') => header.startsWith('Bearer ') ? header.slice(7) : null

export function requireAuth(prisma) {
  return async (req, _res, next) => {
    const token = bearerToken(req.headers.authorization)
    if (!token) return next(new DomainError(401, 'UNAUTHENTICATED', 'Authentication is required'))
    try {
      const secret = process.env.JWT_SECRET
      if (!secret) throw new Error('JWT_SECRET is not configured')
      const payload = /** @type {import('jsonwebtoken').JwtPayload} */ (jwt.verify(token, secret, { algorithms: ['HS256'] }))
      const user = await findAuthUser(prisma, { id: payload.sub })
      if (!user?.isActive) return next(new DomainError(401, 'ACCOUNT_INACTIVE', 'The account is unavailable'))
      if (user.loginResetRequired) return next(new DomainError(401, 'LOGIN_RESET_REQUIRED', 'Use the secure reset link before signing in again'))
      if ((payload.permissionVersion ?? 0) !== user.permissionVersion) return next(new DomainError(401, 'PERMISSIONS_CHANGED', 'Sign in again after your permissions changed'))
      req.user = { id: user.id, email: user.email, role: user.role, clearance: user.clearance, permissionVersion: user.permissionVersion, workflowReady: user.workflowReady, name: user.name, isPrimaryAdmin: user.isPrimaryAdmin, mustChangePassword: user.mustChangePassword }
      next()
    } catch (error) {
      if (error instanceof DomainError) return next(error)
      next(new DomainError(401, 'INVALID_TOKEN', 'The access token is invalid or expired'))
    }
  }
}

export function requirePasswordChanged(req, _res, next) {
  if (req.user?.workflowReady === false) return next(new DomainError(503, 'WORKFLOW_MAPPING_REQUIRED', 'Sign-in is available. Content access awaits the approved database migration and mappings.'))
  if (req.user?.mustChangePassword) {
    return next(new DomainError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change the temporary password before continuing'))
  }
  next()
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role) || (roles.includes('ADMIN') && req.user.role === 'ADMIN' && !isContentAdmin(req.user))) {
      return next(new DomainError(403, 'FORBIDDEN', 'You do not have permission to perform this action'))
    }
    next()
  }
}

export function requireAccountManager(req, _res, next) {
  return canManageUsers(req.user) ? next() : next(new DomainError(403, 'FORBIDDEN', 'Account management is unavailable'))
}

export function requireMainAdmin(req, _res, next) {
  return isMainAdmin(req.user) ? next() : next(new DomainError(403, 'FORBIDDEN', 'Main Admin access is required'))
}
