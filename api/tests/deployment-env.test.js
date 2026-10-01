import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEnv, getListenPort, resetEnvForTests } from '../server/config/env.js'

beforeEach(() => {
  resetEnvForTests()
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/isolated')
  vi.stubEnv('JWT_SECRET', 'isolated-deployment-secret-of-sufficient-length')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PORT', undefined)
  vi.stubEnv('API_PORT', '3001')
  vi.stubEnv('TRUST_PROXY_HOPS', '0')
  vi.stubEnv('STORAGE_DRIVER', 'local')
  vi.stubEnv('RAILWAY_ENVIRONMENT_ID', undefined)
})
afterEach(() => { vi.unstubAllEnvs(); resetEnvForTests() })

describe('deployment environment', () => {
  it('accepts Railway port with the local development fallback', () => {
    expect(getListenPort(getEnv())).toBe(3001)
    resetEnvForTests(); vi.stubEnv('PORT', '8080')
    expect(getListenPort(getEnv())).toBe(3001)
    resetEnvForTests(); vi.stubEnv('NODE_ENV', 'production')
    expect(getListenPort(getEnv())).toBe(8080)
  })
  it('rejects invalid ports and unbounded proxy trust', () => {
    vi.stubEnv('PORT', '0'); expect(() => getEnv()).toThrow('PORT')
    vi.stubEnv('PORT', '8080'); vi.stubEnv('TRUST_PROXY_HOPS', 'true')
    expect(() => getEnv()).toThrow('TRUST_PROXY_HOPS')
  })
  it('requires Railway file storage to remain inside its persistent volume', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('RAILWAY_ENVIRONMENT_ID', 'isolated')
    vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', undefined)
    expect(() => getEnv()).toThrow('persistent volume')
    vi.stubEnv('RAILWAY_VOLUME_MOUNT_PATH', '/data'); vi.stubEnv('STORAGE_LOCAL_DIR', '/ephemeral/storage')
    expect(() => getEnv()).toThrow('persistent volume')
    vi.stubEnv('STORAGE_LOCAL_DIR', '/data/storage'); expect(getEnv().STORAGE_LOCAL_DIR).toBe('/data/storage')
  })
})
