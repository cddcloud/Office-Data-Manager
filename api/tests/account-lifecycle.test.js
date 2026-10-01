import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { createUserService } from '../server/modules/users/user.service.js'
import { hashAccountToken } from '../server/modules/users/account-tokens.js'
import { createAuthService } from '../server/modules/auth/auth.service.js'

const pick = (row, select) => select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row

function memoryDatabase() {
  const state = { users: [], invites: [], resets: [], refreshTokens: [], audits: [] }
  let sequence = 0
  const active = row => !row.acceptedAt && !row.usedAt && !row.revokedAt && row.expiresAt > new Date()
  const db = {
    state,
    user: {
      findUnique: async ({ where, select }) => {
        const row = state.users.find(item => item.id === where.id || item.email === where.email) || (where.id?.includes('admin') ? {id:where.id,role:'ADMIN',clearance:'V1',isActive:true} : null)
        return row ? pick(row, select) : null
      },
      findMany: async () => state.users,
      create: async ({ data, select }) => {
        const row = { id: `user-${++sequence}`, isPrimaryAdmin: false, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }
        state.users.push(row)
        return pick(row, select)
      },
      update: async ({ where, data, select }) => {
        const row = state.users.find(item => item.id === where.id)
        Object.assign(row, data, { updatedAt: new Date() })
        return pick(row, select)
      },
    },
    accountInvite: {
      findUnique: async ({ where }) => state.invites.find(item => item.id === where.id || item.tokenHash === where.tokenHash) || null,
      findUniqueOrThrow: async ({ where }) => state.invites.find(item => item.id === where.id),
      findFirst: async ({ where }) => state.invites.find(item => (!where.id || item.id === where.id) && (!where.email || item.email === where.email) && active(item)) || null,
      findMany: async () => state.invites.filter(item => !item.acceptedAt && !item.revokedAt),
      create: async ({ data }) => {
        const row = { id: `invite-${++sequence}`, acceptedAt: null, revokedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }
        state.invites.push(row)
        return row
      },
      updateMany: async ({ where, data }) => {
        const rows = state.invites.filter(item => {
          const expiryMatches = !where.expiresAt
            || (where.expiresAt.lte && item.expiresAt <= where.expiresAt.lte)
            || (where.expiresAt.gt && item.expiresAt > where.expiresAt.gt)
          return (!where.id || item.id === where.id) && (!where.email || item.email === where.email) && !item.acceptedAt && !item.revokedAt && expiryMatches
        })
        rows.forEach(item => Object.assign(item, data, { updatedAt: new Date() }))
        return { count: rows.length }
      },
    },
    accountPasswordResetToken: {
      findUnique: async ({ where }) => {
        const row = state.resets.find(item => item.tokenHash === where.tokenHash)
        return row ? { ...row, user: state.users.find(user => user.id === row.userId) } : null
      },
      findFirst: async ({ where }) => state.resets.find(item => item.id === where.id && active(item)) || null,
      create: async ({ data }) => {
        const row = { id: `reset-${++sequence}`, usedAt: null, revokedAt: null, createdAt: new Date(), ...data }
        state.resets.push(row)
        return row
      },
      update: async ({ where, data }) => Object.assign(state.resets.find(item => item.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const rows = state.resets.filter(item => (!where.userId || item.userId === where.userId) && (!where.id?.not || item.id !== where.id.not) && !item.usedAt && !item.revokedAt)
        rows.forEach(item => Object.assign(item, data))
        return { count: rows.length }
      },
    },
    refreshToken: {
      updateMany: async ({ where, data }) => {
        const rows = state.refreshTokens.filter(item => item.userId === where.userId && !item.revokedAt)
        rows.forEach(item => Object.assign(item, data))
        return { count: rows.length }
      },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data } },
    $transaction: callback => callback(db),
  }
  return db
}

