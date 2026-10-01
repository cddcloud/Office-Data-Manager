import { useEffect, useMemo, useState } from 'react'
import { apiBlob, apiEnvelope } from '../api.js'
import { WidgetVisualization } from '../records/FilteredModules.jsx'
import { loadViewerItems, loadViewerOverview } from './viewer-data.js'
import './viewer-dashboard.css'
import { useDialogFocus } from '../shared/useDialogFocus.js'
import PdfPreview from '../shared/PdfPreview.jsx'

function flattenCategories(nodes, depth = 0) {
  return nodes.flatMap(node => [{ ...node, depth }, ...flattenCategories(node.children || [], depth + 1)])
}

function branchIds(node) {
  return node ? new Set([node.id, ...(node.children || []).flatMap(child => [...branchIds(child)])]) : null
}

export function DocumentPreview({ document, onClose }) {
  const dialog = useDialogFocus(true, onClose)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl = ''
    apiBlob(`/documents/${document.id}/download`).then(blob => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(failure => active && setError(failure.message))
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [document.id])
  return <div className="viewer-preview-backdrop" onClick={onClose}><section ref={dialog} tabIndex={-1} className="viewer-preview" role="dialog" aria-modal="true" aria-label={document.title} onClick={event => event.stopPropagation()}>
    <header><div><small>{document.mimeType === 'application/pdf' ? 'PDF' : 'JPG'}</small><h2>{document.title}</h2></div><button onClick={onClose} aria-label="Close document">×</button></header>
    {error ? <p className="viewer-error">{error}</p> : url ? document.mimeType === 'application/pdf' ? <PdfPreview title={document.title} url={url} /> : <img src={url} alt={document.title} /> : <p>Loading document…</p>}
  </section></div>
}

