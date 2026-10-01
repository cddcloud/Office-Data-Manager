export function netlifyRedirects(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('Set NETLIFY_API_ORIGIN to the Railway API HTTPS origin') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('NETLIFY_API_ORIGIN must be a plain HTTPS origin without credentials or a path')
  return `/api/* ${url.origin}/api/:splat 200!\n/* /index.html 200\n`
}
