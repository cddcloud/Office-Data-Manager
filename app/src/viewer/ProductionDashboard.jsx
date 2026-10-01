import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, apiBlob, apiEnvelope } from '../api.js'
import { WidgetVisualization } from '../records/FilteredModules.jsx'
import WorkflowHeader from '../shared/WorkflowHeader.jsx'
import { accessibleLevels } from '../shared/access.js'
import { DocumentPreview } from './ViewerDashboard.jsx'
import { useDialogFocus } from '../shared/useDialogFocus.js'
import '../shared/workflow.css'

const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])])

export default function ProductionDashboard({ user, onLogout, onBack, embedded = false, target = null }) {
  const [tree, setTree] = useState([])
  const [collections, setCollections] = useState([])
  const [widgets, setWidgets] = useState([])
  const [folderId, setFolderId] = useState(() => new URLSearchParams(window.location.search).get('folder') || '')
  const [collectionId, setCollectionId] = useState('')
  const [level, setLevel] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState({ data: [], meta: {} })
  const [documents, setDocuments] = useState({ data: [], meta: {} })
  const [record, setRecord] = useState(null)
  const [document, setDocument] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const recordDialog = useDialogFocus(Boolean(record), () => setRecord(null))
  const nodes = useMemo(() => flatten(tree), [tree])
  const folder = nodes.find(node => node.id === folderId)
  const collection = collections.find(item => item.id === collectionId)
  let root = folder
  const ancestors = []
  const visited = new Set()
  while (root && !visited.has(root.id)) { visited.add(root.id); ancestors.unshift(root); if (!root.parentId) break; root = nodes.find(node => node.id === root.parentId) }
  const branch = new Set(flatten(folder ? [folder] : tree).map(node => node.id))
  const refresh = useCallback(() => { setRevision(value => value + 1) }, [])
  useEffect(() => {
    let active = true
    if (record?.id) api(`/data/${record.id}`).then(value => active && setRecord(value)).catch(() => active && setRecord(null))
    if (document?.id) api(`/documents/${document.id}`).then(value => active && setDocument(value)).catch(() => active && setDocument(null))
    return () => { active = false }
  }, [revision, record?.id, document?.id])
  useEffect(() => {
    window.addEventListener('office:content-changed', refresh)
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 20000)
    return () => { clearInterval(timer); window.removeEventListener('office:content-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [refresh])
  useEffect(() => {
    let active = true
    setBusy(true); setError(''); setRecords({ data: [], meta: {} }); setDocuments({ data: [], meta: {} })
    const params = new URLSearchParams({ limit: '50' })
    if (folderId) params.set('categoryId', folderId)
    if (level) params.set('accessLevel', level)
    if (search) params.set('search', search)
    const recordParams = new URLSearchParams(params)
    if (collectionId) recordParams.set('dataCollectionId', collectionId)
    Promise.all([api('/categories'), api('/data/collections'), api(`/dashboard${level ? `?accessLevel=${level}` : ''}`), apiEnvelope(`/data?${recordParams}`), apiEnvelope(`/documents?${params}`)]).then(([roots, sets, charts, rows, files]) => {
      if (!active) return
      setTree(roots); setCollections(sets); setWidgets(charts); setRecords(rows); setDocuments(files)
    }).catch(failure => { if (active) { setError(failure.message); setTree([]); setCollections([]); setWidgets([]) } }).finally(() => active && setBusy(false))
    return () => { active = false }
  }, [folderId, collectionId, level, search, revision])
  async function openRecord(id) {
    try { setRecord(await api(`/data/${id}`)) } catch (failure) { setError(failure.message) }
  }
  async function openDocument(id) {
    try { setDocument(await api(`/documents/${id}`)) } catch (failure) { setError(failure.message) }
  }
  async function openTarget(notice) {
    setFolderId(notice.categoryId); setCollectionId(notice.collectionId || '')
    if (notice.documentId) await openDocument(notice.documentId)
  }
  useEffect(() => { if (target) void openTarget(target) }, [target])
  async function more(kind) {
    const page = kind === 'data' ? records : documents
    if (!page.meta.nextCursor || busy) return
    setBusy(true)
    const params = new URLSearchParams({ limit: '50', cursor: page.meta.nextCursor })
    if (folderId) params.set('categoryId', folderId)
    if (level) params.set('accessLevel', level)
    if (search) params.set('search', search)
    if (kind === 'data' && collectionId) params.set('dataCollectionId', collectionId)
    try { const next = await apiEnvelope(`/${kind}?${params}`); const setter = kind === 'data' ? setRecords : setDocuments; setter(current => ({ data: [...current.data, ...next.data], meta: next.meta })) }
    catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function download(path, filename) {
    try { const blob = await apiBlob(path); const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
    catch (failure) { setError(failure.message) }
  }
  const charts = widgets.filter(item => (!collectionId || item.widget.dataCollectionId === collectionId) && branch.has(item.widget.dataCollection.categoryId))
  function goBack() {
    if (collectionId) setCollectionId('')
    else if (folderId) { setFolderId(folder?.parentId || ''); setSearch(''); setDraft('') }
    else if (search) { setSearch(''); setDraft('') }
    else onBack?.()
  }
  return <main className="workflow-dashboard central-data-dashboard">
    <header className="central-data-banner">
      <span className="central-data-emblem"><img src="/branding/state-emblem.png" alt="ပြည်ထောင်စုသမ္မတမြန်မာနိုင်ငံတော် အမှတ်တံဆိပ်" /></span>
      <div className="central-data-heading"><h1>ဗဟိုအချက်အလက်စုဆောင်းထိန်းသိမ်းရေးဌာနကြီး</h1><p>Central Data Dep</p></div>
      <span className="central-data-logo"><img src="/branding/central-data-dep.png" alt="ဗဟိုအချက်အလက်စုဆောင်းထိန်းသိမ်းရေးဌာနကြီး" /></span>
    </header>
    <div className="central-data-utilities"><div className="central-data-account-row">{!embedded && <WorkflowHeader dashboard user={user} onLogout={onLogout} onTarget={openTarget} onBack={goBack} backDisabled={!onBack && !folderId && !collectionId && !search} searchControl={<form className="central-data-search" onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); setFolderId(''); setCollectionId('') }}><input aria-label="အမည်ဖြင့်ရှာဖွေရန်" value={draft} onChange={event => setDraft(event.target.value)} placeholder="အမည်ဖြင့်ရှာဖွေရန်..." /><button aria-label="ရှာဖွေရန်" title="ရှာဖွေရန်"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg></button></form>} />}</div></div>
    <nav className="workflow-root-tabs" aria-label="Main folders">{tree.filter(node => node.mainSlot).map(node => <button key={node.id} className={root?.id === node.id ? 'active' : ''} onClick={() => { setFolderId(node.id); setCollectionId('') }}>{node.mainSlot === 1 && node.name === 'မဟာဗျူဟာနှင့် မူဝါဒ' ? <>မဟာဗျူဟာနှင့်<br />မူဝါဒ</> : node.mainSlot === 4 && node.name === 'ဝန်ကြီးဌာနများ ကော်မတီ၊ကော်မရှင်များ' ? <>ဝန်ကြီးဌာနများ<small>ကော်မတီ၊ကော်မရှင်များ</small></> : node.name}</button>)}</nav>
    {error && <p className="workflow-error" role="alert">{error} <button onClick={refresh}>Retry</button></p>}
    {!busy && !tree.length && !error && <p>ခွင့်ပြုထားသော Folder မရှိသေးပါ။ Migration mapping ကို စစ်ဆေးပါ။</p>}
    {!folderId && !search && <div className="central-data-sections">{[['အစည်းအဝေးများ', 'အစည်းအဝေး'], ['အထွေထွေ(SCPRU မှ )', 'အထွေထွေ']].map(([label, keyword]) => <section key={keyword} className="central-data-section"><button className="central-data-section-title" onClick={() => { const match = nodes.find(node => node.parentId && node.name.includes(keyword)); if (match) { setFolderId(match.id); setCollectionId('') } else { setDraft(keyword); setSearch(keyword) } }}>{label}</button></section>)}</div>}
    {!folderId && !search && busy && <p role="status">အချက်အလက် ရယူနေသည်…</p>}
    {(folderId || search) && <div className="workflow-dashboard-layout"><aside><h3>Folder များ</h3>{flatten(root ? [root] : tree).map(node => <button key={node.id} className={folderId === node.id ? 'active' : ''} onClick={() => { setFolderId(node.id); setCollectionId('') }}>{node.name}</button>)}<h3>Structured Data</h3>{collections.filter(item => branch.has(item.categoryId)).map(item => <button key={item.id} className={collectionId === item.id ? 'active' : ''} onClick={() => setCollectionId(current => current === item.id ? '' : item.id)}>{item.name}<small> · {item._count?.records || 0} authorized records</small></button>)}</aside>
    <section className="workflow-panel"><nav className="workflow-toolbar" aria-label="Breadcrumbs"><button onClick={() => { setFolderId(''); setCollectionId(''); setSearch(''); setDraft('') }}>ပင်မစာမျက်နှာ</button>{ancestors.map(node => <button key={node.id} onClick={() => { setFolderId(node.id); setCollectionId('') }}>{node.name} ›</button>)}</nav>
      <form className="workflow-toolbar" onSubmit={event => { event.preventDefault(); setSearch(draft.trim()) }}><label>Search<input value={draft} onChange={event => setDraft(event.target.value)} placeholder="အချက်အလက် ရှာရန်…" /></label><button>ရှာဖွေရန်</button><label>Content level<select value={level} onChange={event => setLevel(event.target.value)}><option value="">All permitted levels</option>{accessibleLevels(user).map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={refresh}>Refresh</button>{collection && <button type="button" onClick={() => download(`/reports/export?dataCollectionId=${collectionId}&format=xlsx${level ? `&accessLevel=${level}` : ''}`, `filtered-${collection.name}.xlsx`)}>Filtered Excel export</button>}</form>
      {busy && <p role="status">အချက်အလက် ရယူနေသည်…</p>}
      {charts.length > 0 && <div className="workflow-card-grid">{charts.map(item => <article className="workflow-card" key={item.widget.id}><small>{item.widget.aggregation} · authorized data</small><h3>{item.widget.title}</h3><WidgetVisualization widget={item.widget} data={item.data} /></article>)}</div>}
      <h3>{collection?.name || 'Data records'} <small>{records.meta.total ?? 0} authorized matches · {records.data.length} loaded</small></h3>
      {collection ? <div className="workflow-table"><table><thead><tr><th>Title</th>{collection.fields.map(field => <th key={field.id}>{field.label}</th>)}<th>Level</th></tr></thead><tbody>{records.data.map(row => <tr key={row.id}><td><button onClick={() => openRecord(row.id)}>{row.title}</button></td>{collection.fields.map(field => <td key={field.id}>{String(row.payload[field.key] ?? '—')}</td>)}<td>{row.accessLevel}</td></tr>)}</tbody></table></div> : <div className="workflow-card-grid">{records.data.map(row => <button className="workflow-card" key={row.id} onClick={() => openRecord(row.id)}><small>{row.dataCollection?.name} · {row.accessLevel}</small><h3>{row.title}</h3></button>)}</div>}
      {!busy && !records.data.length && <p>မှတ်တမ်း မရှိသေးပါ။</p>}{records.meta.nextCursor && <button disabled={busy} onClick={() => more('data')}>Load more records</button>}
      <h3>PDF / JPG <small>{documents.meta.total ?? 0} authorized matches · {documents.data.length} loaded</small></h3><div className="workflow-card-grid">{documents.data.map(file => <article className="workflow-card" key={file.id}><small>{file.mimeType === 'application/pdf' ? 'PDF' : 'JPG'} · {file.accessLevel}</small><h3>{file.title}</h3><button onClick={() => openDocument(file.id)}>Preview</button> <button onClick={() => download(`/documents/${file.id}/download`, file.fileName)}>Download</button></article>)}</div>
      {!busy && !documents.data.length && <p>ဖိုင် မရှိသေးပါ။</p>}{documents.meta.nextCursor && <button disabled={busy} onClick={() => more('documents')}>Load more files</button>}
    </section></div>}
    {document && <DocumentPreview document={document} onClose={() => setDocument(null)} />}
    {record && <div className="viewer-preview-backdrop" onClick={() => setRecord(null)}><section ref={recordDialog} tabIndex={-1} className="viewer-preview" role="dialog" aria-modal="true" aria-label={record.title} onClick={event => event.stopPropagation()}><header><h2>{record.title}</h2><button aria-label="Close record" onClick={() => setRecord(null)}>×</button></header><dl>{record.dataCollection.fields.map(field => <div key={field.id}><dt>{field.label}</dt><dd>{String(record.payload[field.key] ?? '—')}</dd></div>)}</dl>{record.sourceImportId && <button onClick={() => download(`/sources/${record.sourceImportId}/download`, 'original-source.xlsx')}>Download original workbook (whole-workbook clearance required)</button>}</section></div>}
  </main>
}
