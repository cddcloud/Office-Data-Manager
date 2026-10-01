import { prisma } from '../lib/prisma.js'
import { ensureStructureDepartments } from '../modules/categories/structure-departments.js'

try {
  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN', isPrimaryAdmin: true, isActive: true } })
  if (!actor) throw new Error('The existing Main Admin is required')
  const result = await ensureStructureDepartments(prisma, actor.id, { reduceTeamsTo17: process.argv.includes('--reduce-teams-to-17') })
  console.log(JSON.stringify({ created: result.created, removed: result.removed, departments: result.departments.length, teams: result.departments.reduce((sum, row) => sum + row.children.length, 0), tabs: result.departments.reduce((sum, row) => sum + row.children.reduce((count, team) => count + team.children.length, 0), 0) }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
