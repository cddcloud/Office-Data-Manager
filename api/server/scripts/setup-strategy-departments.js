import { prisma } from '../lib/prisma.js'
import { ensureStrategyDepartments } from '../modules/categories/strategy-departments.js'

try {
  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN', isPrimaryAdmin: true, isActive: true } })
  if (!actor) throw new Error('The existing Main Admin is required')
  const result = await ensureStrategyDepartments(prisma, actor.id)
  console.log(JSON.stringify({ created: result.created, departmentFolders: result.folders.length }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
