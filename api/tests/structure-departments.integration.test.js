import bcrypt from 'bcryptjs'
import request from 'supertest'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../server/lib/prisma.js'
import { createApp } from '../server/app.js'
import { ensureStructureDepartments } from '../server/modules/categories/structure-departments.js'

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip
const tag = `structure-${Date.now()}`
const password = 'Isolated-structure-test-password!'
let main, viewer, departments, app, token, root, extra

suite('structure folders on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL).pathname.startsWith('/office_workflow_verify_structure_')) throw new Error('A dedicated isolated structure database is required')
    const passwordHash = await bcrypt.hash(password, 4)
    main = await prisma.user.create({ data: { name: 'Structure test Main', email: `${tag}-main@example.test`, role: 'ADMIN', clearance: 'V1', isPrimaryAdmin: true, passwordHash, mustChangePassword: false } })
    viewer = await prisma.user.create({ data: { name: 'Structure test Viewer', email: `${tag}-viewer@example.test`, role: 'VIEWER', clearance: 'V2', passwordHash, mustChangePassword: false } })
    root = await prisma.category.findUnique({ where: { mainSlot: 2 } })
    expect(await prisma.category.count({ where: { parentId: root.id } })).toBe(0)
    app = createApp(prisma, { putObject: async () => {}, getObject: async () => Buffer.from('%PDF-1.7\n%%EOF'), deleteObject: async () => {} })
    token = (await request(app).post('/api/auth/login').send({ email: viewer.email, password })).body.data.accessToken
  })
  afterAll(async () => {
    if (!main) return
    await prisma.document.deleteMany({ where: { createdById: main.id } })
    await prisma.dataRecord.deleteMany({ where: { createdById: main.id } })
    await prisma.dataCollection.deleteMany({ where: { createdById: main.id } })
    if (extra) await prisma.category.delete({ where: { id: extra.id } })
    if (departments) {
      await prisma.category.deleteMany({ where: { parentId: { in: departments.flatMap(row => row.children.map(team => team.id)) } } })
      await prisma.category.deleteMany({ where: { parentId: { in: departments.map(row => row.id) } } })
    }
    await prisma.category.deleteMany({ where: { createdById: main.id } })
    await prisma.auditLog.deleteMany({ where: { actorId: main.id } })
    await prisma.user.deleteMany({ where: { id: { in: [main.id, viewer.id] } } })
    await prisma.$disconnect()
  })
  it('serializes simultaneous setup and creates exactly 17-by-17-by-2 persistent folders with audit', async () => {
    const results = await Promise.all([ensureStructureDepartments(prisma, main.id), ensureStructureDepartments(prisma, main.id)])
    expect(results.map(row => row.created).sort((a, b) => a - b)).toEqual([0, 884])
    departments = results[0].departments
    expect(departments).toHaveLength(17)
    expect(departments.every(row => row.children.length === 17)).toBe(true)
    expect(departments.map(row => row.sortOrder)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1))
    expect(departments[16].name).toBe('ဌာန ၁၇')
    for (const department of departments) {
      expect(department.children.map(row => row.sortOrder)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1))
      expect(department.children.every(row => row.accessLevel === root.accessLevel && row.parentId === department.id)).toBe(true)
      expect(department.children.every(row => row.children.length === 2 && row.children.every(leaf => leaf.parentId === row.id && leaf.accessLevel === row.accessLevel))).toBe(true)
    }
    expect(await prisma.auditLog.count({ where: { actorId: main.id, action: 'CATEGORY_CREATED' } })).toBe(884)
    expect(await prisma.category.count({ where: { mainSlot: { not: null } } })).toBe(6)
  })
  it('preserves renamed department/team identities and rejects non-Main provisioning', async () => {
    await prisma.category.update({ where: { id: departments[1].id }, data: { name: 'Renamed department' } })
    await prisma.category.update({ where: { id: departments[1].children[0].id }, data: { name: 'Renamed team' } })
    const again = await ensureStructureDepartments(prisma, main.id)
    expect(again.created).toBe(0)
    expect(again.departments.flatMap(row => [row.id, ...row.children.map(child => child.id)])).toEqual(departments.flatMap(row => [row.id, ...row.children.map(child => child.id)]))
    expect(again.departments[1].children[0].name).toBe('Renamed team')
    await expect(ensureStructureDepartments(prisma, viewer.id)).rejects.toMatchObject({ status: 403 })
  })
  it('requires explicit reduction, refuses populated excess folders and removes only empty generated teams with audit', async () => {
    const number = value => new Intl.NumberFormat('my-MM').format(value)
    await prisma.category.createMany({ data: departments.flatMap(department => [18, 19, 20].map(slot => ({ name: `အဖွဲ့ ${number(slot)}`, parentId: department.id, sortOrder: slot, accessLevel: root.accessLevel, createdById: main.id }))) })
    const teams = await prisma.category.findMany({ where: { parentId: { in: departments.map(row => row.id) }, sortOrder: { gt: 17 } } })
    await prisma.category.createMany({ data: teams.flatMap(team => [1, 2].map(slot => ({ name: `Tab ${number(slot)}`, parentId: team.id, sortOrder: slot, accessLevel: team.accessLevel, createdById: main.id }))) })
    await expect(ensureStructureDepartments(prisma, main.id)).rejects.toMatchObject({ code: 'STRUCTURE_MAPPING_REQUIRED' })
    const document = await prisma.document.create({ data: { categoryId: teams[0].id, title: 'Must preserve', fileName: 'synthetic.pdf', mimeType: 'application/pdf', fileSize: 16, storageKey: 'synthetic/excess-team', accessLevel: 'V4', createdById: main.id } })
    const before = [await prisma.category.count(), await prisma.auditLog.count()]
    await expect(ensureStructureDepartments(prisma, main.id, { reduceTeamsTo17: true })).rejects.toMatchObject({ code: 'STRUCTURE_MAPPING_REQUIRED' })
    expect([await prisma.category.count(), await prisma.auditLog.count()]).toEqual(before)
    expect(await prisma.document.findUnique({ where: { id: document.id } })).not.toBeNull()
    await prisma.document.delete({ where: { id: document.id } })
    const results = await Promise.all([ensureStructureDepartments(prisma, main.id, { reduceTeamsTo17: true }), ensureStructureDepartments(prisma, main.id, { reduceTeamsTo17: true })])
    expect(results.map(row => row.removed).sort((a, b) => a - b)).toEqual([0, 153])
    expect(results.every(row => row.created === 0)).toBe(true)
    expect(results[0].departments.flatMap(row => [row.id, ...row.children.flatMap(team => [team.id, ...team.children.map(leaf => leaf.id)])])).toEqual(departments.flatMap(row => [row.id, ...row.children.flatMap(team => [team.id, ...team.children.map(leaf => leaf.id)])]))
    expect(await prisma.auditLog.count({ where: { actorId: main.id, action: 'CATEGORY_PURGED' } })).toBe(153)
    expect(await prisma.category.count({ where: { mainSlot: { not: null } } })).toBe(6)
  })
  it('omits gated department/team identities and scopes files, staff records and downloads to the chosen branch', async () => {
    await prisma.category.update({ where: { id: departments[0].id }, data: { accessLevel: 'V1' } })
    await prisma.category.update({ where: { id: departments[1].children[0].id }, data: { accessLevel: 'V1' } })
    const visible = departments[1].children[1].children[0], hidden = departments[1].children[0]
    let visibleDocument
    for (const category of [hidden, visible, departments[2].children[0]]) {
      const collection = await prisma.dataCollection.create({ data: { categoryId: category.id, name: `Staff-${category.id}`, defaultAccessLevel: 'V4', createdById: main.id, fields: { create: { key: 'position', label: 'Position', type: 'TEXT', position: 0 } } } })
      await prisma.dataRecord.create({ data: { categoryId: category.id, dataCollectionId: collection.id, title: `Person-${category.id}`, payload: { position: 'Synthetic role' }, accessLevel: 'V4', createdById: main.id } })
      const document = await prisma.document.create({ data: { categoryId: category.id, title: `File-${category.id}`, fileName: 'synthetic.pdf', mimeType: 'application/pdf', fileSize: 16, storageKey: `synthetic/${category.id}`, accessLevel: 'V4', createdById: main.id } })
      if (category.id === visible.id) visibleDocument = document
    }
    const auth = { Authorization: `Bearer ${token}` }
    const tree = await request(app).get('/api/categories').set(auth)
    const branch = tree.body.data.find(row => row.id === root.id)
    expect(branch.children).toHaveLength(16)
    expect(branch.children.find(row => row.id === departments[1].id).children).toHaveLength(16)
    expect(JSON.stringify(tree.body)).not.toContain(hidden.id)
    expect(JSON.stringify(tree.body)).not.toContain(departments[0].id)
    for (const route of ['data', 'documents']) {
      const result = await request(app).get(`/api/${route}?categoryId=${departments[1].id}&includeDescendants=true`).set(auth)
      expect(result.status).toBe(200)
      expect(result.body.meta.total).toBe(1)
      expect(result.body.data.map(row => row.categoryId)).toEqual([visible.id])
      expect((await request(app).get(`/api/${route}?categoryId=${hidden.id}`).set(auth)).status).toBe(404)
    }
    expect((await request(app).get(`/api/documents/${visibleDocument.id}/download`).set(auth)).status).toBe(200)
    await prisma.category.update({ where: { id: visible.id }, data: { accessLevel: 'V1' } })
    expect((await request(app).get(`/api/documents/${visibleDocument.id}/download`).set(auth)).status).toBe(404)
  })
  it('refuses partial or unexpected existing mappings without creating folders or audits', async () => {
    extra = await prisma.category.create({ data: { name: 'Unmapped team', parentId: departments[16].id, accessLevel: 'V4', createdById: main.id } })
    const before = [await prisma.category.count(), await prisma.auditLog.count()]
    await expect(ensureStructureDepartments(prisma, main.id)).rejects.toMatchObject({ code: 'STRUCTURE_MAPPING_REQUIRED' })
    expect([await prisma.category.count(), await prisma.auditLog.count()]).toEqual(before)
  })
})
