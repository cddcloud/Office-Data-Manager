import bcrypt from 'bcryptjs'
import ExcelJS from 'exceljs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { logger } from '../server/lib/logger.js'
import { prisma } from '../server/lib/prisma.js'
import { createApp } from '../server/app.js'
import { createNotificationService } from '../server/modules/notifications/notification.service.js'

const enabled = process.env.RUN_DATABASE_TESTS === 'true'
const suite = enabled ? describe : describe.skip
const tag = `workflow-${Date.now()}`
const password = 'Isolated-workflow-test-password!'
const actors = []
const folders = []
const objects = new Map()
const tokens = new Map()
let app, main, roots, dataset
const levels = ['V1', 'V2', 'V3', 'V4']
const pdf = Buffer.from('%PDF-1.7\n%%EOF')
const auth = actor => ({ Authorization: `Bearer ${tokens.get(actor.id)}` })
const storage = { putObject: async ({ key, body }) => objects.set(key, Buffer.from(body)), getObject: async key => objects.get(key), deleteObject: async key => objects.delete(key) }

suite('government workflow on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL).pathname.startsWith('/office_workflow_verify_')) throw new Error('Refusing to run against a non-isolated database')
    logger.level = 'silent'
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = 'isolated-integration-secret-over-32-characters'
    const passwordHash = await bcrypt.hash(password, 4)
    for (const [role, clearance, primary] of [['ADMIN', 'V1', true], ...['V1','V2','V3'].map(level => ['ADMIN', level, false]), ...levels.map(level => ['VIEWER', level, false])]) {
      const actor = await prisma.user.create({ data: { email: `${tag}-${role}-${clearance}-${primary}@example.test`.toLowerCase(), name: `ဦးမြန်မာ ရှည်လျားသောစမ်းသပ်အမည် ${role} ${clearance}`, role, clearance, isPrimaryAdmin: primary, passwordHash, mustChangePassword: false } })
      actors.push(actor)
    }
    main = actors[0]
    roots = await prisma.category.findMany({ where: { mainSlot: { not: null } }, orderBy: { mainSlot: 'asc' } })
    expect(roots).toHaveLength(6)
    app = createApp(prisma, storage)
    for (const actor of actors) {
      const response = await request(app).post('/api/auth/login').send({ email: actor.email, password })
      expect(response.status).toBe(200)
      tokens.set(actor.id, response.body.data.accessToken)
    }
    for (const level of levels) {
      const folder = await prisma.category.create({ data: { name: `${tag}-${level}`, parentId: roots[0].id, accessLevel: level, createdById: main.id } })
      folders.push(folder)
      const collection = await prisma.dataCollection.create({ data: { categoryId: folder.id, name: `${tag}-gated-${level}`, defaultAccessLevel: level, createdById: main.id, fields: { create: [{ key: 'text', label: 'အကြောင်းအရာ', type: 'TEXT', position: 0 }] } } })
      await prisma.dataRecord.create({ data: { title: `hidden-through-folder-${level}`, payload: { text: 'qualitative' }, categoryId: folder.id, dataCollectionId: collection.id, accessLevel: 'V4', createdById: main.id } })
    }
    dataset = await prisma.dataCollection.create({ data: { categoryId: roots[1].id, name: `${tag}-dataset`, defaultAccessLevel: 'V4', createdById: main.id, fields: { create: [{ key: 'text', label: 'အကြောင်းအရာ', type: 'TEXT', position: 0 }, { key: 'amount', label: 'Amount', type: 'NUMBER', position: 1 }] } } })
    for (const level of levels) {
      await prisma.dataRecord.create({ data: { title: `record-${level}`, payload: { text: 'ရှည်လျားသော qualitative text\nsecond line', amount: 10 }, categoryId: roots[1].id, dataCollectionId: dataset.id, accessLevel: level, createdById: main.id } })
      objects.set(`${tag}/${level}`, pdf)
      await prisma.document.create({ data: { title: `document-${level}`, fileName: `${level}.pdf`, mimeType: 'application/pdf', fileSize: pdf.length, storageKey: `${tag}/${level}`, accessLevel: level, categoryId: roots[1].id, createdById: main.id } })
    }
  }, 30000)

  afterAll(async () => {
    if (!actors.length) return
    const ids = actors.map(actor => actor.id)
    await prisma.notification.deleteMany({ where: { reads: { some: { userId: { in: ids } } } } })
    await prisma.dashboardWidget.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.document.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.dataRecord.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.importJob.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.dataCollection.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.category.deleteMany({ where: { createdById: { in: ids }, parentId: { not: null } } })
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } })
    await prisma.accountInvite.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.accountPasswordResetToken.deleteMany({ where: { createdById: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  }, 30000)

  it('enforces all eight role/clearance combinations on list, direct IDs, counts and report gates', async () => {
    for (const actor of actors) {
      const allowed = levels.filter(level => actor.isPrimaryAdmin || level >= actor.clearance)
      const rows = await request(app).get(`/api/data?dataCollectionId=${dataset.id}`).set(auth(actor))
      expect(rows.status).toBe(200)
      expect(rows.body.data.map(row => row.accessLevel).sort()).toEqual(allowed)
      expect(rows.body.meta.total).toBe(allowed.length)
      const collections = await request(app).get('/api/data/collections').set(auth(actor))
      expect(collections.body.data.find(row => row.id === dataset.id)._count.records).toBe(allowed.length)
      const documents = await request(app).get('/api/documents').set(auth(actor))
      expect(documents.body.data.map(file => file.accessLevel).sort()).toEqual(allowed)
      for (const level of levels) {
        const folder = folders.find(row => row.accessLevel === level)
        const record = await prisma.dataRecord.findFirst({ where: { categoryId: folder.id } })
        const collection = await prisma.dataCollection.findFirst({ where: { categoryId: folder.id } })
        for (const path of [`/api/categories/${folder.id}`, `/api/data/${record.id}`, `/api/data/collections/${collection.id}`, `/api/reports/export?dataCollectionId=${collection.id}`]) {
          const response = await request(app).get(path).set(auth(actor))
          expect(response.status, `${actor.role}/${actor.clearance} ${path}`).toBe(allowed.includes(level) ? 200 : 404)
          if (!allowed.includes(level)) expect(JSON.stringify(response.body)).not.toContain('hidden-through-folder')
        }
      }
    }
  }, 30000)

  it('denies Viewer management while leaving Dashboard and authorized downloads available', async () => {
    for (const viewer of actors.filter(actor => actor.role === 'VIEWER')) {
      for (const path of ['/api/admin/categories','/api/admin/data','/api/admin/documents','/api/admin/users','/api/admin/trash','/api/dashboard/reference-access']) expect((await request(app).get(path).set(auth(viewer))).status).toBe(403)
      expect((await request(app).post('/api/data').set(auth(viewer)).send({})).status).toBe(403)
      expect((await request(app).get('/api/dashboard').set(auth(viewer))).status).toBe(200)
      const visible = await prisma.document.findFirst({ where: { accessLevel: viewer.clearance } })
      expect((await request(app).get(`/api/documents/${visible.id}/download`).set(auth(viewer))).status).toBe(200)
    }
  })

  it('shows real Home file totals and activity without leaking gated documents or whole-workbook sources', async () => {
    const lower = actors.find(actor => actor.role === 'ADMIN' && actor.clearance === 'V3')
    const beforeMain = await request(app).get('/api/admin/home').set(auth(main))
    const beforeLower = await request(app).get('/api/admin/home').set(auth(lower))
    expect(beforeMain.status).toBe(200); expect(beforeLower.status).toBe(200)
    for (const viewer of actors.filter(actor => actor.role === 'VIEWER')) expect((await request(app).get('/api/admin/home').set(auth(viewer))).status).toBe(403)
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Home')
    sheet.addRow(['Subject', 'Amount']); sheet.addRow(['Home synthetic row', 125])
    const inspected = await request(app).post('/api/admin/imports/excel/inspect').set(auth(main)).field('categoryId', roots[1].id).field('accessLevel', 'V4').attach('file', Buffer.from(await workbook.xlsx.writeBuffer()), { filename: `${tag}-home-source.xlsx` })
    expect(inspected.status).toBe(201)
    expect((await request(app).get('/api/admin/home').set(auth(main))).body.data.counts).toEqual(beforeMain.body.data.counts)
    const committed = await request(app).post(`/api/admin/imports/${inspected.body.data.id}/commit`).set(auth(main)).send({ collectionName: `${tag}-home`, defaultAccessLevel: 'V4' })
    expect(committed.status).toBe(200)
    expect((await request(app).get('/api/admin/home').set(auth(lower))).body.data.counts.excel).toBe(beforeLower.body.data.counts.excel + 1)
    await prisma.dataRecord.updateMany({ where: { sourceImportId: inspected.body.data.id }, data: { accessLevel: 'V1' } })
    const hidden = await request(app).post('/api/admin/documents').set(auth(main)).field('title', 'Home gated file').field('categoryId', folders[0].id).field('accessLevel', 'V4').attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: `${tag}-home-secret.jpg`, contentType: 'image/jpeg' })
    expect(hidden.status).toBe(201)
    const restricted = await request(app).get('/api/admin/home').set(auth(lower))
    expect(restricted.body.data.counts).toEqual(beforeLower.body.data.counts)
    expect(JSON.stringify(restricted.body)).not.toContain(`${tag}-home-secret`)
    expect(JSON.stringify(restricted.body)).not.toContain(`${tag}-home-source`)
    const owner = await request(app).get('/api/admin/home').set(auth(main))
    expect(owner.body.data.counts.excel).toBe(beforeMain.body.data.counts.excel + 1)
    expect(owner.body.data.counts.jpg).toBe(beforeMain.body.data.counts.jpg + 1)
    expect(owner.body.data.counts.total).toBe(beforeMain.body.data.counts.total + 2)
    expect(owner.body.data.trend).toHaveLength(6)
    expect(owner.body.data.trend.at(-1).total).toBe(owner.body.data.counts.total)
    expect(owner.body.data.activity.some(row => row.name === `${tag}-home-secret.jpg`)).toBe(true)
    expect(JSON.stringify(owner.body)).not.toContain('storageKey')
    await request(app).post(`/api/admin/documents/${hidden.body.data.id}/archive`).set(auth(main))
    expect((await request(app).get('/api/admin/home').set(auth(main))).body.data.counts.jpg).toBe(beforeMain.body.data.counts.jpg)
  }, 30000)

  it('protects roots through create/move/archive/trash and preserves authorized child operations', async () => {
    expect((await request(app).post('/api/admin/categories').set(auth(main)).send({ name: 'seventh-root' })).status).toBe(409)
    expect((await request(app).post(`/api/admin/categories/${roots[0].id}/move`).set(auth(main)).send({ parentId: roots[1].id })).status).toBe(409)
    expect((await request(app).post(`/api/admin/categories/${roots[0].id}/archive`).set(auth(main))).status).toBe(409)
    expect((await request(app).delete(`/api/admin/trash/folder/${roots[0].id}`).set(auth(main))).status).toBe(409)
    const admin = actors[1]
    expect((await request(app).patch(`/api/admin/categories/${roots[0].id}`).set(auth(admin)).send({ name: 'not-allowed' })).status).toBe(403)
    const child = await request(app).post('/api/admin/categories').set(auth(actors[2])).send({ name: `${tag}-movable`, parentId: roots[2].id, accessLevel: 'V2' })
    expect(child.status).toBe(201)
    expect((await request(app).post(`/api/admin/categories/${child.body.data.id}/move`).set(auth(actors[2])).send({ parentId: null })).status).toBe(409)
    expect((await request(app).post(`/api/admin/categories/${child.body.data.id}/move`).set(auth(actors[2])).send({ parentId: roots[3].id })).status).toBe(200)
    await prisma.category.update({ where: { id: child.body.data.id }, data: { createdById: main.id } })
    await expect(prisma.category.create({ data: { name: 'direct-seventh' } })).rejects.toThrow()
  })

  it('enforces permitted upload levels and atomically persists one deduplicated notice per operation', async () => {
    for (const actor of actors.filter(actor => actor.role === 'ADMIN')) {
      for (const level of levels) {
        const response = await request(app).post('/api/admin/documents').set(auth(actor)).field('title', `${tag}-${actor.id}-${level}`).field('categoryId', roots[1].id).field('accessLevel', level).attach('file', pdf, { filename: 'test.pdf', contentType: 'application/pdf' })
        expect(response.status).toBe(actor.isPrimaryAdmin || level >= actor.clearance ? 201 : 403)
        if (response.status === 201) await prisma.document.update({ where: { id: response.body.data.id }, data: { createdById: main.id } })
      }
    }
    const key = 'b17a8ca4-1fb3-4d34-b5c4-a1b13868aaf1'
    const upload = () => request(app).post('/api/admin/documents').set(auth(main)).set('Idempotency-Key', key).field('title', `${tag}-retry`).field('categoryId', roots[1].id).field('accessLevel', 'V2').attach('file', pdf, { filename: 'retry.pdf', contentType: 'application/pdf' })
    const first = await upload(), second = await upload()
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(second.body.data.id).toBe(first.body.data.id)
    expect(await prisma.notification.count({ where: { targetId: first.body.data.id } })).toBe(1)
    expect(JSON.stringify(first.body)).not.toContain('storageKey')
    const viewer = actors.find(actor => actor.role === 'VIEWER' && actor.clearance === 'V2')
    const visible = await request(app).get('/api/notifications').set(auth(viewer))
    const notice = visible.body.data.find(item => item.documentId === first.body.data.id)
    expect(notice).toBeTruthy(); expect(visible.body.meta.unreadCount).toBeGreaterThan(0)
    expect((await request(app).post(`/api/notifications/${notice.id}/read`).set(auth(viewer))).body.data.find(item => item.id === notice.id).readAt).toBeTruthy()
    const denied = actors.find(actor => actor.role === 'VIEWER' && actor.clearance === 'V3')
    expect((await request(app).get('/api/notifications').set(auth(denied))).body.data.some(item => item.id === notice.id)).toBe(false)
    await prisma.user.update({ where: { id: viewer.id }, data: { clearance: 'V4' } })
    expect((await createNotificationService(prisma).list({ ...viewer, clearance: 'V4' })).data.some(item => item.id === notice.id)).toBe(false)
    await prisma.user.update({ where: { id: viewer.id }, data: { clearance: 'V2' } })
  }, 30000)

  it('separates Excel inspection and commit, retains the source, and forbids lower clearance source access', async () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Test')
    sheet.addRow(['အကြောင်းအရာ', 'Amount']); sheet.addRow(['မြန်မာ qualitative text', 25])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const before = await prisma.notification.count()
    const inspected = await request(app).post('/api/admin/imports/excel/inspect').set(auth(main)).field('categoryId', roots[1].id).field('accessLevel', 'V2').attach('file', buffer, { filename: 'source.xlsx' })
    expect(inspected.status).toBe(201); expect(inspected.body.data.status).toBe('INSPECTED')
    expect(inspected.body.data.storageKey).toBeUndefined(); expect(await prisma.notification.count()).toBe(before)
    expect(await prisma.dataRecord.count({ where: { sourceImportId: inspected.body.data.id } })).toBe(0)
    const commit = () => request(app).post(`/api/admin/imports/${inspected.body.data.id}/commit`).set(auth(main)).send({ collectionName: `${tag}-import`, defaultAccessLevel: 'V2' })
    expect((await commit()).status).toBe(200); expect((await commit()).status).toBe(200)
    expect(await prisma.notification.count({ where: { targetId: inspected.body.data.id } })).toBe(1)
    expect(await prisma.dataRecord.count({ where: { sourceImportId: inspected.body.data.id } })).toBe(1)
    const actor = actors.find(row => row.role === 'VIEWER' && row.clearance === 'V3')
    expect((await request(app).get(`/api/sources/${inspected.body.data.id}/download`).set(auth(actor))).status).toBe(404)
    const source = await request(app).get(`/api/sources/${inspected.body.data.id}/download`).set(auth(main)).buffer(true).parse((res, callback) => { const chunks = []; res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>callback(null,Buffer.concat(chunks))) }); expect(source.status).toBe(200); expect(source.body.equals(buffer)).toBe(true)
    const viewer2 = actors.find(row => row.role === 'VIEWER' && row.clearance === 'V2')
    expect((await request(app).get(`/api/sources/${inspected.body.data.id}/download`).set(auth(viewer2))).status).toBe(200)
    const row = await prisma.dataRecord.findFirst({ where: { sourceImportId: inspected.body.data.id } })
    expect((await request(app).patch(`/api/admin/data/${row.id}`).set(auth(main)).send({ accessLevel: 'V1' })).status).toBe(200)
    expect((await request(app).get(`/api/sources/${inspected.body.data.id}/download`).set(auth(viewer2))).status).toBe(404)
    expect((await request(app).get('/api/notifications').set(auth(viewer2))).body.data.some(notice => notice.collectionId === row.dataCollectionId)).toBe(false)
  })

  it('enforces the exact account-management matrix and revokes access tokens after clearance changes', async () => {
    const admin1 = actors[1], admin2 = actors[2], viewer = actors[7]
    const visible = await request(app).get('/api/admin/users').set(auth(admin1))
    expect(visible.status).toBe(200); expect(visible.body.data.every(row => row.role === 'VIEWER')).toBe(true)
    for (const path of [`/api/admin/users/${admin2.id}`, `/api/admin/users/${main.id}`]) expect((await request(app).get(path).set(auth(admin1))).status).toBe(404)
    for (const actor of actors.slice(2).filter(row => row.role === 'ADMIN')) expect((await request(app).get('/api/admin/users').set(auth(actor))).status).toBe(403)
    expect((await request(app).post(`/api/admin/users/${admin2.id}/reset-login`).set(auth(admin1))).status).toBe(404)
    expect((await request(app).patch(`/api/admin/users/${viewer.id}`).set(auth(admin1)).send({ role: 'ADMIN' })).status).toBe(403)
    expect((await request(app).post('/api/admin/users/invitations').set(auth(admin1)).send({ email: `${tag}-forbidden@example.test`, name: 'Blocked', role: 'ADMIN', clearance: 'V1' })).status).toBe(404)
    expect((await request(app).patch(`/api/admin/users/${main.id}`).set(auth(main)).send({ isActive: false })).status).toBe(403)
    expect((await request(app).post(`/api/admin/users/${main.id}/reset-login`).set(auth(main))).status).toBe(403)
    expect((await request(app).patch(`/api/admin/users/${admin2.id}`).set(auth(main)).send({ clearance: 'V3' })).status).toBe(200)
    expect((await request(app).get('/api/data').set(auth(admin2))).status).toBe(401)
    expect(await prisma.refreshToken.count({ where: { userId: admin2.id, revokedAt: null } })).toBe(0)
    expect((await request(app).patch(`/api/admin/users/${admin2.id}`).set(auth(main)).send({ clearance: 'V2' })).status).toBe(200)
    const session = await request(app).post('/api/auth/login').send({ email: admin2.email, password })
    expect(session.status).toBe(200)
    tokens.set(admin2.id, session.body.data.accessToken)
  })

  it('keeps listings complete beyond 100 documents and 500 collections', async () => {
    await prisma.document.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ title: `${tag}-page-${i}`, fileName: 'page.pdf', mimeType: 'application/pdf', fileSize: 1, storageKey: `${tag}-page-${i}`, accessLevel: 'V4', categoryId: roots[4].id, createdById: main.id })) })
    let count = 0, cursor
    do { const response = await request(app).get(`/api/documents?categoryId=${roots[4].id}&limit=100${cursor ? `&cursor=${cursor}` : ''}`).set(auth(main)); expect(response.status).toBe(200); count += response.body.data.length; cursor = response.body.meta.nextCursor; expect(response.body.meta.total).toBe(105) } while (cursor)
    expect(count).toBe(105)
    await prisma.dataCollection.createMany({ data: Array.from({ length: 505 }, (_, i) => ({ name: `${tag}-page-${i}`, categoryId: roots[4].id, defaultAccessLevel: 'V4', createdById: main.id })) })
    expect((await request(app).get(`/api/data/collections?categoryId=${roots[4].id}`).set(auth(main))).body.data).toHaveLength(505)
  })

  it('aggregates only currently authorized rows and refreshes Dashboard after changes', async () => {
    const created = await request(app).post('/api/admin/dashboard-widgets').set(auth(main)).send({ title: `${tag}-count`, dataCollectionId: dataset.id, chartType: 'KPI', aggregation: 'COUNT', accessLevel: 'V4' })
    expect(created.status).toBe(201)
    expect((await request(app).post('/api/admin/dashboard-widgets/preview').set(auth(main)).send({ title: 'Synthetic preview', dataCollectionId: dataset.id, chartType: 'KPI', aggregation: 'COUNT', accessLevel: 'V4' })).status).toBe(200)
    for (const actor of actors) {
      const result = await request(app).get('/api/dashboard').set(auth(actor))
      const item = result.body.data.find(item => item.widget.id === created.body.data.id)
      expect(item.data.value).toBe(actor.isPrimaryAdmin ? 4 : 5 - Number(actor.clearance.slice(1)))
    }
    const row = await prisma.dataRecord.findFirst({ where: { dataCollectionId: dataset.id, accessLevel: 'V4' } })
    expect((await request(app).post(`/api/admin/data/${row.id}/archive`).set(auth(main))).status).toBe(200)
    const updated = await request(app).get('/api/dashboard').set(auth(main))
    expect(updated.body.data.find(item => item.widget.id === created.body.data.id).data.value).toBe(3)
    expect((await request(app).post(`/api/admin/data/${row.id}/restore`).set(auth(main))).status).toBe(200)
    for (const actor of actors) expect((await request(app).get('/api/dashboard/reference-access').set(auth(actor))).status).toBe(actor.isPrimaryAdmin || (actor.role === 'ADMIN' && actor.clearance === 'V1') ? 200 : 403)
    expect((await request(app).post(`/api/admin/dashboard-widgets/${created.body.data.id}/archive`).set(auth(main))).status).toBe(200)
  })

  it('enforces V1 target restrictions for invitation regeneration, cancellation, reset and activation', async () => {
    const admin = actors[1]
    const invited = await request(app).post('/api/admin/users/invitations').set(auth(main)).send({ email: `${tag}-admin-invite@example.test`, name: 'Synthetic admin', role: 'ADMIN', clearance: 'V3' })
    expect(invited.status).toBe(201)
    const id = invited.body.data.invitation.id
    for (const action of ['regenerate', 'cancel']) expect((await request(app).post(`/api/admin/users/invitations/${id}/${action}`).set(auth(admin))).status).toBe(404)
    for (const action of ['reset-login', 'enable', 'disable']) expect((await request(app).post(`/api/admin/users/${actors[2].id}/${action}`).set(auth(admin))).status).toBe(404)
    for (const clearance of levels) {
      const invitation = await request(app).post('/api/admin/users/invitations').set(auth(admin)).send({ email: `${tag}-viewer-invite-${clearance}@example.test`, name: 'Synthetic viewer', role: 'VIEWER', clearance })
      expect(invitation.status).toBe(201)
      const viewerId = invitation.body.data.invitation.id
      const regenerated = await request(app).post(`/api/admin/users/invitations/${viewerId}/regenerate`).set(auth(admin))
      expect(regenerated.status).toBe(200)
      const oldToken = new URL(invitation.body.data.setupUrl).searchParams.get('token')
      expect((await request(app).post('/api/auth/account/setup/validate').send({ token: oldToken })).status).not.toBe(200)
      expect((await request(app).post(`/api/admin/users/invitations/${viewerId}/cancel`).set(auth(admin))).status).toBe(204)
    }
  })

  it('revokes an active authenticated SSE connection after deactivation without tokens in URLs', async () => {
    const viewer = actors[6]
    const server = app.listen(0)
    const controller = new AbortController()
    try {
      const response = await fetch(`http://localhost:${server.address().port}/api/notifications/stream`, { headers: auth(viewer), signal: controller.signal })
      expect(response.status).toBe(200)
      const reader = response.body.getReader()
      const first = new TextDecoder().decode((await reader.read()).value)
      expect(first).toContain('event: notifications')
      expect((await request(app).post(`/api/admin/users/${viewer.id}/disable`).set(auth(main))).status).toBe(200)
      let output = ''
      const timeout = setTimeout(() => controller.abort(), 10000)
      try { while (!output.includes('event: revoked')) { const next = await reader.read(); if (next.done) break; output += new TextDecoder().decode(next.value) } }
      finally { clearTimeout(timeout) }
      expect(output).toContain('event: revoked')
      expect((await request(app).get('/api/dashboard').set(auth(viewer))).status).toBe(401)
    } finally { controller.abort(); await new Promise(resolve => server.close(resolve)); await prisma.user.update({ where: { id: viewer.id }, data: { isActive: true } }) }
  }, 20000)

  it('rolls back the uploaded object and notification together when notice persistence fails', async () => {
    const notices = await prisma.notification.count()
    const docs = await prisma.document.count()
    const objectsBefore = objects.size
    const failingDb = new Proxy(prisma, { get(target, key) {
      if (key === '$transaction') return callback => target.$transaction(tx => callback(new Proxy(tx, { get(db, property) { return property === 'notification' ? { upsert: async () => { throw new Error('Injected notice failure') } } : db[property] } })))
      return target[key]
    } })
    const failure = await request(createApp(failingDb, storage)).post('/api/admin/documents').set(auth(main)).field('title', `${tag}-rollback`).field('categoryId', roots[1].id).field('accessLevel', 'V4').attach('file', pdf, { filename: 'rollback.pdf', contentType: 'application/pdf' })
    expect(failure.status).toBe(500)
    expect(await prisma.notification.count()).toBe(notices)
    expect(await prisma.document.count()).toBe(docs)
    expect(objects.size).toBe(objectsBefore)
  })

  it('omits restricted content and Admin account details from authorization-filtered audit history', async () => {
    const record = await prisma.dataRecord.findFirst({ where: { dataCollectionId: dataset.id, accessLevel: 'V1' } })
    expect((await request(app).patch(`/api/admin/data/${record.id}`).set(auth(main)).send({ title: `${tag}-restricted-history` })).status).toBe(200)
    const low = await request(app).get(`/api/admin/audit?entityId=${record.id}`).set(auth(actors[3]))
    expect(low.status).toBe(200); expect(low.body.data).toEqual([])
    const restrictedAudit = await prisma.auditLog.findFirst({ where: { entityId: record.id } })
    expect((await request(app).get(`/api/admin/audit?cursor=${restrictedAudit.id}`).set(auth(actors[3]))).status).toBe(404)
    const adminHistory = await request(app).get(`/api/admin/audit?entityType=User&entityId=${actors[2].id}`).set(auth(actors[1]))
    expect(adminHistory.status).toBe(200); expect(adminHistory.body.data).toEqual([])
    const mainHistory = await request(app).get(`/api/admin/audit?entityType=User&entityId=${actors[2].id}`).set(auth(main))
    expect(mainHistory.body.data.length).toBeGreaterThan(0)
    expect(JSON.stringify(mainHistory.body)).not.toContain('passwordHash')
    expect(JSON.stringify(mainHistory.body)).not.toContain('tokenHash')
  })
})
