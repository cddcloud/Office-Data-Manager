import { useEffect, useState } from 'react'
import { api } from '../api.js'
import WorkspaceIcon from '../shared/WorkspaceIcon.jsx'
import './home.css'

const number = value => new Intl.NumberFormat('en').format(value)
const axisNumber = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const fileTypes = [{ key: 'excel', label: 'Excel Files', color: '#2bc38a' }, { key: 'pdf', label: 'PDF Files', color: '#fa5967' }, { key: 'jpg', label: 'JPG Files', color: '#9143eb' }]
const monthName = month => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const timestamp = value => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Rangoon' }).format(new Date(value))

function GrowthChart({ trend }) {
  const max = Math.max(4, Math.ceil(Math.max(...trend.map(row => row.total), 0) / 4) * 4)
  const points = trend.map((row, index) => ({ ...row, x: 76 + index * 126, y: 202 - row.total / max * 176 }))
  const line = points.map(point => `${point.x},${point.y}`).join(' ')
  return <div className="home-growth-chart"><svg viewBox="0 0 780 245" role="img" aria-label={`စုဆောင်းထားသော ဖိုင်များ: ${trend.map(row => `${monthName(row.month)} ${row.total}`).join(', ')}`}>
    <defs><linearGradient id="home-growth-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1787ef" stopOpacity=".3" /><stop offset="1" stopColor="#1787ef" stopOpacity=".02" /></linearGradient></defs>
    {Array.from({ length: 5 }, (_, index) => <g key={index}><line x1="76" x2="706" y1={26 + index * 44} y2={26 + index * 44} stroke="#e7eff8" /><text x="62" y={31 + index * 44} textAnchor="end">{axisNumber(max - index * max / 4)}</text></g>)}
    {points.map(point => <g key={point.month}><line x1={point.x} x2={point.x} y1="26" y2="202" stroke="#edf3fa" /><text x={point.x} y="231" textAnchor="middle">{monthName(point.month)}</text></g>)}
    <polygon points={`76,202 ${line} 706,202`} fill="url(#home-growth-fill)" /><polyline points={line} fill="none" stroke="#1688ee" strokeWidth="2.5" />
    {points.map(point => <circle key={point.month} cx={point.x} cy={point.y} r="4.5" fill="#1688ee" stroke="#fff" strokeWidth="1.5"><title>{monthName(point.month)}: {number(point.total)}</title></circle>)}
  </svg></div>
}

function FileDistribution({ counts }) {
  let end = 0
  const segments = fileTypes.map(type => {
    const start = end
    end += counts.total ? counts[type.key] / counts.total * 100 : 0
    return `${type.color} ${start}% ${end}%`
  })
  return <div className="home-distribution"><div className="home-donut" style={{ background: counts.total ? `conic-gradient(${segments.join(',')})` : '#e7eef8' }} role="img" aria-label={`Total Data ${counts.total}; ${fileTypes.map(type => `${type.label} ${counts[type.key]}`).join('; ')}`}><div><strong>{number(counts.total)}</strong><span>Total Data</span></div></div><div className="home-file-legend">{fileTypes.map(type => <div key={type.key}><i style={{ background: type.color }} /><p>{type.label}<strong>{number(counts[type.key])} <span>({counts.total ? (counts[type.key] / counts.total * 100).toFixed(1) : '0.0'}%)</span></strong></p></div>)}</div></div>
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    const timer = setInterval(refresh, 20000)
    window.addEventListener('office:content-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('office:content-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    let active = true
    api('/admin/home').then(value => { if (active) { setData(value); setError('') } }).catch(failure => { if (active) { setData(null); setError(failure.message) } })
    return () => { active = false }
  }, [revision])
  if (error) return <section className="home-page"><p className="home-error" role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>ပြန်စမ်းရန်</button></p></section>
  if (!data) return <section className="home-page" aria-busy="true"><p role="status">အချက်အလက်များ ရယူနေသည်…</p><div className="home-summary-grid">{['Total Data', 'Excel File', 'PDF File', 'JPG File'].map(label => <article className="home-stat" key={label}><span>{label}</span><strong>—</strong></article>)}</div></section>
  return <section className="home-page" aria-label="Home overview">
    <div className="home-summary-grid">{[['total', 'Total Data'], ['excel', 'Excel File'], ['pdf', 'PDF File'], ['jpg', 'JPG File']].map(([key, label]) => <article className="home-stat" key={key}><span>{label}</span><strong>{number(data.counts[key])}</strong></article>)}</div>
    <div className="home-charts"><article className="home-panel"><h2>ဒေတာတိုးတက်မှု အခြေအနေ</h2><p className="home-chart-note">လက်ရှိဖိုင်များ · တင်သွင်းချိန်အလိုက် စုစုပေါင်း</p><GrowthChart trend={data.trend} /></article><article className="home-panel"><h2>ဖိုင်အမျိုးအစားအလိုက် ခွဲဝေမှု</h2><FileDistribution counts={data.counts} /></article></div>
    <article className="home-panel home-activity"><h2><span className="home-clock"><WorkspaceIcon name="clock" /></span>နောက်ဆုံး လုပ်ဆောင်ချက်များ</h2><div className="home-table-wrap"><table><thead><tr>{['#', 'လုပ်ဆောင်ချက်', 'ဖိုင်အမည် / ဒေတာ', 'ဖိုင်အမျိုးအစား', 'နေရာ', 'လုပ်ဆောင်သူ', 'အချိန်'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.activity.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.action}</td><td className="home-file-name">{row.name}</td><td><span className={`home-type home-type-${row.type.toLowerCase()}`}><WorkspaceIcon name={row.type === 'Folder' ? 'categories' : 'file'} />{row.type}</span></td><td>{row.location || '—'}</td><td>{row.actor}</td><td><time dateTime={row.createdAt}>{timestamp(row.createdAt)}</time></td></tr>)}{!data.activity.length && <tr><td colSpan="7" className="home-empty">လုပ်ဆောင်ချက် မရှိသေးပါ။</td></tr>}</tbody></table></div></article>
  </section>
}
