import { useDialogFocus } from '../shared/useDialogFocus.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddRounded from '@mui/icons-material/AddRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined'
import DashboardCustomizeOutlined from '@mui/icons-material/DashboardCustomizeOutlined'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import HomeRounded from '@mui/icons-material/HomeRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import NavigateNextRounded from '@mui/icons-material/NavigateNextRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import StorageRounded from '@mui/icons-material/StorageRounded'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { inputLevels, isContentAdmin } from '../shared/access.js'
import '../shared/workflow.css'
import { api, apiEnvelope } from '../api.js'
import { useCategoryTree } from '../categories/category-queries.js'
import { SemanticFileIcon } from '../shared/SemanticFileIcon.jsx'
import { archiveDashboardWidget, archiveRecordRequest, clearCollectionContext, createRecordRequest, dataCollectionDetailsRequest, fieldInputType, filterFolderTree, generateRecordTitle, handleCollectionEnter, loadCollectionDashboard, previewDashboardWidget, recordQueryParams, reorderDashboardWidgets, saveDashboardWidget, topSeriesWithOthers, updateRecordRequest, widgetFieldChoices, widgetFormError, widgetRequestBody } from './data-workspace-utils.js'
import './filtered-modules.css'
import './data-workspace.css'
import './data-dashboard.css'

const admin = () => isContentAdmin(JSON.parse(sessionStorage.getItem('office_user') || '{}'))
const formatDate = value => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'

export function FolderTree({ nodes, selectedId, expanded, onToggle, onSelect, depth = 0 }) {
  return nodes.map(node => {
    const open = expanded.has(node.id)
    const children = node.children || []
    return <div className="data-tree-branch" key={node.id}>
      <div className={`data-tree-row ${selectedId === node.id ? 'selected' : ''}`} style={{ '--depth': depth }}>
        <button className="data-tree-toggle" onClick={() => children.length && onToggle(node.id)} disabled={!children.length}>{children.length && (open ? <ExpandMoreRounded /> : <ChevronRightRounded />)}</button>
        <button className="data-tree-name" onClick={() => onSelect(node)}><SemanticFileIcon type="FOLDER" open={open} /><span>{node.name}</span></button>
      </div>
      {open && children.length > 0 && <FolderTree nodes={children} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} depth={depth + 1} />}
    </div>
  })
}

function Modal({ title, eyebrow, children, actions, onClose, wide = false }) {
  const dialog = useDialogFocus(true, onClose)
  return <div className="data-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section ref={dialog} tabIndex={-1} className={`data-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div>{eyebrow && <small>{eyebrow}</small>}<h2>{title}</h2></div><button onClick={onClose}><CloseRounded /></button></header><div className="data-modal-body">{children}</div>{actions && <footer>{actions}</footer>}</section></div>
}

export function DynamicField({ field, value, onChange, disabled = false }) {
  const common = { id: `field-${field.id}`, disabled, required: field.required }
  if (field.type === 'BOOLEAN') return <label className="data-switch"><input {...common} type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span />{field.label}{field.required && <em>*</em>}</label>
  if (field.type === 'ENUM') return <label>{field.label}{field.required && <em>*</em>}<select {...common} value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">ရွေးချယ်ပါ</option>{(field.options || []).map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select></label>
  return <label>{field.label}{field.required && <em>*</em>}<input {...common} type={fieldInputType(field.type)} value={field.type === 'DATE' && value ? String(value).slice(0, 10) : value ?? ''} onChange={event => onChange(event.target.value)} /></label>
}

