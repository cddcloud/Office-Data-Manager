import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { createStorage } from '../lib/storage.js'

// Explicit owner-requested legacy removal. This is not a classification mapping
// or a route for deleting the six protected workflow roots.
export async function resetLegacyContent(db, storage, plan, apply = false) {
  if (plan?.deleteContents !== true || !Array.isArray(plan.rootIds) || !plan.rootIds.length || new Set(plan.rootIds).size !== plan.rootIds.length) throw new Error('Explicit legacy-root and content deletion plan required')
  const backup = JSON.parse(await fs.readFile(path.join(plan.backupDirectory, 'manifest.json'), 'utf8'))
  if (!backup.restoredAndVerified) throw new Error('A restored and verified backup is required')
  await fs.access(path.join(plan.backupDirectory, 'database.dump'))
  await fs.access(path.join(plan.backupDirectory, 'storage'))
  const result = await db.$transaction(async tx => {
    for (const table of ['User', 'Category', 'DataCollection', 'DataRecord', 'Document', 'ImportJob', 'DashboardWidget', 'DataField']) await tx.$executeRawUnsafe(`LOCK TABLE "${table}" IN EXCLUSIVE MODE`)
    const categories = await tx.$queryRaw`SELECT id, "parentId", to_jsonb(t)->>'mainSlot' AS "mainSlot" FROM "Category" t`
    if (categories.some(row => row.mainSlot !== null)) throw new Error('Protected workflow roots cannot be removed with this tool')
    const roots = categories.filter(row => row.parentId === null)
    if (roots.length !== plan.rootIds.length || roots.some(row => !plan.rootIds.includes(row.id))) throw new Error('Existing roots differ from the approved removal plan')
    const remaining = new Map(categories.map(row => [row.id, row]))
    const ids = new Set(roots.map(row => row.id))
    let changed = true
    while (changed) { changed = false; for (const row of categories) if (!ids.has(row.id) && ids.has(row.parentId)) { ids.add(row.id); changed = true } }
    if (ids.size !== categories.length) throw new Error('Orphaned/cyclic categories require a separate decision')
    const counts = {}
    for (const table of ['User', 'AccountInvite', 'Category', 'DataCollection', 'DataRecord', 'Document', 'ImportJob', 'DashboardWidget', 'AuditLog']) {
      const rows = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "${table}"`)
      counts[table] = rows[0].count
      if (counts[table] !== backup.counts[table]) throw new Error('Database changed since the verified backup; take and verify a fresh backup')
    }
    const [primary] = await tx.$queryRaw`SELECT id FROM "User" WHERE "isPrimaryAdmin"=true AND role::text='ADMIN'`
    if (!primary) throw new Error('Existing Main Admin must be preserved')
    const files = await tx.$queryRaw`SELECT "storageKey" FROM "Document" UNION SELECT "storageKey" FROM "ImportJob"`
    const keys = files.map(row => row.storageKey).filter(Boolean)
    for (const key of keys) {
      const file = path.resolve(plan.backupDirectory, 'storage', key)
      const root = path.resolve(plan.backupDirectory, 'storage')
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid private storage key')
      await fs.access(file)
    }
    if (!apply) return { dryRun: true, counts, keys: [] }
    for (const table of ['DashboardWidget', 'DataRecord', 'Document', 'ImportJob', 'DataCollection']) await tx.$executeRawUnsafe(`DELETE FROM "${table}"`)
    // Delete leaves first; the legacy hierarchy uses RESTRICT on parent deletion.
    while (remaining.size) {
      const parents = new Set([...remaining.values()].map(row => row.parentId))
      const leaves = [...remaining.keys()].filter(id => !parents.has(id))
      if (!leaves.length) throw new Error('Cyclic hierarchy cannot be removed')
      await tx.$executeRaw(Prisma.sql`DELETE FROM "Category" WHERE id IN (${Prisma.join(leaves)})`)
      for (const id of leaves) remaining.delete(id)
    }
    await tx.auditLog.create({ data: { actorId: primary.id, action: 'CATEGORY_PURGED', entityType: 'Category', entityId: plan.rootIds[0], metadata: { operation: 'owner_requested_legacy_reset', counts, backupId: path.basename(plan.backupDirectory) } } })
    return { dryRun: false, counts, keys }
  }, { timeout: 120000 })
  let filesRemoved = 0
  for (const key of result.keys) { await storage.deleteObject(key); filesRemoved++ }
  return { dryRun: result.dryRun, counts: result.counts, filesRemoved }
}

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Supply the private approved removal plan')
  const plan = JSON.parse(await fs.readFile(file, 'utf8'))
  console.log(JSON.stringify(await resetLegacyContent(prisma, createStorage(), plan, process.argv.includes('--apply'))))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
