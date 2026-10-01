import { describe, expect, it, vi } from 'vitest'
import { createTrashService, TRASH_RETENTION_DAYS } from '../server/modules/trash/trash.service.js'

function memoryDatabase(now = new Date()) {
  const old = new Date(now.getTime() - (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000)
  const state = {
    categories: [
      { id: 'root-deleted', name: 'Deleted Folder', parentId: 'active-folder', accessLevel:'V4', archivedAt: old, updatedAt: old },
      { id: 'child-deleted', name: 'Child', parentId: 'root-deleted', accessLevel:'V4', archivedAt: old, updatedAt: old },
      { id: 'active-folder', name: 'Active Folder', parentId: null, accessLevel:'V4', archivedAt: null, updatedAt: now },
    ],
    collections: [{ id: 'hidden-collection', name: 'Hidden', categoryId: 'child-deleted', archivedAt: old, updatedAt: old, _count: { records: 2 } }],
    documents: [{ id: 'old-document', title: 'Old PDF', categoryId: 'active-folder', archivedAt: old, updatedAt: old, fileSize: 10, mimeType: 'application/pdf', storageKey: 'documents/old.pdf', accessLevel: 'V4' }],
    audits: [],
  }
  const db = {
    state,
    user:{findUnique:async({where})=>({id:where.id,role:'ADMIN',clearance:'V1',isActive:true})},
    category: {
      findMany: async ({ where, select } = {}) => {
        let rows = state.categories
        if (where?.parentId?.in) rows = rows.filter(row => where.parentId.in.includes(row.parentId))
        return rows.map(row => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row)
      },
      findFirst: async ({ where }) => state.categories.find(row => row.id === where.id && (where.archivedAt === undefined || row.archivedAt === where.archivedAt)) || null,
      findUnique: async ({ where }) => state.categories.find(row => row.id === where.id) || null,
    },
    dataCollection: { findMany: async ({ where } = {}) => state.collections.filter(row => !where?.archivedAt || row.archivedAt).map(row => ({ ...row })) },
    document: {
      findMany: async ({ where, select } = {}) => state.documents.filter(row => !where?.archivedAt || row.archivedAt).map(row => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row),
      findUnique: async ({ where }) => state.documents.find(row => row.id === where.id) || null,
      findFirst: async ({ where }) => state.documents.find(row => row.id === where.id && where.accessLevel.in.includes(row.accessLevel)) || null,
      update: async ({ where, data, select }) => { const row = Object.assign(state.documents.find(item => item.id === where.id), data); return select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row },
      delete: async ({ where }) => { const index = state.documents.findIndex(row => row.id === where.id); return state.documents.splice(index, 1)[0] },
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data } },
    $transaction: callback => callback(db),
  }
  return db
}

describe('File Manager trash service', () => {
  it('lists only top-level deleted units with location and 30-day auto-delete metadata', async () => {
    const db = memoryDatabase()
    const service = createTrashService(db, { deleteObject: vi.fn() })
    const items = await service.list()
    expect(items.map(item => item.id).sort()).toEqual(['old-document', 'root-deleted'])
    expect(items.find(item => item.id === 'root-deleted')).toMatchObject({ itemType: 'FOLDER', originalLocation: 'Home / Active Folder' })
    expect(items.find(item => item.id === 'old-document').originalLocation).toBe('Home / Active Folder')
  })

  it('restores a soft-deleted document without deleting its physical object', async () => {
    const db = memoryDatabase()
    const storage = { deleteObject: vi.fn() }
    const service = createTrashService(db, storage)
    await service.restore('document', 'old-document', 'admin-1')
    expect(db.state.documents[0].archivedAt).toBeNull()
    expect(storage.deleteObject).not.toHaveBeenCalled()
    expect(db.state.audits.at(-1).action).toBe('DOCUMENT_RESTORED')
  })

  it('purges an eligible document and deletes its physical object, but protects fresh trash', async () => {
    const db = memoryDatabase()
    const storage = { deleteObject: vi.fn(async () => {}) }
    const service = createTrashService(db, storage)
    db.state.documents.push({ id: 'fresh', title: 'Fresh', categoryId: 'active-folder', archivedAt: new Date(), storageKey: 'documents/fresh.pdf', accessLevel: 'V4' })
    await expect(service.purge('document', 'fresh', null)).rejects.toMatchObject({ code: 'RETENTION_ACTIVE' })
    await service.purge('document', 'old-document', null)
    expect(storage.deleteObject).toHaveBeenCalledWith('documents/old.pdf')
    expect(db.state.documents.some(item => item.id === 'old-document')).toBe(false)
    expect(db.state.audits.at(-1).action).toBe('DOCUMENT_PURGED')
  })
})
