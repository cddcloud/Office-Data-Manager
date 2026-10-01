import { assertCategoryAccess, assertInputLevel, isMainAdmin, resolveActor } from '../../lib/access.js'
import { DomainError } from '../../lib/errors.js'

const number = value => new Intl.NumberFormat('my-MM').format(value)
const ordered = (rows, count) => rows.length === count && rows.every((row, index) => !row.archivedAt && row.sortOrder === index + 1)

// Explicit provisioning only. Folder names may change; ordered identities are reused.
export async function ensureStructureDepartments(prisma, actorId, { reduceTeamsTo17 = false } = {}) {
  return prisma.$transaction(async tx => {
    const actor = await resolveActor(tx, actorId)
    if (!isMainAdmin(actor)) throw new DomainError(403, 'FORBIDDEN', 'Only Main Admin may set up the structure folders')
    await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "mainSlot" = 2 FOR UPDATE`
    const root = await tx.category.findUnique({ where: { mainSlot: 2 } })
    if (!root || root.archivedAt) throw new DomainError(409, 'STRUCTURE_ROOT_MISSING', 'The structure main folder is unavailable')
    await assertCategoryAccess(tx, actor, root.id)
    assertInputLevel(actor, root.accessLevel)
    const include = { children: { orderBy: { sortOrder: 'asc' }, include: { children: { orderBy: { sortOrder: 'asc' } } } } }
    let departments = await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' }, include })
    let removed = 0
    if (reduceTeamsTo17 && ordered(departments, 17) && departments.every(row => ordered(row.children, 20) && row.children.every(team => ordered(team.children, 2)))) {
      const teams = departments.flatMap(row => row.children.slice(17))
      const leaves = teams.flatMap(row => row.children)
      const ids = [...teams, ...leaves].map(row => row.id)
      const counts = await Promise.all(['document', 'dataRecord', 'dataCollection', 'importJob'].map(model => tx[model].count({ where: { categoryId: { in: ids } } })))
      const extraChildren = await tx.category.count({ where: { parentId: { in: leaves.map(row => row.id) } } })
      const unchanged = teams.every(team => !team.description && team.name === `အဖွဲ့ ${number(team.sortOrder)}` && team.children.every(leaf => !leaf.description && leaf.name === `Tab ${number(leaf.sortOrder)}` && leaf.accessLevel === team.accessLevel))
      if (!unchanged || extraChildren || counts.some(Boolean)) throw new DomainError(409, 'STRUCTURE_MAPPING_REQUIRED', 'Extra teams contain content or changed folders; nothing was removed')
      for (const team of teams) assertInputLevel(actor, team.accessLevel)
      await tx.auditLog.createMany({ data: [...teams, ...leaves].map(folder => ({ action: 'CATEGORY_PURGED', entityType: 'Category', entityId: folder.id, actorId: actor.id, before: { name: folder.name, parentId: folder.parentId, accessLevel: folder.accessLevel, sortOrder: folder.sortOrder }, metadata: { reason: 'Owner-approved reduction to 17 teams; empty generated folders only' } })) })
      await tx.category.deleteMany({ where: { id: { in: leaves.map(row => row.id) } } })
      await tx.category.deleteMany({ where: { id: { in: teams.map(row => row.id) } } })
      removed = ids.length
      departments = await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' }, include })
    }
    const previousIds = new Set(departments.flatMap(row => [row.id, ...row.children.flatMap(child => [child.id, ...child.children.map(leaf => leaf.id)])]))
    if (departments.length) {
      if (!ordered(departments, 17) || !departments.every(row => ordered(row.children, 17))) throw new DomainError(409, 'STRUCTURE_MAPPING_REQUIRED', 'Existing folders require an explicit 17-by-17-by-2 mapping; nothing was changed')
      const teams = departments.flatMap(row => row.children)
      if (teams.every(row => ordered(row.children, 2))) return { created: 0, removed, departments }
      if (!teams.every(row => row.children.length === 0)) throw new DomainError(409, 'STRUCTURE_MAPPING_REQUIRED', 'Existing leaf tabs require an explicit mapping; nothing was changed')
    }
    for (let slot = 1; !departments.length && slot <= 17; slot++) {
      const department = await tx.category.create({ data: { name: `ဌာန ${number(slot)}`, parentId: root.id, accessLevel: root.accessLevel, sortOrder: slot, createdById: actor.id, updatedById: actor.id } })
      await tx.category.createMany({ data: Array.from({ length: 17 }, (_, index) => ({ name: `အဖွဲ့ ${number(index + 1)}`, parentId: department.id, accessLevel: root.accessLevel, sortOrder: index + 1, createdById: actor.id, updatedById: actor.id })) })
    }
    departments = await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' }, include })
    for (const team of departments.flatMap(row => row.children)) assertInputLevel(actor, team.accessLevel)
    await tx.category.createMany({ data: departments.flatMap(row => row.children.flatMap(team => [1, 2].map(slot => ({ name: `Tab ${number(slot)}`, parentId: team.id, accessLevel: team.accessLevel, sortOrder: slot, createdById: actor.id, updatedById: actor.id })))) })
    departments = await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' }, include })
    const folders = departments.flatMap(row => [row, ...row.children.flatMap(team => [team, ...team.children])]).filter(row => !previousIds.has(row.id))
    await tx.auditLog.createMany({ data: folders.map(folder => ({ action: 'CATEGORY_CREATED', entityType: 'Category', entityId: folder.id, actorId: actor.id, after: { name: folder.name, parentId: folder.parentId, accessLevel: folder.accessLevel, sortOrder: folder.sortOrder } })) })
    return { created: folders.length, removed, departments }
  }, { timeout: 20000 })
}
