import { useEffect, useState } from 'react'
import { api } from '../api.js'
import './accounts-access.css'

const roleLabels = { ADMIN: 'Admin', VIEWER: 'Viewer' }

export default function AccountLinkPage({ mode }) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [details, setDetails] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState({ loading: true, error: '', complete: false })
  const endpoint = mode === 'setup' ? '/auth/account/setup' : '/auth/account/reset'

  useEffect(() => {
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('token')
    window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
    api(`${endpoint}/validate`, { method: 'POST', body: JSON.stringify({ token }) })
      .then(data => { setDetails(data); setState({ loading: false, error: '', complete: false }) })
      .catch(error => setState({ loading: false, error: error.message, complete: false }))
  }, [endpoint, token])

  const submit = async event => {
    event.preventDefault()
    if (password.length < 12) return setState(value => ({ ...value, error: 'Password သည် အနည်းဆုံး 12 လုံး ရှိရမည်။' }))
    if (password !== confirm) return setState(value => ({ ...value, error: 'Password နှစ်ခု မတူပါ။' }))
    setState(value => ({ ...value, loading: true, error: '' }))
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify({ token, password }) })
      setState({ loading: false, error: '', complete: true })
    } catch (error) {
      setState({ loading: false, error: error.message, complete: false })
    }
  }

  return <main className="account-link-page"><section>
    <div className="account-link-mark">▣</div>
    <span>Government Data Management System</span>
    <h1>{mode === 'setup' ? 'Set Up Account' : 'Reset Account Login'}</h1>
    {state.loading && !details ? <p>Link ကို စစ်ဆေးနေသည်...</p> : state.error && !details ? <div className="accounts-alert">{state.error}</div> : state.complete ? <><div className="account-success">✓ {mode === 'setup' ? 'Account setup completed.' : 'Password reset completed.'}</div><button className="accounts-primary" onClick={() => { window.location.href = '/' }}>Continue to Login</button></> : <form onSubmit={submit}><div className="link-identity"><b>{details?.name}</b><small>Email: {details?.email}</small>{mode === 'setup' && <small>Access: {roleLabels[details?.role]} · {details?.clearance}</small>}</div>{state.error && <div className="accounts-alert">{state.error}</div>}<label>New Password<input type="password" required minLength="12" value={password} onChange={event => setPassword(event.target.value)} /></label><label>Confirm Password<input type="password" required minLength="12" value={confirm} onChange={event => setConfirm(event.target.value)} /></label><button className="accounts-primary" disabled={state.loading}>{state.loading ? 'Saving...' : mode === 'setup' ? 'Set Up Account' : 'Set New Password'}</button></form>}
  </section></main>
}
