import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { DomainError } from '../../lib/errors.js'
import { createAuditService } from '../../lib/audit.js'
import { authUserSelect, authUserValue, findAuthUser, missingWorkflowSchema } from './auth-user.js'

const publicUser = user => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  clearance: user.clearance,
  workflowReady: user.workflowReady !== false,
  isActive: user.isActive,
  isPrimaryAdmin: user.isPrimaryAdmin,
  loginResetRequired: user.loginResetRequired,
  mustChangePassword: user.mustChangePassword,
  lastLoginAt: user.lastLoginAt,
})

const tokenHash = token => createHash('sha256').update(token).digest('hex')

function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw new Error('JWT_SECRET must contain at least 24 characters')
  }
  return process.env.JWT_SECRET
}

function accessToken(user) {
  const expiresIn = /** @type {import('jsonwebtoken').SignOptions['expiresIn']} */ (process.env.ACCESS_TOKEN_TTL || '15m')
  return jwt.sign(
    { permissionVersion: user.permissionVersion, role: user.role, name: user.name, mustChangePassword: user.mustChangePassword },
    secret(),
    { subject: user.id, expiresIn, algorithm: 'HS256' },
  )
}

async function refreshToken(prisma, userId) {
  const token = randomBytes(48).toString('base64url')
  const days = Math.max(1, Math.min(90, Number(process.env.REFRESH_TOKEN_DAYS || 14)))
  await prisma.refreshToken.create({
    data: { tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + days * 86_400_000) },
  })
  return token
}

export function createAuthService(prisma) {
  return {
    async login({ email, password }) {
      const user = await findAuthUser(prisma, { email: email.trim().toLowerCase() })
      if (!user || !user.isActive || !await bcrypt.compare(password, user.passwordHash)) {
        throw new DomainError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
      }
      if (user.loginResetRequired) throw new DomainError(403, 'LOGIN_RESET_REQUIRED', 'Use the secure reset link before signing in again')
      const updated = authUserValue(await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: authUserSelect(user.workflowReady) }), user.workflowReady)
      return { accessToken: accessToken(updated), refreshToken: await refreshToken(prisma, user.id), user: publicUser(updated) }
    },

    async refresh(rawToken) {
      const readSession = ready => prisma.refreshToken.findUnique({ where: { tokenHash: tokenHash(rawToken) }, include: { user: { select: authUserSelect(ready) } } })
      let ready = true
      let session
      try { session = await readSession(true) }
      catch (error) { if (!missingWorkflowSchema(error)) throw error; ready = false; session = await readSession(false) }
      if (session) session.user = authUserValue(session.user, ready)
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive || session.user.loginResetRequired) {
        throw new DomainError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired')
      }
      return prisma.$transaction(async tx => {
        const revoked = await tx.refreshToken.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } })
        if (revoked.count !== 1) throw new DomainError(401, 'REFRESH_TOKEN_REUSED', 'The refresh session has already been used')
        const nextRefresh = await refreshToken(tx, session.userId)
        return { accessToken: accessToken(session.user), refreshToken: nextRefresh, user: publicUser(session.user) }
      })
    },

    async logout(rawToken) {
      if (!rawToken) return
      await prisma.refreshToken.updateMany({
        where: { tokenHash: tokenHash(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    },

    async changePassword(userId, currentPassword, newPassword) {
      const user = await findAuthUser(prisma, { id: userId })
      if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) {
        throw new DomainError(401, 'INVALID_CURRENT_PASSWORD', 'The current password is incorrect')
      }
      const passwordHash = await bcrypt.hash(newPassword, 12)
      const updated = await prisma.$transaction(async tx => {
        const result = await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false }, select: authUserSelect(user.workflowReady) })
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
        await createAuditService(tx).record({ actorId: userId, action: 'USER_PASSWORD_CHANGED', entityType: 'User', entityId: userId })
        return result
      })
      return publicUser(authUserValue(updated, user.workflowReady))
    },

    publicUser,
  }
}
