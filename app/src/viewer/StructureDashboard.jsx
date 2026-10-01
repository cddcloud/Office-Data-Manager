import { useState } from 'react'
import FolderHoverMenu from './FolderHoverMenu.jsx'
import './strategy-dashboard.css'
import './structure-dashboard.css'

export default function StructureDashboard({ root, folder, ancestors, error, onSelect, onBack, onRefresh, accountHeader }) {
  const [ongoing, setOngoing] = useState(false)
  return <section className="strategy-dashboard structure-dashboard" aria-label={root.name}>
    {accountHeader && <div className="strategy-account-header">{accountHeader}</div>}
    <header className="strategy-page-header"><button aria-label="Back to Dashboard" onClick={onBack}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"/></svg></button><h1>{root.name}</h1><span aria-hidden="true"/></header>
    <div className="structure-content">
      <div className="structure-card-row">
        <div className="strategy-ongoing" onPointerEnter={() => setOngoing(true)} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setOngoing(false) }}>
          <button className="strategy-card" aria-describedby={ongoing ? 'structure-ongoing-note' : undefined} onClick={() => setOngoing(true)} onFocus={() => setOngoing(true)} onBlur={() => setOngoing(false)} onKeyDown={event => { if (event.key === 'Escape') setOngoing(false) }}>NUG တစ်စုံလုံး</button>
          {ongoing && <div id="structure-ongoing-note" className="strategy-ongoing-note" role="status"><i/>လုပ်ဆောင်ဆဲ</div>}
        </div>
        <FolderHoverMenu nodes={root.children} selectedId={folder.id} onSelect={onSelect} label={<span>ဝန်ကြီးဌာန / ရုံး၊ ကော်မတီ၊ လုပ်ငန်းအဖွဲ့အလိုက်<br/>ဖွဲ့စည်းပုံနှင့်အင်အား</span>}/>
        <div className="structure-ongoing-card"><span className="structure-status-dot"/><h2>ဆောင်ရွက်ဆဲ</h2></div>
      </div>
      {folder.id !== root.id && <section className="structure-selected" aria-label="Selected tab">
        <nav className="structure-breadcrumbs" aria-label="Structure breadcrumbs">{ancestors.map(node => <button key={node.id} onClick={() => onSelect(node.id)}>{node.name}</button>)}</nav>
        <h2>{folder.name}</h2><p role="status">ဆောင်ရွက်ဆဲ</p>
      </section>}
      {error && <p className="strategy-error" role="alert">{error} <button onClick={onRefresh}>ပြန်စမ်းရန်</button></p>}
    </div>
  </section>
}
