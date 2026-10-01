import { useDialogFocus } from '../shared/useDialogFocus.js'
import PdfPreview from '../shared/PdfPreview.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ContentCutRounded from '@mui/icons-material/ContentCutRounded'
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined'
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import FolderRounded from '@mui/icons-material/FolderRounded'
import GridViewRounded from '@mui/icons-material/GridViewRounded'
import HomeRounded from '@mui/icons-material/HomeRounded'
import HistoryRounded from '@mui/icons-material/HistoryRounded'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import RestoreFromTrashRounded from '@mui/icons-material/RestoreFromTrashRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import SortRounded from '@mui/icons-material/SortRounded'
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import ViewListRounded from '@mui/icons-material/ViewListRounded'
import { inputLevels, isMainAdmin, isContentAdmin } from '../shared/access.js'
import '../shared/workflow.css'
import { api, apiBlob } from '../api.js'
import { SemanticFileIcon as ItemIcon } from '../shared/SemanticFileIcon.jsx'
import { categoryKeys, useCategoryMutation, useCategoryTree, useFolderContents } from './category-queries.js'
import { categoryDescendantIds, createCutController, exitTrashThen, filterAndSortItems, flattenCategories, isEditingTarget, normalizeFileManagerItems } from './category-utils.js'
import './categories.css'

const itemKey = item => `${item.itemType}:${item.id}`
const protectedFolder = item => item?.itemType === 'FOLDER' && (item.mainSlot || item.parentId === null)
const user = () => JSON.parse(sessionStorage.getItem('office_user') || '{}')

function FolderTree({ nodes, selectedId, expanded, onToggle, onSelect, onContext, depth = 0 }) {
  return nodes.map(node => {
    const opened = expanded.has(node.id)
    const hasChildren = Boolean(node.children?.length)
    return <div className="fm-tree-branch" key={node.id}>
      <div className={`fm-tree-row ${selectedId === node.id ? 'selected' : ''}`} style={/** @type {import('react').CSSProperties} */ ({ '--tree-depth': depth })} onContextMenu={event => onContext(event, node)}>
        <button type="button" className="fm-tree-toggle" onClick={() => hasChildren && onToggle(node.id)} disabled={!hasChildren} aria-label={opened ? 'Folder ခေါက်ရန်' : 'Folder ဖြန့်ရန်'}>
          {hasChildren && (opened ? <ExpandMoreRounded /> : <ChevronRightRounded />)}
        </button>
        <button type="button" className="fm-tree-name" onClick={() => onSelect(node.id)} onDoubleClick={() => hasChildren && onToggle(node.id)}>
          <ItemIcon type="FOLDER" open={opened} /><span>{node.name}</span>
        </button>
      </div>
      {opened && hasChildren && <FolderTree nodes={node.children} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} onContext={onContext} depth={depth + 1} />}
    </div>
  })
}

