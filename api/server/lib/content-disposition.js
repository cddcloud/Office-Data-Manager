import { basename } from 'node:path'

export function contentDisposition(type, filename) {
  const name = basename(filename).replace(/[\r\n]/g, '')
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'download'
  const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