export function RecordDialog({ tree, initialCategory, initialCollection, record, onClose, onSaved, refreshTree }) {
  const editing = Boolean(record)
  const [step, setStep] = useState(editing || initialCollection ? 'form' : 'location')
  const [folder, setFolder] = useState(initialCategory || null)
  const [collection, setCollection] = useState(initialCollection || record?.dataCollection || null)
  const [collections, setCollections] = useState([])
  const [folderSearch, setFolderSearch] = useState('')
  const [expanded, setExpanded] = useState(new Set(tree.map(item => item.id)))
  const [newFolder, setNewFolder] = useState('')
  const [view, setView] = useState(record?.accessLevel || collection?.defaultAccessLevel || 'V4')
  const [payload, setPayload] = useState(record?.payload || {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const filteredTree = useMemo(() => filterFolderTree(tree, folderSearch), [folderSearch, tree])

  useEffect(() => {
    if (!folder?.id || editing) return
    let active = true
    api(`/data/collections?categoryId=${encodeURIComponent(folder.id)}`).then(items => active && setCollections(items)).catch(requestError => active && setError(requestError.message))
    return () => { active = false }
  }, [editing, folder?.id])

  async function createFolder() {
    if (!newFolder.trim() || !folder?.id) return
    setBusy(true); setError('')
    try {
      const created = await api('/admin/categories', { method: 'POST', body: JSON.stringify({ name: newFolder.trim(), ...(folder?.id ? { parentId: folder.id } : {}) }) })
      await refreshTree(); setFolder(created); setNewFolder('')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function save() {
    if (!collection) return
    setBusy(true); setError('')
    try {
      const title = generateRecordTitle({ fields: collection.fields, payload, existingTitle: record?.title || '', collectionName: collection.name })
      const body = { title, accessLevel: view, payload }
      if (editing) await updateRecordRequest(record.id, body)
      else await createRecordRequest({ ...body, categoryId: folder.id, dataCollectionId: collection.id })
      onSaved()
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const fields = collection?.fields || []
  return <Modal wide title={editing ? 'မှတ်တမ်းပြင်ဆင်ရန်' : 'Add New'} onClose={onClose} actions={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save} disabled={busy || !collection}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add New'}</button></>}>
    {!editing && step === 'location' && <div className="data-location-picker"><div className="data-picker-tree"><label><SearchRounded /><input value={folderSearch} onChange={event => setFolderSearch(event.target.value)} placeholder="Folder ရှာရန်…" /></label><div><FolderTree nodes={filteredTree} selectedId={folder?.id} expanded={expanded} onToggle={id => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })} onSelect={node => { setFolder(node); setCollection(null) }} /></div><div className="data-new-folder"><input value={newFolder} onChange={event => setNewFolder(event.target.value)} placeholder="Folder အသစ်အမည်" /><button onClick={createFolder} disabled={busy || !newFolder.trim() || !folder?.id}><CreateNewFolderOutlined />New Folder</button></div></div><div className="data-picker-files"><h3>Data File</h3>{folder ? collections.map(item => <button key={item.id} className={collection?.id === item.id ? 'selected' : ''} onClick={() => { setCollection(item); setView(item.defaultAccessLevel); setPayload({}); setStep('form') }}><SemanticFileIcon type="DATA" /><span><b>{item.name}</b><small>{item._count?.records || 0} records · {item.fields?.length || 0} fields</small></span></button>) : <p>Folder တစ်ခုရွေးပါ</p>}{folder && !collections.length && <p>ဤ Folder တွင် Structured Data မရှိသေးပါ</p>}</div></div>}
    {(editing || step === 'form') && collection && <div className="data-record-form"><label>View<select value={view} onChange={event => setView(event.target.value)}>{inputLevels(record?.accessLevel).map(level=><option key={level} value={level}>{level}</option>)}</select></label><div className="data-dynamic-fields">{fields.map(field => <DynamicField key={field.id} field={field} value={payload[field.key]} onChange={value => setPayload(current => ({ ...current, [field.key]: value }))} />)}</div></div>}
    {error && <p className="data-error">{error}</p>}
  </Modal>
}

const chartColors = ['#1677d2', '#f2ae2e', '#16a06d', '#7856c7', '#e66a48', '#22a8b5', '#6479d8', '#d65891', '#82a53a', '#8797aa']

const metric = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0))

export function WidgetVisualization({ widget, data }) {
  if (widget.chartType === 'KPI') return <div className="data-kpi-visual"><strong>{metric(data?.value)}</strong><span>{widget.aggregation === 'COUNT' ? 'Total records' : widget.aggregation}</span></div>
  const rawSeries = data?.series || []
  const series = widget.chartType === 'LINE' ? rawSeries : topSeriesWithOthers(rawSeries)
  if (!series.length) return <div className="data-chart-empty">No data available</div>
  if (widget.chartType === 'PIE') {
    const total = series.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1
    const gradient = series.map((item, index) => {
      const start = series.slice(0, index).reduce((sum, previous) => sum + Number(previous.value || 0), 0) / total * 100
      const end = start + Number(item.value || 0) / total * 100
      return `${chartColors[index % chartColors.length]} ${start}% ${end}%`
    }).join(', ')
    return <div className="data-pie-visual"><div className="data-pie" style={{ background: `conic-gradient(${gradient})` }}><span><b>{metric(total)}</b><small>Total</small></span></div><div className="data-chart-legend">{series.map((item, index) => <span key={`${item.label}-${index}`}><i style={{ background: chartColors[index % chartColors.length] }} /><b>{item.label}</b><em>{metric(item.value)}</em></span>)}</div></div>
  }
  const max = Math.max(...series.map(item => Number(item.value || 0)), 1)
  if (widget.chartType === 'LINE') {
    const points = series.map((item, index) => `${series.length === 1 ? 50 : index / (series.length - 1) * 100},${92 - Number(item.value || 0) / max * 78}`).join(' ')
    const labelIndexes = new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])
    return <div className="data-line-visual"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="#1677d2" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />{series.map((item, index) => <circle key={`${item.label}-${index}`} cx={series.length === 1 ? 50 : index / (series.length - 1) * 100} cy={92 - Number(item.value || 0) / max * 78} r="1.8" fill="#1677d2" />)}</svg><div>{series.filter((_item, index) => labelIndexes.has(index)).map(item => <span key={item.label}>{item.label}</span>)}</div></div>
  }
  return <div className="data-bar-visual">{series.map((item, index) => <span key={`${item.label}-${index}`}><i style={{ height: `${Math.max(8, Number(item.value || 0) / max * 100)}%`, background: chartColors[index % chartColors.length] }}><em>{metric(item.value)}</em></i><b title={item.label}>{item.label}</b></span>)}</div>
}

