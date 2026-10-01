import bcrypt from 'bcryptjs'
import request from 'supertest'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../server/lib/prisma.js'
import { createApp } from '../server/app.js'
import { ensureStrategyDepartments } from '../server/modules/categories/strategy-departments.js'
import { ensureStrategyClassifications } from '../server/modules/categories/strategy-classifications.js'

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip
const tag = `classification-${Date.now()}`
const password = 'Isolated-classification-test-password!'
let main, viewers, root, previous, groups, app

suite('strategy classification pairs on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL).pathname.startsWith('/office_workflow_verify_structure_')) throw new Error('A dedicated isolated workflow database is required')
    const passwordHash = await bcrypt.hash(password, 4)
    main = await prisma.user.create({ data: { name: 'Classification Main', email: `${tag}-main@example.test`, role: 'ADMIN', clearance: 'V1', isPrimaryAdmin: true, passwordHash, mustChangePassword: false } })
    viewers = []
    for (const clearance of ['V1', 'V2', 'V3', 'V4']) viewers.push(await prisma.user.create({ data: { name: `Synthetic ${clearance}`, email: `${tag}-${clearance.toLowerCase()}@example.test`, role: 'VIEWER', clearance, passwordHash, mustChangePassword: false } }))
    root = await prisma.category.findUnique({ where: { mainSlot: 1 } })
    expect(await prisma.category.count({ where: { parentId: root.id } })).toBe(0)
    previous = (await ensureStrategyDepartments(prisma, main.id)).folders
    app = createApp(prisma, { getObject: async () => Buffer.from('%PDF-1.7\n%%EOF'), putObject: async () => {}, deleteObject: async () => {} })
  })
  afterAll(async () => {
    if (!main) return
    await prisma.document.deleteMany({ where: { createdById: main.id } })
    if (groups) {
      await prisma.category.deleteMany({ where: { parentId: { in: groups.flatMap(row => row.children.map(child => child.id)) } } })
      await prisma.category.deleteMany({ where: { parentId: { in: groups.map(row => row.id) } } })
    }
    await prisma.category.deleteMany({ where: { createdById: main.id } })
    await prisma.auditLog.deleteMany({ where: { actorId: main.id } })
    await prisma.user.deleteMany({ where: { id: { in: [main.id, ...viewers.map(row => row.id)] } } })
    await prisma.$disconnect()
  })
  it('refuses to guess a classification for existing content without any folder or audit changes', async () => {
    const document = await prisma.document.create({ data: { categoryId: previous[0].id, title: 'Unmapped existing file', fileName: 'synthetic.pdf', mimeType: 'application/pdf', fileSize: 16, storageKey: `${tag}/existing`, accessLevel: 'V4', createdById: main.id } })
    const before = [await prisma.category.count(), await prisma.auditLog.count()]
    await expect(ensureStrategyClassifications(prisma, main.id)).rejects.toMatchObject({ code: 'STRATEGY_MAPPING_REQUIRED' })
    expect([await prisma.category.count(), await prisma.auditLog.count()]).toEqual(before)
    expect((await prisma.category.findUnique({ where: { id: previous[0].id } })).parentId).toBe(root.id)
    await prisma.document.delete({ where: { id: document.id } })
  })
  it('creates four real parents with two card folders each, reusing the empty V4 department IDs', async () => {
    const results = await Promise.all([ensureStrategyClassifications(prisma, main.id), ensureStrategyClassifications(prisma, main.id)])
    expect(results.map(row => row.created).sort((a, b) => a - b)).toEqual([0, 63])
    groups = results[0].groups
    expect(groups.map(row => row.name)).toEqual(['ထိပ်တန်းလျှို့ဝှက်', 'လျှို့ဝှက်', 'ကန့်သတ်', 'အများပြည်သူ'])
    expect(groups.map(row => row.accessLevel)).toEqual(['V1', 'V2', 'V3', 'V4'])
    for (const group of groups) {
      expect(group.children).toHaveLength(2)
      expect(group.children[0].name).toBe(root.name)
      expect(group.children[1].name).toBe(`ဝန်ကြီးဌာနအလိုက် ${root.name}`)
      expect(group.children[1].children).toHaveLength(17)
      expect(group.children[1].children.every(row => row.accessLevel === group.accessLevel)).toBe(true)
    }
    expect(groups[3].children[1].children.map(row => row.id)).toEqual(previous.map(row => row.id))
    expect(await prisma.auditLog.count({ where: { actorId: main.id, action: 'CATEGORY_MOVED' } })).toBe(17)
    expect(await prisma.category.count({ where: { mainSlot: { not: null } } })).toBe(6)
  })
  it('preserves renamed parent, card and department identities and denies non-Main setup', async () => {
    await prisma.category.update({ where: { id: groups[3].id }, data: { name: 'Renamed public parent' } })
    await prisma.category.update({ where: { id: groups[3].children[1].id }, data: { name: 'Renamed ministry card' } })
    await prisma.category.update({ where: { id: previous[0].id }, data: { name: 'Renamed department' } })
    const again = await ensureStrategyClassifications(prisma, main.id)
    expect(again.created).toBe(0)
    expect(again.groups[3].children[1].children[0].id).toBe(previous[0].id)
    expect(again.groups[3].name).toBe('Renamed public parent')
    expect(again.groups[3].children[1].name).toBe('Renamed ministry card')
    await expect(ensureStrategyClassifications(prisma, viewers[0].id)).rejects.toMatchObject({ status: 403 })
  })
  it('filters entire pairs and descendants for every Viewer clearance and gates direct file access', async () => {
    const files = []
    for (const group of groups) files.push(await prisma.document.create({ data: { categoryId: group.children[1].children[0].id, title: `Synthetic ${group.accessLevel}`, fileName: `${group.accessLevel}.pdf`, mimeType: 'application/pdf', fileSize: 16, storageKey: `${tag}/${group.id}`, accessLevel: 'V4', createdById: main.id } }))
    for (const [index, viewer] of viewers.entries()) {
      const login = await request(app).post('/api/auth/login').send({ email: viewer.email, password })
      expect(login.status).toBe(200)
      const token = login.body.data.accessToken
      const auth = { Authorization: `Bearer ${token}` }
      const tree = await request(app).get('/api/categories').set(auth)
      expect(tree.status).toBe(200)
      const parent = tree.body.data.find(row => row.id === root.id)
      expect(parent.children.map(row => row.id)).toEqual(groups.slice(index).map(row => row.id))
      expect(parent.children.flatMap(row => row.children)).toHaveLength((4 - index) * 2)
      for (let hidden = 0; hidden < index; hidden++) {
        expect(JSON.stringify(tree.body)).not.toContain(groups[hidden].id)
        expect((await request(app).get(`/api/documents/${files[hidden].id}/download`).set(auth)).status).toBe(404)
      }
      const branchFiles = await request(app).get(`/api/documents?categoryId=${groups[index].children[1].id}`).set(auth)
      expect(branchFiles.body.data.map(row => row.id)).toEqual([files[index].id])
      expect((await request(app).get(`/api/documents/${files[index].id}/download`).set(auth)).status).toBe(200)
    }
  })
})
