import { describe, expect, it } from 'vitest'
import { createDocumentService } from '../server/modules/documents/document.service.js'

function memoryDatabase() {
  const state = { documents: [], audits: [] }
  let sequence = 0
  const db = {
    state,
    user: {findUnique: async ({where})=>({id:where.id,role:'ADMIN',clearance:'V1',isActive:true}),findMany:async()=>[]},
    category: { findFirst: async () => ({ id: 'category-1', archivedAt:null }), findUnique: async()=>({id:'category-1',archivedAt:null}), findMany: async()=>[{id:'category-1',parentId:null,accessLevel:'V4',archivedAt:null},{id:'category-2',parentId:null,accessLevel:'V4',archivedAt:null}] },
    notification:{upsert:async()=>({id:'notice',kind:'DOCUMENT',targetId:'doc-1'})},
    notificationRead:{createMany:async()=>({count:0})},
    document: {
      count:async()=>state.documents.length,
      create: async ({ data, select }) => { const row = { id: `doc-${++sequence}`, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }; state.documents.push(row); return select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row },
      findFirst: async ({ where }) => state.documents.find(row => row.id === where.id && (!where.archivedAt || row.archivedAt === where.archivedAt) && where.accessLevel.in.includes(row.accessLevel)) || null,
      findMany: async ({ where, take }) => state.documents.filter(row => !row.archivedAt && where.accessLevel.in.includes(row.accessLevel)).slice(0, take),
      update: async ({ where, data, select }) => { const row = Object.assign(state.documents.find(item => item.id === where.id), data, { updatedAt: new Date() }); return select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data } },
    $transaction: callback => callback(db),
  }
  return db
}

describe('document service', () => {
  it('stores PDF metadata separately and never exposes the storage key', async () => {
    const db = memoryDatabase()
    const objects = new Map()
    const storage = { putObject: async ({ key, body }) => objects.set(key, body), getObject: async key => objects.get(key) }
    const service = createDocumentService(db, storage)
    const fileContents = Buffer.from('%PDF-test')
    const created = await service.upload({ file: { originalname: 'policy.pdf', mimetype: 'application/pdf', size: fileContents.length, buffer: fileContents }, title: 'Policy', categoryId: 'category-1', accessLevel: 'V2' }, 'admin-1')
    expect(created).not.toHaveProperty('storageKey')
    expect(db.state.documents[0]).toMatchObject({ createdById: 'admin-1', updatedById: 'admin-1' })
    await service.update(created.id, { title: 'Updated Policy' }, 'admin-2')
    expect(db.state.documents[0].updatedById).toBe('admin-2')
    expect(db.state.audits.at(-1)).toMatchObject({ action: 'DOCUMENT_UPDATED', actorId: 'admin-2' })
    await expect(service.get(created.id, { role: 'VIEWER', clearance: 'V4' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await service.download(created.id, { role: 'VIEWER', clearance: 'V2' })).buffer.toString()).toBe('%PDF-test')
    expect(db.state.audits[0].action).toBe('DOCUMENT_UPLOADED')
  })

  it('rejects files whose content does not match the declared MIME type', async () => {
    const db = memoryDatabase()
    const service = createDocumentService(db, { putObject: async () => {} })
    await expect(service.upload({ file: { originalname: 'fake.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('JPG!') }, title: 'Fake', categoryId: 'category-1', accessLevel: 'V4' }, 'admin-1')).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_CONTENT' })
  })

  it('filters V4/V2 metadata before listing and supports archive/restore', async () => {
    const db = memoryDatabase()
    db.state.documents.push(
      { id: 'normal', title: 'Normal', accessLevel: 'V4', archivedAt: null },
      { id: 'vip', title: 'VIP', categoryId:'category-1', accessLevel: 'V2', archivedAt: null },
    )
    const service = createDocumentService(db, { getObject: async () => Buffer.alloc(0) })
    expect((await service.list({ limit: 50 }, { role: 'VIEWER', clearance: 'V4' })).data.map(item => item.id)).toEqual(['normal'])
    expect((await service.list({ limit: 50 }, { role: 'VIEWER', clearance: 'V2' })).data.map(item => item.id)).toEqual(['normal', 'vip'])
    expect((await service.archive('vip', 'admin-1')).archivedAt).toBeInstanceOf(Date)
    expect((await service.restore('vip', 'admin-1')).archivedAt).toBeNull()
  })
})
