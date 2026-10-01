import WorkspaceIcon from './WorkspaceIcon.jsx'
import './folder-tree-header.css'

export default function FolderTreeHeader({ onCollapse, disabled }) {
  return <div className="folder-tree-header"><h2>Folders</h2><button type="button" aria-label="Collapse all folders" title="Collapse all folders" disabled={disabled} onClick={onCollapse}><WorkspaceIcon name="collapse"/></button></div>
}
