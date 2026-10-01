import { getUser } from '../api.js'

export const isMainAdmin = user => user?.role === 'ADMIN' && user.isPrimaryAdmin === true
export const canManageUsers = user => isMainAdmin(user) || (user?.role === 'ADMIN' && user.clearance === 'V1')
export const isContentAdmin = user => user?.role === 'ADMIN' && (isMainAdmin(user) || ['V1', 'V2', 'V3'].includes(user.clearance))
export function accessibleLevels(user = getUser()) {
  if (isMainAdmin(user)) return ['V1', 'V2', 'V3', 'V4']
  if (!user || !['ADMIN', 'VIEWER'].includes(user.role)) return []
  const start = ['V1', 'V2', 'V3', 'V4'].indexOf(user.clearance)
  return start < 0 || (user.role === 'ADMIN' && start === 3) ? [] : ['V1', 'V2', 'V3', 'V4'].slice(start)
}
export function inputLevels(previous) {
  if (!isContentAdmin(getUser())) return []
  return accessibleLevels().filter(level => !previous || level <= previous)
}
export function initials(name = '') {
  const words = name.trim().split(/\s+/u).filter(Boolean)
  const first = text => typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('my', { granularity: 'grapheme' }).segment(text)][0]?.segment || '' : Array.from(text)[0] || ''
  return words.slice(0, 2).map(first).join('').toLocaleUpperCase()
}
