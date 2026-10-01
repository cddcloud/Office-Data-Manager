import { useEffect, useMemo, useState } from 'react'
import Login from './auth/LoginForm.jsx'
import Categories from './categories/Categories.jsx'
import { DataRecordsPage } from './records/FilteredModules.jsx'
import { api, bootstrapSession, getUser, logout as clearSession, subscribeSessionExpired } from './api.js'
import AccountsAccess from './accounts/AccountsAccess.jsx'
import ProductionDashboard from './viewer/ProductionDashboard.jsx'
import WorkflowHeader from './shared/WorkflowHeader.jsx'
import { canManageUsers, isContentAdmin } from './shared/access.js'
import { useQueryClient } from '@tanstack/react-query'
import AccountLinkPage from './accounts/AccountLinkPage.jsx'
import { adminNavigation } from './admin-navigation.js'
import './App.css'
import './presentation.css'
import './presentation-polish.css'
import './meeting-dashboard.css'
import './overlay-drawer.css'
import './reference-dashboard.css'
import './records-explorer.css'

const records = [
  ['၀၉ စက်တင်ဘာ ၂၀၂၆','ဘဏ္ဍာရေးဌာန','FIN-2609-041','နှစ်ကုန်ဘတ်ဂျက်သုံးသပ်ချက်','ဘတ်ဂျက်','ဆောင်ရွက်ရန်ကျန်','September_Report.xlsx'],
  ['၀၈ စက်တင်ဘာ ၂၀၂၆','လူ့စွမ်းအားဌာန','HR-2609-118','ဝန်ထမ်းသင်တန်းအစီအစဉ်','ဝန်ထမ်းရေးရာ','ပြီးစီးပြီး','September_Report.xlsx'],
  ['၀၈ စက်တင်ဘာ ၂၀၂၆','အုပ်ချုပ်ရေးဌာန','ADM-2609-207','လစဉ်အုပ်ချုပ်ရေးအစီရင်ခံစာ','အစီရင်ခံစာ','ဆောင်ရွက်ဆဲ','September_Report.xlsx'],
  ['၀၅ စက်တင်ဘာ ၂၀၂၆','စီမံကိန်းဌာန','PLN-2609-033','သုံးလပတ်စီမံကိန်းအစီရင်ခံစာ','စီမံကိန်း','ပြီးစီးပြီး','September_Report.xlsx'],
  ['၀၄ စက်တင်ဘာ ၂၀၂၆','လုပ်ငန်းဌာန','OPS-2609-092','ယာဉ်ပြုပြင်ထိန်းသိမ်းမှု','လုပ်ငန်း','ဆောင်ရွက်ရန်ကျန်','September_Report.xlsx'],
  ['၀၂ စက်တင်ဘာ ၂၀၂၆','ဘဏ္ဍာရေးဌာန','FIN-2609-038','လစဉ်အသုံးစရိတ်အစီရင်ခံစာ','အစီရင်ခံစာ','ပြီးစီးပြီး','August_Office_Return.xlsx'],
]
const imports=[['September_Report.xlsx','၀၉ စက်တင်ဘာ ၂၀၂၆','၂၅၀','အတည်ပြုပြီး'],['August_Office_Return.xlsx','၃၁ ဩဂုတ် ၂၀၂၆','၁၉၈','အတည်ပြုပြီး'],['Q3_Activity_Register.xlsx','၀၁ ဇူလိုင် ၂၀၂၆','၃၁၂','အတည်ပြုပြီး']]
const nav=adminNavigation
function Badge({children}){return <span className={'badge '+children.replaceAll(' ','-')}>{children}</span>}
function App(){
  const route=window.location.pathname
  if(route==='/account/setup')return <AccountLinkPage mode="setup"/>
  if(route==='/account/reset')return <AccountLinkPage mode="reset"/>
  return <WorkspaceApp/>
}
function WorkspaceApp(){
  const [user,setUser]=useState(()=>getUser())
  const [checkingSession,setCheckingSession]=useState(true)
  const [page,setPage]=useState(()=>window.location.pathname==='/dashboard/demo'?'preview':window.location.pathname.startsWith('/manage/')?window.location.pathname.split('/')[2]:'dashboard')
  const [target,setTarget]=useState(null)
  const [referenceAllowed,setReferenceAllowed]=useState(false)
  const [referenceError,setReferenceError]=useState('')
  const queryClient=useQueryClient()
  const [search,setSearch]=useState('')
  const [published,setPublished]=useState(true)
  const [presentation,setPresentation]=useState(false)
  const [categoryFilter,setCategoryFilter]=useState(null)
  const [collectionFilter,setCollectionFilter]=useState(null)
  const filtered=useMemo(()=>records.filter(r=>r.join(' ').toLowerCase().includes(search.toLowerCase())),[search])
  const enter=()=>{setPresentation(true);document.documentElement.requestFullscreen?.().catch(()=>{})}
  const leave=()=>{document.exitFullscreen?.().catch(()=>{});setPresentation(false);setPage('dashboard');window.history.pushState({},'', '/dashboard')}
  const choosePage=(id)=>{setPresentation(false);setPage(id);window.history.pushState({},'',id==='dashboard'?'/dashboard':id==='preview'?'/dashboard/demo':`/manage/${id}`)}
  const notifyTarget=notice=>{setTarget(notice);choosePage('dashboard')}
  const navItems=(items)=>items.filter(([id])=>!['accounts','preview'].includes(id)||canManageUsers(user)).map(([id,label,icon])=><button className={page===id?'active':''} onClick={()=>choosePage(id)} key={id} title={label}><em>{icon}</em><span className="nav-label">{label}</span></button>)
  useEffect(()=>{let active=true;bootstrapSession().then(next=>{if(active)setUser(next)}).finally(()=>{if(active)setCheckingSession(false)});return()=>{active=false}},[])
  useEffect(()=>subscribeSessionExpired(()=>{queryClient.clear();setUser(null)}),[queryClient])
  useEffect(()=>{const change=()=>{const path=window.location.pathname;setPage(path==='/dashboard/demo'?'preview':path.startsWith('/manage/')?path.split('/')[2]:'dashboard')};window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change)},[])
  useEffect(()=>{let active=true;setReferenceAllowed(false);setReferenceError('');if(user&&canManageUsers(user)&&(page==='preview'||presentation))api('/dashboard/reference-access').then(()=>active&&setReferenceAllowed(true)).catch(error=>active&&setReferenceError(error.message));return()=>{active=false}},[user,page,presentation])
  if(checkingSession)return <main className="login"><div className="login-card"><div className="logo">GO</div><p>Session ကို စစ်ဆေးနေသည်...</p></div></main>
  if(!user)return <Login onLogin={setUser}/>
  const signOut=()=>{queryClient.clear();setUser(null);void clearSession()}
  if(user.workflowReady===false)return <main className="login"><section className="login-card"><h1>Login ဝင်ပြီးပါပြီ</h1><p>{user.name} · {user.email}</p><p>လက်ရှိ database ကို workflow အသစ်သို့ မပြောင်းရသေးပါ။ Legacy account/content access levels နှင့် ရှိပြီးသား Main Folder IDs များအတွက် approved mapping လိုအပ်နေသောကြောင့် content pages များကို ယာယီပိတ်ထားပါသည်။</p><p>ရှိပြီးသား password နှင့် data များကို မပြောင်းထားပါ။</p><button onClick={()=>window.location.reload()}>ပြန်စစ်ရန်</button><button onClick={signOut}>Logout</button></section></main>
  if(!isContentAdmin(user)){if(!['/','/dashboard'].includes(window.location.pathname))return <main className="workflow-dashboard"><p role="alert">ဤ Management page ကို ဝင်ရောက်ခွင့်မရှိပါ။</p><button onClick={()=>choosePage('dashboard')}>Open Dashboard</button></main>;return <ProductionDashboard user={user} onLogout={signOut} target={target}/>}
  if(['accounts','preview'].includes(page)&&!canManageUsers(user))return <main className="workflow-dashboard"><p role="alert">ဤ page ကို ဝင်ရောက်ခွင့်မရှိပါ။</p><button onClick={()=>choosePage('dashboard')}>Open Dashboard</button></main>
  if(presentation||page==='preview')return referenceAllowed?<><div className="demo-reference-label">Demo / Design Reference — sample values only <button onClick={leave}>Back to Dashboard</button></div><Dashboard published={published} onBack={leave}/></>:referenceError?<p role="alert">{referenceError} <button onClick={leave}>Back to Dashboard</button></p>:<p role="status">Checking reference access…</p>
  if(page==='dashboard')return <ProductionDashboard user={user} onLogout={signOut} onBack={()=>choosePage('categories')} target={target}/>
  return <div className="app drawer-shell">
    <aside className="temporary-drawer" aria-label="ပင်မလမ်းညွှန်">
      <div className="drawer-brand"><div className="drawer-mark">▤</div><div className="drawer-brand-copy"><b>အစိုးရရုံး အချက်အလက်စနစ်</b><small>Government Data Management System</small></div></div>
      <div className="drawer-nav-groups">
        <div className="drawer-section"><span className="drawer-section-title">အနှစ်ချုပ်</span><nav>{navItems(nav.slice(0,1))}</nav></div>
        <div className="drawer-section"><span className="drawer-section-title">ဒေတာစီမံခန့်ခွဲမှု</span><nav>{navItems(nav.slice(1,3))}</nav></div>
        <div className="drawer-section"><span className="drawer-section-title">စနစ်စီမံခန့်ခွဲမှု</span><nav>{navItems(nav.slice(3,6))}</nav></div>
      </div>
      <div className="side-foot"><button onClick={()=>{setUser(null);void clearSession()}} title="Logout"><em>↩</em><span className="foot-label">Logout</span></button><small>ဗားရှင်း 1.0.0<br/>© ၂၀၂၆ အစိုးရ အချက်အလက်စနစ်</small></div>
    </aside>
    <main className="main">
      <header className="workspace-header"><div className="header-page-title"><span>{nav.find(n=>n[0]===page)?.[1]}</span></div><WorkflowHeader user={user} onLogout={signOut} onTarget={notifyTarget}/></header>
      {!['entry','categories','accounts','dashboard'].includes(page)&&<div className="page-context"><small>Workspace / {nav.find(n=>n[0]===page)?.[1]}</small><h2>{nav.find(n=>n[0]===page)?.[1]}</h2></div>}
      {page==='dashboard'&&<ProductionDashboard embedded user={user} onLogout={signOut} target={target}/>}
      {page==='overview'&&<Overview go={setPage}/>}
      {page==='categories'&&<Categories onViewData={(categoryId,collectionId)=>{setCategoryFilter(categoryId);setCollectionFilter(collectionId);setPage('entry')}}/>}
      {page==='entry'&&<DataRecordsPage categoryId={categoryFilter} dataCollectionId={collectionFilter} onOpenCollection={setCollectionFilter} onClearCollection={()=>setCollectionFilter(null)}/>} {page==='activity'&&<Activity/>}
      {page==='accounts'&&<AccountsAccess user={user}/>} {page==='preview'&&<Preview published={published} setPublished={setPublished} open={enter}/>}
    </main>
  </div>
}
function Kpi({label,value}){return <div className="kpi"><span>{label}</span><b>{value}</b><small>ယနေ့အထိ</small></div>}
function Overview(){
  const recentFiles=[
    ['2026 Budget.xlsx','ဘဏ္ဍာရေးဌာန','1,240','အောင်မြင်','16 Sep 2026\n09:32','Admin A'],
    ['Department Data.xlsx','အုပ်ချုပ်ရေးဌာန','328','အောင်မြင်','15 Sep 2026\n16:20','Admin A'],
    ['Project Monitoring.xlsx','စီမံကိန်းဌာန','860','အောင်မြင်','14 Sep 2026\n10:15','Admin A'],
    ['Facility List.xlsx','ရုံးပိုင်ပစ္စည်းများ','542','သတိပေးချက်','13 Sep 2026\n14:22','Admin B'],
    ['Invalid Format.xlsx','-','0','မအောင်မြင်','12 Sep 2026\n11:03','Admin A']
  ]
  const activity=[
    ['Admin A','မှတ်တမ်း ပြင်ဆင်ခဲ့သည်','ဒေတာများ','16 Sep 10:32','✎'],
    ['Admin A','Excel ဖိုင်တင်သွင်းခဲ့သည်','Excel တင်သွင်း','16 Sep 09:15','↥'],
    ['Admin B','ဒေတာအစု အသစ်ဖန်တီးခဲ့သည်','ဒေတာအစုများ','15 Sep 16:20','●'],
    ['Admin B','Viewer အသုံးပြုသူ ထည့်ခဲ့သည်','အသုံးပြုသူများ','15 Sep 14:10','♟'],
    ['Admin A','စာရွက်စာတမ်း တင်ခဲ့သည်','စာရွက်စာတမ်းများ','14 Sep 11:45','▣']
  ]
  return <section className="page reference-overview">
    <div className="welcome-strip"><div><h1>မင်္ဂလာပါ အက်မင် အေ</h1><p>ယနေ့ လုပ်ဆောင်ရမည့်အရာများကို အောက်တွင် ကြည့်ရှုနိုင်ပါသည်။</p></div><div className="date-chip"><span>▣</span><b>၂၀၂၆ ခုနှစ် စက်တင်ဘာ ၁၆ ရက်<small>အင်္ဂါနေ့</small></b></div><blockquote>“ စနစ်တကျသော ဒေတာစီမံခန့်ခွဲမှု<br/>ဖွံ့ဖြိုးတိုးတက်သော ပြည်သူ့ဝန်ဆောင်မှု ”</blockquote></div>
    <div className="reference-kpis">
      {[['▰','ကဏ္ဍများစုစုပေါင်း','128','blue'],['●','ဒေတာအစုများ','42','green'],['▤','ဒေတာမှတ်တမ်းများ','18,420','orange'],['▣','စာရွက်စာတမ်းများ','864','purple']].map(([icon,label,value,tone])=><article className={'reference-kpi '+tone} key={label}><i>{icon}</i><div><span>{label}</span><strong>{value}</strong></div></article>)}
    </div>
    <div className="reference-charts"><article className="reference-card line-card"><div className="card-heading"><h3><span>▥</span> ဒေတာမှတ်တမ်းတိုးတက်မှု</h3><button>နောက်ဆုံး ၆ လ⌄</button></div><div className="line-chart"><div className="y-labels"><span>20,000</span><span>15,000</span><span>10,000</span><span>5,000</span><span>0</span></div><svg viewBox="0 0 560 175" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1688ee" stopOpacity=".25"/><stop offset="1" stopColor="#1688ee" stopOpacity="0"/></linearGradient></defs><path className="area" d="M5 145 L105 120 L205 95 L305 72 L405 42 L550 20 L550 160 L5 160 Z"/><polyline points="5,145 105,120 205,95 305,72 405,42 550,20"/><g>{[[5,145],[105,120],[205,95],[305,72],[405,42],[550,20]].map(([cx,cy])=><circle key={cx} cx={cx} cy={cy} r="4"/>)}</g></svg><div className="x-labels"><span>ဧပြီ 2026</span><span>မေ 2026</span><span>ဇွန် 2026</span><span>ဇူလိုင် 2026</span><span>ဩဂုတ် 2026</span><span>စက်တင်ဘာ 2026</span></div></div></article><article className="reference-card donut-card"><div className="card-heading"><h3><span>◕</span> ဝင်ရောက်ခွင့်အဆင့်အလိုက် ဒေတာများ</h3></div><div className="donut-wrap"><div className="reference-donut"><b>18,420<small>စုစုပေါင်း</small></b></div><div className="donut-legend"><p><i className="public"></i>ပုံမှန်ဝင်ရောက်ခွင့်<strong>14,320 (78%)</strong></p><p><i className="vip"></i>VIP ဝင်ရောက်ခွင့်<strong>4,100 (22%)</strong></p></div></div></article></div>
    <div className="reference-bottom"><article className="reference-card data-table-card"><div className="card-heading"><h3><span>☁</span> နောက်ဆုံး Excel တင်သွင်းမှုများ</h3><a>အားလုံးကြည့်ရန်</a></div><table><thead><tr><th>ဖိုင်အမည်</th><th>ဒေတာအစု</th><th>မှတ်တမ်းအရေအတွက်</th><th>အခြေအနေ</th><th>တင်သွင်းချိန်</th><th>တင်သွင်းသူ</th></tr></thead><tbody>{recentFiles.map((r,i)=><tr key={r[0]}>{r.map((c,j)=><td key={j}>{j===3?<span className={'status s'+i}>{c}</span>:c}</td>)}</tr>)}</tbody></table></article><article className="reference-card activity-card"><div className="card-heading"><h3><span>◷</span> နောက်ဆုံးလုပ်ဆောင်ချက်များ</h3><a>အားလုံးကြည့်ရန်</a></div><table><thead><tr><th>အသုံးပြုသူ</th><th>လုပ်ဆောင်ချက်</th><th>မော်ဂျူး</th><th>အချိန်</th></tr></thead><tbody>{activity.map(r=><tr key={r[3]}><td><span className="mini-avatar">A</span>{r[0]}</td><td><b className="activity-icon">{r[4]}</b>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></article></div>
    <div className="quick-actions"><h3><span>⚡</span> အမြန်လုပ်ဆောင်ရန်</h3><div>{[['▰','ကဏ္ဍအသစ်ထည့်ရန်','blue'],['●','ဒေတာအစုအသစ်ဖန်တီးရန်','green'],['↥','Excel တင်သွင်းရန်','purple'],['▤','စာရွက်စာတမ်းတင်ရန်','orange'],['♟','Viewer အသစ်ထည့်ရန်','cyan'],['▥','အစီရင်ခံစာထုတ်ရန်','red']].map(([icon,label,tone])=><button className={tone} key={label}><b>{icon}</b>{label}</button>)}</div></div>
  </section>
}
function Charts(){return <div className="chart-area"><div className="chart-card"><h3>ဌာနအလိုက် အချက်အလက်</h3><p>စက်တင်ဘာ ၂၀၂၆</p><div className="bars">{[38,62,45,78,57].map((v,i)=><div key={i}><i style={{height:v+'%'}}></i><small>{['ဘဏ္ဍာ','အုပ်ချုပ်','လူ့စွမ်း','စီမံ','လုပ်ငန်း'][i]}</small></div>)}</div></div><div className="chart-card"><h3>လစဉ်လုပ်ငန်းလမ်းကြောင်း</h3><p>နောက်ဆုံး ၆ လ</p><svg viewBox="0 0 400 150" preserveAspectRatio="none"><path d="M0 125 C40 110 55 115 85 92 S130 105 160 77 S205 82 235 52 S280 70 310 38 S360 58 400 18" fill="none" stroke="#2f6fed" strokeWidth="3"/></svg></div></div>}
function RecordsExplorer({categoryId}){
  const rows=[
    ['ဘဏ္ဍာရေး','ဝန်ပစ္စည်း','150,000,000','90,000,000','60,000,000','16 Jan 2026','အတည်ပြုပြီး','approved'],
    ['IT','Server','250,000,000','180,000,000','70,000,000','16 Jan 2026','စောင့်ဆိုင်း','pending'],
    ['HR','ရုံးသုံးပစ္စည်း','80,000,000','70,000,000','10,000,000','15 Jan 2026','အတည်ပြုပြီး','approved'],
    ['ပညာရေး','Software','120,000,000','50,000,000','70,000,000','14 Jan 2026','စိစစ်ဆဲ','review'],
    ['ကျန်းမာရေး','ဆေးပစ္စည်း','200,000,000','120,000,000','80,000,000','13 Jan 2026','အတည်ပြုပြီး','approved'],
    ['စိုက်ပျိုးရေး','စက်ကိရိယာ','75,000,000','40,000,000','35,000,000','12 Jan 2026','ပယ်ဖျက်','rejected'],
    ['လမ်းပန်းဆက်သွယ်ရေး','ပြုပြင်ထိန်းသိမ်း','300,000,000','220,000,000','80,000,000','11 Jan 2026','အတည်ပြုပြီး','approved'],
    ['ပြည်သူ့ရေးရာ','အဆောက်အဦ','450,000,000','300,000,000','150,000,000','10 Jan 2026','စိစစ်ဆဲ','review']
  ]
  const [query,setQuery]=useState('')
  const [checked,setChecked]=useState([])
  const [notice,setNotice]=useState('')
  const visible=rows.filter(row=>row.join(' ').toLowerCase().includes(query.toLowerCase()))
  const toggle=index=>setChecked(checked.includes(index)?checked.filter(x=>x!==index):[...checked,index])
  const action=text=>{setNotice(text);setTimeout(()=>setNotice(''),1800)}
  const folders=[
    {name:'ဘဏ္ဍာရေး',count:42,color:'blue',open:true,children:[
      {name:'ဘတ်ဂျက်',count:12,open:true,children:[{name:'2026',count:4,active:true,children:[['Q1',1],['Q2',1],['Q3',1],['Q4',1]]}]},
      {name:'ငွေစာရင်း',count:8},{name:'အကောက်ခွန်',count:6},{name:'ငွေကြေး',count:6}
    ]},
    {name:'လူ့စွမ်းအား',count:28,color:'green'},{name:'စီမံကိန်း',count:36,color:'orange'},{name:'ဥပဒေရေးရာ',count:18,color:'purple'},{name:'သတင်းနှင့်ဆက်သွယ်ရေး',count:24,color:'red'},{name:'အထွေထွေစီမံ',count:14,color:'slate'}
  ]
  const renderFolder=(folder,level=0)=><div className="record-tree-node" key={folder.name}><button className={folder.active?'active':''} style={{'--level':level}}><span className="tree-arrow">{folder.children?'⌄':'›'}</span><i className={'folder '+(folder.color||'blue')}>■</i><b>{folder.name}</b><em>{folder.count}</em></button>{folder.children&&<div>{folder.children.map(child=>Array.isArray(child)?<button className="quarter" style={{'--level':level+1}} key={child[0]}><span></span><i>■</i><b>{child[0]}</b><em>{child[1]}</em></button>:renderFolder(child,level+1))}</div>}</div>
  return <section className="records-explorer" data-category-id={categoryId||''}>
    {notice&&<div className="records-toast">✓ {notice}</div>}
    <div className="records-heading"><div><h1>ဒေတာများ</h1><p>အမျိုးအစားတစ်ခုချင်းစီရှိ ဒေတာများကို ကြည့်ရှု၊ တည်းဖြတ်၊ ထည့်သွင်း၊ ပြန်ထုတ်နိုင်ပါသည်။</p></div><div className="records-breadcrumb"><span>⌂</span><b>ဒေတာများ</b><i>›</i><b>ဘဏ္ဍာရေး</b><i>›</i><b>ဘတ်ဂျက်</b><i>›</i><b>2026</b></div></div>
    <div className="records-layout">
      <aside className="record-tree-panel"><h2>အမျိုးအစားများ</h2><div className="record-tree-search">⌕<input placeholder="အမျိုးအစား ရှာရန်..."/></div><div className="record-tree">{folders.map(folder=>renderFolder(folder))}</div></aside>
      <main className="records-main">
        <header className="records-folder-head"><div className="large-folder">■</div><div className="folder-copy"><h2>2026 ဘတ်ဂျက်</h2><p>ဘဏ္ဍာရေး　›　ဘတ်ဂျက်　›　2026</p><span>2026 ခုနှစ် ဘတ်ဂျက်ဆိုင်ရာ ဒေတာများ</span></div><div className="folder-stat"><i>◉</i><b>1,240<small>စုစုပေါင်း</small></b></div><div className="folder-stat"><i>▣</i><b>10 Jan 2026<small>နောက်ဆုံးတင်သွင်းမှု</small></b></div></header>
        <div className="records-actions"><div><button className="primary" onClick={()=>action('ဒေတာအသစ်ထည့်ရန် ဖောင်ကို ဖွင့်ထားပါသည်')}>＋　ဒေတာအသစ်ထည့်ရန်</button><button className="excel" onClick={()=>action('Excel ဖိုင်ကို စစ်ဆေးရန် အဆင်သင့်ဖြစ်ပါသည်')}>▣　Excel မှ ထည့်သွင်းရန်</button><button onClick={()=>action('Export ပြုလုပ်ရန် အဆင်သင့်ဖြစ်ပါသည်')}>↧　Export</button></div><button onClick={()=>action('ကော်လံများစီမံရန် ဖွင့်ထားပါသည်')}>⚙　ကော်လံများ စီမံ</button></div>
        <div className="records-filters"><div className="records-search">⌕<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ဒေတာ ရှာဖွေ..."/></div><label>ဌာန:<select><option>အားလုံး</option></select></label><label>အခြေအနေ:<select><option>အားလုံး</option></select></label><label>နှစ်:<select><option>2026</option></select></label><button>▼　ပိုမိုစစ်ထုတ်</button></div>
        <div className="records-table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="အားလုံးရွေးရန်"/></th><th>#</th><th>ဌာန</th><th>ဘတ်ဂျက်အမျိုးအစား</th><th>ခွင့်ပြုငွေ</th><th>သုံးပြီးငွေ</th><th>ကျန်ငွေ</th><th>ရက်စွဲ</th><th>အခြေအနေ</th><th>လုပ်ဆောင်ချက်</th></tr></thead><tbody>{visible.map((row,index)=><tr key={row[0]+index}><td><input type="checkbox" checked={checked.includes(index)} onChange={()=>toggle(index)} aria-label={`${row[0]} ရွေးရန်`}/></td><td>{index+1}</td>{row.slice(0,6).map((cell,i)=><td key={i}>{cell}</td>)}<td><span className={'record-status '+row[7]}>{row[6]}</span></td><td className="row-actions"><button onClick={()=>action(`${row[0]} ကို ပြင်ဆင်ရန်`)}>✎</button><button onClick={()=>action(`${row[0]} အသေးစိတ်ကြည့်ရန်`)}>⊙</button><button onClick={()=>action(`${row[0]} အခြားလုပ်ဆောင်ချက်များ`)}>⋮</button></td></tr>)}</tbody></table></div>
        <footer className="records-pagination"><label>တစ်မျက်နှာ:<select><option>10</option></select></label><span>1 - {visible.length} of 1,240</span><div><button disabled>‹</button><button className="active">1</button><button>2</button><button>3</button><button>4</button><button>5</button><b>…</b><button>124</button><button>›</button></div></footer>
      </main>
    </div>
  </section>
}
function Data(){
  const datasets=[
    {id:1,icon:'◉',tone:'blue',name:'ဘတ်ဂျက်',path:'ဘဏ္ဍာရေး  >  ဘတ်ဂျက်',records:'1,240',status:'အသုံးပြုနေ'},
    {id:2,icon:'♟',tone:'cyan',name:'ဝန်ထမ်းအချက်အလက်',path:'လူ့စွမ်းအား  >  ဝန်ထမ်း',records:'856',status:'အသုံးပြုနေ'},
    {id:3,icon:'■',tone:'orange',name:'စီမံကိန်းများ',path:'စီမံကိန်း  >  စီမံကိန်းများ',records:'420',status:'အသုံးပြုနေ'},
    {id:4,icon:'▤',tone:'blue',name:'စာရင်းသွင်းမှတ်တမ်း',path:'စာရင်းပေး  >  မှတ်တမ်းများ',records:'230',status:'မူကြမ်း'},
    {id:5,icon:'▣',tone:'purple',name:'ရုံးစာများ',path:'အထွေထွေ  >  ရုံးလက်ခံ',records:'98',status:'အသုံးပြုနေ'},
    {id:6,icon:'▤',tone:'red',name:'တိုင်ကြားစာများ',path:'အထွေထွေ  >  တိုင်ကြားစာ',records:'152',status:'အသုံးပြုနေ'},
    {id:7,icon:'✚',tone:'navy',name:'အရေးပေါ်မှတ်တမ်း',path:'အထွေထွေ  >  အရေးပေါ်',records:'310',status:'ပြင်ဆင်'},
    {id:8,icon:'◆',tone:'purple',name:'သင်တန်းများ',path:'လူ့စွမ်းအား  >  သင်တန်း',records:'67',status:'မူကြမ်း'},
    {id:9,icon:'◉',tone:'orange',name:'ပြည်သူ့ဝန်ဆောင်မှု',path:'ဝန်ဆောင်မှု  >  စာရင်းများ',records:'540',status:'အသုံးပြုနေ'},
    {id:10,icon:'◎',tone:'blue',name:'ဌာနဆိုင်ရာများ',path:'မူဝါဒ  >  လုပ်ငန်းစဉ်များ',records:'120',status:'အသုံးပြုနေ'}
  ]
  const fields=[
    ['department','ဌာန','Text',true,'-','ဌာနအမည်'],
    ['budget_year','နှစ်','Number',true,'-','ဘတ်ဂျက်နှစ်'],
    ['budget_type','ဘတ်ဂျက်အမျိုးအစား','Select',true,'-','အမျိုးအစား (ရင်းနှီး/လည်ပတ်)'],
    ['approved_amount','အတည်ပြုငွေပမာဏ','Number',true,'0','အတည်ပြုငွေပမာဏ'],
    ['used_amount','အသုံးပြုငွေပမာဏ','Number',false,'0','အသုံးပြုငွေပမာဏ'],
    ['remaining_amount','ကျန်ရှိငွေပမာဏ','Number',false,'0','ကျန်ရှိငွေပမာဏ (အလိုအလျောက်တွက်)']
  ]
  const [activeId,setActiveId]=useState(1)
  const [activeTab,setActiveTab]=useState('fields')
  const [query,setQuery]=useState('')
  const [toast,setToast]=useState('')
  const active=datasets.find(item=>item.id===activeId)||datasets[0]
  const shown=datasets.filter(item=>`${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase()))
  const action=(text)=>{setToast(text);setTimeout(()=>setToast(''),1800)}
  return <section className="datasets-page">
    <div className="datasets-topbar"><div><h1>ဒေတာအစုများ</h1><p>အမျိုးအစားတစ်ခုချင်းစီအတွက် Dataset (Schema) များကို စီမံခန့်ခွဲပါ။</p></div><div className="dataset-steps">{['Dataset အမည်','Fields သတ်မှတ်','Sample စစ်','Excel တင်သွင်း','အတည်ပြု'].map((step,i)=><span key={step}><b>{i+1}</b>{step}{i<4&&<i>›</i>}</span>)}</div></div>
    {toast&&<div className="dataset-toast">✓ {toast}</div>}
    <div className="datasets-workspace">
      <aside className="dataset-browser">
        <div className="dataset-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ဒေတာအစုများ ရှာရန်..."/></div>
        <div className="dataset-filters"><label>အမျိုးအစား<select><option>အားလုံး</option><option>ဘဏ္ဍာရေး</option></select></label><label>အခြေအနေ<select><option>အားလုံး</option><option>အသုံးပြုနေ</option></select></label><button aria-label="Filter">▼</button></div>
        <button className="dataset-add" onClick={()=>action('ဒေတာအစုအသစ် ဖန်တီးရန်ဖောင်ကို ဖွင့်ထားပါသည်')}>＋　ဒေတာအစုအသစ်</button>
        <div className="dataset-count"><b>စုစုပေါင်း: {shown.length}</b><button>နောက်ဆုံးပြင်ဆင်မှု⌄</button></div>
        <div className="dataset-list">{shown.map(item=><button key={item.id} className={activeId===item.id?'dataset-item active':'dataset-item'} onClick={()=>setActiveId(item.id)}><i className={item.tone}>{item.icon}</i><span><b>{item.name}</b><small>{item.path}</small></span><em><strong>{item.records}</strong><small>records</small></em><u className={item.status==='အသုံးပြုနေ'?'live':'draft'}>{item.status}</u><sup>⋮</sup></button>)}</div>
        <div className="dataset-pagination"><button>‹</button><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>›</button></div>
      </aside>
      <main className="dataset-detail">
        <header className="dataset-detail-head"><div className="dataset-title-icon">◉</div><div className="dataset-title"><div><h2>{active.name}</h2><span>အသုံးပြုနေ</span></div><small>{active.path}</small><p>နှစ်စဉ် {active.name}ဆိုင်ရာ အချက်အလက်များ စုစည်းရန် အသုံးပြုသည့် Dataset။</p></div><div className="dataset-actions"><button className="blue" onClick={()=>setActiveTab('sample')}>Data ကြည့်ရန်</button><button onClick={()=>action('ပြင်ဆင်မှုအခြေအနေ ဖွင့်ထားပါသည်')}>✎　ပြင်ဆင်</button><button onClick={()=>action('ဒေတာအစုကို ကူးယူပြီးပါပြီ')}>▣　ကူးယူ</button><button onClick={()=>action('Archive ထဲသို့ ရွှေ့ရန် ပြင်ဆင်ထားပါသည်')}>▰　Archive</button><button className="danger" onClick={()=>action('ဖျက်ရန် အတည်ပြုမှုလိုအပ်ပါသည်')}>▥　ဖျက်မည်</button></div></header>
        <div className="dataset-metrics">{[['▤','Fields','6','blue'],['▦','Records',active.records,'navy'],['▣','Related Documents','12','purple'],['↥','Import History','3','green'],['▣','Created At','10 Jan 2026','slate'],['▣','Last Updated','15 Sep 2026','slate'],['♟','Created By','Admin A','slate']].map(([icon,label,value,tone])=><div key={label}><i className={tone}>{icon}</i><span><small>{label}</small><b>{value}</b></span></div>)}</div>
        <div className="dataset-tabs"><div>{[['fields','Field များ (6)'],['sample','Sample Data'],['docs','Related Documents'],['history','Import History'],['settings','Settings']].map(([id,label])=><button key={id} className={activeTab===id?'active':''} onClick={()=>setActiveTab(id)}>{label}</button>)}</div><button className="add-field" onClick={()=>action('Field အသစ်ထည့်ရန် ဖောင်ကို ဖွင့်ထားပါသည်')}>＋　Field ထည့်မည်</button></div>
        {activeTab==='fields'?<>
          <div className="fields-table"><table><thead><tr><th>#</th><th>Field Name<small>(Database field)</small></th><th>Display Label<small>(ပြသမည့်အမည်)</small></th><th>Field Type</th><th>Required</th><th>Default Value</th><th>Description<small>(ဖော်ပြချက်)</small></th><th>Order</th><th>Actions</th></tr></thead><tbody>{fields.map((row,i)=><tr key={row[0]}><td><span className="drag">⠿</span>{i+1}</td><td>{row[0]}</td><td>{row[1]}</td><td><span className={'field-type '+row[2].toLowerCase()}>{row[2]}</span></td><td><input type="checkbox" checked={row[3]} readOnly/></td><td>{row[4]}</td><td>{row[5]}</td><td><input className="order-input" value={i+1} readOnly/></td><td><button onClick={()=>action(`${row[1]} ကို ပြင်ဆင်ရန်`)}>✎</button><button onClick={()=>action(`${row[1]} ကို ကူးယူပြီးပါပြီ`)}>▣</button><button className="delete" onClick={()=>action(`${row[1]} ကို ဖျက်ရန် အတည်ပြုမှုလိုအပ်ပါသည်`)}>♲</button></td></tr>)}</tbody></table></div>
          <section className="field-order"><header><b>Field Order</b><button>↻　မူလအတိုင်းပြန်ထား</button></header><p><i>i</i> Field များကို drag & drop ဖြင့် အစီအစဉ် ပြောင်းနိုင်ပါသည်။</p></section>
          <section className="formula-field"><i>ƒx</i><div><b>Formula Field (Optional)</b><div><select><option>remaining_amount (ကျန်ရှိငွေပမာဏ)</option></select><span>=</span><input value="approved_amount - used_amount" readOnly/><button>✎</button></div><small>Formula ဖြင့်တွက်ချက်သော field များသည် manual input မလိုအပ်ပါ။</small></div></section>
          <section className="select-options"><b><i>?</i> Select Field Options <small>(for Select Type)</small></b><select><option>budget_type (ဘတ်ဂျက်အမျိုးအစား)</option></select><div><span>• ရင်းနှီး</span><span>• လည်ပတ်ငွေ</span><span>• တည်ဆောက်</span><span>• အခြား</span></div><button onClick={()=>action('Option အသစ်ထည့်ရန်')}>＋ Option ထည့်မည်</button></section>
        </>:<div className="dataset-tab-content"><div className="tab-content-icon">{activeTab==='sample'?'▦':activeTab==='docs'?'▣':activeTab==='history'?'↥':'⚙'}</div><h3>{[['sample','Sample Data'],['docs','Related Documents'],['history','Import History'],['settings','Dataset Settings']].find(x=>x[0]===activeTab)?.[1]}</h3><p>{active.name} အတွက် demo အချက်အလက်များကို ဤနေရာတွင် စီမံနိုင်ပါသည်။</p><button onClick={()=>setActiveTab('fields')}>Field များသို့ ပြန်သွားရန်</button></div>}
      </main>
    </div>
  </section>
}
function Imports(){const [preview,setPreview]=useState(false);return <section className="page"><div className="upload"><div><span className="eyebrow">DATA INPUT</span><h3>Excel အချက်အလက်တင်သွင်းရန်</h3><p>.xlsx ဖိုင်ကို ဆွဲချပြီး ထည့်ပါ သို့မဟုတ် Browse လုပ်ပါ။</p></div><button className="primary" onClick={()=>setPreview(true)}>＋ Excel Import</button></div>{preview&&<div className="preview-box"><div><b>September_Report.xlsx</b><span>အတန်း ၂၅၀ · မှန်ကန် ၂၄၅ · သတိပေးချက် ၅</span></div><Badge>စစ်ဆေးရန်အဆင်သင့်</Badge><button className="primary" onClick={()=>setPreview(false)}>အတည်ပြုတင်သွင်းရန်</button><button className="ghost" onClick={()=>setPreview(false)}>ပယ်ဖျက်ရန်</button></div>}<div className="section-title"><div><h3>တင်သွင်းမှုမှတ်တမ်း</h3><p>Workspace ထဲသို့ ထည့်ထားသော ဖိုင်များ</p></div></div><div className="table-card"><table><thead><tr><th>ဖိုင်အမည်</th><th>ရက်စွဲ</th><th>အရေအတွက်</th><th>အခြေအနေ</th><th>လုပ်ဆောင်ချက်</th></tr></thead><tbody>{imports.map(x=><tr key={x[0]}><td><b>▣ {x[0]}</b></td><td>{x[1]}</td><td>{x[2]}</td><td><Badge>{x[3]}</Badge></td><td><button className="text">ကြည့်ရန်</button><button className="danger">ဖျက်ရန်</button></td></tr>)}</tbody></table></div></section>}
function Entry(){
  const groupOptions=Object.fromEntries(Array.from({length:20},(_,i)=>[`အဖွဲ့ ${i+1}`,['အုပ်ချုပ်ရေး','ဖွဲ့စည်းပုံ','ဘဏ္ဍာရေး','မှတ်တမ်းဖိုင်']]))
  const hierarchy={
    'မူဝါဒ':{'အုပ်ချုပ်ရေးမူဝါဒ':['ဝန်ထမ်းစီမံခန့်ခွဲမှု','ရုံးလုပ်ငန်းစည်းမျဉ်း'],'ဘဏ္ဍာရေးမူဝါဒ':['ဘတ်ဂျက်စီမံခန့်ခွဲမှု','အသုံးစရိတ်ထိန်းချုပ်မှု'],'ဝန်ထမ်းရေးရာမူဝါဒ':['ခန့်အပ်ရေး','စွမ်းဆောင်ရည်အကဲဖြတ်မှု'],'လုပ်ငန်းဆောင်ရွက်မှုမူဝါဒ':['စီမံချက်ရေးဆွဲခြင်း','အကောင်အထည်ဖော်ခြင်း']},
    'ဖွဲ့စည်းပုံ':{'ဦးစီးဌာနဖွဲ့စည်းပုံ':['အထွေထွေဌာန','အုပ်ချုပ်ရေးဌာန'],'ဌာနခွဲဖွဲ့စည်းပုံ':['ဘဏ္ဍာရေးဌာနခွဲ','စီမံကိန်းဌာနခွဲ'],'ရာထူးဖွဲ့စည်းပုံ':['အရာထမ်းရာထူး','အမှုထမ်းရာထူး'],'တာဝန်ခွဲဝေမှု':['ဌာနတာဝန်','အဖွဲ့တာဝန်']},
    'ဘဏ္ဍာရေး':{'ဘတ်ဂျက်':['၂၀၂၆ နှစ်စဉ်ဘတ်ဂျက်','သုံးလပတ်ဘတ်ဂျက်'],'အသုံးစရိတ်':['လစဉ်အသုံးစရိတ်','လုပ်ငန်းအသုံးစရိတ်'],'ရသုံးမှန်းခြေငွေစာရင်း':['နှစ်စဉ်ရသုံးမှန်းခြေ','ပြင်ဆင်ရသုံးမှန်းခြေ'],'ဝယ်ယူရေး':['ဝယ်ယူရေးအစီအစဉ်','ပေးချေမှုမှတ်တမ်း'],'လစဉ်ဘဏ္ဍာရေးအစီရင်ခံစာ':['စက်တင်ဘာအစီရင်ခံစာ','အောက်တိုဘာအစီရင်ခံစာ']},
    'အဖွဲ့များ':groupOptions
  }
  const [main,setMain]=useState('ဘဏ္ဍာရေး'); const [sub,setSub]=useState('ဘတ်ဂျက်'); const [leaf,setLeaf]=useState('၂၀၂၆ နှစ်စဉ်ဘတ်ဂျက်'); const [type,setType]=useState('Excel'); const [mode,setMode]=useState('new'); const [saved,setSaved]=useState(false); const [datasetOpen,setDatasetOpen]=useState(false); const [edit,setEdit]=useState(null); const [query,setQuery]=useState('');
  const [rows,setRows]=useState([{id:1,dept:'ဘဏ္ဍာရေးဌာန',item:'ရုံးသုံးပစ္စည်း',amount:'500,000',status:'Approved'},{id:2,dept:'အုပ်ချုပ်ရေးဌာန',item:'သင်တန်းအသုံးစရိတ်',amount:'250,000',status:'Pending'},{id:3,dept:'စီမံကိန်းဌာန',item:'စီမံကိန်းလုပ်ငန်း',amount:'320,000',status:'Approved'}]);
  const subs=Object.keys(hierarchy[main]); const leaves=hierarchy[main][sub]||[]; const shown=rows.filter(r=>Object.values(r).join(' ').toLowerCase().includes(query.toLowerCase()));
  const changeMain=e=>{const v=e.target.value;const next=Object.keys(hierarchy[v])[0];setMain(v);setSub(next);setLeaf(hierarchy[v][next][0])}; const changeSub=e=>{const v=e.target.value;setSub(v);setLeaf(hierarchy[main][v][0])};
  const addRow=()=>{const id=Math.max(...rows.map(r=>r.id))+1;setRows([...rows,{id,dept:'ဌာနအသစ်',item:'အချက်အလက်အသစ်',amount:'0',status:'Pending'}]);setEdit(id)}; const updateRow=(id,key,value)=>setRows(rows.map(r=>r.id===id?{...r,[key]:value}:r)); const deleteRow=id=>setRows(rows.filter(r=>r.id!==id));
  return <section className="page entry-page">
    <div className="entry-workspace"><section className="entry-panel hierarchy-panel"><h4><b>၁.</b> အချက်အလက် အမျိုးအစားရွေးရန်</h4><div className="three-select"><label>အဓိကအမျိုးအစား *<select value={main} onChange={changeMain}>{Object.keys(hierarchy).map(x=><option key={x}>{x}</option>)}</select></label><label>သက်ဆိုင်ရာအမျိုးအစား *<select value={sub} onChange={changeSub}>{subs.map(x=><option key={x}>{x}</option>)}</select></label><label>အမျိုးအစားခွဲ *<select value={leaf} onChange={e=>setLeaf(e.target.value)}>{leaves.map(x=><option key={x}>{x}</option>)}</select></label></div></section>
      <section className="entry-panel type-panel"><h4><b>၂.</b> အချက်အလက်အမျိုးအစား ရွေးရန်</h4><div className="type-picker">{[['JPG','▣','image'],['PDF','⌁','pdf'],['Excel','X','excel']].map(([name,icon,cls])=><button key={name} className={type===name?'selected '+cls:cls} onClick={()=>setType(name)}><strong>{icon}</strong><span>{name}</span><small>{name==='Excel'?'Structured data အဖြစ် စီမံရန်':'ဖိုင်အဖြစ် upload လုပ်ရန်'}</small>{type===name&&<i>✓</i>}</button>)}</div></section>
      <section className="entry-content">{type!=='Excel'?<div className="entry-panel asset-form"><h4>{type} ဖိုင်အချက်အလက်</h4><label>ခေါင်းစဉ် *<input defaultValue={leaf}/></label><label>ဖော်ပြချက် *<textarea defaultValue={`${leaf} နှင့် သက်ဆိုင်သော ${type} မှတ်တမ်းဖိုင်`}/></label><label className="upload-field">{type} Upload<input type="file" accept={type==='JPG'?'image/*':'.pdf'}/><span>⇧　{type} ဖိုင်ကို ရွေးချယ်ရန် သို့မဟုတ် drag & drop လုပ်ပါ</span></label><div className="two"><label>ရက်စွဲ<input type="date" defaultValue="2026-09-12"/></label><label>မှတ်တမ်းအမှတ်<input defaultValue={main==='မူဝါဒ'?'POL-2026-001':'FIN-2026-001'}/></label></div><label>မှတ်ချက်<textarea placeholder="အပိုဆောင်းမှတ်ချက်ရေးပါ"/></label></div>:<><div className="entry-panel excel-choice"><h4><b>၃.</b> Excel အချက်အလက်</h4><label className={mode==='new'?'choice active':'choice'}><input type="radio" checked={mode==='new'} onChange={()=>setMode('new')}/> Excel ဖိုင်အသစ်တင်ရန်</label><label className={mode==='existing'?'choice active':'choice'}><input type="radio" checked={mode==='existing'} onChange={()=>setMode('existing')}/> ရှိပြီးသား Excel Data ကို အသုံးပြုရန်</label></div><div className="entry-panel excel-preview"><div className="excel-preview-head"><div><b>{mode==='new'?'၂၀၂၆ ဘတ်ဂျက်စာရင်း.xlsx':'၂၀၂၆ ဘတ်ဂျက်စာရင်း (Dataset)'}</b><small>Original Excel File + Parsed Structured Data</small></div><button className="text" onClick={()=>setDatasetOpen(!datasetOpen)}>{datasetOpen?'Preview ပိတ်ရန်':'Dataset ကိုကြည့်ရန် →'}</button></div>{mode==='new'&&<label className="excel-drop">⇧<input type="file" accept=".xlsx,.xls"/><b>Excel ဖိုင် ရွေးချယ်ရန် သို့မဟုတ် drag & drop လုပ်ပါ</b><small>.xlsx, .xls (အများဆုံး 10 MB)</small></label>}<div className="scan-ok">✓ ဖိုင်ကို စစ်ဆေးပြီးပါပြီ · Column ၅ ခု · Row {rows.length} ခု</div><DataTable rows={shown} query={query} setQuery={setQuery} compact/></div>{datasetOpen&&<section className="entry-panel dataset-panel"><div className="dataset-title"><div><h4>၂၀၂၆ ဘတ်ဂျက်စာရင်း</h4><span>Excel-looking structured dataset · {main} / {sub} / {leaf}</span></div><button className="primary" onClick={addRow}>＋ Row အသစ်ထည့်ရန်</button></div><div className="dataset-tools"><div className="search">⌕<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Excel data ရှာဖွေရန်..."/></div><button className="ghost">Status ⌄</button><button className="ghost">Filter ⌄</button></div><DataTable rows={shown} edit={edit} setEdit={setEdit} updateRow={updateRow} deleteRow={deleteRow}/></section>}</>}</section>
    </div><div className="entry-actions"><button className="ghost">မလုပ်တော့ပါ</button><button className="primary" onClick={()=>setSaved(true)}>▣　{saved?'သိမ်းဆည်းပြီးပါပြီ':'အချက်အလက်သိမ်းဆည်းရန်'}</button></div></section>}
function DataTable({rows,compact,edit,setEdit,updateRow,deleteRow}){return <div className={'excel-table '+(compact?'compact':'')}><table><thead><tr><th>စဉ်</th><th>ဌာန</th><th>အကြောင်းအရာ</th><th>Amount</th><th>Status</th>{!compact&&<th>Action</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.id}</td>{['dept','item','amount'].map(key=><td key={key}>{edit===row.id?<input value={row[key]} onChange={e=>updateRow(row.id,key,e.target.value)}/>:row[key]}</td>)}<td>{edit===row.id?<select value={row.status} onChange={e=>updateRow(row.id,'status',e.target.value)}><option>Approved</option><option>Pending</option></select>:<Badge>{row.status==='Approved'?'အတည်ပြုပြီး':'စောင့်ဆိုင်းနေ'}</Badge>}</td>{!compact&&<td><button className="text" onClick={()=>setEdit(edit===row.id?null:row.id)}>{edit===row.id?'ပြီးပါပြီ':'Edit'}</button><button className="danger" onClick={()=>deleteRow(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>}
function Reports(){const [ready,setReady]=useState(false);return <section className="page"><div className="section-title"><div><span className="eyebrow">အစီရင်ခံစာနှင့် အချက်အလက်ထုတ်ယူမှု</span><h3>အစီရင်ခံစာပြုလုပ်ရန်</h3><p>ရွေးချယ်ထားသော အချက်အလက်များကို ရုံးသုံးအစီရင်ခံစာအဖြစ် ပြင်ဆင်ပါ။</p></div><button className="primary" onClick={()=>setReady(true)}>Excel ထုတ်ယူရန်</button></div><div className="report-layout"><div className="form-card"><h3>အစီရင်ခံစာသတ်မှတ်ချက်များ</h3><label>အစီရင်ခံစာအမည်<input defaultValue="စက်တင်ဘာလ လုပ်ငန်းဆောင်ရွက်မှုအစီရင်ခံစာ"/></label><div className="two"><label>စတင်ရက်<input type="date" defaultValue="2026-09-01"/></label><label>ပြီးဆုံးရက်<input type="date" defaultValue="2026-09-30"/></label></div><label>ဌာန<select><option>ဌာနအားလုံး</option><option>ဘဏ္ဍာရေးဌာန</option></select></label><button className="primary report-generate" onClick={()=>setReady(true)}>အစီရင်ခံစာပြုလုပ်ရန် →</button></div><div className="report-preview"><div className="report-paper"><span className="eyebrow">အစိုးရရုံး · အစီရင်ခံစာ</span><h2>စက်တင်ဘာလ လုပ်ငန်းဆောင်ရွက်မှု</h2><p>၀၁ စက်တင်ဘာ ၂၀၂၆ — ၃၀ စက်တင်ဘာ ၂၀၂၆</p><div className="report-stats"><strong>၇၆၀<small>အချက်အလက်စုစုပေါင်း</small></strong><strong>၇၂%<small>ပြီးစီးနှုန်း</small></strong><strong>၅<small>ပါဝင်သောဌာန</small></strong></div><div className="report-line"></div><div className="report-row"><span>ဘဏ္ဍာရေးဌာန</span><b>၁၄၈</b></div><div className="report-row"><span>အုပ်ချုပ်ရေးဌာန</span><b>၂၁၆</b></div>{ready&&<div className="report-ready">✓ အစီရင်ခံစာ အဆင်သင့်ဖြစ်ပါပြီ</div>}</div></div></div></section>}
function Activity(){const events=[['ယနေ့ ၀၉:၄၂','September_Report.xlsx ကို အချက်အလက် ၂၅၀ ခု တင်သွင်းခဲ့သည်','Excel တင်သွင်းမှု'],['ယနေ့ ၀၈:၁၅','စက်တင်ဘာလ အစည်းအဝေး Dashboard ကို ပြင်ဆင်ခဲ့သည်','အစည်းအဝေး'],['မနေ့ ၁၆:၃၀','ဘတ်ဂျက်အစီရင်ခံစာ အမျိုးအစားအသစ် ထည့်သွင်းခဲ့သည်','အမျိုးအစား'],['၀၇ စက်တင်ဘာ','August_Office_Return.xlsx ကို အတည်ပြုခဲ့သည်','Excel တင်သွင်းမှု']];return <section className="page"><div className="section-title"><div><span className="eyebrow">စနစ်မှတ်တမ်း</span><h3>လုပ်ဆောင်မှုမှတ်တမ်း</h3><p>စနစ်အတွင်း နောက်ဆုံးပြုလုပ်ခဲ့သော လုပ်ဆောင်ချက်များ</p></div></div><div className="activity-layout"><div className="activity-list">{events.map(([time,text,type])=><div className="activity-item" key={time}><div className="activity-dot"></div><div className="activity-copy"><strong>{text}</strong><span>{type} · Admin K.</span></div><time>{time}</time></div>)}</div><div className="activity-summary"><h3>ယနေ့အခြေအနေ</h3><div><b>၂၅</b><span>လုပ်ဆောင်ချက်များ</span></div><div><b>၁၂</b><span>အတည်ပြုထားသော Import</span></div><div><b>၉၈%</b><span>စနစ်အခြေအနေ</span></div></div></div></section>}
function Prep({go}){return <section className="page"><div className="form-card"><span className="eyebrow">အစည်းအဝေးပြင်ဆင်မှု</span><h3>Presentation Dashboard ပြင်ဆင်ရန်</h3><p>စက်တင်ဘာလ အစည်းအဝေးတွင် ပြသမည့်အချက်အလက်များကို ရွေးချယ်ပါ။</p><label>အစည်းအဝေးအမည်<input defaultValue="စက်တင်ဘာလ လစဉ်ညှိနှိုင်းအစည်းအဝေး"/></label><div className="two"><label>အစည်းအဝေးရက်<input type="date" defaultValue="2026-09-30"/></label><label>ကာလ<select><option>၀၁ စက်တင်ဘာ — ၃၀ စက်တင်ဘာ ၂၀၂၆</option></select></label></div><h4>ဌာနများ</h4><div className="checks">{['ဘဏ္ဍာရေး','အုပ်ချုပ်ရေး','စီမံကိန်း','လူ့စွမ်းအား','လုပ်ငန်း'].map((x,i)=><label key={x}><input type="checkbox" defaultChecked={i<3}/>{x}</label>)}</div><button className="primary" onClick={()=>go('preview')}>Dashboard အစမ်းကြည့်ရန် →</button></div></section>}
function Preview({published,setPublished,open}){return <section className="page"><div className="preview-head"><div><span className="eyebrow">ADMIN အစမ်းကြည့်မှု</span><h3>တင်ပြရန်အဆင်သင့်</h3><p>အစည်းအဝေး display သို့ မတင်ပြမီ Dashboard ကို စစ်ဆေးပါ။</p></div><div><button className="ghost" onClick={()=>setPublished(false)}>Dashboard ရှင်းရန်</button><button className="primary" onClick={()=>setPublished(true)}>Publish လုပ်ရန်</button></div></div><div className="embedded"><Dashboard published={published} onBack={open} embedded/></div></section>}
function Dashboard({published,onBack,embedded,initialAccess=1,viewerUser,onLogout}){
  const [section,setSection]=useState(null)
  const [group,setGroup]=useState(null)
  const [file,setFile]=useState(null)
  const [accessLevel,setAccessLevel]=useState(initialAccess)
  const sections=[
    {id:'strategy',title:'မဟာဗျူဟာ',subtitle:'မဟာဗျူဟာနှင့် လုပ်ငန်းစဉ်များ'},
    {id:'policy',title:'မူဝါဒ',subtitle:'မူဝါဒနှင့် လုပ်ထုံးလုပ်နည်းများ'},
    {id:'structure',title:'ဖွဲ့စည်းပုံနှင့် အင်အားမှတ်တမ်း',subtitle:'ဖွဲ့စည်းပုံနှင့် ဝန်ထမ်းအင်အား'},
    {id:'finance',title:'ဘဏ္ဍာရေး',subtitle:'ဘဏ္ဍာရေးနှင့် အသုံးစရိတ်'},
    {id:'groups',title:'အဖွဲ့များ',subtitle:'ဌာနခွဲနှင့် အဖွဲ့အစည်းများ'},
    {id:'meeting',title:'အစည်းအဝေး',subtitle:'အစည်းအဝေးမှတ်တမ်းနှင့် တင်ပြချက်များ',level:1},
    {id:'general',title:'အထွေထွေ',subtitle:'အထွေထွေဆိုင်ရာ အချက်အလက်များ'}
  ]
  const visibleSections=sections.filter(item=>!item.level||item.level===accessLevel)
  const strategyGroups=Array.from({length:4},(_,groupIndex)=>({
    name:'မဟာဗျူဟာ အုပ်စု '+(groupIndex+1),
    tabs:Array.from({length:17},(_,tabIndex)=>({
      name:'Tab '+(tabIndex+1),
      type:'TAB',
      meta:'မဟာဗျူဟာ အုပ်စု '+(groupIndex+1)+' · အချက်အလက် '+(tabIndex+1)
    }))
  }))
  const policyTabs=Array.from({length:17},(_,i)=>({name:'Tab '+(i+1),type:'TAB',meta:'မူဝါဒ အချက်အလက် '+(i+1)}))
  const structureFiles=[
    {name:'ဌာနဖွဲ့စည်းပုံဇယား',type:'JPG',meta:'ဌာနနှင့် ဌာနခွဲဖွဲ့စည်းပုံ'},
    {name:'အရာထမ်းအင်အားစာရင်း',type:'PDF',meta:'အရာထမ်း လက်ရှိအင်အားမှတ်တမ်း'},
    {name:'အမှုထမ်းအင်အားစာရင်း',type:'PDF',meta:'အမှုထမ်း လက်ရှိအင်အားမှတ်တမ်း'},
    {name:'ရာထူးအလိုက်ခွဲခြားမှု',type:'JPG',meta:'ရာထူးအဆင့်အလိုက် အင်အားပြဇယား'},
    {name:'လစ်လပ်ရာထူးမှတ်တမ်း',type:'PDF',meta:'လက်ရှိလစ်လပ်ရာထူးစာရင်း'},
    {name:'ဝန်ထမ်းနေရာချထားမှု',type:'JPG',meta:'ဌာနအလိုက် နေရာချထားမှု'}
  ]
  const financeFiles=[
    {name:'၂၀၂၆ ဘတ်ဂျက်ခွဲဝေမှု',type:'XLSX',meta:'နှစ်စဉ်ဘတ်ဂျက်စာရင်း'},
    {name:'စက်တင်ဘာ အသုံးစရိတ်',type:'XLSX',meta:'လစဉ်အသုံးစရိတ်အသေးစိတ်'},
    {name:'သုံးလပတ်ဘဏ္ဍာရေး',type:'XLSX',meta:'တတိယသုံးလပတ်အစီရင်ခံစာ'},
    {name:'ဝယ်ယူရေးစာရင်း',type:'XLSX',meta:'ဝယ်ယူရေးနှင့် ပေးချေမှုမှတ်တမ်း'},
    {name:'အသုံးစရိတ်နှိုင်းယှဉ်ချက်',type:'XLSX',meta:'ခွင့်ပြုငွေနှင့် သုံးစွဲငွေ'},
    {name:'ရန်ပုံငွေလက်ကျန်',type:'XLSX',meta:'လက်ရှိရန်ပုံငွေအခြေအနေ'}
  ]
  const meetingFiles=[
    {name:'အစည်းအဝေးအစီအစဉ်',type:'PDF',meta:'အစည်းအဝေးအစီအစဉ်နှင့် အချိန်ဇယား'},
    {name:'အစည်းအဝေးမှတ်တမ်း',type:'PDF',meta:'အစည်းအဝေး ဆုံးဖြတ်ချက်မှတ်တမ်း'},
    {name:'တင်ပြချက်များ',type:'PDF',meta:'အစည်းအဝေးတွင် တင်ပြမည့်အချက်အလက်များ'}
  ]
  const generalFiles=[
    {name:'ရုံးတွင်းညွှန်ကြားချက်များ',type:'PDF',meta:'အထွေထွေရုံးတွင်းညွှန်ကြားချက်များ'},
    {name:'ဆက်သွယ်ရန်စာရင်း',type:'XLSX',meta:'ဌာနနှင့် အဖွဲ့ဆက်သွယ်ရန်စာရင်း'},
    {name:'အသိပေးကြေညာချက်',type:'JPG',meta:'ဝန်ထမ်းများအတွက် အသိပေးချက်'}
  ]
  const groups=Array.from({length:20},(_,i)=>'အဖွဲ့ '+(i+1))
  const childFiles=group?Array.from({length:4},(_,i)=>({name:group+' · အမျိုးအစား '+(i+1),type:['PDF','XLSX','JPG','PDF'][i],meta:'သက်ဆိုင်ရာ အချက်အလက်နှင့် မှတ်တမ်းဖိုင်'})):[]
  const current=sections.find(x=>x.id===section)
  const files=section==='policy'?policyTabs:section==='structure'?structureFiles:section==='finance'?financeFiles:section==='meeting'?meetingFiles:section==='general'?generalFiles:[]
  const back=()=>{if(group){setGroup(null)}else if(section){setSection(null)}else{onBack()}}
  const changeAccessLevel=(level)=>{setAccessLevel(level);setGroup(null);setFile(null);if(level===2&&section==='meeting')setSection(null)}
  if(!published)return <div className="empty"><span className="eyebrow">အစိုးရရုံး</span><h1>လက်ရှိပြသမှု မရှိပါ</h1><p>အစည်းအဝေး Dashboard ကို လောလောဆယ် မပြင်ဆင်ရသေးပါ။</p>{!embedded&&<button className="ghost" onClick={onBack}>← စီမံခန့်ခွဲရေးသို့ ပြန်သွားရန်</button>}</div>
  return <div className={'dashboard exact-presentation '+(section?'detail-presentation':'')}>
    <div className="exact-header">
      {!section&&!embedded&&<div className="header-actions">
        <button className="admin-button" onClick={onBack}>စီမံခန့်ခွဲမှုသို့ ပြန်ရန်</button>
      </div>}
      <div>
        <span>{section?'အမျိုးအစား':'အစိုးရအဖွဲ့'}</span>
        <h1>{group?group:current?current.title:'အစည်းအဝေးတင်ပြမှု Dashboard'}</h1>
        <p>{group?'အောက်ခံအမျိုးအစား ၄ ခု':current?current.subtitle:'အုပ်ချုပ်ရေးအဖွဲ့ · စက်တင်ဘာလအစည်းအဝေး ၂၀၂၆'}</p>
      </div>
      {section&&<button className="page-back" onClick={back}>← ပင်မစာမျက်နှာ</button>}
      {!embedded&&<div className="access-level-switch" aria-label="အသုံးပြုသူမြင်ကွင်း စမ်းသပ်ရန်">
        <span>Security Check</span>
        <div role="group" aria-label="Access level">
          <button className={accessLevel===1?'active':''} onClick={()=>changeAccessLevel(1)}>Level 1</button>
          <button className={accessLevel===2?'active':''} onClick={()=>changeAccessLevel(2)}>Level 2</button>
        </div>
      </div>}
      {viewerUser&&<div className="viewer-session-badge"><span><b>{viewerUser.name}</b><small>{viewerUser.role==='VIP_VIEWER'?'VIP Viewer':'Normal Viewer'}</small></span><button onClick={onLogout}>Sign out</button></div>}
    </div>
    {!section&&<main className="presentation-home">
      <div className="access-note">လက်ရှိမြင်ကွင်း — <b>Level {accessLevel}</b>{accessLevel===2&&<span> · အစည်းအဝေးကို ကြည့်ရှုခွင့်မရှိပါ</span>}</div>
      <div className="exact-main-tabs meeting-dashboard-grid">{visibleSections.map((item,index)=><button className={'presentation-card section-card '+item.id+'-card card-'+index} key={item.id} onClick={()=>setSection(item.id)}><strong>{item.title}</strong><span className="card-subtitle">{item.subtitle}</span></button>)}</div>
    </main>}
    {section==='strategy'&&<div className="section-tab-heading"><b>{current.title}</b><span>အုပ်စု ၄ ခု · အုပ်စုတစ်ခုလျှင် Tab ၁၇ ခု</span></div>}
    {section==='policy'&&<div className="section-tab-heading"><b>{current.title}</b><span>Tab ၁၇ ခု</span></div>}
    {section==='strategy'&&<div className="strategy-group-grid">{strategyGroups.map((strategyGroup,groupIndex)=><div className={'strategy-group group-'+groupIndex} key={strategyGroup.name} tabIndex="0"><button className="strategy-group-trigger" type="button" aria-haspopup="menu"><span>Level {groupIndex===0?'1':'2'}</span><strong>{strategyGroup.name}</strong><small>ရွေးချယ်ရန် ▾</small></button><div className="strategy-options" role="menu" aria-label={strategyGroup.name+' ရွေးချယ်စရာများ'}>{strategyGroup.tabs.map(item=><button type="button" role="menuitem" key={item.name} onClick={()=>setFile(item)}><span>{item.name}</span><b>→</b></button>)}</div></div>)}</div>}
    {section==='groups'&&!group&&<div className="exact-category-grid">{groups.map((name,index)=><button key={name} onClick={()=>setGroup(name)}><strong>{name}</strong><small>စုစုပေါင်းအမျိုးအစား: {index+4} ခု</small></button>)}</div>}
    {section==='groups'&&group&&<div className="exact-file-grid child-grid dark-file-grid">{childFiles.map((item,index)=><button key={item.name} onClick={()=>setFile(item)}><span className={'file-type '+item.type.toLowerCase()}>{item.type}</span><strong>{item.name}</strong><small>{item.meta}</small><em>⇩　ကြည့်ရှုရန်　→</em><b className="file-watermark">▧</b></button>)}</div>}
    {section&&section!=='groups'&&section!=='strategy'&&<div className={'exact-file-grid '+(section==='policy'?'numbered-tab-grid':'')}>{files.map((item,index)=><button key={item.name} onClick={()=>setFile(item)}><strong>{item.name}</strong><small>{item.meta}</small>{item.type!=='TAB'&&<><i>{(1.6+(index%5)*.4).toFixed(1)} MB　|　{String(15+index).padStart(2,'0')}-01-2024</i><em>ကြည့်ရှုရန်　→</em></>}</button>)}</div>}
    {file&&<div className="file-preview-backdrop" onClick={()=>setFile(null)}><div className="file-preview" onClick={e=>e.stopPropagation()}><div className={'preview-icon '+file.type.toLowerCase()}>{file.type}</div><span>Demo ဖိုင်အစမ်းကြည့်မှု</span><h2>{file.name}</h2><p>{file.meta}</p><div className="preview-sheet">{file.type==='XLSX'?<><b>စာရင်းအချက်အလက်</b><div>ဌာန / သတ်မှတ်ချက် / ပမာဏ / အခြေအနေ</div><div>ဘဏ္ဍာရေး / စက်တင်ဘာ / ၁၂၅,၀၀၀ / အတည်ပြုပြီး</div><div>စီမံကိန်း / တတိယသုံးလပတ် / ၈၈,၅၀၀ / ဆောင်ရွက်ဆဲ</div></>:<><b>{file.type} Document Preview</b><div className="document-lines"></div><div className="document-lines short"></div><div className="document-lines"></div></>}</div><button onClick={()=>setFile(null)}>ပိတ်ရန်</button></div></div>}
    <footer><div><b>အစိုးရအဖွဲ့စီမံခန့်ခွဲမှု Dashboard</b><small>© ၂၀၂၆ အစိုးရအဖွဲ့စီမံခန့်ခွဲမှုဌာန | မူပိုင်ခွင့်ကို ကာကွယ်ထားသည်</small></div><span>∞ version 1.0.0　 ·　 <b>စည်းမျဉ်းများ</b></span></footer>
  </div>
}
export default App
