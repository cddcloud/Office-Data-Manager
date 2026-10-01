import { assertCategoryAccess, assertInputLevel, isMainAdmin, resolveActor } from '../../lib/access.js'
import { DomainError } from '../../lib/errors.js'

const classifications = [['ထိပ်တန်းလျှို့ဝှက်', 'V1'], ['လျှို့ဝှက်', 'V2'], ['ကန့်သတ်', 'V3'], ['အများပြည်သူ', 'V4']]
const ordered = (rows, count) => rows.length === count && rows.every((row, index) => !row.archivedAt && row.sortOrder === index + 1)

export async function ensureStrategyClassifications(prisma, actorId) {
  return prisma.$transaction(async tx => {
    const actor = await resolveActor(tx, actorId)
    if (!isMainAdmin(actor)) throw new DomainError(403, 'FORBIDDEN', 'Only Main Admin may set up strategy classification folders')
    await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "mainSlot" = 1 FOR UPDATE`
    const root = await tx.category.findUnique({ where: { mainSlot: 1 } })
    if (!root || root.archivedAt) throw new DomainError(409, 'STRATEGY_ROOT_MISSING', 'The strategy main folder is unavailable')
    await assertCategoryAccess(tx, actor, root.id)
    const include = { children: { orderBy: { sortOrder: 'asc' }, include: { children: { orderBy: { sortOrder: 'asc' } } } } }
    const existing = await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' }, include })
    if (ordered(existing, 4) && existing.every((row, index) => row.accessLevel === classifications[index][1] && ordered(row.children, 2) && ordered(row.children[1].children, 17))) return { created: 0, moved: 0, groups: existing }
    // The only automatic rearrangement is the previously provisioned empty V4 set.
    // Populated or unexpected structures need an explicit mapping, never guessed.
    const reuse = ordered(existing, 17) && existing.every(row => row.accessLevel === 'V4' && row.children.length === 0)
    if (existing.length && !reuse) throw new DomainError(409, 'STRATEGY_MAPPING_REQUIRED', 'Existing folders require a classification mapping; nothing was changed')
    if (reuse) {
      const where = { categoryId: { in: existing.map(row => row.id) } }
      const counts = await Promise.all([tx.document.count({ where }), tx.dataRecord.count({ where }), tx.dataCollection.count({ where }), tx.importJob.count({ where })])
      if (counts.some(Boolean)) throw new DomainError(409, 'STRATEGY_MAPPING_REQUIRED', 'Existing content needs an approved classification mapping; nothing was changed')
    }
    const created = []
    for (const [index, [name, accessLevel]] of classifications.entries()) {
      assertInputLevel(actor, accessLevel)
      const group = await tx.category.create({ data: { name, accessLevel, parentId: root.id, sortOrder: index + 1, createdById: actor.id, updatedById: actor.id } })
      created.push(group)
      const policy = await tx.category.create({ data: { name: root.name, accessLevel, parentId: group.id, sortOrder: 1, createdById: actor.id, updatedById: actor.id } })
      const ministry = await tx.category.create({ data: { name: `ဝန်ကြီးဌာနအလိုက် ${root.name}`, accessLevel, parentId: group.id, sortOrder: 2, createdById: actor.id, updatedById: actor.id } })
      created.push(policy, ministry)
      if (index === 3 && reuse) {
        await tx.category.updateMany({ where: { id: { in: existing.map(row => row.id) } }, data: { parentId: ministry.id, updatedById: actor.id } })
        await tx.auditLog.createMany({ data: existing.map(row => ({ action: 'CATEGORY_MOVED', entityType: 'Category', entityId: row.id, actorId: actor.id, before: { parentId: root.id }, after: { parentId: ministry.id } })) })
      } else {
        await tx.category.createMany({ data: Array.from({ length: 17 }, (_, slot) => ({ name: `ဌာန ${new Intl.NumberFormat('my-MM').format(slot + 1)}`, accessLevel, parentId: ministry.id, sortOrder: slot + 1, createdById: actor.id, updatedById: actor.id })) })
        created.push(...await tx.category.findMany({ where: { parentId: ministry.id } }))
      }
    }
    await tx.auditLog.createMany({ data: created.map(row => ({ action: 'CATEGORY_CREATED', entityType: 'Category', entityId: row.id, actorId: actor.id, after: { name: row.name, parentId: row.parentId, accessLevel: row.accessLevel, sortOrder: row.sortOrder } })) })
    return { created: created.length, moved: reuse ? 17 : 0, groups: await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' }, include }) }
  }, { timeout: 20000 })
}
