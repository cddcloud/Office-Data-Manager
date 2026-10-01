import { describe, expect, it, vi } from 'vitest'
import { aggregateWidget, createDashboardService, validateWidgetConfiguration } from '../server/modules/dashboard/dashboard.service.js'

const fields = [
  { id: 'department', key: 'department', type: 'TEXT', required: false },
  { id: 'budget', key: 'budget', type: 'NUMBER', required: false },
  { id: 'date', key: 'date', type: 'DATE', required: false },
]

describe('dashboard widget validation', () => {
  it('accepts meaningful KPI, pie, and trend configurations', () => {
    expect(() => validateWidgetConfiguration({ chartType: 'KPI', aggregation: 'SUM', measureFieldId: 'budget' }, fields)).not.toThrow()
    expect(() => validateWidgetConfiguration({ chartType: 'PIE', aggregation: 'SUM', dimensionFieldId: 'department', measureFieldId: 'budget' }, fields)).not.toThrow()
    expect(() => validateWidgetConfiguration({ chartType: 'LINE', aggregation: 'SUM', dimensionFieldId: 'date', measureFieldId: 'budget', timeGrouping: 'MONTH' }, fields)).not.toThrow()
  })

  it('rejects nonnumeric measures and invalid trend dimensions', () => {
    expect(() => validateWidgetConfiguration({ chartType: 'PIE', aggregation: 'SUM', dimensionFieldId: 'department', measureFieldId: 'department' }, fields)).toThrowError(expect.objectContaining({ code: 'NUMERIC_MEASURE_REQUIRED' }))
    expect(() => validateWidgetConfiguration({ chartType: 'LINE', aggregation: 'COUNT', dimensionFieldId: 'department', timeGrouping: 'MONTH' }, fields)).toThrowError(expect.objectContaining({ code: 'TIME_DIMENSION_REQUIRED' }))
    expect(() => validateWidgetConfiguration({ chartType: 'BAR', aggregation: 'COUNT' }, fields)).toThrowError(expect.objectContaining({ code: 'DIMENSION_REQUIRED' }))
  })

  it('validates and normalizes saved filters against collection fields', () => {
    expect(validateWidgetConfiguration({ chartType: 'KPI', aggregation: 'COUNT', savedFilters: { budget: '1,250' } }, fields).savedFilters).toEqual({ budget: 1250 })
    expect(() => validateWidgetConfiguration({ chartType: 'KPI', aggregation: 'COUNT', savedFilters: { missing: 'value' } }, fields)).toThrowError(expect.objectContaining({ code: 'UNKNOWN_DATA_FIELDS' }))
  })

  it('lists widgets for one collection and previews an unsaved configuration server-side', async () => {
    const findMany = vi.fn(async () => [])
    const prisma = {
      user:{findUnique:async({where})=>({id:where.id,role:'ADMIN',clearance:'V1',isActive:true})},
      category:{findMany:async()=>[{id:'category-1',parentId:null,accessLevel:'V4',archivedAt:null}]},
      dataCollection: { findFirst: vi.fn(async () => ({ id: 'collection-1', fields })) },
      dashboardWidget: { findMany },
      $queryRaw: vi.fn(async () => [{ value: 7 }]),
    }
    const service = createDashboardService(prisma)
    await service.listAdmin('collection-1',{role:'ADMIN',clearance:'V1'})
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dataCollectionId: 'collection-1' }) }))
    const preview = await service.previewConfiguration({ title: 'Total records', dataCollectionId: 'collection-1', chartType: 'KPI', aggregation: 'COUNT', accessLevel: 'V4', sortOrder: 0, isActive: true },{role:'ADMIN',clearance:'V1'})
    expect(preview.data).toEqual({ value: 7 })
    expect(preview.widget.dataCollectionId).toBe('collection-1')
  })

  it('tracks the real creator and latest modifier for dashboard widgets', async () => {
    let widget = null
    const audits = []
    const prisma = {
      user:{findUnique:async({where})=>({id:where.id,role:'ADMIN',clearance:'V1',isActive:true})},
      category:{findMany:async()=>[{id:'category-1',parentId:null,accessLevel:'V4',archivedAt:null}]},
      dataCollection: { findFirst: vi.fn(async () => ({ id: 'collection-1', fields })) },
      dashboardWidget: {
        create: vi.fn(async ({ data }) => { widget = { id: 'widget-1', archivedAt: null, ...data }; return widget }),
        findFirst: vi.fn(async () => widget),
        update: vi.fn(async ({ data }) => { widget = { ...widget, ...data }; return widget }),
      },
      auditLog: { create: vi.fn(async ({ data }) => { audits.push(data); return data }) },
      $transaction: callback => callback(prisma),
    }
    const service = createDashboardService(prisma)
    const created = await service.create({ title: 'Records', dataCollectionId: 'collection-1', chartType: 'KPI', aggregation: 'COUNT', accessLevel: 'V4', sortOrder: 0, isActive: true }, 'admin-1')
    expect(created).toMatchObject({ createdById: 'admin-1', updatedById: 'admin-1' })
    const updated = await service.update(created.id, { title: 'All Records' }, 'admin-2')
    expect(updated.updatedById).toBe('admin-2')
    expect(audits.at(-1)).toMatchObject({ action: 'DASHBOARD_WIDGET_UPDATED', actorId: 'admin-2' })
  })

  it('aggregates Excel-imported count, numeric, and date-compatible payloads', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ value: 3 }])
      .mockResolvedValueOnce([{ value: 75.5 }])
      .mockResolvedValueOnce([{ label: new Date('2026-01-01T00:00:00.000Z'), value: 2 }])
    const prisma = { category:{findMany:async()=>[{id:'category-1',parentId:null,accessLevel:'V4',archivedAt:null}]}, $queryRaw: queryRaw }
    const base = { dataCollectionId: 'collection-1', savedFilters: null }
    await expect(aggregateWidget(prisma, { ...base, chartType: 'KPI', aggregation: 'COUNT' }, { role: 'ADMIN', clearance: 'V1' })).resolves.toEqual({ value: 3 })
    await expect(aggregateWidget(prisma, { ...base, chartType: 'KPI', aggregation: 'SUM', measureField: { key: 'amount' } }, { role: 'ADMIN', clearance: 'V1' })).resolves.toEqual({ value: 75.5 })
    await expect(aggregateWidget(prisma, { ...base, chartType: 'LINE', aggregation: 'COUNT', dimensionField: { key: 'date' }, timeGrouping: 'MONTH' }, { role: 'ADMIN', clearance: 'V1' })).resolves.toEqual({ series: [{ label: '2026-01-01T00:00:00.000Z', value: 2 }] })
    expect(queryRaw).toHaveBeenCalledTimes(3)
  })
})