describe('account invitation and reset lifecycle', () => {
  it('maps database uniqueness races to clean conflict responses', async () => {
    const inviteDb = memoryDatabase()
    inviteDb.accountInvite.create = async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }) }
    await expect(createUserService(inviteDb).invite({ email: 'race@example.test', name: 'Race', role: 'VIEWER', clearance: 'V4', permissionVersion: 0 }, 'admin-1'))
      .rejects.toMatchObject({ status: 409, code: 'INVITATION_ALREADY_PENDING' })

    const resetDb = memoryDatabase()
    resetDb.state.users.push({ id: 'viewer', email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, isActive: true, isPrimaryAdmin: false })
    resetDb.accountPasswordResetToken.create = async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }) }
    await expect(createUserService(resetDb).resetLogin('viewer', 'admin-1'))
      .rejects.toMatchObject({ status: 409, code: 'RESET_ALREADY_IN_PROGRESS' })
  })

  it('rejects duplicate active accounts and duplicate pending invitations', async () => {
    const activeDb = memoryDatabase()
    activeDb.state.users.push({ id: 'viewer', email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, isActive: true })
    await expect(createUserService(activeDb).invite({ email: 'VIEWER@example.test', name: 'Duplicate', role: 'VIEWER', clearance: 'V2', permissionVersion: 0 }, 'admin-1'))
      .rejects.toMatchObject({ code: 'ACCOUNT_ALREADY_EXISTS' })

    const pendingDb = memoryDatabase()
    const pendingService = createUserService(pendingDb)
    await pendingService.invite({ email: 'pending@example.test', name: 'Pending Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0 }, 'admin-1')
    await expect(pendingService.invite({ email: 'pending@example.test', name: 'Pending Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0 }, 'admin-1'))
      .rejects.toMatchObject({ code: 'INVITATION_ALREADY_PENDING' })
  })

  it('rejects cancelled and expired setup links', async () => {
    const db = memoryDatabase()
    const service = createUserService(db)
    const cancelled = await service.invite({ email: 'cancelled@example.test', name: 'Cancelled Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0 }, 'admin-1')
    const cancelledToken = new URL(cancelled.setupUrl).searchParams.get('token')
    await service.cancelInvite(cancelled.invitation.id, 'admin-1')
    await expect(service.validateSetup(cancelledToken)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_LINK' })

    const expired = await service.invite({ email: 'expired@example.test', name: 'Expired Viewer', role: 'VIEWER', clearance: 'V2', permissionVersion: 0 }, 'admin-1')
    const expiredToken = new URL(expired.setupUrl).searchParams.get('token')
    const expiredRow = db.state.invites.find(item => item.id === expired.invitation.id)
    expiredRow.expiresAt = new Date(Date.now() - 1000)
    await expect(service.validateSetup(expiredToken)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_LINK' })
  })

  it('rotates setup links and accepts an invitation only once', async () => {
    const db = memoryDatabase()
    const service = createUserService(db)
    const first = await service.invite({ email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V2', permissionVersion: 0 }, 'admin-1')
    const firstToken = new URL(first.setupUrl).searchParams.get('token')
    expect(db.state.invites[0].tokenHash).toBe(hashAccountToken(firstToken))
    expect(db.state.users).toHaveLength(0)

    const rotated = await service.regenerateInvite(first.invitation.id, 'admin-1')
    const nextToken = new URL(rotated.setupUrl).searchParams.get('token')
    await expect(service.validateSetup(firstToken)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_LINK' })
    await expect(service.validateSetup(nextToken)).resolves.toMatchObject({ email: 'viewer@example.test' })

    const user = await service.completeSetup(nextToken, 'Strong-password-2026')
    expect(user.role).toBe('VIEWER')
    expect(await bcrypt.compare('Strong-password-2026', db.state.users[0].passwordHash)).toBe(true)
    await expect(service.completeSetup(nextToken, 'Another-password-2026')).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_LINK' })
  })

  it('protects the Main Admin from demotion, disablement, and reset', async () => {
    const db = memoryDatabase()
    db.state.users.push({ id: 'primary', email: 'admin@example.test', name: 'Main Admin', role: 'ADMIN', clearance: 'V1', permissionVersion: 0, isActive: true, isPrimaryAdmin: true })
    const service = createUserService(db)
    await expect(service.update('primary', { role: 'VIEWER', clearance: 'V2', permissionVersion: 0 }, 'other-admin')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.update('primary', { isActive: false }, 'other-admin')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.resetLogin('primary', 'other-admin')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rotates reset links, revokes sessions, and consumes the reset token once', async () => {
    const db = memoryDatabase()
    db.state.users.push({ id: 'viewer', email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, isActive: true, isPrimaryAdmin: false, passwordHash: await bcrypt.hash('Old-password-2026', 4) })
    db.state.refreshTokens.push({ id: 'session-1', userId: 'viewer', revokedAt: null })
    const service = createUserService(db)
    const first = await service.resetLogin('viewer', 'admin-1')
    const firstToken = new URL(first.resetUrl).searchParams.get('token')
    expect(db.state.refreshTokens[0].revokedAt).toBeInstanceOf(Date)
    await expect(createAuthService(db).login({ email: 'viewer@example.test', password: 'Old-password-2026' })).rejects.toMatchObject({ code: 'LOGIN_RESET_REQUIRED' })
    const second = await service.resetLogin('viewer', 'admin-1')
    const secondToken = new URL(second.resetUrl).searchParams.get('token')
    await expect(service.validateReset(firstToken)).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_LINK' })
    await service.completeReset(secondToken, 'New-password-2026')
    expect(await bcrypt.compare('New-password-2026', db.state.users[0].passwordHash)).toBe(true)
    await expect(service.completeReset(secondToken, 'Again-password-2026')).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_LINK' })
  })
})
