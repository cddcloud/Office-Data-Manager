import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import WorkspaceIcon from '../shared/WorkspaceIcon.jsx'
import './strategy-dashboard.css'

export default function StrategyDashboard({ root, folder, documents, busy, error, onSelect, onBack, onPreview, onDownload, onMore, onRefresh, accountHeader }) {
  const [open, setOpen] = useState(false)
  const [ongoing, setOngoing] = useState(false)
  const [menuHeight, setMenuHeight] = useState(400)
  const menuBox = useRef(null)
  const trigger = useRef(null)
  const menu = useRef(null)
  const departments = root.children || []
  const selected = folder && folder.id !== root.id
  useLayoutEffect(() => {
    if (!open) return undefined
    const resize = () => setMenuHeight(Math.min(520, Math.max(144, window.innerHeight - menu.current.getBoundingClientRect().top - 16)))
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [open])
  useEffect(() => {
    if (!open) return undefined
    const outside = event => { if (!menuBox.current?.contains(event.target)) setOpen(false) }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => { setOpen(false) }, [folder?.id])
  function keyboard(event) {
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current.focus() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && items.length) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next].focus()
    }
  }
  function openWithKeyboard(event) {
    if (event.key !== 'ArrowDown') return
    event.preventDefault(); setOpen(true)
    requestAnimationFrame(() => menu.current?.querySelector('[role="menuitem"]')?.focus())
  }
  return <section className="strategy-dashboard" aria-label={root.name}>
    {accountHeader && <div className="strategy-account-header">{accountHeader}</div>}
    <header className="strategy-page-header"><button aria-label="Back to Dashboard" onClick={onBack}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"/></svg></button><h1>{root.name}</h1><span aria-hidden="true"/></header>
    <div className="strategy-content">
      <div className="strategy-cards">
        <div className="strategy-ongoing" onPointerEnter={() => setOngoing(true)} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setOngoing(false) }}>
          <button className="strategy-card" aria-describedby={ongoing ? 'strategy-ongoing-note' : undefined} onClick={() => setOngoing(true)} onFocus={() => setOngoing(true)} onBlur={() => setOngoing(false)} onKeyDown={event => { if (event.key === 'Escape') setOngoing(false) }}>{root.name}</button>
          {ongoing && <div id="strategy-ongoing-note" className="strategy-ongoing-note" role="status"><i/>ဆောင်ရွက်ဆဲ</div>}
        </div>
        <div className="strategy-departments" ref={menuBox} onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true) }} onPointerLeave={() => { if (!menuBox.current?.contains(document.activeElement)) setOpen(false) }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
          <button ref={trigger} className="strategy-card" aria-haspopup="menu" aria-expanded={open} aria-controls="strategy-department-menu" onClick={() => setOpen(true)} onKeyDown={openWithKeyboard}><span>ဝန်ကြီးဌာနအလိုက်<br/>{root.name}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
          {open && <div id="strategy-department-menu" ref={menu} role="menu" aria-label="ဌာနများ" className="strategy-department-menu" style={{ maxHeight: menuHeight }} onKeyDown={keyboard}>
            {departments.map(department => <button role="menuitem" key={department.id} className={folder?.id === department.id ? 'selected' : ''} onClick={() => { onSelect(department.id); setOpen(false); trigger.current.focus() }}><WorkspaceIcon name="categories"/><span>{department.name}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>)}
            {!departments.length && <p role="status">ခွင့်ပြုထားသော ဌာန folder မရှိသေးပါ။</p>}
          </div>}
        </div>
      </div>
      {error && <p className="strategy-error" role="alert">{error} <button onClick={onRefresh}>ပြန်စမ်းရန်</button></p>}
      {selected && <section className="strategy-files" aria-label="ဌာနဖိုင်များ" aria-busy={busy}>
        <div className="strategy-files-heading"><div><span>PDF / JPG</span><h2>{folder?.name || root.name}</h2></div><button className="strategy-refresh" aria-label="Refresh files" onClick={onRefresh}>Refresh</button></div>
        {busy && <p role="status">ဖိုင်များ ရယူနေသည်…</p>}
        <div className="strategy-file-grid">{documents.data.map(file => <article key={file.id} className="strategy-file"><span className={`strategy-file-icon ${file.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`}><WorkspaceIcon name="file"/></span><div><span className="strategy-file-type">{file.mimeType === 'application/pdf' ? 'PDF' : 'JPG'}</span><h3><button onClick={() => onPreview(file.id)}>{file.title}</button></h3><p>{file.fileName}</p></div><div className="strategy-file-actions"><button onClick={() => onPreview(file.id)}>Preview</button><button aria-label={`Download ${file.title}`} onClick={() => onDownload(file)}><WorkspaceIcon name="download"/></button></div></article>)}</div>
        {!busy && !error && !documents.data.length && <div className="strategy-empty"><WorkspaceIcon name="file"/><p>ဤဌာနတွင် PDF / JPG ဖိုင် မရှိသေးပါ။</p></div>}
        {documents.meta.nextCursor && <button className="strategy-load-more" disabled={busy} onClick={onMore}>ဖိုင်များ ထပ်ပြရန်</button>}
      </section>}
    </div>
  </section>
}
