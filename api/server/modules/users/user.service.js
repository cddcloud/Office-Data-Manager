import { assertAccountTarget, canManageUsers, isMainAdmin, resolveActor } from '../../lib/access.js'
import bcrypt from 'bcryptjs'
import { createAuditService } from '../../lib/audit.js'
import { DomainError } from '../../lib/errors.js'
import { missingWorkflowSchema } from '../auth/auth-user.js'
import {
  createAccountToken,
  hashAccountToken,
  inviteExpiresAt,
  resetExpiresAt,
  resetUrl,
  setupUrl,
} from './account-tokens.js'

const selectPublic = {
  id: true,
  email: true,
  name: true,
  role: true,
  clearance: true,
  isActive: true,
  isPrimaryAdmin: true,
  loginResetRequired: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
}

const conflict = (code, message) => new DomainError(409, code, message)
const forbidden = message => new DomainError(403, 'PRIMARY_ADMIN_PROTECTED', message)
const normalizeEmail = email => email.trim().toLowerCase()
const isUniqueConstraintError = error => error?.code === 'P2002'

function assertMutableAccount(user, input = {}) {
  if (!user.isPrimaryAdmin) return
  if (input.clearance !== undefined) throw forbidden('The Main Admin clearance cannot be changed')
  if (input.role !== undefined && input.role !== 'ADMIN') throw forbidden('The Main Admin role cannot be changed')
  if (input.isActive === false) throw forbidden('The Main Admin account cannot be disabled')
}

function publicInvite(invite) {
  const now = new Date()
  return {
    id: invite.id,
    kind: 'INVITATION',
    email: invite.email,
    name: invite.name,
    role: invite.role,
    clearance: invite.clearance,
    isActive: false,
    isPrimaryAdmin: false,
    status: invite.revokedAt ? 'CANCELLED' : invite.acceptedAt ? 'ACCEPTED' : invite.expiresAt <= now ? 'EXPIRED' : 'SETUP_REQUIRED',
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  }
}

function publicAccount(user) {
  return { ...user, kind: 'USER', status: !user.isActive ? 'DISABLED' : user.loginResetRequired ? 'RESET_REQUIRED' : 'ACTIVE' }
}

async function validInvite(prisma, rawToken) {
  if (!rawToken) throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This account link is invalid or expired')
  const invite = await prisma.accountInvite.findUnique({ where: { tokenHash: hashAccountToken(rawToken) } })
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
    throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This account setup link is invalid or expired')
  }
  return invite
}

async function validReset(prisma, rawToken) {
  if (!rawToken) throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This account link is invalid or expired')
  const read = select => prisma.accountPasswordResetToken.findUnique({ where: { tokenHash: hashAccountToken(rawToken) }, include: { user: { select } } })
  let reset
  try { reset = await read(selectPublic) }
  catch (error) {
    if (!missingWorkflowSchema(error)) throw error
    const { clearance: _clearance, ...legacySelect } = selectPublic
    void _clearance
    reset = await read(legacySelect)
    if (reset) reset.user = { ...reset.user, workflowReady: false, clearance: null }
  }
  if (!reset || reset.revokedAt || reset.usedAt || reset.expiresAt <= new Date() || !reset.user.isActive) {
    throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This password reset link is invalid or expired')
  }
  return reset
}

