import { useDialogFocus } from '../shared/useDialogFocus.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, getUser } from '../api.js'
import { initials, isMainAdmin } from '../shared/access.js'
import '../shared/workflow.css'
import { accountAccessOptions, accountActionItems, accountMenuPosition, runAccountAction } from './accounts-utils.js'
import { copyText } from './copy-text.js'
import WorkspaceIcon from '../shared/WorkspaceIcon.jsx'
import './accounts-access.css'
import './accounts-access-enhancements.css'
import './accounts-reference.css'

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
      setAccounts([])
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
    inactive: accounts.filter(row => row.status === 'RESET_REQUIRED').length,
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

  return <section className="accounts-access accounts-reference">
    {error && !showAdd && !changeAccess && <div className="accounts-alert" role="alert">{error}</div>}

    <div className="account-summary-grid">
      <SummaryCard label="Total Users" value={loading ? '—' : summary.total} />
      <SummaryCard label="Active" value={loading ? '—' : summary.active} />
      <SummaryCard label="Inactive" value={loading ? '—' : summary.inactive} />
      <SummaryCard label="Deactivated" value={loading ? '—' : summary.deactivated} />
    </div>

      <div className="workflow-root-tabs" aria-label="Account types">{isMainAdmin(user) && <button className={roleFilter === 'ADMIN' ? 'active' : ''} onClick={() => setRoleFilter('ADMIN')}>Admins</button>}<button className={roleFilter === 'VIEWER' ? 'active' : ''} onClick={() => setRoleFilter('VIEWER')}>Viewers</button></div>
    <div className="accounts-panel">
      <div className="accounts-toolbar account-filter-toolbar">
        <label className="account-search"><WorkspaceIcon name="search"/><input aria-label="Search users" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users..." /></label>
        <div className="account-filters">
          <select aria-label="Filter by level" value={levelFilter} onChange={event => setLevelFilter(event.target.value)}><option value="ALL">All levels</option>{['V1','V2','V3','V4'].map(level => <option key={level}>{level}</option>)}</select>
          <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="SETUP_REQUIRED">Setup Required</option><option value="DISABLED">Deactivated</option><option value="RESET_REQUIRED">Reset Required</option><option value="EXPIRED">Expired</option></select>
        </div>
        <button className="accounts-primary account-toolbar-add" onClick={() => { setError(''); setForm(isMainAdmin(user) && roleFilter === 'ADMIN' ? { ...emptyForm, role: 'ADMIN', clearance: 'V3' } : emptyForm); setShowAdd(true) }}><WorkspaceIcon name="add"/><span>Add</span></button>
      </div>
      {loading ? <div className="accounts-state">အချက်အလက် ရယူနေသည်...</div> : <div className="accounts-table-wrap"><table>
        <thead><tr><th>No</th><th>User</th><th>Account type</th><th>Level</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>{visible.map((row, index) => <tr key={`${row.kind}-${row.id}`}>
          <td className="account-number">{index + 1}</td>
          <td><div className="account-person"><span className={`account-avatar tone-${index % 5}`}>{initials(row.name || '') || '-'}</span><div><b>{row.name || '-'}</b><small>{row.email || '-'}</small></div></div></td>
          <td>{row.isPrimaryAdmin || roleLabels[row.role] ? <span className={`access-chip ${row.isPrimaryAdmin ? 'primary-admin' : row.role.toLowerCase()}`}>{row.isPrimaryAdmin ? 'Main Admin' : roleLabels[row.role]}</span> : '-'}</td>
          <td>{!row.isPrimaryAdmin && !row.clearance ? '-' : row.kind === 'USER' && !row.isPrimaryAdmin ? <button className="access-chip editable" onClick={() => setChangeAccess({ ...row, nextClearance: row.clearance })} aria-label={`Change level for ${row.name}`}>{row.clearance}</button> : <span className="workflow-chip">{row.isPrimaryAdmin ? 'V1–V4' : row.clearance}</span>}</td>
          <td>{row.status ? <span className={`account-status ${row.status.toLowerCase()}`}>{statusLabel(row.status)}</span> : '-'}</td>
          <td>{row.lastLoginAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Rangoon' }).format(new Date(row.lastLoginAt)) : '-'}</td>
          <td><AccountActions row={row} onReset={() => resetLogin(row)} onDeactivate={() => setDeactivateTarget(row)}/></td>
        </tr>)}</tbody>
      </table>{!visible.length && <div className="accounts-state">No users match these filters.</div>}</div>}
    </div>

    {showAdd && <AccountDialog title="Add Account" error={error} onClose={() => setShowAdd(false)} onSubmit={addAccount} saving={saving} submitLabel="Add">
      <div className="account-name-fields"><label>Full Name<input data-dialog-autofocus autoComplete="name" required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>Email Address<input autoComplete="email" required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label></div>
      <RoleOptions value={form.role} main={isMainAdmin(user)} onChange={role => setForm({ ...form, role, clearance: role === 'ADMIN' ? 'V3' : 'V4' })} />
      <label>Level<select value={form.clearance} onChange={event => setForm({ ...form, clearance: event.target.value })}>{(form.role === 'ADMIN' ? ['V1','V2','V3'] : ['V1','V2','V3','V4']).map(level => <option key={level}>{level}</option>)}</select></label>
    </AccountDialog>}

    {changeAccess && <AccountDialog title="Change Access" error={error} onClose={() => setChangeAccess(null)} onSubmit={saveAccess} saving={saving} submitLabel="Save Changes">
      <div className="current-access"><span>User</span><b>{changeAccess.name}</b></div>
      <p>Current: <b>{changeAccess.clearance}</b> → New: <b>{changeAccess.nextClearance}</b></p>
      <label>New level<select value={changeAccess.nextClearance} onChange={event => setChangeAccess({ ...changeAccess, nextClearance: event.target.value })}>{(changeAccess.role === 'ADMIN' ? ['V1','V2','V3'] : ['V1','V2','V3','V4']).map(level => <option key={level}>{level}</option>)}</select></label>
      <p>Access will cover {['V1','V2','V3','V4'].filter(level => level >= changeAccess.nextClearance).join(', ')}. Existing sessions will be revoked. Account type remains {roleLabels[changeAccess.role]}.</p>
    </AccountDialog>}

    {deactivateTarget && <ConfirmDeactivate user={deactivateTarget} busy={saving} onCancel={() => setDeactivateTarget(null)} onConfirm={deactivate} />}
    {linkResult && <LinkResult result={linkResult} onClose={() => setLinkResult(null)} />}
  </section>
}

