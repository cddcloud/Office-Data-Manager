import { useDialogFocus } from '../shared/useDialogFocus.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, getUser } from '../api.js'
import { initials, isMainAdmin } from '../shared/access.js'
import '../shared/workflow.css'
import { accountAccessOptions, accountActionItems, accountMenuPosition, runAccountAction } from './accounts-utils.js'
import { copyText } from './copy-text.js'
import './accounts-access.css'
import './accounts-access-enhancements.css'

const roleLabels = Object.fromEntries(accountAccessOptions.map(item => [item.value, item.label]))
const emptyForm = { name: '', email: '', role: 'VIEWER', clearance: 'V4' }
const statusLabel = status => ({
  ACTIVE: 'Active',
  DISABLED: 'Deactivated',
  SETUP_REQUIRED: 'Setup Required',
  RESET_REQUIRED: 'Reset Required',
  EXPIRED: 'Expired',
})[status] || status

export default function AccountsAccess({ user = getUser() }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [changeAccess, setChangeAccess] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [linkResult, setLinkResult] = useState(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState(isMainAdmin(user) ? 'ADMIN' : 'VIEWER')
  const [levelFilter, setLevelFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setAccounts(await api('/admin/users'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial server data fetch synchronizes this page with the account store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  const summary = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter(row => row.status === 'ACTIVE').length,
    setup: accounts.filter(row => row.status === 'SETUP_REQUIRED').length,
    deactivated: accounts.filter(row => row.status === 'DISABLED').length,
  }), [accounts])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return accounts.filter(row => {
      const matchesSearch = !needle || `${row.name} ${row.email}`.toLowerCase().includes(needle)
      const matchesRole = row.role === roleFilter && (levelFilter === 'ALL' || row.clearance === levelFilter)
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [accounts, query, roleFilter, levelFilter, statusFilter])

  const perform = async action => {
    setError('')
    try {
      const data = await action()
      await load()
      return { ok: true, data }
    } catch (requestError) {
      setError(requestError.message)
      return { ok: false, data: null }
    }
  }

  const addAccount = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api('/admin/users/invitations', { method: 'POST', body: JSON.stringify(form) })
      setLinkResult({ title: 'Account Created', url: result.setupUrl, name: form.name, email: form.email, role: roleLabels[form.role], kind: 'setup' })
      setForm(emptyForm)
      setShowAdd(false)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const saveAccess = async event => {
    event.preventDefault()
    setSaving(true)
    const result = await perform(() => api(`/admin/users/${changeAccess.id}`, { method: 'PATCH', body: JSON.stringify({ clearance: changeAccess.nextClearance }) }))
    setSaving(false)
    if (result.ok) setChangeAccess(null)
  }

  const resetLogin = async row => {
    const result = await perform(() => api(`/admin/users/${row.id}/reset-login`, { method: 'POST' }))
    if (result.ok) setLinkResult({ title: 'Login Reset Required', url: result.data.resetUrl, kind: 'reset' })
  }

  const deactivate = async () => {
    if (!deactivateTarget) return
    setSaving(true)
    const result = await perform(() => api(`/admin/users/${deactivateTarget.id}/disable`, { method: 'POST' }))
    setSaving(false)
    if (result.ok) setDeactivateTarget(null)
  }

  const reactivate = row => perform(() => api(`/admin/users/${row.id}/enable`, { method: 'POST' }))

  return <section className="accounts-access">
    {error && <div className="accounts-alert">{error}</div>}

    <div className="account-summary-grid">
      <SummaryCard icon="◎" label="Total Users" value={summary.total} tone="blue" />
      <SummaryCard icon="✓" label="Active" value={summary.active} tone="green" />
      <SummaryCard icon="◷" label="Setup Required" value={summary.setup} tone="amber" />
      <SummaryCard icon="⊘" label="Deactivated" value={summary.deactivated} tone="slate" />
    </div>

    <div className="accounts-panel">
      <div className="workflow-root-tabs" aria-label="Account types">{isMainAdmin(user) && <button className={roleFilter === 'ADMIN' ? 'active' : ''} onClick={() => setRoleFilter('ADMIN')}>Admins</button>}<button className={roleFilter === 'VIEWER' ? 'active' : ''} onClick={() => setRoleFilter('VIEWER')}>Viewers</button></div>
      <div className="accounts-toolbar account-filter-toolbar">
        <label className="account-search">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users..." /></label>
        <div className="account-filters">
          <select aria-label="Filter by clearance" value={levelFilter} onChange={event => setLevelFilter(event.target.value)}><option value="ALL">All levels</option>{['V1','V2','V3','V4'].map(level => <option key={level}>{level}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="SETUP_REQUIRED">Setup Required</option><option value="DISABLED">Deactivated</option><option value="RESET_REQUIRED">Reset Required</option></select>
        </div>
        {isMainAdmin(user) && <button className="accounts-primary account-toolbar-add" onClick={() => { setForm({ ...emptyForm, role: 'ADMIN', clearance: 'V3' }); setShowAdd(true) }}>＋ Add Admin</button>}<button className="accounts-primary account-toolbar-add" onClick={() => { setForm(emptyForm); setShowAdd(true) }}>＋ Add Viewer</button>
      </div>
      {loading ? <div className="accounts-state">အချက်အလက် ရယူနေသည်...</div> : <div className="accounts-table-wrap"><table>
        <thead><tr><th>No</th><th>User</th><th>Account type</th><th>Clearance</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>{visible.map((row, index) => <tr key={`${row.kind}-${row.id}`}>
          <td className="account-number">{index + 1}</td>
          <td><div className="account-person"><span>{initials(row.name)}</span><div><b>{row.name}</b><small>{row.email}</small></div></div></td>
          <td><span className={`access-chip ${row.isPrimaryAdmin ? 'primary-admin' : row.role.toLowerCase()}`}>{row.isPrimaryAdmin ? 'Main Admin' : roleLabels[row.role]}</span></td>
          <td>{row.kind === 'USER' && !row.isPrimaryAdmin ? <button className="access-chip editable" onClick={() => setChangeAccess({ ...row, nextClearance: row.clearance })} aria-label={`Change clearance for ${row.name}`}>{row.clearance}</button> : <span className="workflow-chip">{row.isPrimaryAdmin ? 'V1–V4' : row.clearance}</span>}</td>
          <td><span className={`account-status ${row.status.toLowerCase()}`}>{statusLabel(row.status)}</span></td>
          <td>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : 'Never'}</td>
          <td>{row.kind==='INVITATION'&&<><button onClick={async()=>{const result=await perform(()=>api(`/admin/users/invitations/${row.id}/regenerate`,{method:'POST'}));if(result.ok)setLinkResult({title:'Setup link regenerated',url:result.data.setupUrl,kind:'setup',name:row.name,email:row.email,role:roleLabels[row.role]})}}>Regenerate link</button><button onClick={()=>perform(()=>api(`/admin/users/invitations/${row.id}/cancel`,{method:'POST'}))}>Cancel invitation</button></>}<AccountActions row={row} onReset={() => resetLogin(row)} onDeactivate={() => setDeactivateTarget(row)} onReactivate={() => reactivate(row)} /></td>
        </tr>)}</tbody>
      </table>{!visible.length && <div className="accounts-state">No users match these filters.</div>}</div>}
    </div>

    {showAdd && <AccountDialog title="Add Account" onClose={() => setShowAdd(false)} onSubmit={addAccount} saving={saving} submitLabel="Add Account">
      <label>Full Name<input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email Address<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <RoleOptions value={form.role} main={isMainAdmin(user)} onChange={role => setForm({ ...form, role, clearance: role === 'ADMIN' ? 'V3' : 'V4' })} />
      <label>Clearance<select value={form.clearance} onChange={event => setForm({ ...form, clearance: event.target.value })}>{(form.role === 'ADMIN' ? ['V1','V2','V3'] : ['V1','V2','V3','V4']).map(level => <option key={level}>{level}</option>)}</select></label>
    </AccountDialog>}

    {changeAccess && <AccountDialog title="Change Access" onClose={() => setChangeAccess(null)} onSubmit={saveAccess} saving={saving} submitLabel="Save Changes">
      <div className="current-access"><span>User</span><b>{changeAccess.name}</b></div>
      <p>Current: <b>{changeAccess.clearance}</b> → New: <b>{changeAccess.nextClearance}</b></p>
      <label>New clearance<select value={changeAccess.nextClearance} onChange={event => setChangeAccess({ ...changeAccess, nextClearance: event.target.value })}>{(changeAccess.role === 'ADMIN' ? ['V1','V2','V3'] : ['V1','V2','V3','V4']).map(level => <option key={level}>{level}</option>)}</select></label>
      <p>Access will cover {['V1','V2','V3','V4'].filter(level => level >= changeAccess.nextClearance).join(', ')}. Existing sessions will be revoked. Account type remains {roleLabels[changeAccess.role]}.</p>
    </AccountDialog>}

    {deactivateTarget && <ConfirmDeactivate user={deactivateTarget} busy={saving} onCancel={() => setDeactivateTarget(null)} onConfirm={deactivate} />}
    {linkResult && <LinkResult result={linkResult} onClose={() => setLinkResult(null)} />}
  </section>
}

function SummaryCard({ icon, label, value, tone }) {
  return <article className={`account-summary ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>
}

function RoleOptions({ value, onChange, main }) {
  return <fieldset className="role-options"><legend>Role</legend><div role="radiogroup" aria-label="Role">{accountAccessOptions.filter(item => main || item.value === 'VIEWER').map(item => <button type="button" role="radio" aria-checked={value === item.value} className={value === item.value ? 'selected' : ''} onClick={() => onChange(item.value)} key={item.value}><i />{item.label}</button>)}</div></fieldset>
}

function AccountActions({ row, onReset, onDeactivate, onReactivate }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const actions = accountActionItems(row)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return
    const buttonRect = buttonRef.current.getBoundingClientRect()
    const menuRect = menuRef.current.getBoundingClientRect()
    setPosition(accountMenuPosition({
      buttonRect,
      menuWidth: menuRect.width,
      menuHeight: menuRect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(false)
    const closeOutside = event => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      close()
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  if (row.isPrimaryAdmin) return <span className="no-actions">—</span>
  if (!actions.length) return <span className="no-actions">—</span>
  const run = action => runAccountAction(setOpen, action)
  const menu = open && typeof document !== 'undefined' && createPortal(
    <div
      ref={menuRef}
      className="account-action-menu-popup"
      role="menu"
      data-placement={position?.opensUpward ? 'top' : 'bottom'}
      style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      {actions[0] === 'Reactivate'
        ? <button role="menuitem" onClick={() => run(onReactivate)}>Reactivate</button>
        : <><button role="menuitem" onClick={() => run(onReset)}>Reset Login</button><hr /><button role="menuitem" className="danger" onClick={() => run(onDeactivate)}>Deactivate</button></>}
    </div>,
    document.body,
  )
  return <div className="account-action-menu">
    <button ref={buttonRef} className="account-kebab" aria-label={`Actions for ${row.name}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>⋮</button>
    {menu}
  </div>
}

function AccountDialog({ title, onClose, onSubmit, saving, submitLabel, children }) {
  const dialog = useDialogFocus(true, () => !saving && onClose())
  return <div className="account-modal" role="dialog" aria-modal="true" aria-label={title}><form ref={dialog} tabIndex={-1} onSubmit={onSubmit}><header><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>{children}<footer><button type="button" onClick={onClose}>Cancel</button><button className="accounts-primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button></footer></form></div>
}

function ConfirmDeactivate({ user, busy, onCancel, onConfirm }) {
  const dialog = useDialogFocus(true, () => !busy && onCancel())
  return <div className="account-modal" role="dialog" aria-modal="true"><div ref={dialog} tabIndex={-1} className="account-confirm"><header><h2>Deactivate this user?</h2><button type="button" aria-label="Close" onClick={onCancel}>×</button></header><p><b>{user.name}</b> will be signed out and cannot log in until this account is reactivated.</p><footer><button onClick={onCancel} disabled={busy}>Cancel</button><button className="danger-solid" onClick={onConfirm} disabled={busy}>{busy ? 'Deactivating...' : 'Deactivate'}</button></footer></div></div>
}

function LinkResult({ result, onClose }) {
  const dialog = useDialogFocus(true, onClose)
  const [copyState, setCopyState] = useState({ copied: false, error: '' })
  const copy = async () => {
    const copied = await copyText(result.url)
    setCopyState(copied ? { copied: true, error: '' } : { copied: false, error: 'Copy failed. Select the link and copy it manually.' })
  }
  const linkLabel = result.kind === 'reset' ? 'Reset Link' : 'Setup Link'
  return <div className="account-modal" role="dialog" aria-modal="true"><div ref={dialog} tabIndex={-1} className="link-result"><header><h2>{result.title}</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>{result.kind === 'setup' && <dl><div><dt>Name</dt><dd>{result.name}</dd></div><div><dt>Email</dt><dd>{result.email}</dd></div><div><dt>Role</dt><dd>{result.role}</dd></div></dl>}<label>{linkLabel}<input readOnly value={result.url} onFocus={event => event.currentTarget.select()} /></label>{copyState.error && <div className="copy-error" role="alert">{copyState.error}</div>}<footer><button onClick={onClose}>{result.kind === 'reset' ? 'Done' : 'Close'}</button><button className="accounts-primary" onClick={copy}>{copyState.copied ? 'Copied' : result.kind === 'reset' ? 'Copy Reset Link' : 'Copy Link'}</button></footer></div></div>
}