export function createUserService(prisma) {
  return {
    async list(actor) {
      if (!canManageUsers(actor)) throw new DomainError(403, 'FORBIDDEN', 'Account management is unavailable')
      const scope = isMainAdmin(actor) ? {} : { role: 'VIEWER' }
      const [users, invites] = await Promise.all([
        prisma.user.findMany({ where: scope, select: selectPublic, orderBy: [{ isPrimaryAdmin: 'desc' }, { isActive: 'desc' }, { name: 'asc' }], take: 500 }),
        prisma.accountInvite.findMany({ where: { ...scope, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 500 }),
      ])
      return [...users.map(publicAccount), ...invites.map(publicInvite)]
    },

    async get(id, actor) {
      const user = await prisma.user.findUnique({ where: { id }, select: selectPublic })
      assertAccountTarget(actor, user)
      return publicAccount(user)
    },

    async invite(input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      assertAccountTarget(actor, input)
      if (!['ADMIN', 'VIEWER'].includes(input.role) || !['V1', 'V2', 'V3', 'V4'].includes(input.clearance) || (input.role === 'ADMIN' && input.clearance === 'V4')) throw new DomainError(422, 'INVALID_ACCOUNT_ACCESS', 'Select a permitted account role and clearance')
      const email = normalizeEmail(input.email)
      const now = new Date()
      const { rawToken, tokenHash } = createAccountToken()
      const expiresAt = inviteExpiresAt()
      let invitation
      try {
        invitation = await prisma.$transaction(async tx => {
          const existing = await tx.user.findUnique({ where: { email }, select: { id: true, isActive: true } })
          if (existing) throw conflict('ACCOUNT_ALREADY_EXISTS', existing.isActive ? 'An account already exists for this email' : 'This account is disabled; enable it instead')
          await tx.accountInvite.updateMany({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }, data: { revokedAt: now } })
          const pending = await tx.accountInvite.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } })
          if (pending) throw conflict('INVITATION_ALREADY_PENDING', 'A valid setup invitation already exists for this email')
          const created = await tx.accountInvite.create({ data: { email, name: input.name, role: input.role, clearance: input.clearance, tokenHash, expiresAt, createdById: actorId } })
          await createAuditService(tx).record({ actorId, action: 'ACCOUNT_INVITE_CREATED', entityType: 'AccountInvite', entityId: created.id, after: { email, name: input.name, role: input.role, clearance: input.clearance, expiresAt } })
          return created
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) throw conflict('INVITATION_ALREADY_PENDING', 'A valid setup invitation already exists for this email')
        throw error
      }
      return { invitation: publicInvite(invitation), setupUrl: setupUrl(rawToken) }
    },

    async regenerateInvite(id, actorId) {
      const current = await prisma.accountInvite.findUnique({ where: { id } })
      const actor = await resolveActor(prisma, actorId)
      assertAccountTarget(actor, current)
      if (current.acceptedAt || current.revokedAt) throw conflict('INVITATION_NOT_PENDING', 'This invitation is no longer pending')
      const { rawToken, tokenHash } = createAccountToken()
      const expiresAt = inviteExpiresAt()
      const invitation = await prisma.$transaction(async tx => {
        const changed = await tx.accountInvite.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { tokenHash, expiresAt } })
        if (changed.count !== 1) throw conflict('INVITATION_NOT_PENDING', 'This invitation is no longer pending')
        const updated = await tx.accountInvite.findUniqueOrThrow({ where: { id } })
        await createAuditService(tx).record({ actorId, action: 'ACCOUNT_SETUP_LINK_REGENERATED', entityType: 'AccountInvite', entityId: id, metadata: { expiresAt } })
        return updated
      })
      return { invitation: publicInvite(invitation), setupUrl: setupUrl(rawToken) }
    },

    async cancelInvite(id, actorId) {
      const current = await prisma.accountInvite.findUnique({ where: { id } })
      const actor = await resolveActor(prisma, actorId)
      assertAccountTarget(actor, current)
      if (current.acceptedAt || current.revokedAt) throw conflict('INVITATION_NOT_PENDING', 'This invitation is no longer pending')
      await prisma.$transaction(async tx => {
        const changed = await tx.accountInvite.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
        if (changed.count !== 1) throw conflict('INVITATION_NOT_PENDING', 'This invitation is no longer pending')
        await createAuditService(tx).record({ actorId, action: 'ACCOUNT_INVITE_CANCELLED', entityType: 'AccountInvite', entityId: id, before: { email: current.email, role: current.role } })
      })
    },

    async update(id, input, actorId) {
      const before = await prisma.user.findUnique({ where: { id }, select: selectPublic })
      const actor = await resolveActor(prisma, actorId)
      assertAccountTarget(actor, before)
      if (input.role && input.role !== before.role) throw new DomainError(403, 'FORBIDDEN', 'Account type cannot be changed; invite a new account instead')
      if (input.clearance && (!['V1', 'V2', 'V3', 'V4'].includes(input.clearance) || (before.role === 'ADMIN' && input.clearance === 'V4'))) throw new DomainError(422, 'INVALID_ACCOUNT_ACCESS', 'Admin clearance must be V1, V2 or V3')
      assertMutableAccount(before, input)
      if (input.isActive === false && id === actorId) throw conflict('SELF_DISABLE_BLOCKED', 'You cannot disable your current account')
      return prisma.$transaction(async tx => {
        const updated = await tx.user.update({ where: { id }, data: { ...input, ...((input.clearance && input.clearance !== before.clearance) || (input.isActive !== undefined && input.isActive !== before.isActive) ? { permissionVersion: { increment: 1 } } : {}) }, select: selectPublic })
        const audit = createAuditService(tx)
        if (input.clearance !== undefined && input.clearance !== before.clearance) {
          await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
          await audit.record({ actorId, action: 'USER_ACCESS_CHANGED', entityType: 'User', entityId: id, before: { role: before.role, clearance: before.clearance }, after: { role: updated.role, clearance: updated.clearance } })
        }
        if (input.isActive !== undefined && input.isActive !== before.isActive) {
          if (!input.isActive) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
          await audit.record({ actorId, action: input.isActive ? 'USER_ENABLED' : 'USER_DISABLED', entityType: 'User', entityId: id, before: { isActive: before.isActive }, after: { isActive: updated.isActive } })
        }
        if (input.name !== undefined && input.name !== before.name) {
          await audit.record({ actorId, action: 'USER_PROFILE_UPDATED', entityType: 'User', entityId: id, before: { name: before.name }, after: { name: updated.name } })
        }
        return publicAccount(updated)
      })
    },

    async resetLogin(id, actorId) {
      const user = await prisma.user.findUnique({ where: { id }, select: selectPublic })
      const actor = await resolveActor(prisma, actorId)
      assertAccountTarget(actor, user)
      if (user.isPrimaryAdmin) throw forbidden('The Main Admin login cannot be reset here')
      if (!user.isActive) throw conflict('ACCOUNT_DISABLED', 'Enable this account before resetting its login')
      const { rawToken, tokenHash } = createAccountToken()
      const expiresAt = resetExpiresAt()
      let token
      try {
        token = await prisma.$transaction(async tx => {
          const now = new Date()
          await tx.user.update({ where: { id }, data: { loginResetRequired: true, permissionVersion: { increment: 1 } } })
          await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } })
          await tx.accountPasswordResetToken.updateMany({ where: { userId: id, usedAt: null, revokedAt: null }, data: { revokedAt: now } })
          const created = await tx.accountPasswordResetToken.create({ data: { userId: id, createdById: actorId, tokenHash, expiresAt } })
          await createAuditService(tx).record({ actorId, action: 'ACCOUNT_RESET_LOGIN_CREATED', entityType: 'User', entityId: id, metadata: { tokenId: created.id, expiresAt } })
          return created
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) throw conflict('RESET_ALREADY_IN_PROGRESS', 'A login reset is already in progress; try again')
        throw error
      }
      return { id: token.id, expiresAt, resetUrl: resetUrl(rawToken) }
    },

    async validateSetup(rawToken) {
      const invite = await validInvite(prisma, rawToken)
      return { name: invite.name, email: invite.email, role: invite.role, clearance: invite.clearance, expiresAt: invite.expiresAt }
    },

    async completeSetup(rawToken, password) {
      const invite = await validInvite(prisma, rawToken)
      if (!['ADMIN', 'VIEWER'].includes(invite.role) || !invite.clearance || (invite.role === 'ADMIN' && invite.clearance === 'V4')) throw new DomainError(409, 'MAPPING_REQUIRED', 'This invitation requires an approved clearance mapping')
      const passwordHash = await bcrypt.hash(password, 12)
      return prisma.$transaction(async tx => {
        const active = await tx.accountInvite.findFirst({ where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })
        if (!active) throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This account setup link is invalid or expired')
        if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) throw conflict('ACCOUNT_ALREADY_EXISTS', 'An account already exists for this email')
        const user = await tx.user.create({ data: { email: invite.email, name: invite.name, role: invite.role, clearance: invite.clearance, passwordHash, isActive: true, mustChangePassword: false }, select: selectPublic })
        const changed = await tx.accountInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } })
        if (changed.count !== 1) throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This account setup link is no longer valid')
        await createAuditService(tx).record({ actorId: user.id, action: 'ACCOUNT_SETUP_COMPLETED', entityType: 'User', entityId: user.id, after: { email: user.email, role: user.role, clearance: user.clearance } })
        return publicAccount(user)
      })
    },

    async validateReset(rawToken) {
      const reset = await validReset(prisma, rawToken)
      return { name: reset.user.name, email: reset.user.email, expiresAt: reset.expiresAt }
    },

    async completeReset(rawToken, password) {
      const reset = await validReset(prisma, rawToken)
      const passwordHash = await bcrypt.hash(password, 12)
      return prisma.$transaction(async tx => {
        const active = await tx.accountPasswordResetToken.findFirst({ where: { id: reset.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })
        if (!active) throw new DomainError(400, 'INVALID_ACCOUNT_LINK', 'This password reset link is no longer valid')
        const { clearance: _clearance, ...legacySelect } = selectPublic
        void _clearance
        const user = await tx.user.update({ where: { id: reset.userId }, data: { passwordHash, mustChangePassword: false, loginResetRequired: false }, select: reset.user.workflowReady === false ? legacySelect : selectPublic })
        await tx.accountPasswordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
        await tx.accountPasswordResetToken.updateMany({ where: { userId: reset.userId, id: { not: reset.id }, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
        await tx.refreshToken.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } })
        await createAuditService(tx).record({ actorId: reset.userId, action: 'ACCOUNT_PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: reset.userId, metadata: { tokenId: reset.id } })
        return publicAccount(user)
      })
    },
  }
}