function SummaryCard({ label, value }) {
  return <article className="account-summary"><div><small>{label}</small><strong>{value}</strong></div></article>
}

function RoleOptions({ value, onChange, main }) {
  const options = accountAccessOptions.filter(item => main || item.value === 'VIEWER')
  return <fieldset className={`role-options${main ? '' : ' viewer-only'}`}><legend>Account type</legend><div role="radiogroup" aria-label="Account type">{options.map((item, index) => <button type="button" role="radio" aria-label={item.label} aria-checked={value === item.value} tabIndex={value === item.value ? 0 : -1} className={value === item.value ? 'selected' : ''} onClick={() => onChange(item.value)} onKeyDown={event => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); const next = (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + options.length) % options.length; onChange(options[next].value); event.currentTarget.parentElement.querySelectorAll('button')[next].focus() }} key={item.value}><WorkspaceIcon name={item.value === 'ADMIN' ? 'categories' : 'accounts'}/><strong>{item.label}</strong></button>)}</div></fieldset>
}

function AccountActions({ row, onReset, onDeactivate }) {
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

  useLayoutEffect(() => {
    if (open && position) (menuRef.current?.querySelector('button:not(:disabled)') || menuRef.current)?.focus()
  }, [open, position])

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
  const canAct = actions.length > 0
  const unavailable = row.isPrimaryAdmin ? 'Main Admin account ကို ဤနေရာမှ ပြောင်းလဲ၍ မရပါ။' : row.kind === 'INVITATION' ? 'အကောင့်စတင်အသုံးပြုခြင်း မပြီးသေးပါ။' : 'အကောင့်ပိတ်ထားပြီးဖြစ်သည်။'
  const run = action => runAccountAction(setOpen, () => { buttonRef.current?.focus(); return action() })
  const menu = open && typeof document !== 'undefined' && createPortal(
    <div
      ref={menuRef}
      className="account-action-menu-popup"
      role="menu"
      aria-label={`Account actions for ${row.name || '-'}`}
      tabIndex={-1}
      data-placement={position?.opensUpward ? 'top' : 'bottom'}
      style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); buttonRef.current?.focus() } if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement); if (buttons.length) buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() } }}
    >
      <button role="menuitem" disabled={!canAct} title={canAct ? undefined : unavailable} onClick={() => run(onReset)}>Reset Login</button><hr /><button role="menuitem" className="danger" disabled={!canAct} title={canAct ? undefined : unavailable} onClick={() => run(onDeactivate)}>Deactivate</button>
    </div>,
    document.body,
  )
  return <div className="account-action-menu">
    <button ref={buttonRef} className="account-kebab" aria-label={`Actions for ${row.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><WorkspaceIcon name="dots"/></button>
    {menu}
  </div>
}

function AccountDialog({ title, description = '', error = '', onClose, onSubmit, saving, submitLabel, children }) {
  const dialog = useDialogFocus(true, () => !saving && onClose())
  return <div className="account-modal" role="dialog" aria-modal="true" aria-label={title}><form ref={dialog} tabIndex={-1} onSubmit={onSubmit}><header><div><span className="account-dialog-icon"><WorkspaceIcon name="accounts"/></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div><button type="button" disabled={saving} aria-label="Close" onClick={onClose}><WorkspaceIcon name="close"/></button></header><fieldset disabled={saving} className="account-dialog-fields">{children}</fieldset>{error && <p className="accounts-alert" role="alert">{error}</p>}<footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="accounts-primary" disabled={saving}>{saving ? 'Saving...' : submitLabel}</button></footer></form></div>
}

function ConfirmDeactivate({ user, busy, onCancel, onConfirm }) {
  const dialog = useDialogFocus(true, () => !busy && onCancel())
  return <div className="account-modal" role="dialog" aria-modal="true" aria-label="Deactivate this user?"><div ref={dialog} tabIndex={-1} className="account-confirm"><header><h2>Deactivate this user?</h2><button type="button" disabled={busy} aria-label="Close" onClick={onCancel}><WorkspaceIcon name="close"/></button></header><p><b>{user.name}</b> will be signed out and cannot log in until this account is reactivated.</p><footer><button onClick={onCancel} disabled={busy}>Cancel</button><button className="danger-solid" onClick={onConfirm} disabled={busy}>{busy ? 'Deactivating...' : 'Deactivate'}</button></footer></div></div>
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
