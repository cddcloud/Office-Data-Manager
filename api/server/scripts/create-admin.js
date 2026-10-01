import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD
const name = process.env.ADMIN_NAME?.trim() || 'System Administrator'

try {
  const currentPrimary = await prisma.user.findFirst({ where: { isPrimaryAdmin: true }, select: { email: true } })
  if (currentPrimary) {
    console.log(`Main Administrator ready: ${currentPrimary.email}. Create other accounts through User & Access invitations.`)
  } else if (await prisma.user.count()) {
    throw new Error('A populated installation must preserve its approved Main Admin identity. This bootstrap command cannot assign or recover one.')
  } else if (!email || !password || password.length < 12) {
    throw new Error('For an empty installation, set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) for the first Main Admin.')
  } else {
    await prisma.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN', clearance: 'V1', isPrimaryAdmin: true, isActive: true, mustChangePassword: false, loginResetRequired: false } })
    console.log(`Main Administrator ready: ${email}`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
