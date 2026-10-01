import { DomainError, notFound } from './errors.js'

// Legacy labels deliberately have no rank; deployment requires explicit mappings.
export const ACCESS_RANK = Object.freeze({ V1: 1, V2: 2, V3: 3, V4: 4 })
export const CONTENT_LEVELS = Object.freeze(Object.keys(ACCESS_RANK))
export const isMainAdmin = actor => actor?.role === 'ADMIN' && actor.isPrimaryAdmin === true
export const isContentAdmin = actor => actor?.role === 'ADMIN' && (isMainAdmin(actor) || ['V1', 'V2', 'V3'].includes(actor.clearance))
export const canManageUsers = actor => isMainAdmin(actor) || (isContentAdmin(actor) && actor.clearance === 'V1')
export const canViewReference = canManageUsers

export function allowedAccessLevels(actor) {
  if (isMainAdmin(actor)) return [...CONTENT_LEVELS]
  if (!actor || !['ADMIN', 'VIEWER'].includes(actor.role)) return []
  const rank = ACCESS_RANK[actor.clearance]
  if (!rank || (actor.role === 'ADMIN' && rank === 4)) return []
  return CONTENT_LEVELS.filter(level => ACCESS_RANK[level] >= rank)
}

export function canAccess(actor, level) {
  return allowedAccessLevels(actor).includes(level)
}

export function assertInputLevel(actor, level, previous) {
  if (!isContentAdmin(actor) || !canAccess(actor, level)) throw new DomainError(403, 'FORBIDDEN', 'This classification is not permitted')
  if (previous && ACCESS_RANK[level] > ACCESS_RANK[previous]) throw new DomainError(409, 'DECLASSIFICATION_NOT_APPROVED', 'Lowering content sensitivity requires an approved policy')
}

export async function resolveActor(db, actorOrId) {
  const actor = typeof actorOrId === 'string' ? await db.user.findUnique({ where: { id: actorOrId } }) : actorOrId
  if (!actor || actor.isActive === false || actor.loginResetRequired || !allowedAccessLevels(actor).length) throw new DomainError(403, 'FORBIDDEN', 'The account has no current content clearance')
  return actor
}

// Every ancestor must be accessible. Never return an orphan whose parent is hidden.
export async function authorizedCategoryIds(db, actor, { includeArchived = false } = {}) {
  const rows = await db.category.findMany({ select: { id: true, parentId: true, accessLevel: true, archivedAt: true } })
  const byId = new Map(rows.map(row => [row.id, row]))
  const memo = new Map()
  function visible(id, path = new Set()) {
    if (memo.has(id)) return memo.get(id)
    const row = byId.get(id)
    if (!row || path.has(id) || (!includeArchived && row.archivedAt) || !canAccess(actor, row.accessLevel)) return false
    const result = !row.parentId || visible(row.parentId, new Set(path).add(id))
    memo.set(id, result)
    return result
  }
  return rows.filter(row => visible(row.id)).map(row => row.id)
}

export async function assertCategoryAccess(db, actor, id, options = {}) {
  if (!(await authorizedCategoryIds(db, actor, options)).includes(id)) throw notFound('Content')
}

export async function collectionWhere(db, actor, includeArchived = false) {
  return { ...(includeArchived ? {} : { archivedAt: null }), defaultAccessLevel: { in: allowedAccessLevels(actor) }, categoryId: { in: await authorizedCategoryIds(db, actor, { includeArchived }) } }
}

export async function contentWhere(db, actor, kind, includeArchived = false) {
  return {
    ...(includeArchived ? {} : { archivedAt: null }),
    accessLevel: { in: allowedAccessLevels(actor) },
    categoryId: { in: await authorizedCategoryIds(db, actor, { includeArchived }) },
    ...(kind === 'record' || kind === 'widget' ? { dataCollection: await collectionWhere(db, actor, includeArchived) } : {}),
  }
}

export function assertAccountTarget(actor, target) {
  if (!canManageUsers(actor)) throw new DomainError(403, 'FORBIDDEN', 'Account management is unavailable')
  if (!target || (!isMainAdmin(actor) && (target.role !== 'VIEWER' || target.isPrimaryAdmin))) throw notFound('Account')
}

// Subtree operations must not mutate even one object outside the actor's clearance.
export async function assertSubtreeAccess(db, actor, ids) {
  const accessible = new Set(await authorizedCategoryIds(db, actor, { includeArchived: true }))
  if (ids.some(id => !accessible.has(id))) throw notFound('Content')
  const categoryId = { in: ids }
  const levels = allowedAccessLevels(actor)
  const counts = await Promise.all([
    db.dataCollection.count({ where: { categoryId, defaultAccessLevel: { notIn: levels } } }),
    db.dataRecord.count({ where: { categoryId, NOT: await contentWhere(db, actor, 'record', true) } }),
    db.document.count({ where: { categoryId, accessLevel: { notIn: levels } } }),
    db.importJob.count({ where: { categoryId, OR: [{ accessLevel: null }, { accessLevel: { notIn: levels } }] } }),
    db.dashboardWidget.count({ where: { dataCollection: { categoryId }, accessLevel: { notIn: levels } } }),
  ])
  if (counts.some(Boolean)) throw new DomainError(403, 'FORBIDDEN', 'This operation includes content outside your clearance')
}