export function DashboardDialog({ collection, widget = null, onClose, onSaved }) {
  const initial = widget || {}
  const [form, setForm] = useState({ title: initial.title || `${collection.name} Dashboard`, chartType: initial.chartType || 'KPI', dimensionFieldId: initial.dimensionFieldId || '', measureFieldId: initial.measureFieldId || '', aggregation: initial.aggregation || 'COUNT', timeGrouping: initial.timeGrouping || 'MONTH', accessLevel: initial.accessLevel || 'V4', sortOrder: initial.sortOrder || 0 })
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const choices = widgetFieldChoices(collection.fields, form.chartType)
  const needsDimension = ['PIE', 'BAR', 'LINE'].includes(form.chartType)
  const validationError = widgetFormError(form, collection.fields)
  const valid = !validationError
  const body = () => widgetRequestBody(form, collection.id)
  async function runPreview() {
    setBusy(true); setError('')
    try { setPreview(await previewDashboardWidget(body())) }
    catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setError('')
    try {
      const saved = await saveDashboardWidget(body(), widget?.id)
      onSaved(saved)
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }
  return <Modal title={widget ? 'Edit Widget' : 'Add Widget'} eyebrow={collection.name} onClose={onClose} actions={<><button onClick={onClose}>Cancel</button><button onClick={runPreview} disabled={busy || !valid}>Preview</button><button className="primary" onClick={save} disabled={busy || !valid}>{busy ? 'Saving…' : widget ? 'Save changes' : 'Add Widget'}</button></>}>
    <div className="data-record-form">
      <label>Widget Type<select value={form.chartType} onChange={event => { const chartType = event.target.value; setPreview(null); setForm(current => ({ ...current, chartType, dimensionFieldId: '', timeGrouping: chartType === 'LINE' ? 'MONTH' : '' })) }}>{['KPI', 'PIE', 'BAR', 'LINE'].map(item => <option key={item}>{item}</option>)}{widget?.chartType === 'CATEGORY_SUMMARY' && <option value="CATEGORY_SUMMARY">Category Summary (existing)</option>}</select></label>
      <label>Title<input value={form.title} onChange={event => set('title', event.target.value)} /></label>
      {needsDimension && <label>Group By<select value={form.dimensionFieldId} onChange={event => { setPreview(null); set('dimensionFieldId', event.target.value) }}><option value="">ရွေးချယ်ပါ</option>{choices.dimensions.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>}
      <label>Calculation<select value={form.aggregation} onChange={event => { setPreview(null); set('aggregation', event.target.value) }}>{['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].map(item => <option key={item}>{item}</option>)}</select></label>
      {form.aggregation !== 'COUNT' && <label>Value<select value={form.measureFieldId} onChange={event => { setPreview(null); set('measureFieldId', event.target.value) }}><option value="">ရွေးချယ်ပါ</option>{choices.measures.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>}
      {form.chartType === 'LINE' && <label>Time Grouping<select value={form.timeGrouping} onChange={event => { setPreview(null); set('timeGrouping', event.target.value) }}>{['DAY', 'MONTH', 'QUARTER', 'YEAR'].map(item => <option key={item}>{item}</option>)}</select></label>}
      <label>Content level<select value={form.accessLevel} onChange={event => set('accessLevel', event.target.value)}>{inputLevels(widget?.accessLevel).map(level => <option key={level} value={level}>{level}</option>)}</select></label>
    </div>
    {validationError && <p className="data-widget-hint">{validationError}</p>}
    {preview && <div className="data-widget-preview"><WidgetVisualization widget={body()} data={preview.data} /></div>}
    {error && <p className="data-error" role="alert">{error}</p>}
  </Modal>
}

export function DataDashboard({ loading, error, items, customize, onAdd, onEdit, onRemove, onMove }) {
  if (loading) return <div className="data-dashboard-state">Loading dashboard…</div>
  if (error) return <div className="data-dashboard-state error">{error}</div>
  if (!items.length) return <div className="data-dashboard-empty"><DashboardCustomizeOutlined /><h2>Dashboard not set up yet</h2><p>This data can be summarized with KPI, Pie, Bar, and Line charts.</p><button className="primary" onClick={onAdd}>Set Up Dashboard</button></div>
  return <div className="data-dashboard-grid">{items.map((item, index) => <article className={`data-widget-card ${item.widget.chartType.toLowerCase()}`} key={item.widget.id}><header><div><small>{item.widget.chartType} · {item.widget.aggregation}</small><h2>{item.widget.title}</h2></div>{customize && <details className="data-widget-menu"><summary><MoreVertRounded /></summary><div><button onClick={() => onEdit(item.widget)}><EditOutlined />Edit</button><button onClick={() => onMove(index, -1)} disabled={index === 0}><ArrowUpwardRounded />Move up</button><button onClick={() => onMove(index, 1)} disabled={index === items.length - 1}><ArrowDownwardRounded />Move down</button><button className="danger" onClick={() => onRemove(item.widget)}><DeleteOutlineRounded />Remove</button></div></details>}</header><WidgetVisualization widget={item.widget} data={item.data} /></article>)}</div>
}

export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm, busy }) {
  return <Modal title={title} onClose={onCancel} actions={<><button onClick={onCancel} disabled={busy}>Cancel</button><button className="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : confirmLabel}</button></>}><p className="data-confirm-message">{message}</p></Modal>
}

export function RecordMenu({ position, onClose, onDetails, onEdit, onDelete }) {
  useEffect(() => { const close = () => onClose(); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [onClose])
  return <div className="data-row-menu" style={position} onClick={event => event.stopPropagation()}><button onClick={onEdit}><EditOutlined />Edit</button><button onClick={onDetails}><InfoOutlined />Details</button><hr/><button className="danger" onClick={onDelete}><DeleteOutlineRounded />Delete</button></div>
}

export function CollectionMenu({ position, onClose, onOpen, onAdd, onDetails }) {
  useEffect(() => { const close = () => onClose(); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [onClose])
  return <div className="data-row-menu" style={position} onClick={event => event.stopPropagation()}><button onClick={onOpen}><VisibilityOutlined />Open</button><button onClick={onAdd}><AddRounded />Add New</button><button onClick={onDetails}><InfoOutlined />Details</button></div>
}

export function DataCollectionRow({ item, selected, onSelect, onOpen, onMenu }) {
  return <div className={`data-collection-row ${selected ? 'selected' : ''}`} tabIndex={0} role="row" aria-selected={selected} onClick={() => onSelect(item)} onDoubleClick={() => onOpen(item)} onKeyDown={event => handleCollectionEnter(event, item, selected ? item.id : null, onOpen)}><span><i><SemanticFileIcon type="DATA" /></i><b>{item.name}</b></span><span>Structured Data</span><span>{(item._count?.records || 0).toLocaleString()}</span><span>{formatDate(item.updatedAt)}</span><button onClick={event => { event.stopPropagation(); onMenu(event, item) }} aria-label={`${item.name} actions`}><MoreVertRounded /></button></div>
}

export function DataRecordsHeader({ collection, onBack }) {
  return <div className="data-records-title"><button onClick={onBack} aria-label="Back to Structured Data list"><ArrowBackRounded /></button><div><h1>{collection.name}</h1><p>{collection.fields.length} fields · {collection._count?.records || 0} records</p></div></div>
}

export function DataRecordToolbar({ viewMode, setViewMode, search, setSearch, sort, setSort, customize, setCustomize, onAddRecord, onAddWidget }) {
  const modeClass = viewMode === 'dashboard' ? 'data-mode-dashboard' : 'data-mode-table'
  return <div className={`data-record-toolbar ${modeClass}`}><div>{viewMode === 'table' && <button className="primary" onClick={onAddRecord}><AddRounded />Add New</button>}<div className="data-view-switch" role="group" aria-label="Data view"><button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Table</button><button className={viewMode === 'dashboard' ? 'active' : ''} onClick={() => setViewMode('dashboard')}>Dashboard</button></div></div>{viewMode === 'table' ? <div><label><SearchRounded /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="မှတ်တမ်းရှာရန်…" /></label><select value={`${sort.sortBy}:${sort.sortDirection}`} onChange={event => { const [sortBy, sortDirection] = event.target.value.split(':'); setSort({ sortBy, sortDirection }) }}><option value="updatedAt:desc">Recently updated</option><option value="createdAt:desc">Newest</option><option value="title:asc">Title A–Z</option></select></div> : <div><button className="primary" onClick={onAddWidget}><AddRounded />Add Widget</button><button className={customize ? 'active' : ''} onClick={() => setCustomize(value => !value)}><DashboardCustomizeOutlined />{customize ? 'Done' : 'Customize'}</button></div>}</div>
}

export function DataRecordRow({ record, collection, onDetails, onMenu }) {
  return <tr onDoubleClick={() => onDetails(record)}><td><b>{record.title}</b></td>{collection.fields.map(field => <td key={field.id}>{field.type === 'BOOLEAN' ? (record.payload[field.key] ? 'Yes' : 'No') : field.type === 'DATE' ? formatDate(record.payload[field.key]) : String(record.payload[field.key] ?? '—')}</td>)}<td>{formatDate(record.updatedAt)}</td><td><button aria-label={`${record.title} actions`} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onMenu(event, record, rect) }}><MoreVertRounded /></button></td></tr>
}

export function DataRecordsPage({ categoryId, dataCollectionId = null, onOpenCollection, onClearCollection }) {
  const treeQuery = useCategoryTree()
  const tree = useMemo(() => treeQuery.data || [], [treeQuery.data])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [folderSearch, setFolderSearch] = useState('')
  const [collections, setCollections] = useState({ loading: false, items: [], error: '' })
  const [collection, setCollection] = useState(null)
  const [selectedCollectionId, setSelectedCollectionId] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState({ sortBy: 'updatedAt', sortDirection: 'desc' })
  const [records, setRecords] = useState({ loading: false, items: [], nextCursor: null, error: '' })
  const [recordRevision, setRecordRevision] = useState(0)
  const [viewMode, setViewMode] = useState('table')
  const [dashboard, setDashboard] = useState({ loading: false, items: [], error: '' })
  const [dashboardRevision, setDashboardRevision] = useState(0)
  const [customize, setCustomize] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [menu, setMenu] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const sentinel = useRef(null)

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => clearTimeout(timer) }, [search])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(timer) } }, [notice])
  useEffect(() => {
    if (!tree.length || selectedFolder) return
    const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])])
    const targetFolder = flatten(tree).find(node => node.id === categoryId) || tree[0]
    if (targetFolder) {
      setSelectedFolder(targetFolder)
      setExpanded(new Set(tree.map(item => item.id)))
    }
  }, [categoryId, selectedFolder, tree])
  useEffect(() => {
    if (!selectedFolder?.id) return
    let active = true
    setCollections(current => ({ ...current, loading: true, error: '' }))
    Promise.all([api(`/data/collections?categoryId=${encodeURIComponent(selectedFolder.id)}`), api(`/categories/${selectedFolder.id}`)]).then(([items, details]) => { if (!active) return; setCollections({ loading: false, items, error: '' }); setBreadcrumb(details.breadcrumb || []); setCollection(current => current && current.categoryId !== selectedFolder.id ? null : current) }).catch(error => active && setCollections({ loading: false, items: [], error: error.message }))
    return () => { active = false }
  }, [selectedFolder?.id])
  useEffect(() => {
    if (!dataCollectionId || collection?.id === dataCollectionId) return
    api(`/data/collections/${dataCollectionId}`).then(item => {
      setCollection(item)
      setViewMode('table')
      setCustomize(false)
      const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])])
      const targetFolder = flatten(tree).find(node => node.id === item.categoryId)
      if (targetFolder) setSelectedFolder(targetFolder)
    }).catch(() => {})
  }, [collection?.id, dataCollectionId, tree])
  const loadRecords = useCallback(async (cursor = null, append = false) => {
    if (!collection) return
    setRecords(current => ({ ...current, loading: true, error: '' }))
    try {
      const params = recordQueryParams({ dataCollectionId: collection.id, search: debouncedSearch, sortBy: sort.sortBy, sortDirection: sort.sortDirection, cursor })
      const response = await apiEnvelope(`/data?${params}`)
      setRecords(current => ({ loading: false, items: append ? [...current.items, ...response.data] : response.data, nextCursor: response.meta?.nextCursor || null, error: '' }))
    } catch (error) { setRecords(current => ({ ...current, loading: false, error: error.message })) }
  }, [collection, debouncedSearch, sort.sortBy, sort.sortDirection])
  useEffect(() => { if (collection && viewMode === 'table') loadRecords() }, [collection, loadRecords, recordRevision, viewMode])
  useEffect(() => {
    if (!collection || viewMode !== 'dashboard') return undefined
    let active = true
    setDashboard(current => ({ ...current, loading: true, error: '' }))
    loadCollectionDashboard(collection.id).then(items => active && setDashboard({ loading: false, items, error: '' })).catch(error => active && setDashboard({ loading: false, items: [], error: error.message }))
    return () => { active = false }
  }, [collection, dashboardRevision, viewMode])
  useEffect(() => {
    const node = sentinel.current
    if (!node || !records.nextCursor || records.loading) return undefined
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadRecords(records.nextCursor, true) }, { rootMargin: '160px' })
    observer.observe(node); return () => observer.disconnect()
  }, [records.nextCursor, records.loading, loadRecords])

  const filteredTree = useMemo(() => filterFolderTree(tree, folderSearch), [folderSearch, tree])
  const leaveCollection = () => {
    clearCollectionContext({ setCollection, setSelectedCollectionId, onClearCollection })
    setSearch('')
    setViewMode('table')
    setCustomize(false)
  }
  const changeFolder = node => { leaveCollection(); setSelectedFolder(node) }
  const withCollection = async (item, action) => {
    setMenu(null)
    try {
      const details = await dataCollectionDetailsRequest(item.id)
      action(details)
    } catch (error) { setNotice(error.message) }
  }
  const openCollection = (item, afterOpen) => withCollection(item, details => {
    setCollection(details)
    setSelectedCollectionId(details.id)
    setSearch('')
    setViewMode('table')
    setCustomize(false)
    onOpenCollection?.(details.id)
    afterOpen?.(details)
  })
  const closeDialog = () => setDialog(null)
  const refreshRecords = (message = 'Saved successfully') => { closeDialog(); setMenu(null); setRecordRevision(value => value + 1); setNotice(message) }
  const archiveRecord = async record => {
    setActionBusy(true)
    try { await archiveRecordRequest(record.id); refreshRecords('Record deleted successfully') }
    catch (error) { setNotice(error.message) } finally { setActionBusy(false) }
  }
  const refreshDashboard = (message = 'Dashboard updated successfully') => { closeDialog(); setDashboardRevision(value => value + 1); setNotice(message) }
  const archiveWidget = async widget => {
    setActionBusy(true)
    try { await archiveDashboardWidget(widget.id); refreshDashboard('Widget removed successfully') }
    catch (error) { setNotice(error.message) } finally { setActionBusy(false) }
  }
  const moveWidget = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= dashboard.items.length) return
    const reordered = [...dashboard.items]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setActionBusy(true)
    try {
      await reorderDashboardWidgets(reordered)
      setDashboard(current => ({ ...current, items: reordered.map((item, order) => ({ ...item, widget: { ...item.widget, sortOrder: order } })) }))
      setNotice('Widget order updated')
    } catch (error) { setNotice(error.message) } finally { setActionBusy(false) }
  }

  return <section className="data-workspace">
    <aside className="data-sidebar"><label className="data-folder-search"><SearchRounded /><input value={folderSearch} onChange={event => setFolderSearch(event.target.value)} placeholder="Folder များ ရှာဖွေ…" /></label><button className="data-tree-home" onClick={() => tree[0] && changeFolder(tree[0])}><HomeRounded /><span>Home</span></button><div className="data-tree-scroll">{treeQuery.isLoading ? <p>Folder များဖွင့်နေသည်…</p> : <FolderTree nodes={filteredTree} selectedId={selectedFolder?.id} expanded={expanded} onToggle={id => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })} onSelect={changeFolder} />}</div></aside>
    <main className="data-main">
      <header className="data-topbar"><nav><button onClick={() => { leaveCollection(); setSelectedFolder(tree[0] || null) }}><HomeRounded /></button>{breadcrumb.map(item => <span key={item.id}><NavigateNextRounded />{item.name}</span>)}{collection && <span><NavigateNextRounded />{collection.name}</span>}</nav>{!collection && <button className="data-add" onClick={() => setDialog({ type: 'record', record: null })} disabled={!admin()}><AddRounded />Add New</button>}</header>
      {!collection ? <section className="data-collection-list"><div className="data-list-head"><span>Name</span><span>Type</span><span>Records</span><span>Last Updated</span><span /></div>{collections.loading ? <div className="data-empty">Structured Data ဖွင့်နေသည်…</div> : collections.error ? <div className="data-empty error">{collections.error}</div> : collections.items.map(item => <DataCollectionRow key={item.id} item={item} selected={selectedCollectionId === item.id} onSelect={selected => setSelectedCollectionId(selected.id)} onOpen={openCollection} onMenu={(event, selected) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ kind: 'collection', item: selected, position: { right: window.innerWidth - rect.right, top: rect.bottom + 4 } }) }} />)}{!collections.loading && !collections.error && !collections.items.length && <div className="data-empty"><StorageRounded /><b>Structured Data မရှိသေးပါ</b><span>အခြား Folder ရွေးပါ သို့မဟုတ် Add New မှ မှတ်တမ်းထည့်ပါ။</span></div>}</section> : <section className="data-records-view">
        <DataRecordsHeader collection={collection} onBack={leaveCollection} />
        <DataRecordToolbar viewMode={viewMode} setViewMode={mode => { setViewMode(mode); if (mode === 'table') setCustomize(false) }} search={search} setSearch={setSearch} sort={sort} setSort={setSort} customize={customize} setCustomize={setCustomize} onAddRecord={() => setDialog({ type: 'record', record: null })} onAddWidget={() => setDialog({ type: 'widget', widget: null })} />
        {viewMode === 'table' ? <div className="data-record-table"><table><thead><tr><th>Name</th>{collection.fields.map(field => <th key={field.id}>{field.label}</th>)}<th>Last Updated</th><th>Actions</th></tr></thead><tbody>{records.items.map(record => <DataRecordRow key={record.id} record={record} collection={collection} onDetails={selected => setDialog({ type: 'details', record: selected })} onMenu={(_event, selected, rect) => setMenu({ kind: 'record', item: selected, position: { right: window.innerWidth - rect.right, top: rect.bottom + 4 } })} />)}</tbody></table>{records.loading && <div className="data-loading">Loading…</div>}{records.error && <div className="data-error">{records.error}</div>}{!records.loading && !records.items.length && <div className="data-empty"><StorageRounded /><b>မှတ်တမ်းမရှိသေးပါ</b><span>Add New ဖြင့် ပထမဆုံးမှတ်တမ်းထည့်နိုင်ပါသည်။</span></div>}<div ref={sentinel} className="data-sentinel">{records.nextCursor ? 'More records loading…' : records.items.length ? 'All records loaded' : ''}</div></div> : <div className="data-dashboard"><DataDashboard loading={dashboard.loading} error={dashboard.error} items={dashboard.items} customize={customize} onAdd={() => setDialog({ type: 'widget', widget: null })} onEdit={widget => setDialog({ type: 'widget', widget })} onRemove={widget => setDialog({ type: 'delete-widget', widget })} onMove={moveWidget} /></div>}
      </section>}
    </main>
    {menu?.kind === 'record' && <RecordMenu position={menu.position} onClose={() => setMenu(null)} onDetails={() => { setDialog({ type: 'details', record: menu.item }); setMenu(null) }} onEdit={() => { setDialog({ type: 'record', record: menu.item }); setMenu(null) }} onDelete={() => { setDialog({ type: 'delete-record', record: menu.item }); setMenu(null) }} />}
    {menu?.kind === 'collection' && <CollectionMenu position={menu.position} onClose={() => setMenu(null)} onOpen={() => openCollection(menu.item)} onAdd={() => openCollection(menu.item, details => setDialog({ type: 'record', record: null, collection: details }))} onDetails={() => withCollection(menu.item, details => setDialog({ type: 'collection-details', collection: details }))} />}
    {dialog?.type === 'record' && <RecordDialog tree={tree} initialCategory={selectedFolder} initialCollection={dialog.collection || collection} record={dialog.record} onClose={closeDialog} onSaved={refreshRecords} refreshTree={treeQuery.refetch} />}
    {dialog?.type === 'widget' && <DashboardDialog collection={collection} widget={dialog.widget} onClose={closeDialog} onSaved={() => refreshDashboard(dialog.widget ? 'Widget updated successfully' : 'Widget added successfully')} />}
    {dialog?.type === 'delete-record' && <ConfirmDialog title="Delete this record?" message="Are you sure you want to delete this record? It will move to Recently Deleted." confirmLabel="Delete" onCancel={closeDialog} onConfirm={() => archiveRecord(dialog.record)} busy={actionBusy} />}
    {dialog?.type === 'delete-widget' && <ConfirmDialog title="Remove this widget?" message="The widget configuration will be removed from this data file dashboard." confirmLabel="Remove" onCancel={closeDialog} onConfirm={() => archiveWidget(dialog.widget)} busy={actionBusy} />}
    {dialog?.type === 'details' && <Modal title={dialog.record.title} eyebrow="Record Details" onClose={closeDialog} actions={<button className="primary" onClick={closeDialog}>Done</button>}><dl className="data-details">{collection.fields.map(field => <div key={field.id}><dt>{field.label}</dt><dd>{String(dialog.record.payload[field.key] ?? '—')}</dd></div>)}<div><dt>Created</dt><dd>{formatDate(dialog.record.createdAt)}</dd></div><div><dt>Created By</dt><dd>{dialog.record.createdBy?.name || '—'}</dd></div><div><dt>Updated</dt><dd>{formatDate(dialog.record.updatedAt)}</dd></div><div><dt>Modified By</dt><dd>{dialog.record.updatedBy?.name || dialog.record.createdBy?.name || '—'}</dd></div><div><dt>Source</dt><dd>{dialog.record.sourceType === 'EXCEL' ? 'Excel' : 'Manual'}</dd></div><div><dt>View</dt><dd>{dialog.record.accessLevel}</dd></div></dl></Modal>}
    {dialog?.type === 'collection-details' && <Modal title={dialog.collection.name} eyebrow="Structured Data" onClose={closeDialog} actions={<button className="primary" onClick={closeDialog}>Done</button>}><dl className="data-details"><div><dt>Location</dt><dd>{breadcrumb.map(item => item.name).join(' / ')}</dd></div><div><dt>Records</dt><dd>{dialog.collection._count?.records || 0}</dd></div><div><dt>Fields</dt><dd>{dialog.collection.fields.map(field => field.label).join(', ')}</dd></div><div><dt>Last Updated</dt><dd>{formatDate(dialog.collection.updatedAt)}</dd></div></dl></Modal>}
    {notice && <div className="data-toast">{notice}</div>}
  </section>
}

