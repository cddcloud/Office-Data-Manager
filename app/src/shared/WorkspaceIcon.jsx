const paths = {
  overview: 'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
  categories: 'M3 7V5h6l2 2h10v13H3V7M3 10h18',
  entry: 'M4 4h16v16H4V4M4 10h16M10 4v16',
  accounts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87',
  dashboard: 'M3 3h7v7H3V3M14 3h7v7h-7V3M3 14h7v7H3v-7M14 14h7v7h-7v-7',
  preview: 'M8 5l11 7-11 7V5',
  logout: 'M9 4H4v16h5M13 7l5 5-5 5M8 12h12',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 7v5l3 2',
  file: 'M14 2H5v20h14V7l-5-5M14 2v5h5M8 12h8M8 16h8',
  add: 'M12 5v14M5 12h14',
  search: 'M16 16l5 5',
  dots: 'M12 5v.01M12 12v.01M12 19v.01',
  collapse: 'M6 3h15v15H6V3M3 6v15h15M10 10h7',
}

export default function WorkspaceIcon({ name, className = '' }) {
  return <svg className={`workspace-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'dots' ? '3' : '1.8'} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.file} />{name === 'accounts' && <circle cx="9" cy="7" r="4" />}{name === 'clock' && <circle cx="12" cy="12" r="9" />}{name === 'search' && <circle cx="10.5" cy="10.5" r="6.5" />}</svg>
}
