import { beforeEach, describe, expect, it } from 'vitest'
import { createDataService } from '../server/modules/data/data.service.js'

function memoryDatabase() {
  const fields = [{ id: 'field-1', key: 'department', label: 'Department', type: 'TEXT', required: true, position: 0 }, { id: 'field-2', key: 'budget', label: 'Budget', type: 'NUMBER', required: true, position: 1 }]
  const collection = { id: 'collection-1', categoryId: 'category-1', name: 'Budget', defaultAccessLevel: 'V4', archivedAt: null, fields }
  const state = { records: [], imports: [], audits: [] }
  let sequence = 0
  const db = {
    state,
    user: {findUnique: async ({where})=>({id:where.id,role:'ADMIN',clearance:'V1',isActive:true})},
    category: { findFirst: async () => ({ id: 'category-1', archivedAt:null }), findUnique: async()=>({id:'category-1',archivedAt:null}), findMany: async()=>[{id:'category-1',parentId:null,accessLevel:'V4',archivedAt:null},{id:'category-2',parentId:null,accessLevel:'V4',archivedAt:null}] },
    dataCollection: {
      findFirst: async ({ where }) => where.id === collection.id ? collection : null,
      findMany: async () => [collection],
      findUnique: async ({ include } = {}) => include?.category ? { ...collection, category: { archivedAt: null } } : collection,
      update: async ({ data }) => Object.assign(collection, data, { updatedAt: new Date() }),
    },
    dataRecord: {
      count: async ({where})=>where.NOT ? state.records.filter(row=>!where.NOT.accessLevel.in.includes(row.accessLevel)||!where.NOT.categoryId.in.includes(row.categoryId)).length : state.records.filter(row=>!row.archivedAt && where.accessLevel.in.includes(row.accessLevel)).length,
      findFirst: async ({ where }) => {
        const row = state.records.find(record => record.id === where.id && (!where.archivedAt || record.archivedAt === where.archivedAt) && (!where.accessLevel || where.accessLevel.in.includes(record.accessLevel)))
        return row ? { ...row, dataCollection: collection } : null
      },
      findMany: async ({ where, take, cursor, skip = 0 }) => state.records
        .filter(record => !record.archivedAt && where.accessLevel.in.includes(record.accessLevel) && (!where.dataCollectionId || record.dataCollectionId === where.dataCollectionId))
        .slice(cursor ? state.records.findIndex(record => record.id === cursor.id) + skip : 0, take),
      create: async ({ data }) => { const row = { id: `record-${++sequence}`, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }; state.records.push(row); return row },
      update: async ({ where, data }) => Object.assign(state.records.find(record => record.id === where.id), data, { updatedAt: new Date() }),
      updateMany: async ({ where, data }) => { const rows = state.records.filter(record => record.dataCollectionId === where.dataCollectionId && (!Object.hasOwn(where, 'archivedAt') || record.archivedAt?.getTime?.() === where.archivedAt?.getTime?.() || record.archivedAt === where.archivedAt)); rows.forEach(record => Object.assign(record, data)); return { count: rows.length } },
    },
    dashboardWidget: { count:async()=>0, updateMany: async () => ({ count: 0 }) },
    importJob: { count:async()=>0, updateMany: async ({ where, data }) => { state.imports.filter(job => job.dataCollectionId === where.dataCollectionId).forEach(job => Object.assign(job, data)); return { count: state.imports.length } } },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data } },
    $transaction: callback => callback(db),
  }
  return { db, collection }
}

