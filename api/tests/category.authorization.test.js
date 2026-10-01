import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

const secret = 'test-only-secret-that-is-long-enough'

describe('category authorization', () => {
  beforeAll(() => { process.env.JWT_SECRET = secret })

  it('requires authentication for category reads', async () => {
    const response = await request(createApp({ user: { findUnique: async () => null } })).get('/api/categories')
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects category mutations from a viewer before touching persistence', async () => {
    const token = jwt.sign({ role: 'VIEWER', clearance: 'V4', permissionVersion: 0, name: 'Viewer' }, secret, { subject: 'viewer-1' })
    const response = await request(createApp({ user: { findUnique: async () => ({ id: 'viewer-1', email: 'viewer@example.test', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, name: 'Viewer', isActive: true, mustChangePassword: false }) } })).post('/api/categories').set('Authorization', `Bearer ${token}`).send({ name: 'Blocked' })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('protects the complete admin namespace from viewer accounts', async () => {
    const token = jwt.sign({ role: 'VIEWER', clearance: 'V4', permissionVersion: 0, name: 'Viewer' }, secret, { subject: 'viewer-1' })
    const response = await request(createApp({ user: { findUnique: async () => ({ id: 'viewer-1', email: 'viewer@example.test', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, name: 'Viewer', isActive: true, mustChangePassword: false }) } })).get('/api/admin/data').set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('rejects malformed category input for an administrator', async () => {
    const token = jwt.sign({ role: 'ADMIN', clearance: 'V1', permissionVersion: 0, name: 'Admin' }, secret, { subject: 'admin-1' })
    const response = await request(createApp({ user: { findUnique: async () => ({ id: 'admin-1', email: 'admin@example.test', role: 'ADMIN', clearance: 'V1', permissionVersion: 0, name: 'Admin', isActive: true, mustChangePassword: false }) } })).post('/api/categories').set('Authorization', `Bearer ${token}`).send({ name: '' })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })
})
