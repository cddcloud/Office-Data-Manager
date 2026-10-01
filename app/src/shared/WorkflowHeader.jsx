import { useEffect, useRef, useState } from 'react'
import { apiEnvelope, getToken } from '../api.js'
import { initials, isMainAdmin } from './access.js'
import './workflow.css'

export default function WorkflowHeader({ user, onLogout, onTarget }) {
  const [notices, setNotices] = useState({ data: [], meta: { unreadCount: 0 } })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const box = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    let reconnect
    let active = true
    let delay = 1000
    const reload = () => apiEnvelope('/notifications').then(data => { if (active) { setNotices(data); setError('') } }).catch(failure => active && setError(failure.message))
    const fallback = setInterval(reload, 20000)
    window.addEventListener('office:content-changed', reload)
    async function stream() {
      await reload()
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/notifications/stream`, { headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal, credentials: 'include' })
        if (!response.ok || !response.body) throw new Error('Stream unavailable')
        delay = 1000
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        while (active) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          let boundary
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const block = pending.slice(0, boundary); pending = pending.slice(boundary + 2)
            if (block.startsWith('event: revoked')) { setNotices({ data: [], meta: { unreadCount: 0 } }); onLogout(); return }
            const data = block.split('\n').find(line => line.startsWith('data: '))
            if (data && active) setNotices(JSON.parse(data.slice(6)))
          }
        }
      } catch (failure) { if (failure.name === 'AbortError') return }
      if (active) { reconnect = setTimeout(stream, delay); delay = Math.min(delay * 2, 20000) }
    }
    void stream()
    return () => { active = false; controller.abort(); clearInterval(fallback); clearTimeout(reconnect); window.removeEventListener('office:content-changed', reload) }
  }, [user.id])
  useEffect(() => {
    if (!open) return
    const close = event => { if (event.key === 'Escape' || (event.type === 'pointerdown' && !box.current?.contains(event.target))) setOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [open])
  async function mark(id) {
    try { setNotices(await apiEnvelope(`/notifications/${id ? `${id}/read` : 'read-all'}`, { method: 'POST' })); setError('') }
    catch (failure) { setError(failure.message) }
  }
  async function more() {
    try { const page = await apiEnvelope(`/notifications?cursor=${encodeURIComponent(notices.meta.nextCursor)}`); setNotices(current => ({ data: [...current.data, ...page.data], meta: page.meta })) }
    catch (failure) { setError(failure.message) }
  }
  return <div className="workflow-identity" ref={box}>
    <button className="workflow-bell" aria-label={`Notifications, ${notices.meta.unreadCount} unread`} aria-expanded={open} onClick={() => setOpen(value => !value)}>♧{notices.meta.unreadCount > 0 && <span>{notices.meta.unreadCount}</span>}</button>
    <span className="workflow-avatar" aria-hidden="true">{initials(user.name)}</span><div className="workflow-name"><b>{user.name}</b><small>{isMainAdmin(user) ? 'Main Admin' : user.role === 'ADMIN' ? 'Admin' : 'Viewer'} <span className="workflow-chip">{isMainAdmin(user) ? 'V1–V4' : user.clearance || 'Mapping required'}</span></small></div>
    <button onClick={onLogout}>Logout</button>
    {open && <section className="workflow-notifications" aria-label="Notifications"><header><b>အသိပေးချက်များ</b><button onClick={() => mark()}>Mark all read</button></header>{error && <p role="alert">{error}</p>}{!notices.data.length && <p>အသိပေးချက် မရှိသေးပါ။</p>}{notices.data.map(notice => <article key={notice.id} className={notice.readAt ? '' : 'unread'}><button onClick={() => { onTarget(notice); setOpen(false); void mark(notice.id) }}><strong>{notice.text}</strong><time>{new Intl.DateTimeFormat('my', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Rangoon' }).format(new Date(notice.createdAt))}</time></button>{!notice.readAt && <button aria-label={`Mark ${notice.text} read`} onClick={() => mark(notice.id)}>✓</button>}</article>)}{notices.meta.nextCursor && <button onClick={more}>Load more</button>}</section>}
  </div>
}