describe('unified data service', () => {
  let db
  let service
  beforeEach(() => { ({ db } = memoryDatabase()); service = createDataService(db) })

  it('creates and edits manual records using collection field validation', async () => {
    const created = await service.create({ title: 'Finance budget', categoryId: 'category-1', dataCollectionId: 'collection-1', payload: { department: 'Finance', budget: '500000' } }, 'admin-1')
    expect(created.sourceType).toBe('MANUAL')
    expect(created.sourceImportId).toBeNull()
    expect(created.payload.budget).toBe(500000)
    expect(created).toMatchObject({ createdById: 'admin-1', updatedById: 'admin-1' })
    const updated = await service.update(created.id, { payload: { budget: 550000 } }, 'admin-2')
    expect(updated.payload.budget).toBe(550000)
    expect(updated.updatedById).toBe('admin-2')
    expect(db.state.audits.at(-1).actorId).toBe('admin-2')
    expect(db.state.audits.map(item => item.action)).toEqual(['DATA_CREATED', 'DATA_UPDATED'])
  })

  it('edits imported records through the same update path and archives/restores', async () => {
    db.state.records.push({ id: 'excel-1', title: 'Imported', categoryId: 'category-1', dataCollectionId: 'collection-1', payload: { department: 'HR', budget: 250000 }, accessLevel: 'V4', sourceType: 'EXCEL', sourceImportId: 'import-1', archivedAt: null })
    const updated = await service.update('excel-1', { payload: { budget: 275000 } }, 'admin-1')
    expect(updated.sourceType).toBe('EXCEL')
    expect(updated.payload.budget).toBe(275000)
    expect((await service.archive('excel-1', 'admin-1')).archivedAt).toBeInstanceOf(Date)
    expect((await service.restore('excel-1', 'admin-1')).archivedAt).toBeNull()
  })

  it('enforces V4/V2 access before cursor retrieval', async () => {
    db.state.records.push(
      { id: 'normal-1', accessLevel: 'V4', archivedAt: null, dataCollectionId: 'collection-1' },
      { id: 'vip-1', accessLevel: 'V2', archivedAt: null, dataCollectionId: 'collection-1' },
    )
    const normal = await service.list({ dataCollectionId: 'collection-1', includeDescendants: true, sortBy: 'createdAt', sortDirection: 'desc', limit: 50 }, { role: 'VIEWER', clearance: 'V4' })
    const vip = await service.list({ dataCollectionId: 'collection-1', includeDescendants: true, sortBy: 'createdAt', sortDirection: 'desc', limit: 50 }, { role: 'VIEWER', clearance: 'V2' })
    expect(normal.data.map(row => row.id)).toEqual(['normal-1'])
    expect(vip.data.map(row => row.id)).toEqual(['normal-1', 'vip-1'])
  })

  it('moves a structured data collection and its related records/imports together', async () => {
    db.state.records.push({ id: 'row-1', categoryId: 'category-1', dataCollectionId: 'collection-1', accessLevel: 'V4' })
    db.state.imports.push({ id: 'import-1', categoryId: 'category-1', dataCollectionId: 'collection-1', accessLevel: 'V4' })
    await service.updateCollection('collection-1', { categoryId: 'category-2', name: 'Budget 2026' }, 'admin-2')
    expect(db.state.records[0].categoryId).toBe('category-2')
    expect(db.state.records[0].updatedById).toBe('admin-2')
    expect(db.state.imports[0].categoryId).toBe('category-2')
    expect((await service.getCollection('collection-1',{role:'ADMIN',clearance:'V1'})).updatedById).toBe('admin-2')
  })

  it('soft-deletes and restores a structured data collection with its records', async () => {
    db.state.records.push({ id: 'row-1', categoryId: 'category-1', dataCollectionId: 'collection-1', accessLevel: 'V4', archivedAt: null })
    const archived = await service.archiveCollection('collection-1', 'admin-1')
    expect(archived.archivedAt).toBeInstanceOf(Date)
    expect(db.state.records[0].archivedAt).toEqual(archived.archivedAt)
    const restored = await service.restoreCollection('collection-1', 'admin-1')
    expect(restored.archivedAt).toBeNull()
    expect(db.state.records[0].archivedAt).toBeNull()
    expect(db.state.audits.slice(-2).map(item => item.action)).toEqual(['DATA_COLLECTION_ARCHIVED', 'DATA_COLLECTION_RESTORED'])
  })
})
