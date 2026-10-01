import { beforeEach, describe, expect, it } from 'vitest'
import { createCategoryService } from '../server/modules/categories/category.service.js'

function memoryDatabase() {
  let sequence = 0
  const state = { categories: [], collections: [], data: [], documents: [], widgets: [], audits: [] }
  const matchArchive = (row, where = {}) => !Object.hasOwn(where, 'archivedAt') || row.archivedAt === where.archivedAt
  const db = {
    state,
    user:{findUnique:async({where})=>({id:where.id,role:'ADMIN',clearance:'V1',isActive:true})},
    importJob:{count:async()=>0},
    category: {
      findMany: async ({ where = {} } = {}) => state.categories.filter(row => matchArchive(row, where) && (!where.id?.in||where.id.in.includes(row.id)) && (!where.parentId?.in || where.parentId.in.includes(row.parentId))),
      findUnique: async ({ where, select }) => {
        const row = state.categories.find(item => item.id === where.id) || null
        if (!row || !select) return row
        return Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]]))
      },
      findFirst: async ({ where }) => state.categories.find(row => {
        const nameMatches = typeof where.name === 'object' ? row.name.toLowerCase() === where.name.equals.toLowerCase() : row.name === where.name
        const idMatches = !where.id?.not || row.id !== where.id.not
        return nameMatches && (row.parentId ?? null) === (where.parentId ?? null) && idMatches
      }) || null,
      create: async ({ data }) => {
        const now = new Date()
        const row = { id: `category-${++sequence}`, description: null, sortOrder: 0, accessLevel:'V4', archivedAt: null, createdAt: now, updatedAt: now, ...data }
        state.categories.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const index = state.categories.findIndex(row => row.id === where.id)
        state.categories[index] = { ...state.categories[index], ...data, updatedAt: new Date() }
        return state.categories[index]
      },
      updateMany: async ({ where, data }) => { const rows = state.categories.filter(row => (!where.id?.in || where.id.in.includes(row.id)) && matchArchive(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length } },
      count: async ({ where }) => state.categories.filter(row => row.parentId === where.parentId && matchArchive(row, where)).length,
    },
    dataRecord: {
      groupBy: async ({ where }) => groups(state.data.filter(row => matchArchive(row, where))),
      count: async ({ where }) => state.data.filter(row => row.categoryId === where.categoryId && matchArchive(row, where)).length,
      updateMany: async ({ where, data }) => { const rows = state.data.filter(row => (!where.categoryId?.in || where.categoryId.in.includes(row.categoryId)) && matchArchive(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length } },
    },
    document: {
      groupBy: async ({ where }) => groups(state.documents.filter(row => matchArchive(row, where))),
      count: async ({ where }) => state.documents.filter(row => row.categoryId === where.categoryId && matchArchive(row, where)).length,
      updateMany: async ({ where, data }) => { const rows = state.documents.filter(row => (!where.categoryId?.in || where.categoryId.in.includes(row.categoryId)) && matchArchive(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length } },
    },
    dataCollection: {
      count:async()=>0,
      findMany: async ({ where }) => state.collections.filter(row => where.categoryId.in.includes(row.categoryId) && matchArchive(row, where)).map(row => ({ id: row.id })),
      updateMany: async ({ where, data }) => { const rows = state.collections.filter(row => where.id.in.includes(row.id) && matchArchive(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length } },
    },
    dashboardWidget: { count:async()=>0, updateMany: async ({ where, data }) => { const rows = state.widgets.filter(row => where.dataCollectionId.in.includes(row.dataCollectionId) && matchArchive(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length } } },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data } },
    $transaction: callback => callback(db),
  }
  return db
}

function groups(rows) {
  const counts = new Map()
  rows.forEach(row => counts.set(row.categoryId, (counts.get(row.categoryId) || 0) + 1))
  return [...counts].map(([categoryId, count]) => ({ categoryId, _count: { _all: count } }))
}

