const API_BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'office_access_token'
const USER_KEY = 'office_user'

let refreshPromise = null
let refreshShouldNotify = false
const sessionExpiredListeners = new Set()

export function subscribeSessionExpired(listener) {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

function notifySessionExpired() {
  sessionExpiredListeners.forEach(listener => listener())
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

function storeSession(data) {
  const token = data.accessToken || data.token
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  if (data.user) sessionStorage.setItem(USER_KEY, JSON.stringify(data.user))
  return data.user || getUser()
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

function apiError(payload, fallback) {
  return Object.assign(new Error(payload.error?.message || fallback), {
    code: payload.error?.code,
    details: payload.error?.details,
  })
}

async function refreshSession({ notifyOnFailure = false } = {}) {
  if (notifyOnFailure) refreshShouldNotify = true
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw apiError(payload, 'Your session has expired')
        storeSession(payload.data)
        return payload.data
      })
      .catch(error => {
        clearSession()
        if (refreshShouldNotify) notifySessionExpired()
        throw error
      })
      .finally(() => {
        refreshPromise = null
        refreshShouldNotify = false
      })
  }
  return refreshPromise
}

async function request(path, options = {}, retry = true) {
  const token = getToken()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    await refreshSession({ notifyOnFailure: true })
    return request(path, options, false)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw apiError(payload, 'တောင်းဆိုမှု မအောင်မြင်ပါ')
  if (typeof window !== 'undefined' && options.method && !['GET', 'HEAD'].includes(options.method) && !path.startsWith('/auth/')) window.dispatchEvent(new Event('office:content-changed'))
  return payload
}

export async function api(path, options = {}) {
  return (await request(path, options)).data
}

export function apiEnvelope(path, options = {}) {
  return request(path, options)
}

export async function apiBlob(path, retry = true) {
  const token = getToken()
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (response.status === 401 && retry) {
    await refreshSession({ notifyOnFailure: true })
    return apiBlob(path, false)
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw apiError(payload, 'ဖိုင်ကို ဖွင့်၍မရပါ')
  }
  return response.blob()
}

export async function login(email, password) {
  const payload = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
  return storeSession(payload.data)
}

export async function bootstrapSession() {
  try {
    const data = await refreshSession()
    return storeSession(data)
  } catch {
    return null
  }
}

export async function logout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
  } finally {
    clearSession()
  }
}
