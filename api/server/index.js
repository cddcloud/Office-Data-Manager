import { createApp } from './app.js'
import { getEnv, getListenPort } from './config/env.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'

const env = getEnv()
const port = getListenPort(env)
const server = createApp().listen(port, '0.0.0.0', () => logger.info({ port }, 'API listening'))

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down')
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