describe('category service', () => {
  let db
  let service
  beforeEach(() => { db = memoryDatabase(); service = createCategoryService(db) })

  it('creates child and deeply nested categories inside an existing root with audit entries', async () => {
    const root = await db.category.create({data:{name:'Finance',parentId:null,accessLevel:'V4'}})
    const child = await service.create({ name: 'Budget', parentId: root.id,accessLevel:'V4' }, 'admin-1')
    const deep = await service.create({ name: '2026', parentId: child.id,accessLevel:'V4' }, 'admin-1')
    expect(deep.parentId).toBe(child.id)
    expect(db.state.audits).toHaveLength(2)
    expect(db.state.audits.every(item => item.action === 'CATEGORY_CREATED')).toBe(true)
  })

  it('returns a sorted tree, breadcrumbs, direct children, search, and subtree counts', async () => {
    const root = await db.category.create({data:{name:'Finance',parentId:null,sortOrder:2,accessLevel:'V4'}})
    const budget = await service.create({ name: 'Budget', parentId: root.id, accessLevel: 'V4' }, 'admin-1')
    const year = await service.create({ name: '2026', parentId: budget.id,accessLevel:'V4' }, 'admin-1')
    await db.category.create({data:{name:'Administration',parentId:null,sortOrder:1,accessLevel:'V4'}})
    db.state.data.push({ categoryId: year.id, archivedAt: null }, { categoryId: budget.id, archivedAt: null })
    db.state.documents.push({ categoryId: year.id, archivedAt: null })

    const tree = await service.tree({}, {role:'ADMIN',clearance:'V1'})
    expect(tree.map(item => item.name)).toEqual(['Administration', 'Finance'])
    expect(tree[1].dataCount).toBe(2)
    expect(tree[1].documentCount).toBe(1)
    const details = await service.details(year.id,{role:'ADMIN',clearance:'V1'})
    expect(details.breadcrumb.map(item => item.name)).toEqual(['Finance', 'Budget', '2026'])
    expect((await service.details(root.id,{role:'ADMIN',clearance:'V1'})).children.map(item => item.name)).toEqual(['Budget'])
    expect((await service.tree({ search: '2026' },{role:'ADMIN',clearance:'V1'}))[0].children[0].children[0].name).toBe('2026')
  })

  it('renames and moves a category while retaining audit context', async () => {
    const first = await db.category.create({data:{name:'First',parentId:null,accessLevel:'V4'}})
    const second = await db.category.create({data:{name:'Second',parentId:null,accessLevel:'V4'}})
    const child = await service.create({ name: 'Child', parentId: first.id,accessLevel:'V4' }, 'admin-1')
    await service.update(child.id, { name: 'Renamed' }, 'admin-2')
    const moved = await service.move(child.id, second.id, 'admin-2')
    expect(moved.parentId).toBe(second.id)
    expect(db.state.categories.find(item => item.id === child.id)).toMatchObject({ createdById: 'admin-1', updatedById: 'admin-2' })
    expect(db.state.audits.at(-1).actorId).toBe('admin-2')
    expect(db.state.audits.at(-1)).toMatchObject({ action: 'CATEGORY_MOVED', before: { parentId: first.id }, after: { parentId: second.id, parentName: 'Second' } })
  })

  it('rejects self-parenting, descendant-parenting, and invalid parents', async () => {
    const mainRoot=await db.category.create({data:{name:'Main',parentId:null,accessLevel:'V4'}})
    const root=await service.create({name:'Root',parentId:mainRoot.id,accessLevel:'V4'},'admin-1')
    const child = await service.create({ name: 'Child', parentId: root.id, accessLevel: 'V4' }, 'admin-1')
    await expect(service.move(root.id, root.id, 'admin-1')).rejects.toMatchObject({ code: 'SELF_PARENT' })
    await expect(service.move(root.id, child.id, 'admin-1')).rejects.toMatchObject({ code: 'DESCENDANT_PARENT' })
    await expect(service.move(root.id, 'missing', 'admin-1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.create({ name: 'Orphan', parentId: 'missing', accessLevel: 'V4' }, 'admin-1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('trashes and restores a complete folder subtree while preserving parent safety', async () => {
    const mainRoot = await db.category.create({data:{name:'Main',parentId:null,accessLevel:'V4'}})
    const root = await service.create({name:'Root',parentId:mainRoot.id,accessLevel:'V4'},'admin-1')
    const child = await service.create({ name: 'Child', parentId: root.id, accessLevel: 'V4' }, 'admin-1')
    db.state.collections.push({ id: 'collection-1', categoryId: child.id, archivedAt: null })
    db.state.data.push({ categoryId: child.id, archivedAt: null })
    db.state.documents.push({ categoryId: child.id, archivedAt: null })
    await service.archive(root.id, 'admin-1')
    expect(db.state.categories.filter(item=>item.parentId).every(item => item.archivedAt instanceof Date)).toBe(true)
    expect(db.state.collections[0].archivedAt).toEqual(db.state.categories.find(row=>row.id===root.id).archivedAt)
    await expect(service.restore(child.id, 'admin-1')).rejects.toMatchObject({ code: 'ARCHIVED_PARENT' })
    await service.restore(root.id, 'admin-1')
    expect(db.state.categories.every(item => item.archivedAt === null)).toBe(true)
    expect(db.state.collections[0].archivedAt).toBeNull()
    expect(db.state.audits.at(-1).action).toBe('CATEGORY_RESTORED')
  })

  it('allows non-empty folders to move to trash and hides their active content', async () => {
    const mainRoot=await db.category.create({data:{name:'Main',parentId:null,accessLevel:'V4'}})
    const category=await service.create({name:'Records',parentId:mainRoot.id,accessLevel:'V4'},'admin-1')
    db.state.data.push({ categoryId: category.id, archivedAt: null })
    db.state.documents.push({ categoryId: category.id, archivedAt: null })
    await service.archive(category.id, 'admin-1')
    expect(db.state.data[0].archivedAt).toBeInstanceOf(Date)
    expect(db.state.documents[0].archivedAt).toBeInstanceOf(Date)
  })
})
