import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import WorkspaceIcon from '../shared/WorkspaceIcon.jsx'
import './folder-hover-menu.css'

export default function FolderHoverMenu({ nodes, label, onSelect, maxDepth = 3, selectedId }) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState([])
  const [stage, setStage] = useState(0)
  const [placement, setPlacement] = useState({})
  const box = useRef(null), menu = useRef(null), trigger = useRef(null)
  const hoverTimer = useRef(null), closeTimer = useRef(null)
  const columns = []
  let items = nodes || []
  for (let depth = 0; depth < maxDepth && items.length; depth++) {
    const active = items.find(item => item.id === path[depth])
    columns.push({ items, active, name: depth === 0 ? 'ဌာနများ' : columns[depth - 1].active.name })
    if (!active) break
    items = active.children || []
  }
  useLayoutEffect(() => {
    if (!open) return undefined
    const resize = () => {
      const bounds = box.current.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth
      const width = Math.min(viewportWidth - 24, viewportWidth <= 650 ? 320 : Math.max(260, columns.length * 250))
      const left = Math.max(12, Math.min(bounds.left, viewportWidth - width - 12)) - bounds.left
      const below = window.innerHeight - bounds.bottom - 24, above = bounds.top - 24
      const opensAbove = below < 180 && above > below
      setPlacement({ width, left, top: opensAbove ? 'auto' : 'calc(100% + 8px)', bottom: opensAbove ? 'calc(100% + 8px)' : 'auto', '--menu-height': `${Math.max(140, Math.min(500, opensAbove ? above : below))}px` })
    }
    resize(); window.addEventListener('resize', resize); window.addEventListener('scroll', resize, true)
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('scroll', resize, true) }
  }, [open, columns.length])
  useEffect(() => {
    if (!open) return undefined
    const outside = event => { if (!box.current?.contains(event.target)) close() }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => { close() }, [selectedId])
  useEffect(() => () => { clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current) }, [])
  function close() {
    clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current)
    setOpen(false); setPath([]); setStage(0)
  }
  function openRoot() {
    clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current)
    setPath([]); setStage(0); setOpen(true)
  }
  function focusColumn(depth, id) { requestAnimationFrame(() => menu.current?.querySelector(id ? `[data-folder="${id}"]` : `[data-depth="${depth}"] [role="menuitem"]`)?.focus()) }
  function branch(depth, node) {
    clearTimeout(hoverTimer.current)
    setPath(current => [...current.slice(0, depth), node.id])
  }
  function hoverBranch(event, depth, node) {
    clearTimeout(hoverTimer.current)
    // Only departments preview their children on hover. Teams open by activation.
    if (event.pointerType === 'mouse' && depth === 0 && maxDepth > 1 && node.children?.length) {
      hoverTimer.current = setTimeout(() => branch(depth, node), 220)
    }
  }
  function activate(depth, node) {
    if (depth + 1 < maxDepth && node.children?.length) { branch(depth, node); setStage(depth + 1); focusColumn(depth + 1) }
    else { onSelect(node.id); close(); trigger.current.focus() }
  }
  function previous(depth) {
    const parentId = columns[depth - 1].active.id
    setPath(current => current.slice(0, depth - 1)); setStage(depth - 1)
    focusColumn(depth - 1, parentId)
  }
  function keyboard(event, depth) {
    clearTimeout(hoverTimer.current)
    const buttons = [...event.currentTarget.querySelectorAll('[role="menuitem"]')]
    const index = buttons.indexOf(document.activeElement)
    if (event.key === 'Escape') { event.preventDefault(); close(); trigger.current.focus() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
      event.preventDefault()
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus()
    }
    if (event.key === 'ArrowRight' && depth + 1 < maxDepth) {
      const node = columns[depth].items.find(item => item.id === document.activeElement?.dataset.folder)
      if (node?.children?.length) { event.preventDefault(); activate(depth, node) }
    }
    if (event.key === 'ArrowLeft' && depth) { event.preventDefault(); previous(depth) }
  }
  return <div className="folder-hover" ref={box} onPointerEnter={event => { clearTimeout(closeTimer.current); if (event.pointerType === 'mouse' && !open) openRoot() }} onPointerLeave={() => { clearTimeout(hoverTimer.current); closeTimer.current = setTimeout(() => { if (!box.current?.contains(document.activeElement)) close() }, 180) }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
    <button ref={trigger} className="strategy-card" aria-haspopup="menu" aria-expanded={open} onClick={openRoot} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openRoot(); focusColumn(0) } if (event.key === 'Escape') { event.preventDefault(); close() } }}>{label}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    {open && <div ref={menu} className="folder-hover-menu" style={{ ...placement, '--menu-columns': Math.max(1, columns.length) }}>
      {columns.map((column, depth) => <div role="menu" aria-label={column.name} key={depth} data-depth={depth} className={`folder-menu-column ${stage === depth ? 'current-stage' : ''}`} onKeyDown={event => keyboard(event, depth)}>
        {depth > 0 && <div className="folder-menu-heading"><button className="folder-menu-back" aria-label="Previous menu" onClick={() => previous(depth)}>←</button></div>}
        {column.items.map(node => {
          const hasChildren = node.children?.length > 0 && depth + 1 < maxDepth
          const expanded = hasChildren && column.active?.id === node.id
          return <button role="menuitem" key={node.id} data-folder={node.id} aria-haspopup={hasChildren ? 'menu' : undefined} aria-expanded={hasChildren ? expanded : undefined} className={`folder-menu-item ${expanded ? 'selected' : ''}`} onPointerEnter={event => hoverBranch(event, depth, node)} onPointerLeave={() => clearTimeout(hoverTimer.current)} onClick={() => activate(depth, node)}><WorkspaceIcon name={depth === 0 ? 'categories' : 'entry'}/><span>{node.name}</span>{hasChildren && <span aria-hidden="true">›</span>}</button>
        })}
      </div>)}
      {!columns.length && <p role="status">ခွင့်ပြုထားသော ဌာန မရှိသေးပါ။</p>}
    </div>}
  </div>
}
