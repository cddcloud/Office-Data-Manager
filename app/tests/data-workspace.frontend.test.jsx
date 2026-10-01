import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CollectionMenu, ConfirmDialog, DashboardDialog, DataCollectionRow, DataDashboard, DataRecordRow, DataRecordsHeader, DataRecordToolbar, FolderTree, RecordDialog, RecordMenu, WidgetVisualization } from '../src/records/FilteredModules.jsx'
import { SemanticFileIcon } from '../src/shared/SemanticFileIcon.jsx'
import { semanticFileType } from '../src/shared/semantic-file-types.js'
import { archiveDashboardWidget, archiveRecordRequest, clearCollectionContext, createRecordRequest, dataCollectionDetailsRequest, fieldInputType, filterFolderTree, generateRecordTitle, loadCollectionDashboard, previewDashboardWidget, recordQueryParams, reorderDashboardWidgets, saveDashboardWidget, topSeriesWithOthers, updateRecordRequest, widgetFieldChoices, widgetFormError, widgetRequestBody } from '../src/records/data-workspace-utils.js'

const workspaceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/records/FilteredModules.jsx'), 'utf8')
const dashboardCss = fs.readFileSync(path.resolve(process.cwd(), 'src/records/data-dashboard.css'), 'utf8')

describe('Data workspace frontend', () => {
  const tree = [{ id: 'finance', name: 'Finance', children: [{ id: 'budget', name: 'Budget', children: [] }] }, { id: 'hr', name: 'HR', children: [] }]
  const collection = { id: 'collection-1', categoryId: 'budget', name: '2026 Budget', defaultAccessLevel: 'V4', fields: [{ id: 'f1', key: 'department', label: 'Department', type: 'TEXT', required: true }, { id: 'f2', key: 'amount', label: 'Amount', type: 'NUMBER', required: true }, { id: 'f3', key: 'status', label: 'Status', type: 'ENUM', required: false, options: ['Approved', 'Pending'] }] }

  it('filters only the folder hierarchy while retaining matching ancestors', () => {
    expect(filterFolderTree(tree, 'budget').map(item => item.name)).toEqual(['Finance'])
    expect(filterFolderTree(tree, 'budget')[0].children[0].name).toBe('Budget')
  })

  it('uses the existing picker only when no collection is open and opens dynamic fields directly in context', () => {
    const picker = renderToStaticMarkup(<RecordDialog tree={tree} initialCategory={tree[0]} initialCollection={null} record={null} onClose={() => {}} onSaved={() => {}} refreshTree={async () => {}} />)
    expect(picker).toContain('Folder ရှာရန်')
    expect(picker).toContain('Data File')
    expect(picker).toContain('New Folder')
    const form = renderToStaticMarkup(<RecordDialog tree={tree} initialCategory={tree[0].children[0]} initialCollection={collection} record={null} onClose={() => {}} onSaved={() => {}} refreshTree={async () => {}} />)
    expect(form).not.toContain('Location')
    expect(form).not.toContain('Data File')
    expect(form).not.toContain('Structured Data')
    expect(form).toContain('Department')
    expect(form).toContain('type="number"')
    expect(form).toContain('>View<')
    expect(form).not.toContain('ခေါင်းစဉ်')
    expect(form).not.toContain('New Folder')
    expect(fieldInputType('BOOLEAN')).toBe('checkbox')
  })

  it('opens a selected collection by double-click or Enter and clears parent context on Back', () => {
    const onOpen = vi.fn()
    const onSelect = vi.fn()
    const row = DataCollectionRow({ item: collection, selected: true, onSelect, onOpen, onMenu: vi.fn() })
    row.props.onClick()
    expect(onSelect).toHaveBeenCalledWith(collection)
    expect(onOpen).not.toHaveBeenCalled()
    row.props.onDoubleClick()
    const preventDefault = vi.fn()
    row.props.onKeyDown({ key: 'Enter', preventDefault })
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onOpen).toHaveBeenNthCalledWith(1, collection)
    expect(preventDefault).toHaveBeenCalledOnce()

    const setCollection = vi.fn()
    const setSelectedCollectionId = vi.fn()
    const onClearCollection = vi.fn()
    clearCollectionContext({ setCollection, setSelectedCollectionId, onClearCollection })
    expect(setCollection).toHaveBeenCalledWith(null)
    expect(setSelectedCollectionId).toHaveBeenCalledWith(null)
    expect(onClearCollection).toHaveBeenCalledOnce()
  })

  it('renders the focused DataCollection kebab actions in usage order', () => {
    const callback = () => {}
    const html = renderToStaticMarkup(<CollectionMenu position={{ top: 0 }} onClose={callback} onOpen={callback} onAdd={callback} onDetails={callback} />)
    const labels = ['Open', 'Add New', 'Details']
    labels.forEach(label => expect(html).toContain(`>${label}<`))
    expect(labels.map(label => html.indexOf(`>${label}<`))).toEqual([...labels.map(label => html.indexOf(`>${label}<`))].sort((a, b) => a - b))
    expect(html).not.toContain('Rename')
    expect(html).not.toContain('Move')
    expect(html).not.toContain('Delete')
    expect(html).not.toContain('Dashboard')
    expect(html).not.toContain('Export')
  })

  it('loads full collection details before Records View and generates internal record titles', async () => {
    globalThis.sessionStorage = { getItem: () => 'access-token' }
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: collection }) }))
    await expect(dataCollectionDetailsRequest(collection.id)).resolves.toEqual(collection)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/data/collections/collection-1', expect.any(Object))
    expect(generateRecordTitle({ fields: collection.fields, payload: { department: 'Finance' }, collectionName: collection.name })).toBe('Finance')
    expect(generateRecordTitle({ fields: collection.fields, payload: {}, collectionName: collection.name })).toBe('Record - 2026 Budget')
    expect(generateRecordTitle({ fields: collection.fields, payload: { department: 'Changed' }, existingTitle: 'Existing title', collectionName: collection.name })).toBe('Existing title')
  })

  it('wires server-side search, equality filters, sorting, and cursor loading', () => {
    const params = recordQueryParams({ dataCollectionId: 'collection-1', search: 'finance', filters: { status: 'Approved' }, sortBy: 'title', sortDirection: 'asc', cursor: 'next-1' })
    expect(params.get('search')).toBe('finance')
    expect(params.get('filters')).toBe(JSON.stringify({ status: 'Approved' }))
    expect(params.get('cursor')).toBe('next-1')
    expect(params.get('limit')).toBe('50')
  })

  it('creates records through the existing unified DataRecord endpoint', async () => {
    globalThis.sessionStorage = { getItem: () => 'access-token' }
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: { id: 'record-1' } }) }))
    await createRecordRequest({ title: 'Budget A', accessLevel: 'V4', payload: { amount: 10 }, categoryId: 'budget', dataCollectionId: 'collection-1' })
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/data', expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Budget A', accessLevel: 'V4', payload: { amount: 10 }, categoryId: 'budget', dataCollectionId: 'collection-1' }) }))
  })

  it('navigates folders on a single click and keeps shared semantic file icons consistent', () => {
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    const branches = FolderTree({ nodes: tree, selectedId: 'finance', expanded: new Set(), onSelect, onToggle })
    const row = branches[0].props.children[0]
    row.props.children[1].props.onClick()
    row.props.children[0].props.onClick()
    expect(onSelect).toHaveBeenCalledWith(tree[0])
    expect(onToggle).toHaveBeenCalledWith('finance')
    expect(semanticFileType('xlsx')).toBe('DATA')
    expect(semanticFileType('pdf')).toBe('PDF')
    expect(renderToStaticMarkup(<SemanticFileIcon type="FOLDER" />)).toContain('<svg')
    expect(renderToStaticMarkup(<DataCollectionRow item={collection} selected={false} onSelect={() => {}} onOpen={() => {}} onMenu={() => {}} />)).toContain('Structured Data')
  })

  it('keeps the records header clean and renders Table as the default full toolbar', () => {
    const header = renderToStaticMarkup(<DataRecordsHeader collection={collection} onBack={() => {}} />)
    expect(header).toContain('2026 Budget')
    expect(header).not.toContain('<small>Structured Data</small>')
    const table = renderToStaticMarkup(<DataRecordToolbar viewMode="table" setViewMode={() => {}} search="" setSearch={() => {}} sort={{ sortBy: 'updatedAt', sortDirection: 'desc' }} setSort={() => {}} customize={false} setCustomize={() => {}} onAddRecord={() => {}} onAddWidget={() => {}} />)
    expect(table).toContain('Add New')
    expect(table).toContain('Table')
    expect(table).toContain('Dashboard')
    expect(table).toContain('class="data-record-toolbar data-mode-table"')
    expect(table).not.toContain('data-record-toolbar dashboard')
    expect(table).toContain('မှတ်တမ်းရှာရန်')
    expect(table).not.toContain('Filter')
    expect(table).not.toContain('Export')
    const dashboard = renderToStaticMarkup(<DataRecordToolbar viewMode="dashboard" setViewMode={() => {}} search="" setSearch={() => {}} sort={{ sortBy: 'updatedAt', sortDirection: 'desc' }} setSort={() => {}} customize={false} setCustomize={() => {}} onAddRecord={() => {}} onAddWidget={() => {}} />)
    expect(dashboard).toContain('Add Widget')
    expect(dashboard).toContain('Customize')
    expect(dashboard).toContain('class="data-record-toolbar data-mode-dashboard"')
    expect(dashboard).not.toContain('data-record-toolbar dashboard')
    expect(dashboard).not.toContain('မှတ်တမ်းရှာရန်')
    expect(dashboard).not.toContain('Add New')
    expect(workspaceSource).not.toContain('className={`data-record-toolbar ${viewMode}`}')
    expect(dashboardCss).toContain('.data-record-toolbar.data-mode-dashboard')
    expect(dashboardCss).not.toContain('.data-record-toolbar.dashboard')
  })

  it('switches between Table and Dashboard and preserves Add Widget', () => {
    const setViewMode = vi.fn()
    const toolbar = DataRecordToolbar({ viewMode: 'table', setViewMode, search: '', setSearch: vi.fn(), sort: { sortBy: 'updatedAt', sortDirection: 'desc' }, setSort: vi.fn(), customize: false, setCustomize: vi.fn(), onAddRecord: vi.fn(), onAddWidget: vi.fn() })
    const viewSwitch = toolbar.props.children[0].props.children[1]
    viewSwitch.props.children[1].props.onClick()
    expect(setViewMode).toHaveBeenCalledWith('dashboard')
    const onAddWidget = vi.fn()
    const dashboardToolbar = DataRecordToolbar({ viewMode: 'dashboard', setViewMode, search: '', setSearch: vi.fn(), sort: { sortBy: 'updatedAt', sortDirection: 'desc' }, setSort: vi.fn(), customize: false, setCustomize: vi.fn(), onAddRecord: vi.fn(), onAddWidget })
    const dashboardSwitch = dashboardToolbar.props.children[0].props.children[1]
    dashboardSwitch.props.children[0].props.onClick()
    expect(setViewMode).toHaveBeenCalledWith('table')
    dashboardToolbar.props.children[1].props.children[0].props.onClick()
    expect(onAddWidget).toHaveBeenCalledOnce()
  })

  it('renders the dashboard empty state and configured KPI, Pie, Bar, and Line widgets', () => {
    const empty = renderToStaticMarkup(<DataDashboard loading={false} error="" items={[]} customize={false} onAdd={() => {}} onEdit={() => {}} onRemove={() => {}} onMove={() => {}} />)
    expect(empty).toContain('Dashboard not set up yet')
    expect(empty).toContain('Set Up Dashboard')
    const items = ['KPI', 'PIE', 'BAR', 'LINE'].map((chartType, index) => ({ widget: { id: `w${index}`, title: `${chartType} widget`, chartType, aggregation: 'COUNT' }, data: chartType === 'KPI' ? { value: 12 } : { series: [{ label: 'A', value: 8 }, { label: 'B', value: 4 }] } }))
    const configured = renderToStaticMarkup(<DataDashboard loading={false} error="" items={items} customize onAdd={() => {}} onEdit={() => {}} onRemove={() => {}} onMove={() => {}} />)
    items.forEach(item => expect(configured).toContain(item.widget.title))
    expect(configured).toContain('Move up')
    expect(configured).toContain('Remove')
    expect(renderToStaticMarkup(<WidgetVisualization widget={items[1].widget} data={items[1].data} />)).toContain('data-pie')
    const failed = renderToStaticMarkup(<DataDashboard loading={false} error="Dashboard request failed" items={[]} customize={false} onAdd={() => {}} onEdit={() => {}} onRemove={() => {}} onMove={() => {}} />)
    expect(failed).toContain('Dashboard request failed')
  })

  it('builds smart widget fields, previews unsaved widgets, and scopes loading to one collection', async () => {
    expect(widgetFieldChoices(collection.fields, 'PIE').dimensions.map(field => field.id)).toEqual(['f1', 'f3'])
    expect(widgetFieldChoices([...collection.fields, { id: 'date', type: 'DATE' }], 'LINE').dimensions.map(field => field.id)).toEqual(['date'])
    const body = widgetRequestBody({ title: ' Total ', chartType: 'KPI', dimensionFieldId: '', measureFieldId: '', aggregation: 'COUNT', timeGrouping: '', accessLevel: 'V4', sortOrder: 0 }, collection.id)
    expect(body).toMatchObject({ title: 'Total', dataCollectionId: collection.id, chartType: 'KPI', measureFieldId: null })
    globalThis.sessionStorage = { getItem: () => 'access-token' }
    globalThis.fetch = vi.fn(async url => ({ ok: true, json: async () => url.includes('/preview') ? { data: { data: { value: 9 } } } : { data: [{ id: 'widget-1', dataCollectionId: collection.id }] } }))
    const loaded = await loadCollectionDashboard(collection.id)
    expect(loaded).toHaveLength(1)
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/admin/dashboard-widgets?dataCollectionId=collection-1', expect.any(Object))
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/admin/dashboard-widgets/widget-1/preview', expect.any(Object))
    const preview = await previewDashboardWidget(body)
    expect(preview.data.value).toBe(9)
  })

  it('uses existing widget create, edit, archive, and reorder endpoints', async () => {
    globalThis.sessionStorage = { getItem: () => 'access-token' }
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: { id: 'saved' } }) }))
    const body = widgetRequestBody({ title: 'Total', chartType: 'KPI', dimensionFieldId: '', measureFieldId: '', aggregation: 'COUNT', timeGrouping: '', accessLevel: 'V4', sortOrder: 0 }, collection.id)
    await saveDashboardWidget(body)
    await saveDashboardWidget(body, 'widget-1')
    await archiveDashboardWidget('widget-1')
    await reorderDashboardWidgets([{ widget: { id: 'widget-2' } }, { widget: { id: 'widget-1' } }])
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/dashboard-widgets', expect.objectContaining({ method: 'POST' }))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/dashboard-widgets/widget-1', expect.objectContaining({ method: 'PATCH' }))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/dashboard-widgets/widget-1/archive', expect.objectContaining({ method: 'POST' }))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/dashboard-widgets/widget-2', expect.objectContaining({ body: JSON.stringify({ sortOrder: 0 }) }))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/dashboard-widgets/widget-1', expect.objectContaining({ body: JSON.stringify({ sortOrder: 1 }) }))
  })

  it('offers the exact record menu and wires kebab, edit, and soft delete requests', async () => {
    const callback = () => {}
    const menu = renderToStaticMarkup(<RecordMenu position={{ top: 0 }} onClose={callback} onDetails={callback} onEdit={callback} onDelete={callback} />)
    expect(menu).toContain('Edit')
    expect(menu).toContain('Details')
    expect(menu).toContain('Delete')
    expect(menu).not.toContain('>View<')
    vi.stubGlobal('sessionStorage',{getItem:key=>key==='office_user'?JSON.stringify({role:'ADMIN',clearance:'V1'}):null})
    const editor = renderToStaticMarkup(<RecordDialog tree={tree} initialCategory={tree[0].children[0]} initialCollection={collection} record={{ id: 'record-1', title: 'Budget row', accessLevel: 'V2', payload: { department: 'Finance', amount: 10 } }} onClose={() => {}} onSaved={() => {}} refreshTree={async () => {}} />)
    expect(editor).toContain('value="Finance"')
    expect(editor).toContain('<option value="V2" selected="">V2</option>')
    const confirmation = renderToStaticMarkup(<ConfirmDialog title="Delete this record?" message="Are you sure you want to delete this record?" confirmLabel="Delete" onCancel={() => {}} onConfirm={() => {}} busy={false} />)
    expect(confirmation).toContain('Delete this record?')
    expect(confirmation).toContain('Are you sure')
    const onMenu = vi.fn()
    const record = { id: 'record-1', title: 'Budget row', payload: { department: 'Finance', amount: 10 }, updatedAt: '2026-01-01' }
    const row = DataRecordRow({ record, collection, onDetails: vi.fn(), onMenu })
    const button = row.props.children[3].props.children
    const stopPropagation = vi.fn()
    button.props.onClick({ stopPropagation, currentTarget: { getBoundingClientRect: () => ({ right: 10, bottom: 20 }) } })
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onMenu).toHaveBeenCalledWith(expect.any(Object), record, { right: 10, bottom: 20 })
    globalThis.sessionStorage = { getItem: () => 'access-token' }
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ data: record }) }))
    await updateRecordRequest(record.id, { title: record.title, payload: record.payload, accessLevel: 'V4' })
    await archiveRecordRequest(record.id)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/data/record-1', expect.objectContaining({ method: 'PATCH' }))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/data/record-1/archive', expect.objectContaining({ method: 'POST' }))
  })

  it('limits high-cardinality chart series and exposes a focused widget editor', () => {
    const series = Array.from({ length: 12 }, (_, index) => ({ label: `Item ${index + 1}`, value: 1 }))
    const limited = topSeriesWithOthers(series)
    expect(limited).toHaveLength(10)
    expect(limited.at(-1)).toEqual({ label: 'Others', value: 3 })
    const editor = renderToStaticMarkup(<DashboardDialog collection={{ ...collection, fields: [...collection.fields, { id: 'date', key: 'date', label: 'Date', type: 'DATE' }] }} onClose={() => {}} onSaved={() => {}} />)
    expect(editor).toContain('Add Widget')
    expect(editor).toContain('Preview')
    expect(editor).toContain('Widget Type')
    expect(editor).toContain('Content level')
    for (const chartType of ['KPI', 'PIE', 'BAR', 'LINE']) expect(editor).toContain(`>${chartType}</option>`)
    expect(editor).not.toContain('CATEGORY_SUMMARY')
    const valid = { title: 'Records', chartType: 'KPI', aggregation: 'COUNT', dimensionFieldId: '', measureFieldId: '' }
    expect(widgetFormError(valid, collection.fields)).toBe('')
    expect(widgetFormError({ ...valid, chartType: 'PIE', dimensionFieldId: 'f1' }, collection.fields)).toBe('')
    expect(widgetFormError({ ...valid, chartType: 'BAR', dimensionFieldId: 'f3' }, collection.fields)).toBe('')
    expect(widgetFormError({ ...valid, chartType: 'LINE', dimensionFieldId: 'date' }, [...collection.fields, { id: 'date', type: 'DATE' }])).toBe('')
    for (const aggregation of ['SUM', 'AVG', 'MIN', 'MAX']) {
      expect(widgetFormError({ ...valid, aggregation, measureFieldId: '' }, collection.fields)).toContain('Number field')
      expect(widgetFormError({ ...valid, aggregation, measureFieldId: 'f2' }, collection.fields)).toBe('')
    }
    expect(widgetFormError({ ...valid, chartType: 'LINE', dimensionFieldId: 'f1' }, collection.fields)).toContain('Date field')
    expect(widgetFormError({ ...valid, chartType: 'PIE', dimensionFieldId: 'f2' }, collection.fields)).toContain('valid Group By')
  })
})
