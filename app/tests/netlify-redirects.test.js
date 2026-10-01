import { describe, expect, it } from 'vitest'
import { netlifyRedirects } from '../scripts/netlify-redirects.mjs'

describe('same-origin Netlify API routing', () => {
  it('routes every API request before the SPA fallback', () => {
    expect(netlifyRedirects('https://office-api.example.test')).toBe('/api/* https://office-api.example.test/api/:splat 200!\n/* /index.html 200\n')
  })
  it('rejects missing, insecure or credential-bearing proxy targets', () => {
    for (const value of [undefined, 'http://example.test', 'https://user:secret@example.test', 'https://example.test/api', 'https://example.test?token=value', 'https://example.test#fragment']) expect(() => netlifyRedirects(value)).toThrow()
  })
})
