import bcrypt from 'bcryptjs'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

describe('sign-in before approved populated migration', () => {
  it.each([false, true])('preserves credentials and refuses content while mappings are pending (schema present: %s)', async schemaPresent => {
    process.env.JWT_SECRET = 'isolated-compatibility-test-secret-over-32-characters'
    const password = 'Synthetic-compatibility-password!'
    const user = { id: 'legacy-main', email: 'legacy@example.test', name: 'Legacy Main', role: 'ADMIN', isPrimaryAdmin: true, isActive: true, mustChangePassword: false, loginResetRequired: false, passwordHash: await bcrypt.hash(password, 4) }
    let reads = 0
    const db = {
      user: {
        findUnique: async ({ select }) => { reads++; if (select.clearance && !schemaPresent) throw Object.assign(new Error('User.clearance does not exist'), { code: 'P2022' }); return schemaPresent ? { ...user, clearance: null, permissionVersion: 0 } : user },
        update: async ({ data, select }) => { expect(select.clearance).toBeUndefined(); return { ...user, ...data } },
      },
      refreshToken: { create: async () => ({}) },
    }
    const app = createApp(db)
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password })
    expect(login.status).toBe(200)
    expect(login.body.data.user.clearance).toBeNull()
    expect(login.body.data.user.workflowReady).toBe(false)
    expect(login.body.data.user.passwordHash).toBeUndefined()
    const headers = { Authorization: `Bearer ${login.body.data.accessToken}` }
    expect((await request(app).get('/api/auth/me').set(headers)).status).toBe(200)
    for (const path of ['/api/categories', '/api/dashboard', '/api/admin/users']) {
      const blocked = await request(app).get(path).set(headers)
      expect(blocked.status).toBe(503)
      expect(blocked.body.error.code).toBe('WORKFLOW_MAPPING_REQUIRED')
    }
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong-synthetic-password!' })).status).toBe(401)
    expect(reads).toBeGreaterThan(1)
  })
})
