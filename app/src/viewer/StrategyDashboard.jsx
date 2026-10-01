import { useState } from 'react'
import WorkspaceIcon from '../shared/WorkspaceIcon.jsx'
import FolderHoverMenu from './FolderHoverMenu.jsx'
import './strategy-dashboard.css'

function StrategyPair({ group, folder, onSelect }) {
  const [ongoing, setOngoing] = useState(false)
  const noteId = `strategy-ongoing-${group.id}`
  const policy = group.children?.find(node => node.sortOrder === 1)
  const ministry = group.children?.find(node => node.sortOrder === 2)
  return <section className="strategy-set" aria-label={group.name}>
    <div className="strategy-cards">
      {policy && <div className="strategy-ongoing" onPointerEnter={() => setOngoing(true)} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setOngoing(false) }}>
        <button className="strategy-card" aria-describedby={ongoing ? noteId : undefined} onClick={() => setOngoing(true)} onFocus={() => setOngoing(true)} onBlur={() => setOngoing(false)} onKeyDown={event => { if (event.key === 'Escape') setOngoing(false) }}><span>{policy.name}<small>({group.name})</small></span></button>
        {ongoing && <div id={noteId} className="strategy-ongoing-note" role="status"><i/>ဆောင်ရွက်ဆဲ</div>}
      </div>}
      {ministry && <FolderHoverMenu nodes={ministry.children} maxDepth={1} selectedId={folder.id} onSelect={onSelect} label={<span>{ministry.name.startsWith('ဝန်ကြီးဌာနအလိုက် ') ? <>ဝန်ကြီးဌာနအလိုက်<br/>{ministry.name.slice('ဝန်ကြီးဌာနအလိုက် '.length)}</> : ministry.name}<small>({group.name})</small></span>}/>}
    </div>
  </section>
}

export default function StrategyDashboard({ root, folder, ancestors, documents, busy, error, onSelect, onBack, onPreview, onDownload, onMore, onRefresh, accountHeader }) {
  const selected = folder.id !== root.id
  return <section className="strategy-dashboard strategy-classified" aria-label={root.name}>
    {accountHeader && <div className="strategy-account-header">{accountHeader}</div>}
    <header className="strategy-page-header"><button aria-label="Back to Dashboard" onClick={onBack}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"/></svg></button><h1>{root.name}</h1><span aria-hidden="true"/></header>
    <div className="strategy-content">
      <div className="strategy-sets">{(root.children || []).map(group => <StrategyPair key={group.id} group={group} folder={folder} onSelect={onSelect}/>)}</div>
      {error && <p className="strategy-error" role="alert">{error} <button onClick={onRefresh}>ပြန်စမ်းရန်</button></p>}
      {selected && <section className="strategy-files" aria-label="ဌာနဖိုင်များ" aria-busy={busy}>
        <nav className="strategy-breadcrumbs" aria-label="Strategy breadcrumbs">{ancestors.map(node => <button key={node.id} onClick={() => onSelect(node.id)}>{node.name}</button>)}</nav>
        <div className="strategy-files-heading"><div><span>PDF / JPG</span><h2>{folder.name}</h2></div><button className="strategy-refresh" aria-label="Refresh files" onClick={onRefresh}>Refresh</button></div>
        {busy && <p role="status">ဖိုင်များ ရယူနေသည်…</p>}
        <div className="strategy-file-grid">{documents.data.map(file => <article key={file.id} className="strategy-file"><span className={`strategy-file-icon ${file.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`}><WorkspaceIcon name="file"/></span><div><span className="strategy-file-type">{file.mimeType === 'application/pdf' ? 'PDF' : 'JPG'}</span><h3><button onClick={() => onPreview(file.id)}>{file.title}</button></h3><p>{file.fileName}</p></div><div className="strategy-file-actions"><button onClick={() => onPreview(file.id)}>Preview</button><button aria-label={`Download ${file.title}`} onClick={() => onDownload(file)}><WorkspaceIcon name="download"/></button></div></article>)}</div>
        {!busy && !error && !documents.data.length && <div className="strategy-empty"><WorkspaceIcon name="file"/><p>ဤဌာနတွင် PDF / JPG ဖိုင် မရှိသေးပါ။</p></div>}
        {documents.meta.nextCursor && <button className="strategy-load-more" disabled={busy} onClick={onMore}>ဖိုင်များ ထပ်ပြရန်</button>}
      </section>}
    </div>
  </section>
}
