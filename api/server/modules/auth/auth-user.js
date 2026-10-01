// Keep existing sign-in/self-service usable while a populated installation waits
// for its approved migration. This never invents a legacy clearance mapping.
const existingFields = {
  id: true, email: true, name: true, role: true, passwordHash: true,
  isActive: true, isPrimaryAdmin: true, loginResetRequired: true,
  mustChangePassword: true, lastLoginAt: true,
}

export const authUserSelect = ready => ready ? { ...existingFields, clearance: true, permissionVersion: true } : existingFields
export const authUserValue = (user, ready) => user && {
  ...user, clearance: user.clearance ?? null, permissionVersion: user.permissionVersion ?? 0,
  workflowReady: ready && (user.role === 'ADMIN' ? ['V1', 'V2', 'V3'].includes(user.clearance) : user.role === 'VIEWER' && ['V1', 'V2', 'V3', 'V4'].includes(user.clearance)) && (!user.isPrimaryAdmin || user.clearance === 'V1'),
}
export const missingWorkflowSchema = error => error?.code === 'P2022' && /clearance|permissionVersion/.test(error.message)

export async function findAuthUser(db, where) {
  try { return authUserValue(await db.user.findUnique({ where, select: authUserSelect(true) }), true) }
  catch (error) {
    if (!missingWorkflowSchema(error)) throw error
    return authUserValue(await db.user.findUnique({ where, select: authUserSelect(false) }), false)
  }
}
