import 'dotenv/config'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { prisma } from '../lib/prisma.js'
import { MAIN_FOLDER_NAMES } from '../lib/main-folder-names.js'

const tables = ['User', 'AccountInvite', 'Category', 'DataCollection', 'DataRecord', 'Document', 'ImportJob', 'DashboardWidget']
const levels = ['V1', 'V2', 'V3', 'V4']

// Safe before and after schema deployment; no passwords, token hashes or payloads.
export async function inventory(db) {
  const result = {}
  for (const table of tables) {
    result[table] = await db.$queryRawUnsafe(`SELECT id, to_jsonb(t)->>'role' AS role, to_jsonb(t)->>'clearance' AS clearance, to_jsonb(t)->>'isPrimaryAdmin' AS "isPrimaryAdmin", to_jsonb(t)->>'accessLevel' AS "accessLevel", to_jsonb(t)->>'defaultAccessLevel' AS "defaultAccessLevel", to_jsonb(t)->>'parentId' AS "parentId", to_jsonb(t)->>'mainSlot' AS "mainSlot", to_jsonb(t)->>'archivedAt' AS "archivedAt" FROM "${table}" t ORDER BY id`)
  }
  return result
}

export function validateMappings(current, mapping) {
  const plan = []
  for (const table of tables) {
    const supplied = mapping[table] || {}
    const known = new Set(current[table].map(row => row.id))
    for (const id of Object.keys(supplied)) if (!known.has(id)) throw new Error(`Unknown ${table} ID: ${id}`)
    for (const row of current[table]) {
      const input = supplied[row.id]
      if (!input) throw new Error(`Explicit mapping required for ${table} ID: ${row.id}`)
      if (table === 'User' || table === 'AccountInvite') {
        if (!['ADMIN', 'VIEWER'].includes(input.role) || !levels.includes(input.clearance) || (input.role === 'ADMIN' && input.clearance === 'V4')) throw new Error(`Invalid account mapping: ${row.id}`)
        if (row.isPrimaryAdmin === 'true' && (input.role !== 'ADMIN' || input.clearance !== 'V1')) throw new Error('Preserve the existing Main Admin identity with V1 clearance')
        plan.push({ table, id: row.id, data: { role: input.role, clearance: input.clearance } })
      } else {
        if (!levels.includes(input.accessLevel)) throw new Error(`Invalid content mapping: ${row.id}`)
        const data = table === 'DataCollection' ? { defaultAccessLevel: input.accessLevel } : { accessLevel: input.accessLevel }
        if (table === 'Category') {
          if (row.parentId === null) {
            if (!Number.isInteger(input.mainSlot) || input.mainSlot < 1 || input.mainSlot > 6 || row.archivedAt) throw new Error(`An active root requires an approved slot 1–6: ${row.id}`)
            data.mainSlot = input.mainSlot
            data.sortOrder = input.mainSlot
            if (row.mainSlot === null) data.name = MAIN_FOLDER_NAMES[input.mainSlot - 1]
          } else if (input.mainSlot !== undefined) throw new Error('Do not convert child folders to roots')
        }
        plan.push({ table, id: row.id, data })
      }
    }
  }
  const roots = plan.filter(row => row.table === 'Category' && row.data.mainSlot)
  if (roots.length > 6 || new Set(roots.map(row => row.data.mainSlot)).size !== roots.length) throw new Error('Existing roots need an explicit, non-destructive six-slot decision')
  return plan
}

export async function applyMappings(db, plan) {
  return db.$transaction(async tx => {
    // Maintenance window required. Recheck complete inventory under table locks.
    for (const table of tables) await tx.$executeRawUnsafe(`LOCK TABLE "${table}" IN EXCLUSIVE MODE`)
    const current = await inventory(tx)
    const mapping = Object.fromEntries(tables.map(table => [table, Object.fromEntries(plan.filter(row => row.table === table).map(row => [row.id, { ...row.data, accessLevel: row.data.defaultAccessLevel || row.data.accessLevel }]))]))
    validateMappings(current, mapping)
    for (const item of plan) {
      const model = item.table[0].toLowerCase() + item.table.slice(1)
      await tx[model].update({ where: { id: item.id }, data: { ...item.data, ...(item.table === 'User' ? { permissionVersion: { increment: 1 } } : {}) } })
    }
    await tx.refreshToken.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } })
    const slots = new Set(plan.filter(row => row.table === 'Category').map(row => row.data.mainSlot))
    for (let slot = 1; slot <= 6; slot++) if (!slots.has(slot)) await tx.category.create({ data: { id: `cmainfolder00000000000000${slot}`, name: MAIN_FOLDER_NAMES[slot - 1], mainSlot: slot, sortOrder: slot, accessLevel: 'V4' } })
    return { mapped: plan.length, roots: 6 }
  }, { timeout: 120000 })
}

async function main() {
  const current = await inventory(prisma)
  const mappingFile = process.argv[2]
  if (!mappingFile) { console.log(JSON.stringify(current, null, 2)); return }
  const plan = validateMappings(current, JSON.parse(await fs.readFile(mappingFile, 'utf8')))
  if (process.argv.includes('--apply')) console.log(JSON.stringify(await applyMappings(prisma, plan)))
  else console.log(JSON.stringify({ dryRun: true, updates: plan.length, roots: plan.filter(row => row.data.mainSlot).map(row => ({ id: row.id, slot: row.data.mainSlot })), counts: Object.fromEntries(tables.map(table => [table, current[table].length])) }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