function useDocuments(categoryId, revision) {
  const [state, setState] = useState({ loading: true, error: '', items: [], category: null })
  useEffect(() => { let active = true; Promise.all([api(`/documents${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}&includeDescendants=true` : ''}`), categoryId ? api(`/categories/${categoryId}`) : Promise.resolve(null)]).then(([items, details]) => active && setState({ loading: false, error: '', items, category: details?.category || null })).catch(error => active && setState(current => ({ ...current, loading: false, error: error.message }))); return () => { active = false } }, [categoryId, revision])
  return state
}

export function DocumentsPage({ categoryId }) {
  const [revision, setRevision] = useState(0)
  const state = useDocuments(categoryId, revision)
  return <section className="filtered-page"><div className="filtered-heading"><div><h1>စာရွက်စာတမ်းများ</h1><p>{state.category ? `${state.category.name} နှင့် အောက်ခံအမျိုးအစားများရှိ ဖိုင်များ` : 'အမျိုးအစားအားလုံးရှိ စာရွက်စာတမ်းများ'}</p></div>{state.category && <span>▰ {state.category.name}</span>}</div><div className="filtered-toolbar"><b>{state.items.length.toLocaleString()} ဖိုင်</b></div><div className="filtered-card">{state.loading ? <div className="filtered-state">အချက်အလက်များ ဖွင့်နေသည်…</div> : state.error ? <div className="filtered-state error"><b>အချက်အလက် မဖွင့်နိုင်ပါ</b><span>{state.error}</span><button onClick={() => setRevision(value => value + 1)}>ပြန်စမ်းရန်</button></div> : !state.items.length ? <div className="filtered-state"><b>မှတ်တမ်းမရှိသေးပါ</b></div> : <div className="document-grid">{state.items.map(document => <article key={document.id}><span>{document.mimeType.includes('pdf') ? 'PDF' : 'JPG'}</span><div><h3>{document.title}</h3><p>{document.fileName}</p><small>{formatDate(document.updatedAt)}</small></div></article>)}</div>}</div></section>
}