export default function ViewerDashboard({ user, onLogout }) {
  const [categories, setCategories] = useState([])
  const [collections, setCollections] = useState([])
  const [widgets, setWidgets] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [documents, setDocuments] = useState([])
  const [recordCursor, setRecordCursor] = useState(null)
  const [documentCursor, setDocumentCursor] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const categoryRows = useMemo(() => flattenCategories(categories), [categories])
  const selectedCategory = categoryRows.find(item => item.id === categoryId)
  const selectedCollection = collections.find(item => item.id === collectionId)
  const selectedBranch = branchIds(selectedCategory)
  const visibleWidgets = widgets.filter(item => !collectionId || item.widget.dataCollectionId === collectionId).filter(item => !selectedBranch || selectedBranch.has(item.widget.dataCollection?.categoryId))

  useEffect(() => {
    let active = true
    loadViewerOverview().then(([tree, dataCollections, dashboard]) => {
      if (!active) return
      setCategories(tree)
      setCollections(dataCollections)
      setWidgets(dashboard)
    }).catch(failure => active && setError(failure.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    loadViewerItems({ categoryId, collectionId, search }).then(([recordPage, documentPage]) => {
      if (!active) return
      setRecords(recordPage.data)
      setDocuments(documentPage.data)
      setRecordCursor(recordPage.meta?.nextCursor || null)
      setDocumentCursor(documentPage.meta?.nextCursor || null)
    }).catch(failure => active && setError(failure.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [categoryId, collectionId, search])

  async function loadMore(kind) {
    const cursor = kind === 'records' ? recordCursor : documentCursor
    if (!cursor) return
    const params = new URLSearchParams({ limit: '50', cursor })
    if (categoryId) params.set('categoryId', categoryId)
    if (search) params.set('search', search)
    if (kind === 'records' && collectionId) params.set('dataCollectionId', collectionId)
    try {
      const page = await apiEnvelope(`/${kind === 'records' ? 'data' : 'documents'}?${params}`)
      if (kind === 'records') { setRecords(current => [...current, ...page.data]); setRecordCursor(page.meta?.nextCursor || null) }
      else { setDocuments(current => [...current, ...page.data]); setDocumentCursor(page.meta?.nextCursor || null) }
    } catch (failure) { setError(failure.message) }
  }

  return <div className="dashboard exact-presentation viewer-dashboard">
    <header className="exact-header viewer-header"><div><span>အစိုးရအဖွဲ့</span><h1>အစည်းအဝေးတင်ပြမှု Dashboard</h1><p>ခွင့်ပြုထားသော အချက်အလက်များ</p></div><div className="viewer-session-badge"><span><b>{user.name}</b><small>{user.role === 'VIP_VIEWER' ? 'VIP Viewer' : 'Normal Viewer'}</small></span><button onClick={onLogout}>Sign out</button></div></header>
    <main className="viewer-content">
      <div className="viewer-intro"><div><h2>{selectedCategory?.name || selectedCollection?.name || 'အချက်အလက်များ'}</h2><p>သင်ကြည့်ရှုခွင့်ရှိသော သိမ်းဆည်းထားသည့် ဒေတာနှင့် စာရွက်စာတမ်းများ</p></div><form onSubmit={event => { event.preventDefault(); setSearch(draftSearch.trim()) }}><input aria-label="Search visible data" placeholder="အချက်အလက်ရှာရန်…" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} /><button type="submit">ရှာဖွေရန်</button></form></div>
      {error && <p className="viewer-error" role="alert">{error}</p>}
      <div className="viewer-layout"><aside className="viewer-navigation"><h3>အမျိုးအစားများ</h3><button className={!categoryId ? 'active' : ''} onClick={() => { setCategoryId(''); setCollectionId('') }}>အားလုံး</button>{categoryRows.map(item => <button key={item.id} className={categoryId === item.id ? 'active' : ''} style={{ paddingLeft: 14 + item.depth * 18 }} onClick={() => { setCategoryId(item.id); setCollectionId('') }}>{item.name}<span>{item.dataCount + item.documentCount}</span></button>)}<h3>ဒေတာအစုများ</h3>{collections.filter(item => !selectedBranch || selectedBranch.has(item.categoryId)).map(item => <button key={item.id} className={collectionId === item.id ? 'active' : ''} onClick={() => setCollectionId(current => current === item.id ? '' : item.id)}>{item.name}<span>{item._count?.records || 0}</span></button>)}</aside>
      <div className="viewer-results">
        {loading && <p className="viewer-state">အချက်အလက်များ ဖွင့်နေသည်…</p>}
        {visibleWidgets.length > 0 && <section><h3>Dashboard</h3><div className="viewer-widget-grid">{visibleWidgets.map(({ widget, data }) => <article className="viewer-card" key={widget.id}><small>{widget.chartType} · {widget.aggregation}</small><h4>{widget.title}</h4><WidgetVisualization widget={widget} data={data} /></article>)}</div></section>}
        <section><h3>ဒေတာမှတ်တမ်းများ <span>{records.length}</span></h3><div className="viewer-item-grid">{records.map(record => <button className="viewer-card viewer-item" key={record.id} onClick={() => setSelectedRecord(record)}><small>{record.dataCollection?.name}</small><strong>{record.title}</strong><span>{record.category?.name}</span></button>)}</div>{!loading && !records.length && <p className="viewer-state">ကြည့်ရှုနိုင်သော မှတ်တမ်း မရှိသေးပါ။</p>}{recordCursor && <button className="viewer-more" onClick={() => loadMore('records')}>နောက်ထပ်ကြည့်ရန်</button>}</section>
        <section><h3>စာရွက်စာတမ်းများ <span>{documents.length}</span></h3><div className="viewer-item-grid">{documents.map(document => <button className="viewer-card viewer-item" key={document.id} onClick={() => setSelectedDocument(document)}><small>{document.mimeType === 'application/pdf' ? 'PDF' : 'JPG'}</small><strong>{document.title}</strong><span>{document.fileName}</span></button>)}</div>{!loading && !documents.length && <p className="viewer-state">ကြည့်ရှုနိုင်သော စာရွက်စာတမ်း မရှိသေးပါ။</p>}{documentCursor && <button className="viewer-more" onClick={() => loadMore('documents')}>နောက်ထပ်ကြည့်ရန်</button>}</section>
      </div></div>
    </main>
    {selectedRecord && <div className="viewer-preview-backdrop" onClick={() => setSelectedRecord(null)}><section className="viewer-preview viewer-record-preview" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}><header><div><small>{selectedRecord.dataCollection?.name}</small><h2>{selectedRecord.title}</h2></div><button onClick={() => setSelectedRecord(null)} aria-label="Close record">×</button></header><dl>{Object.entries(selectedRecord.payload || {}).map(([key, value]) => <div key={key}><dt>{selectedCollection?.fields?.find(field => field.key === key)?.label || key}</dt><dd>{String(value ?? '—')}</dd></div>)}</dl></section></div>}
    {selectedDocument && <DocumentPreview document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
  </div>
}
