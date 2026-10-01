import { assertCategoryAccess, assertInputLevel, isMainAdmin, resolveActor } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'
import { DomainError } from '../../lib/errors.js'

// Explicit setup only: reading the Dashboard never creates or changes folders.
export async function ensureStrategyDepartments(prisma, actorId) {
  return prisma.$transaction(async tx => {
    const actor = await resolveActor(tx, actorId)
    if (!isMainAdmin(actor)) throw new DomainError(403, 'FORBIDDEN', 'Only Main Admin may set up the department folders')
    const root = await tx.category.findUnique({ where: { mainSlot: 1 } })
    if (!root || root.archivedAt) throw new DomainError(409, 'STRATEGY_ROOT_MISSING', 'The strategy main folder is unavailable')
    await assertCategoryAccess(tx, actor, root.id)
    assertInputLevel(actor, root.accessLevel)
    const children = await tx.category.findMany({ where: { parentId: root.id }, orderBy: { sortOrder: 'asc' } })
    if (children.length) {
      if (children.length === 17 && children.every((child, index) => !child.archivedAt && child.sortOrder === index + 1)) return { created: 0, folders: children }
      throw new DomainError(409, 'DEPARTMENT_MAPPING_REQUIRED', 'Existing child folders require an explicit department mapping; nothing was changed')
    }
    const folders = []
    for (let slot = 1; slot <= 17; slot++) {
      const folder = await tx.category.create({ data: { name: `ဌာန ${new Intl.NumberFormat('my-MM').format(slot)}`, parentId: root.id, accessLevel: root.accessLevel, sortOrder: slot, createdById: actor.id, updatedById: actor.id } })
      await createAuditService(tx).record({ action: 'CATEGORY_CREATED', entityType: 'Category', entityId: folder.id, actorId: actor.id, before: null, after: { name: folder.name, parentId: root.id, accessLevel: folder.accessLevel, sortOrder: slot } })
      folders.push(folder)
    }
    return { created: folders.length, folders }
  })
}
