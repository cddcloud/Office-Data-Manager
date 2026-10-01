import bcrypt from 'bcryptjs'
import request from 'supertest'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../server/lib/prisma.js'
import { createApp } from '../server/app.js'
import { ensureStrategyDepartments } from '../server/modules/categories/strategy-departments.js'

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip
const tag = `strategy-${Date.now()}`
const password = 'Isolated-strategy-test-password!'
let main, viewer, departments, app, token, root, nested

suite('strategy departments on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL).pathname.startsWith('/office_workflow_verify_strategy_')) throw new Error('A dedicated isolated strategy database is required')
    const passwordHash = await bcrypt.hash(password, 4)
    main = await prisma.user.create({ data: { name: 'Strategy test Main', email: `${tag}-main@example.test`, role: 'ADMIN', clearance: 'V1', isPrimaryAdmin: true, passwordHash, mustChangePassword: false } })
    viewer = await prisma.user.create({ data: { name: 'Strategy test Viewer', email: `${tag}-viewer@example.test`, role: 'VIEWER', clearance: 'V2', passwordHash, mustChangePassword: false } })
    root = await prisma.category.findUnique({ where: { mainSlot: 1 } })
    expect(await prisma.category.count({ where: { parentId: root.id } })).toBe(0)
    app = createApp(prisma, { putObject: async () => {}, getObject: async () => Buffer.from('%PDF-1.7\n%%EOF'), deleteObject: async () => {} })
    token = (await request(app).post('/api/auth/login').send({ email: viewer.email, password })).body.data.accessToken
  })
  afterAll(async () => {
    if (!main) return
    await prisma.notification.deleteMany({ where: { reads: { some: { userId: { in: [main.id, viewer.id] } } } } })
    await prisma.document.deleteMany({ where: { createdById: main.id } })
    if (nested) await prisma.category.delete({ where: { id: nested.id } })
    await prisma.category.deleteMany({ where: { createdById: main.id } })
    await prisma.auditLog.deleteMany({ where: { actorId: main.id } })
    await prisma.user.deleteMany({ where: { id: { in: [main.id, viewer.id] } } })
    await prisma.$disconnect()
  })
  it('creates exactly 17 real child folders atomically with parent classification and audit', async () => {
    departments = (await ensureStrategyDepartments(prisma, main.id)).folders
    expect(departments).toHaveLength(17)
    expect(departments.map(row => row.sortOrder)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1))
    expect(departments.every(row => row.parentId === root.id && row.accessLevel === root.accessLevel)).toBe(true)
    expect(departments[16].name).toBe('ဌာန ၁၇')
    expect(await prisma.auditLog.count({ where: { actorId: main.id, action: 'CATEGORY_CREATED' } })).toBe(17)
    expect(await prisma.category.count({ where: { mainSlot: { not: null } } })).toBe(6)
  })
  it('reuses folder identities after a rename and denies non-Main setup', async () => {
    await prisma.category.update({ where: { id: departments[1].id }, data: { name: 'Renamed department' } })
    const again = await ensureStrategyDepartments(prisma, main.id)
    expect(again.created).toBe(0)
    expect(again.folders.map(row => row.id)).toEqual(departments.map(row => row.id))
    expect(again.folders[1].name).toBe('Renamed department')
    await expect(ensureStrategyDepartments(prisma, viewer.id)).rejects.toMatchObject({ status: 403 })
  })
  it('omits restricted department identities and lists only selected authorized branch files', async () => {
    await prisma.category.update({ where: { id: departments[0].id }, data: { accessLevel: 'V1' } })
    nested = await prisma.category.create({ data: { name: 'Nested files', parentId: departments[1].id, accessLevel: 'V4', createdById: main.id } })
    for (const category of [departments[0], nested, departments[2]]) await prisma.document.create({ data: { title: category.name, fileName: `${category.id}.pdf`, mimeType: 'application/pdf', fileSize: 16, storageKey: `synthetic/${category.id}`, categoryId: category.id, accessLevel: 'V4', createdById: main.id } })
    const auth = { Authorization: `Bearer ${token}` }
    const tree = await request(app).get('/api/categories').set(auth)
    expect(tree.status).toBe(200)
    const children = tree.body.data.find(row => row.id === root.id).children
    expect(children).toHaveLength(16)
    expect(JSON.stringify(tree.body)).not.toContain(departments[0].id)
    const files = await request(app).get(`/api/documents?categoryId=${departments[1].id}&includeDescendants=true`).set(auth)
    expect(files.status).toBe(200)
    expect(files.body.data.map(row => row.categoryId)).toEqual([nested.id])
    expect(JSON.stringify(files.body)).not.toContain('storageKey')
    expect((await request(app).get(`/api/documents?categoryId=${departments[0].id}`).set(auth)).status).toBe(404)
  })
  it('refuses to guess a mapping for an unexpected existing child without modifying folders', async () => {
    await prisma.category.create({ data: { name: 'Unmapped child', parentId: root.id, accessLevel: 'V4', createdById: main.id } })
    const before = await prisma.category.count()
    await expect(ensureStrategyDepartments(prisma, main.id)).rejects.toMatchObject({ code: 'DEPARTMENT_MAPPING_REQUIRED' })
    expect(await prisma.category.count()).toBe(before)
  })
})
