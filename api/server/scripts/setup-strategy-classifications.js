import { prisma } from '../lib/prisma.js'
import { ensureStrategyClassifications } from '../modules/categories/strategy-classifications.js'

try {
  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN', isPrimaryAdmin: true, isActive: true } })
  if (!actor) throw new Error('The existing Main Admin is required')
  const result = await ensureStrategyClassifications(prisma, actor.id)
  console.log(JSON.stringify({ created: result.created, moved: result.moved, classificationFolders: result.groups.length, cardFolders: result.groups.reduce((sum, row) => sum + row.children.length, 0), departmentFolders: result.groups.reduce((sum, row) => sum + row.children[1].children.length, 0) }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