function MoveDialog({ items, tree, onClose, onConfirm, busy, error }) {
  const dialog = useDialogFocus(true, () => !busy && onClose())
  const blocked = useMemo(() => {
    const ids = new Set()
    for (const item of items) {
      if (item.itemType !== 'FOLDER') continue
      ids.add(item.id)
      const node = flattenCategories(tree).find(folder => folder.id === item.id)
      categoryDescendantIds(node, ids)
    }
    return ids
  }, [items, tree])
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState(null)
  const destinations = useMemo(() => flattenCategories(tree).filter(folder => !blocked.has(folder.id) && folder.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [blocked, query, tree])
  return <div className="fm-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section className="fm-dialog fm-move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-dialog-title">
      <header><div><small>File Manager</small><h2 id="move-dialog-title">Move to</h2></div><button onClick={onClose} disabled={busy} aria-label="ပိတ်ရန်"><CloseRounded /></button></header>
      <div className="fm-dialog-body">
        <p className="fm-dialog-note"><DriveFileMoveOutlined /><span><b>{items.length} item{items.length > 1 ? 's' : ''}</b><small>ရွှေ့လိုသည့် Folder ကို ရွေးပါ</small></span></p>
        <label className="fm-dialog-search"><SearchRounded /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Folder ရှာရန်…" autoFocus /></label>
        <div className="fm-destination-list">
          {destinations.map(folder => <button key={folder.id} className={target === folder.id ? 'selected' : ''} onClick={() => setTarget(folder.id)}><FolderRounded /><span><b>{folder.name}</b><small>{folder.path}</small></span></button>)}
        </div>
        {error && <p className="fm-error" role="alert">{error}</p>}
      </div>
      <footer><button onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={target === null || busy} onClick={() => onConfirm(target)}>{busy ? 'Moving…' : 'Move here'}</button></footer>
    </section>
  </div>
}

function DetailsDialog({ item, location, onClose }) {
  const dialog = useDialogFocus(true, onClose)
  const rows = item.itemType === 'FOLDER'
    ? [['Type', 'Folder'], ['Location', location], ['Items', item.sizeLabel], ['Created', formatDate(item.createdAt)], ['Created By', item.createdBy?.name || '—'], ['Modified', formatDate(item.updatedAt)], ['Modified By', item.updatedBy?.name || item.createdBy?.name || '—']]
    : item.itemType === 'DATA'
      ? [['Type', 'Structured Data'], ['Location', location], ['Records', item.sizeLabel], ['Fields', `${item.fields?.length || 0}`], ['Access', item.defaultAccessLevel], ['Created By', item.createdBy?.name || '—'], ['Modified', formatDate(item.updatedAt)], ['Modified By', item.updatedBy?.name || item.createdBy?.name || '—']]
      : [['Type', item.typeLabel], ['File name', item.fileName], ['Location', location], ['Size', item.sizeLabel], ['Access', item.accessLevel], ['Uploaded', formatDate(item.createdAt)], ['Created By', item.createdBy?.name || '—'], ['Modified', formatDate(item.updatedAt)], ['Modified By', item.updatedBy?.name || item.createdBy?.name || '—']]
  return <div className="fm-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section ref={dialog} tabIndex={-1} className="fm-dialog fm-details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-dialog-title">
      <header><div><small>Details</small><h2 id="details-dialog-title">{item.name}</h2></div><button onClick={onClose} aria-label="ပိတ်ရန်"><CloseRounded /></button></header>
      <div className="fm-details-hero"><span className={`fm-item-icon ${item.itemType.toLowerCase()}`}><ItemIcon type={item.itemType} /></span><div><b>{item.name}</b><small>{item.typeLabel}</small></div></div>
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      <footer><button className="primary" onClick={onClose}>Done</button></footer>
    </section>
  </div>
}

function UploadDialog({ upload, setUpload, folderId, folderName, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  useEffect(()=>{if(upload.mode!=='document')return;const url=URL.createObjectURL(upload.file);setPreviewUrl(url);return()=>URL.revokeObjectURL(url)},[upload.file,upload.mode])

  async function close() {
    if (upload.mode === 'excel' && upload.job?.id && upload.job.status !== 'COMPLETED') api(`/admin/imports/${upload.job.id}/cancel`, { method: 'POST' }).catch(() => {})
    setUpload(null)
  }

  async function inspectSheet() {
    setBusy(true); setError('')
    try {
      const job = await api(`/admin/imports/${upload.job.id}/inspect`, { method: 'POST', body: JSON.stringify({ sheetName: upload.sheetName }) })
      setUpload(current => ({ ...current, job }))
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function confirm() {
    setBusy(true); setError('')
    try {
      if (upload.mode === 'excel' && !upload.job) {
        const body = new FormData(); body.append('file', upload.file); body.append('categoryId', folderId); body.append('accessLevel', upload.accessLevel)
        const job = await api('/admin/imports/excel/inspect', {method:'POST',body,headers:{'Idempotency-Key':upload.operationKey}})
        setUpload(current=>({...current,job,sheetName:job.inspection?.sheets?.[0]?.name||''}));return
      }
      if (upload.mode === 'document') {
        const body = new FormData()
        body.append('file', upload.file)
        body.append('title', upload.title.trim())
        body.append('categoryId', folderId)
        body.append('accessLevel', upload.accessLevel)
        await api('/admin/documents', { method: 'POST', body, headers: {'Idempotency-Key':upload.operationKey} })
      } else {
        const job = await api(`/admin/imports/${upload.job.id}/commit`, { method: 'POST', body: JSON.stringify({ collectionName: upload.collectionName.trim(), defaultAccessLevel: upload.accessLevel }) })
        setUpload(current => ({ ...current, job }))
      }
      onDone()
      setUpload(null)
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  const dialog = useDialogFocus(true, () => !busy && close())
  const inspection = upload.job?.inspection || {}
  const preview = inspection.preview || []
  const fields = inspection.fields || []
  const needsSheet = Boolean(inspection.requiresSheetSelection)
  return <div className="fm-dialog-backdrop">
    <section ref={dialog} tabIndex={-1} className="fm-dialog fm-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
      <header><div><small>Add File</small><h2 id="upload-dialog-title">{upload.mode === 'excel' ? 'Import Excel Data' : 'Upload Document'}</h2></div><button onClick={close} disabled={busy} aria-label="ပိတ်ရန်"><CloseRounded /></button></header>
      <div className="fm-dialog-body">
        <p>Destination: <b>{folderName}</b></p>
        <p className="fm-dialog-note"><ItemIcon type={upload.mode === 'excel' ? 'DATA' : upload.file.type === 'application/pdf' ? 'PDF' : 'IMAGE'} /><span><b>{upload.file?.name || upload.job?.originalFileName}</b><small>{upload.mode === 'excel' ? 'Database ထဲသို့ structured data အဖြစ် import လုပ်မည်' : 'ရွေးထားသည့် Folder ထဲသို့ upload လုပ်မည်'}</small></span></p>
        {upload.mode === 'document' ? <>
          <label className="fm-field">Title<input value={upload.title} onChange={event => setUpload(current => ({ ...current, title: event.target.value }))} autoFocus /></label>
          <label className="fm-field">Access<select value={upload.accessLevel} onChange={event => setUpload(current => ({ ...current, accessLevel: event.target.value }))}>{inputLevels(upload.job?.accessLevel).map(level=><option key={level}>{level}</option>)}</select></label>
        </> : <>
          {needsSheet ? <div className="fm-sheet-select"><label className="fm-field">Worksheet<select value={upload.sheetName} onChange={event => setUpload(current => ({ ...current, sheetName: event.target.value }))}>{inspection.sheets?.map(sheet => <option key={sheet.name}>{sheet.name}</option>)}</select></label><button onClick={inspectSheet} disabled={busy}>Preview sheet</button></div> : <>
            <label className="fm-field">Data name<input value={upload.collectionName} onChange={event => setUpload(current => ({ ...current, collectionName: event.target.value }))} /></label>
            <label className="fm-field">Content level<select value={upload.accessLevel} onChange={event => setUpload(current => ({ ...current, accessLevel: event.target.value }))}>{inputLevels(upload.job?.accessLevel).map(level => <option key={level} value={level}>{level}</option>)}</select></label>
            <div className="fm-import-summary"><span><b>{upload.job?.validRows || 0}</b> valid rows</span><span className={upload.job?.invalidRows ? 'danger' : ''}><b>{upload.job?.invalidRows || 0}</b> invalid rows</span><span><b>{fields.length}</b> fields</span></div>
            {preview.length > 0 && <div className="fm-preview-table"><table><thead><tr><th>#</th>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{preview.slice(0, 6).map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{fields.map(field => <td key={field.key}>{String(row.data[field.key] ?? '')}</td>)}</tr>)}</tbody></table></div>}
          </>}
        </>}
        {previewUrl && (upload.file.type==='application/pdf'?<PdfPreview title={upload.file.name} url={previewUrl}/>:<img src={previewUrl} alt={upload.file.name}/>)}
        {error && <p className="fm-error" role="alert">{error}</p>}
      </div>
      <footer><button onClick={close} disabled={busy}>Cancel</button><button className="primary" onClick={confirm} disabled={busy || (upload.mode === 'document' ? !upload.title.trim() : needsSheet || !upload.collectionName.trim() || upload.job?.invalidRows > 0)}>{busy ? 'Working…' : upload.mode === 'excel' ? upload.job ? 'Commit import' : 'Inspect workbook' : 'Upload'}</button></footer>
    </section>
  </div>
}

export function ContextMenu({ menu, onClose, onOpen, onNewFolder, onAddFile, onRename, onMove, onCut, onDetails, onDelete }) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('resize', close) }
  }, [onClose])
  return <div className="fm-context-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()} role="menu">
    <button onClick={onOpen}><OpenInNewRounded />Open</button>
    {menu.fromTree && <button onClick={onNewFolder}><CreateNewFolderOutlined />New Folder</button>}
    {menu.fromTree && <button onClick={onAddFile}><UploadFileRounded />Add File</button>}
    {(!protectedFolder(menu.item)||isMainAdmin(user()))&&<button onClick={onRename}><EditOutlined />Rename</button>}
    {!protectedFolder(menu.item)&&<button onClick={onMove}><DriveFileMoveOutlined />Move to…</button>}
    {!protectedFolder(menu.item)&&<button onClick={onCut}><ContentCutRounded />Cut <kbd>Ctrl + X</kbd></button>}
    <button onClick={onDetails}><InfoOutlined />Details</button>
    <hr />
    {!protectedFolder(menu.item)&&<button className="danger" onClick={onDelete}><DeleteOutlineRounded />Delete</button>}
  </div>
}

function DeleteDialog({ item, permanent = false, busy, error, onClose, onConfirm }) {
  return <div className="fm-dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section className="fm-dialog fm-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title">
      <header><div><small>{permanent ? 'Permanent deletion' : 'Recently Deleted'}</small><h2 id="delete-dialog-title">{permanent ? 'Delete permanently?' : 'Move to Recently Deleted?'}</h2></div><button onClick={onClose} disabled={busy}><CloseRounded /></button></header>
      <div className="fm-dialog-body"><p className={`fm-delete-message ${permanent ? 'danger' : ''}`}><DeleteOutlineRounded /><span><b>{item.name}</b><small>{permanent ? 'This cannot be undone. The stored file and all related data will be permanently removed.' : 'This item will move to Recently Deleted and can be restored for 30 days.'}</small></span></p>{error && <p className="fm-error">{error}</p>}</div>
      <footer><button onClick={onClose} disabled={busy}>Cancel</button><button className="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : permanent ? 'Delete permanently' : 'Move to Recently Deleted'}</button></footer>
    </section>
  </div>
}

export default function Categories({ onViewData }) {
  const queryClient = useQueryClient()
  const categoryMutation = useCategoryMutation()
  const fileInput = useRef(null)
  const newFolderBlurAction = useRef('')
  const renameBlurAction = useRef('')
  const cutController = useRef(createCutController())
  const selectedFolderRef = useRef(null)
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [selection, setSelection] = useState(new Set())
  const [cutItems, setCutItems] = useState([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [view, setView] = useState('list')
  const [newFolder, setNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [rename, setRename] = useState(null)
  const [menu, setMenu] = useState(null)
  const [moveItems, setMoveItems] = useState(null)
  const [detailsItem, setDetailsItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [upload, setUpload] = useState(null)
  const [uploadFolderId, setUploadFolderId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [trashMode, setTrashMode] = useState(false)
  const [trash, setTrash] = useState({ loading: false, items: [], error: '' })
  const [trashRevision, setTrashRevision] = useState(0)
  const treeQuery = useCategoryTree()
  const contentsQuery = useFolderContents(selectedFolderId)
  const tree = useMemo(() => treeQuery.data || [], [treeQuery.data])
  const contents = useMemo(() => selectedFolderId ? contentsQuery.data : { folders: tree, dataItems: [], documents: [], breadcrumb: [] }, [contentsQuery.data, selectedFolderId, tree])
  const allItems = useMemo(() => normalizeFileManagerItems(contents || {}), [contents])
  const visibleItems = useMemo(() => {
    const items = filterAndSortItems(allItems, search, sortBy)
    return selectedFolderId ? items : items.sort((a, b) => (a.mainSlot || 7) - (b.mainSlot || 7))
  }, [allItems, search, sortBy, selectedFolderId])
  const visibleTrash = useMemo(() => filterAndSortItems(trash.items.map(item => ({ ...item, updatedAt: item.archivedAt })), search, sortBy), [trash.items, search, sortBy])
  const selectedItems = useMemo(() => allItems.filter(item => selection.has(itemKey(item))), [allItems, selection])
  const location = selectedFolderId ? `Home / ${(contents?.breadcrumb || []).map(item => item.name).join(' / ')}` : 'Home'
  const cutKeys = useMemo(() => new Set(cutItems.map(itemKey)), [cutItems])
  const displayedExpanded = useMemo(() => expanded.size ? expanded : new Set(tree.map(folder => folder.id)), [expanded, tree])
  const canManage = isContentAdmin(user())
  useEffect(() => { selectedFolderRef.current = selectedFolderId }, [selectedFolderId])
  useEffect(() => {
    if (!trashMode) return undefined
    let active = true
    api('/admin/trash').then(items => active && setTrash({ loading: false, items, error: '' })).catch(requestError => active && setTrash({ loading: false, items: [], error: requestError.message }))
    return () => { active = false }
  }, [trashMode, trashRevision])

  function toggleTrash() {
    if (!trashMode) setTrash(current => ({ ...current, loading: true, error: '' }))
    setTrashMode(value => !value); setSelection(new Set()); setSearch('')
  }
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 2800)
    return () => clearTimeout(timer)
  }, [notice])

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: categoryKeys.all })
  }

  function toggleTree(id) {
    setExpanded(current => { const next = new Set(current.size ? current : tree.map(folder => folder.id)); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function navigateToFolder(id) {
    return exitTrashThen(setTrashMode, () => {
      setSelectedFolderId(id)
      setSelection(new Set())
      setMenu(null)
      setNewFolder(false)
      setRename(null)
      setSearch('')
    })
  }

  function selectItem(event, item) {
    const key = itemKey(item)
    setSelection(current => {
      if (!event.ctrlKey && !event.metaKey) return new Set([key])
      const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next
    })
  }

  async function openItem(item) {
    setMenu(null)
    if (item.itemType === 'FOLDER') { navigateToFolder(item.id); return }
    if (item.itemType === 'DATA') { onViewData?.(item.categoryId, item.id); return }
    try {
      const blob = await apiBlob(`/documents/${item.id}/download`)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (requestError) { setError(requestError.message) }
  }

  function openMenu(event, item) {
    event.preventDefault(); event.stopPropagation()
    const key = itemKey(item)
    if (!selection.has(key)) setSelection(new Set([key]))
    const x = Math.min(event.clientX, window.innerWidth - 210)
    const y = Math.min(event.clientY, window.innerHeight - 250)
    setMenu({ x, y, item })
  }

  function openTreeMenu(event, node) {
    event.preventDefault(); event.stopPropagation()
    const x = Math.min(event.clientX, window.innerWidth - 230)
    const y = Math.min(event.clientY, window.innerHeight - 350)
    setMenu({ x, y, fromTree: true, item: { ...node, itemType: 'FOLDER', typeLabel: 'Folder', sizeLabel: `${(node.children?.length || 0) + (node.directDataCount || 0) + (node.directDocumentCount || 0)} items` } })
  }

  function beginNewFolder(parentId = selectedFolderId) {
    if (!parentId) {setNotice('Main Folder တစ်ခုကို ရွေးပါ');return}
    return exitTrashThen(setTrashMode, () => {
      if (parentId !== selectedFolderId) navigateToFolder(parentId)
      newFolderBlurAction.current = ''
      setNewFolderName('')
      setNewFolder(true)
      setMenu(null)
    })
  }

  async function createFolder() {
    const name = newFolderName.trim()
    setNewFolder(false); setNewFolderName('')
    if (!name || !selectedFolderId) return
    try {
      await categoryMutation.mutateAsync({ mode: selectedFolderId ? 'child' : 'root', category: { id: selectedFolderId }, values: { name, ...(selectedFolderId ? { parentId: selectedFolderId } : {}) } })
      setNotice('Folder created')
    } catch (requestError) { setError(requestError.message) }
  }

  async function renameItem(item, name) {
    if (protectedFolder(item)&&!isMainAdmin(user()))return
    const cleanName = name.trim()
    setRename(null)
    if (!cleanName || cleanName === item.name) return
    setBusy(true); setError('')
    try {
      if (item.itemType === 'FOLDER') await categoryMutation.mutateAsync({ mode: 'edit', category: item, values: { name: cleanName } })
      else if (item.itemType === 'DATA') await api(`/admin/data/collections/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: cleanName }) })
      else await api(`/admin/documents/${item.id}`, { method: 'PATCH', body: JSON.stringify({ title: cleanName }) })
      await refresh(); setNotice('Renamed successfully')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function move(item, targetFolderId) {
    if(protectedFolder(item)||!targetFolderId)throw new Error('Main folders are protected; select a child destination')
    if (item.itemType === 'FOLDER') return categoryMutation.mutateAsync({ mode: 'move', category: item, values: { parentId: targetFolderId || null } })
    if (!targetFolderId) throw new Error('Data နှင့် Document ကို Home root သို့ မရွှေ့နိုင်ပါ။ Folder တစ်ခုရွေးပါ။')
    if (item.itemType === 'DATA') return api(`/admin/data/collections/${item.id}`, { method: 'PATCH', body: JSON.stringify({ categoryId: targetFolderId }) })
    return api(`/admin/documents/${item.id}`, { method: 'PATCH', body: JSON.stringify({ categoryId: targetFolderId }) })
  }

  async function confirmMove(targetFolderId, items = moveItems || []) {
    setBusy(true); setError('')
    try {
      for (const item of items) await move(item, targetFolderId)
      setMoveItems(null); cutController.current.clear(); setCutItems([]); setSelection(new Set()); await refresh(); setNotice('Items moved successfully')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function pasteCut(targetFolderId) {
    setBusy(true); setError('')
    try {
      const pasted = await cutController.current.paste(targetFolderId, async (items, destination) => {
        for (const item of items) await move(item, destination)
      })
      if (!pasted.length) return
      setCutItems([]); setSelection(new Set()); await refresh(); setNotice('Items moved successfully')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  function startRename(item) {
    const target = item || selectedItems[0]
    if (!target || (protectedFolder(target)&&!isMainAdmin(user())) || (!item && selectedItems.length > 1)) return
    renameBlurAction.current = ''
    setMenu(null); setRename({ key: itemKey(target), name: target.name, item: target })
  }

  function cut(items = selectedItems) {
    if (!items.length || items.some(protectedFolder)) return
    cutController.current.set(items); setCutItems(items); setMenu(null); setNotice(`${items.length} item cut — destination Folder တွင် Ctrl + V နှိပ်ပါ`)
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !uploadFolderId) return
    setError('')
    const operationKey=crypto.randomUUID()
    if (file.name.toLocaleLowerCase().endsWith('.xlsx')) setUpload({mode:'excel',file,job:null,collectionName:file.name.replace(/\.xlsx$/i,''),accessLevel:inputLevels().at(-1)||'V4',sheetName:'',operationKey})
    else if (/\.(pdf|jpe?g)$/i.test(file.name)) setUpload({mode:'document',file,title:file.name.replace(/\.(pdf|jpe?g)$/i,''),accessLevel:inputLevels().at(-1)||'V4',operationKey})
    else setError('Only .xlsx, PDF and JPG files are supported')
  }

  function requestAddFile(explicitFolderId = null) {
    return exitTrashThen(setTrashMode, () => {
      const selectedFolder = selectedItems.length === 1 && selectedItems[0].itemType === 'FOLDER' ? selectedItems[0].id : null
      const targetFolderId = explicitFolderId || selectedFolderId || selectedFolder
      if (!targetFolderId) { setNotice('ဖိုင်ထည့်မည့် Folder ကို အရင်ရွေးပါ'); return }
      setUploadFolderId(targetFolderId)
      fileInput.current?.click()
    })
  }

  function requestMove() {
    if (selectedItems.some(protectedFolder)) {setNotice('Main folders cannot be moved');return}
    if (!selectedItems.length) { setNotice('ရွှေ့လိုသည့် item ကို အရင်ရွေးပါ'); return }
    setMoveItems(selectedItems)
  }

  async function moveToTrash(item) {
    if(protectedFolder(item))return
    setBusy(true); setError('')
    try {
      const path = item.itemType === 'FOLDER' ? `/admin/categories/${item.id}/archive` : item.itemType === 'DATA' ? `/admin/data/collections/${item.id}/archive` : `/admin/documents/${item.id}/archive`
      await api(path, { method: 'POST' })
      setDeleteItem(null); setSelection(new Set()); await refresh(); setNotice('Moved to Recently Deleted')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function restoreTrashItem(item) {
    setBusy(true); setError('')
    try {
      await api(`/admin/trash/${item.itemType.toLowerCase()}/${item.id}/restore`, { method: 'POST' })
      setTrashRevision(value => value + 1); await refresh(); setNotice('Item restored')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  async function purgeTrashItem(item) {
    setBusy(true); setError('')
    try {
      await api(`/admin/trash/${item.itemType.toLowerCase()}/${item.id}`, { method: 'DELETE' })
      setDeleteItem(null); setTrashRevision(value => value + 1); await refresh(); setNotice('Item permanently deleted')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  useEffect(() => {
    const keydown = event => {
      if (isEditingTarget(event.target)) return
      const command = event.ctrlKey || event.metaKey
      if (command && event.shiftKey && event.key.toLocaleLowerCase() === 'n') { event.preventDefault(); if (canManage) beginNewFolder() }
      else if (command && event.key.toLocaleLowerCase() === 'a') { event.preventDefault(); setSelection(new Set(visibleItems.map(itemKey))) }
      else if (command && event.key.toLocaleLowerCase() === 'x') { event.preventDefault(); cut() }
      else if (command && event.key.toLocaleLowerCase() === 'v') { event.preventDefault(); pasteCut(selectedFolderRef.current) }
      else if (event.key === 'F2') { event.preventDefault(); startRename() }
      else if (event.key === 'Enter' && selectedItems.length === 1) { event.preventDefault(); openItem(selectedItems[0]) }
      else if (event.key === 'Escape') { newFolderBlurAction.current = 'cancel'; renameBlurAction.current = 'cancel'; setSelection(new Set()); cutController.current.clear(); setCutItems([]); setMenu(null); setNewFolder(false); setRename(null) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const loading = treeQuery.isLoading || (selectedFolderId && contentsQuery.isLoading)
  const pageError = treeQuery.error || contentsQuery.error
  return <section className="file-manager" onClick={() => setMenu(null)}>
    <aside className="fm-sidebar">
      <h2>Folders</h2>
      <div className={`fm-tree-row home ${selectedFolderId === null ? 'selected' : ''}`}><span className="fm-tree-spacer" /><button className="fm-tree-name" onClick={() => navigateToFolder(null)}><HomeRounded /><span>Home</span></button></div>
      <div className="fm-tree-scroll">
        {treeQuery.isLoading ? <div className="fm-tree-loading"><i /><i /><i /><i /></div> : tree.length ? <FolderTree nodes={tree} selectedId={selectedFolderId} expanded={displayedExpanded} onToggle={toggleTree} onSelect={navigateToFolder} onContext={openTreeMenu} /> : <p className="fm-empty-tree">Folder မရှိသေးပါ</p>}
      </div>
    </aside>

    <main className="fm-main">
      <div className="fm-toolbar">
        <div className="fm-toolbar-primary">
          <button className="primary" onClick={() => beginNewFolder()} disabled={!canManage||!selectedFolderId}><CreateNewFolderOutlined />New Folder<KeyboardArrowDownRounded /></button>
          <button onClick={() => requestAddFile()} disabled={!canManage || busy}><UploadFileRounded />Add File<KeyboardArrowDownRounded /></button>
          <input ref={fileInput} type="file" accept=".xlsx,.pdf,.jpg,.jpeg" onChange={chooseFile} hidden />
          <button onClick={requestMove} disabled={!canManage || trashMode || selectedItems.some(protectedFolder)}><DriveFileMoveOutlined />Move to</button>
          <button className={trashMode ? 'active' : ''} onClick={toggleTrash} disabled={!canManage}><HistoryRounded />Recently Deleted</button>
        </div>
        <div className="fm-toolbar-tools">
          <label className="fm-search"><SearchRounded /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search in this folder…" /></label>
          <label className="fm-sort"><SortRounded /><span>Sort</span><select value={sortBy} onChange={event => setSortBy(event.target.value)} aria-label="Sort items"><option value="name">Name</option><option value="type">Type</option><option value="updated">Last Modified</option></select><KeyboardArrowDownRounded /></label>
          <div className="fm-view-toggle"><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><ViewListRounded /></button><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><GridViewRounded /></button></div>
        </div>
      </div>

      <div className="fm-content" onClick={event => event.target === event.currentTarget && setSelection(new Set())}>
        {error && <div className="fm-inline-error" role="alert"><span>{error}</span><button onClick={() => setError('')}><CloseRounded /></button></div>}
        {trashMode ? <div className="fm-trash-workspace" aria-label="Recently Deleted">
          <div className="fm-trash-heading"><div><HistoryRounded /><span><b>Recently Deleted</b><small>Items are permanently removed 30 days after deletion.</small></span></div></div>
          {view === 'list' && !trash.loading && !trash.error && <div className="fm-list fm-trash-list" role="grid"><div className="fm-list-head" role="row"><span>Name</span><span>Type</span><span>Original Location</span><span>Deleted</span><span>Auto Delete</span><span>Actions</span></div>{visibleTrash.map(item => {
              const iconType = item.itemType === 'DOCUMENT' ? (item.typeLabel === 'PDF' ? 'PDF' : 'IMAGE') : item.itemType
              return <div className="fm-row" role="row" key={`${item.itemType}:${item.id}`}><span className="fm-name-cell"><span className={`fm-item-icon ${iconType.toLowerCase()}`}><ItemIcon type={iconType} /></span><b>{item.name}</b></span><span><em className={`fm-type ${iconType.toLowerCase()}`}>{item.typeLabel}</em></span><span title={item.originalLocation}>{item.originalLocation}</span><span>{formatDate(item.archivedAt)}</span><span>{formatDate(item.autoDeleteAt)}</span><span className="fm-trash-actions"><button onClick={() => restoreTrashItem(item)} disabled={busy} title="Restore"><RestoreFromTrashRounded /></button><button onClick={() => setDetailsItem(item)} disabled={busy} title="Details"><InfoOutlined /></button><button className="danger" onClick={() => setDeleteItem({ ...item, permanent: true })} disabled={busy} title="Delete permanently"><DeleteOutlineRounded /></button></span></div>
            })}</div>}
          {view === 'grid' && !trash.loading && !trash.error && <div className="fm-grid fm-trash-grid">{visibleTrash.map(item => {
              const iconType = item.itemType === 'DOCUMENT' ? (item.typeLabel === 'PDF' ? 'PDF' : 'IMAGE') : item.itemType
              return <article className="fm-trash-card" key={`${item.itemType}:${item.id}`}><span className={`fm-item-icon ${iconType.toLowerCase()}`}><ItemIcon type={iconType} /></span><div><b>{item.name}</b><small>{item.typeLabel} · {item.originalLocation}</small><small>Auto delete {formatDate(item.autoDeleteAt)}</small></div><span className="fm-trash-actions"><button onClick={() => restoreTrashItem(item)} disabled={busy} title="Restore"><RestoreFromTrashRounded /></button><button onClick={() => setDetailsItem(item)} disabled={busy} title="Details"><InfoOutlined /></button><button className="danger" onClick={() => setDeleteItem({ ...item, permanent: true })} disabled={busy} title="Delete permanently"><DeleteOutlineRounded /></button></span></article>
            })}</div>}
          {trash.loading ? <div className="fm-list-loading"><i /><i /><i /></div> : trash.error ? <div className="fm-state error"><InfoOutlined /><b>Recently Deleted မဖွင့်နိုင်ပါ</b><span>{trash.error}</span><button onClick={() => setTrashRevision(value => value + 1)}>Try again</button></div> : null}
          {!trash.loading && !trash.error && !visibleTrash.length && <div className="fm-state"><RestoreFromTrashRounded /><b>Recently Deleted is empty</b><span>Deleted items will appear here for 30 days.</span></div>}
        </div> : pageError ? <div className="fm-state error"><InfoOutlined /><b>Folder contents မဖွင့်နိုင်ပါ</b><span>{pageError.message}</span><button onClick={() => { treeQuery.refetch(); contentsQuery.refetch() }}>Try again</button></div>
          : loading ? <div className="fm-list-loading"><i /><i /><i /><i /><i /></div>
            : view === 'list' ? <div className="fm-list" role="grid" aria-label="Current folder contents">
              <div className="fm-list-head" role="row"><span>Name</span><span>Type</span><span>Size / Records</span><span>Last Modified</span><span>Modified By</span><span /></div>
              {newFolder && <div className="fm-row editing"><span className="fm-name-cell"><span className="fm-item-icon folder"><FolderRounded /></span><input value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); newFolderBlurAction.current = 'save'; createFolder() } if (event.key === 'Escape') { newFolderBlurAction.current = 'cancel'; setNewFolder(false) } }} onBlur={() => { if (newFolderBlurAction.current) { newFolderBlurAction.current = ''; return } createFolder() }} autoFocus placeholder="New folder" /></span><span>Folder</span><span>0 items</span><span>—</span><span>{user().name || 'Administrator'}</span><span /></div>}
              {visibleItems.map(item => {
                const key = itemKey(item); const selected = selection.has(key); const editing = rename?.key === key
                return <div className={`fm-row ${selected ? 'selected' : ''} ${cutKeys.has(key) ? 'cut' : ''}`} role="row" tabIndex={0} key={key} onClick={event => selectItem(event, item)} onDoubleClick={() => openItem(item)} onContextMenu={event => openMenu(event, item)}>
                  <span className="fm-name-cell"><span className={`fm-item-icon ${item.itemType.toLowerCase()}`}><ItemIcon type={item.itemType} /></span>{editing ? <input value={rename.name} onChange={event => setRename(current => ({ ...current, name: event.target.value }))} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Enter') { renameBlurAction.current = 'save'; renameItem(item, rename.name) } if (event.key === 'Escape') { renameBlurAction.current = 'cancel'; setRename(null) } }} onBlur={() => { if (renameBlurAction.current) { renameBlurAction.current = ''; return } renameItem(item, rename.name) }} autoFocus /> : <b>{item.name}</b>}</span>
                  <span><em className={`fm-type ${item.itemType.toLowerCase()}`}>{item.typeLabel}</em></span><span>{item.sizeLabel}</span><span>{formatDate(item.updatedAt)}</span><span>{item.modifiedBy}</span>
                  <span><button className="fm-kebab" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); openMenu({ ...event, clientX: rect.right - 8, clientY: rect.bottom + 4, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() }, item) }} aria-label={`${item.name} actions`}><MoreVertRounded /></button></span>
                </div>
              })}
              {!newFolder && !visibleItems.length && <div className="fm-state"><ItemIcon type="FOLDER" open /><b>This folder is empty</b><span>New Folder ဖန်တီးပါ သို့မဟုတ် File ထည့်ပါ</span></div>}
            </div> : <div className="fm-grid">
              {newFolder && <article className="fm-grid-card editing"><span className="fm-item-icon folder"><FolderRounded /></span><input value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { newFolderBlurAction.current = 'save'; createFolder() } if (event.key === 'Escape') { newFolderBlurAction.current = 'cancel'; setNewFolder(false) } }} onBlur={() => { if (newFolderBlurAction.current) { newFolderBlurAction.current = ''; return } createFolder() }} autoFocus placeholder="New folder" /></article>}
              {visibleItems.map(item => { const key = itemKey(item); return <article key={key} className={`fm-grid-card ${selection.has(key) ? 'selected' : ''} ${cutKeys.has(key) ? 'cut' : ''}`} onClick={event => selectItem(event, item)} onDoubleClick={() => openItem(item)} onContextMenu={event => openMenu(event, item)}><span className={`fm-item-icon ${item.itemType.toLowerCase()}`}><ItemIcon type={item.itemType} /></span><div>{rename?.key === key ? <input value={rename.name} onChange={event => setRename(current => ({ ...current, name: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') { renameBlurAction.current = 'save'; renameItem(item, rename.name) } if (event.key === 'Escape') { renameBlurAction.current = 'cancel'; setRename(null) } }} onBlur={() => { if (renameBlurAction.current) { renameBlurAction.current = ''; return } renameItem(item, rename.name) }} autoFocus /> : <b>{item.name}</b>}<small>{item.typeLabel} · {item.sizeLabel}</small></div><button className="fm-kebab" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); openMenu({ ...event, clientX: rect.right - 8, clientY: rect.bottom + 4, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() }, item) }}><MoreVertRounded /></button></article>})}
            </div>}
      </div>
      <footer className="fm-status"><span>{trashMode ? visibleTrash.length : visibleItems.length} item{(trashMode ? visibleTrash.length : visibleItems.length) === 1 ? '' : 's'}{!trashMode && selection.size ? ` · ${selection.size} selected` : ''}</span>{!trashMode && <div><span><kbd>Ctrl + A</kbd> Select all</span><span><kbd>Ctrl + X</kbd> Cut</span><span><kbd>Ctrl + V</kbd> Paste (Move)</span><span><kbd>Ctrl + Shift + N</kbd> New Folder</span><span><kbd>F2</kbd> Rename</span><span><kbd>Enter</kbd> Open</span></div>}</footer>
    </main>

    {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} onOpen={() => openItem(menu.item)} onNewFolder={() => beginNewFolder(menu.item.id)} onAddFile={() => { setMenu(null); requestAddFile(menu.item.id) }} onRename={() => { if (menu.fromTree) navigateToFolder(menu.item.parentId || null); startRename(menu.item) }} onMove={() => { if(!protectedFolder(menu.item))setMoveItems(menu.fromTree || !selection.has(itemKey(menu.item)) ? [menu.item] : selectedItems); setMenu(null) }} onCut={() => cut(menu.fromTree || !selection.has(itemKey(menu.item)) ? [menu.item] : selectedItems)} onDetails={() => { setDetailsItem(menu.item); setMenu(null) }} onDelete={() => { if(!protectedFolder(menu.item))setDeleteItem(menu.item); setMenu(null) }} />}
    {moveItems && <MoveDialog items={moveItems} tree={tree} onClose={() => { setMoveItems(null); setError('') }} onConfirm={confirmMove} busy={busy} error={error} />}
    {detailsItem && <DetailsDialog item={detailsItem} location={detailsItem.originalLocation || location} onClose={() => setDetailsItem(null)} />}
    {deleteItem && <DeleteDialog item={deleteItem} permanent={deleteItem.permanent} busy={busy} error={error} onClose={() => { setDeleteItem(null); setError('') }} onConfirm={() => deleteItem.permanent ? purgeTrashItem(deleteItem) : moveToTrash(deleteItem)} />}
    {upload && <UploadDialog upload={upload} setUpload={setUpload} folderId={uploadFolderId} folderName={flattenCategories(tree).find(folder => folder.id === uploadFolderId)?.name || 'Selected folder'} onDone={async () => { await refresh(); setNotice('File added successfully') }} />}
    {notice && <div className="fm-toast">{notice}</div>}
  </section>
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
