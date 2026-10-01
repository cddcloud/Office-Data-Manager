import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAuthService } from '../server/modules/auth/auth.service.js'
import { createUserService } from '../server/modules/users/user.service.js'
import { hashAccountToken } from '../server/modules/users/account-tokens.js'

function memoryDatabase() {
  const state = { users: [], tokens: [], audits: [], invites: [] }
  let sequence = 0
  const db = {
    state,
    user: {
      findUnique: async ({ where }) => state.users.find(user => user.id === where.id || user.email === where.email) || (where.id?.startsWith('admin') ? {id:where.id,role:'ADMIN',clearance:'V1',isActive:true}:null),
      findMany: async () => state.users,
      create: async ({ data, select }) => {
        const user = { id: `user-${++sequence}`, isActive: true, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }
        state.users.push(user)
        return select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, user[key]])) : user
      },
      update: async ({ where, data }) => {
        const index = state.users.findIndex(user => user.id === where.id)
        state.users[index] = { ...state.users[index], ...data, updatedAt: new Date() }
        return state.users[index]
      },
    },
    refreshToken: {
      create: async ({ data }) => { const row = { id: `token-${state.tokens.length + 1}`, revokedAt: null, ...data }; state.tokens.push(row); return row },
      findUnique: async ({ where }) => {
        const token = state.tokens.find(item => item.tokenHash === where.tokenHash)
        return token ? { ...token, user: state.users.find(user => user.id === token.userId) } : null
      },
      update: async ({ where, data }) => Object.assign(state.tokens.find(item => item.id === where.id), data),
      updateMany: async ({ where, data }) => { state.tokens.filter(item => item.userId === where.userId && !item.revokedAt).forEach(item => Object.assign(item, data)) },
    },
    accountInvite: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async ({ where }) => state.invites.find(invite => invite.email === where.email && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date()) || null,
      create: async ({ data }) => {
        const invite = { id: `invite-${state.invites.length + 1}`, acceptedAt: null, revokedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }
        state.invites.push(invite)
        return invite
      },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data } },
    $transaction: callback => callback(db),
  }
  return db
}

describe('authentication and user access', () => {
  beforeEach(() => { process.env.JWT_SECRET = 'test-secret-value-with-at-least-32-characters' })

  it('creates a viewer invitation with a hashed one-time setup token', async () => {
    const db = memoryDatabase()
    const result = await createUserService(db).invite({ email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V2', permissionVersion: 0 }, 'admin-1')
    const rawToken = new URL(result.setupUrl).searchParams.get('token')
    expect(db.state.users).toHaveLength(0)
    expect(db.state.invites[0].tokenHash).toBe(hashAccountToken(rawToken))
    expect(db.state.invites[0].tokenHash).not.toBe(rawToken)
    expect(db.state.audits[0].action).toBe('ACCOUNT_INVITE_CREATED')
  })

  it('logs in active V4/V2 users and refuses disabled accounts', async () => {
    const db = memoryDatabase()
    const passwordHash = await bcrypt.hash('A-secure-password-1', 4)
    db.state.users.push({ id: 'vip-1', email: 'vip@example.test', name: 'VIP', role: 'VIEWER', clearance: 'V2', permissionVersion: 0, passwordHash, isActive: true, mustChangePassword: false })
    const result = await createAuthService(db).login({ email: 'VIP@example.test', password: 'A-secure-password-1' })
    expect(result.user.role).toBe('VIEWER')
    expect(result.accessToken).toBeTruthy()
    expect(db.state.tokens).toHaveLength(1)
    db.state.users[0].isActive = false
    await expect(createAuthService(db).login({ email: 'vip@example.test', password: 'A-secure-password-1' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('forces password change and revokes active sessions', async () => {
    const db = memoryDatabase()
    db.state.users.push({ id: 'user-1', email: 'normal@example.test', name: 'Normal', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, passwordHash: await bcrypt.hash('Temporary-pass-1', 4), isActive: true, mustChangePassword: true })
    db.state.tokens.push({ id: 'token-1', userId: 'user-1', revokedAt: null })
    const user = await createAuthService(db).changePassword('user-1', 'Temporary-pass-1', 'Permanent-pass-2')
    expect(user.mustChangePassword).toBe(false)
    expect(db.state.tokens[0].revokedAt).toBeInstanceOf(Date)
    expect(db.state.audits.at(-1).action).toBe('USER_PASSWORD_CHANGED')
  })

  it('audits role, account status, and profile changes as separate events', async () => {
    const db = memoryDatabase()
    db.state.users.push({ id: 'user-1', email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, isActive: true, mustChangePassword: false })
    db.state.tokens.push({ id: 'token-1', userId: 'user-1', revokedAt: null })
    await createUserService(db).update('user-1', { name: 'V2 Viewer', clearance: 'V2', isActive: false }, 'admin-1')
    expect(db.state.audits.map(event => event.action)).toEqual(['USER_ACCESS_CHANGED', 'USER_DISABLED', 'USER_PROFILE_UPDATED'])
    expect(db.state.tokens[0].revokedAt).toBeInstanceOf(Date)
  })

  it('deactivates immediately, blocks login and refresh, then reactivates without changing the password', async () => {
    const db = memoryDatabase()
    const password = 'Permanent-password-2026'
    db.state.users.push({ id: 'user-1', email: 'viewer@example.test', name: 'Viewer', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, passwordHash: await bcrypt.hash(password, 4), isActive: true, isPrimaryAdmin: false, loginResetRequired: false, mustChangePassword: false })
    const initial = await createAuthService(db).login({ email: 'viewer@example.test', password })
    await createUserService(db).update('user-1', { isActive: false }, 'admin-1')
    expect(db.state.tokens[0].revokedAt).toBeInstanceOf(Date)
    await expect(createAuthService(db).login({ email: 'viewer@example.test', password })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(createAuthService(db).refresh(initial.refreshToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' })
    await createUserService(db).update('user-1', { isActive: true }, 'admin-1')
    await expect(createAuthService(db).login({ email: 'viewer@example.test', password })).resolves.toMatchObject({ user: { isActive: true } })
    expect(db.state.audits.map(event => event.action)).toContain('USER_DISABLED')
    expect(db.state.audits.map(event => event.action)).toContain('USER_ENABLED')
  })
})
