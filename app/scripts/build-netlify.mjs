import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { netlifyRedirects } from './netlify-redirects.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  if (process.env.VITE_API_URL && process.env.VITE_API_URL !== '/api') throw new Error('Netlify deployment requires VITE_API_URL=/api or unset for same-origin sign-in')
  const redirects = netlifyRedirects(process.env.NETLIFY_API_ORIGIN)
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.js'], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exitCode = result.status || 1
  else await writeFile(resolve(root, 'dist/_redirects'), redirects)
} catch (error) { console.error(error.message); process.exitCode = 1 }
