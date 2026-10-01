import jwt from 'jsonwebtoken'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

const secret = 'integration-test-secret-value'
const token = () => jwt.sign({ role: 'VIEWER', clearance: 'V4', permissionVersion: 0, name: 'Viewer' }, secret, { subject: 'viewer-1' })
const rootId = 'cl00000000000000000000001'
const childId = 'cl00000000000000000000002'
const deepId = 'cl00000000000000000000003'

function persistence() {
  const calls = { dataWhere: null, documentWhere: null }
  return {
    calls,
    user: { findUnique: async () => ({ id: 'viewer-1', email: 'viewer@example.test', role: 'VIEWER', clearance: 'V4', permissionVersion: 0, name: 'Viewer', isActive: true, mustChangePassword: false }) },
    category: { findFirst: async () => ({ id: rootId }),findMany:async()=>[rootId,childId,deepId].map(id=>({id,parentId:null,accessLevel:'V4',archivedAt:null})) },
    $queryRaw: async () => [{ id: rootId }, { id: childId }, { id: deepId }],
    dataRecord: {count:async()=>1, findMany: async ({ where }) => { calls.dataWhere = where; return [{ id: 'data-1', categoryId: deepId }] } },
    document: {count:async()=>1, findMany: async ({ where }) => { calls.documentWhere = where; return [{ id: 'doc-1', categoryId: childId }] } },
  }
}

describe('Category integrations', () => {
  beforeAll(() => { process.env.JWT_SECRET = secret })

  it('filters Data by the selected category subtree', async () => {
    const db = persistence()
    const response = await request(createApp(db)).get(`/api/data?categoryId=${rootId}&includeDescendants=true`).set('Authorization', `Bearer ${token()}`)
    expect(response.status).toBe(200)
    expect(db.calls.dataWhere.categoryId.in).toEqual([rootId, childId, deepId])
    expect(response.body.meta.categoryId).toBe(rootId)
  })

  it('filters Documents by the selected category subtree', async () => {
    const db = persistence()
    const response = await request(createApp(db)).get(`/api/documents?categoryId=${rootId}&includeDescendants=true`).set('Authorization', `Bearer ${token()}`)
    expect(response.status).toBe(200)
    expect(db.calls.documentWhere.categoryId.in).toEqual([rootId, childId, deepId])
    expect(response.body.data[0].id).toBe('doc-1')
  })
})
