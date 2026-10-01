import 'dotenv/config'
import { z } from 'zod'
import { resolve, sep } from 'node:path'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(24),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
})

let cached

export function getEnv() {
  if (cached) return cached
  const parsed = environmentSchema.safeParse(process.env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map(issue => issue.path.join('.') || 'environment').join(', ')
    throw new Error(`Invalid environment configuration: ${fields}`)
  }
  if (parsed.data.STORAGE_DRIVER === 's3' && (!parsed.data.S3_BUCKET || !parsed.data.S3_REGION || !parsed.data.S3_ACCESS_KEY_ID || !parsed.data.S3_SECRET_ACCESS_KEY)) {
    throw new Error('S3 bucket, region, access key, and secret are required when STORAGE_DRIVER=s3')
  }
  if (parsed.data.NODE_ENV === 'production' && process.env.RAILWAY_ENVIRONMENT_ID && parsed.data.STORAGE_DRIVER === 'local') {
    const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH
    const storage = resolve(parsed.data.STORAGE_LOCAL_DIR)
    if (!mount || (storage !== resolve(mount) && !storage.startsWith(`${resolve(mount)}${sep}`))) throw new Error('Railway local file storage requires a persistent volume containing STORAGE_LOCAL_DIR')
  }
  cached = parsed.data
  return cached
}

export function resetEnvForTests() {
  cached = undefined
}

export function getListenPort(env) {
  return env.NODE_ENV === 'production' ? (env.PORT ?? env.API_PORT) : env.API_PORT
}
