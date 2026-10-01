import { Prisma } from '@prisma/client'
import { allowedAccessLevels, assertInputLevel, authorizedCategoryIds, collectionWhere, resolveActor } from '../../lib/access.js'
import { createAuditService } from '../../lib/audit.js'
import { DomainError, notFound } from '../../lib/errors.js'
import { validateRecordPayload } from '../data/data.validation.js'

const includeDefinition = { dataCollection: true, dimensionField: true, measureField: true, createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } }

export function validateWidgetConfiguration(input, fields) {
  const byId = new Map(fields.map(field => [field.id, field]))
  const dimension = input.dimensionFieldId ? byId.get(input.dimensionFieldId) : null
  const measure = input.measureFieldId ? byId.get(input.measureFieldId) : null
  if (input.dimensionFieldId && !dimension) throw new DomainError(422, 'INVALID_DIMENSION_FIELD', 'The dimension field does not belong to the selected data collection')
  if (input.measureFieldId && !measure) throw new DomainError(422, 'INVALID_MEASURE_FIELD', 'The measure field does not belong to the selected data collection')
  if (['PIE', 'BAR', 'LINE'].includes(input.chartType) && !dimension) throw new DomainError(422, 'DIMENSION_REQUIRED', 'This chart type requires a dimension field')
  if (input.aggregation !== 'COUNT' && (!measure || measure.type !== 'NUMBER')) throw new DomainError(422, 'NUMERIC_MEASURE_REQUIRED', 'This aggregation requires a numeric measure field')
  if (input.chartType === 'LINE' && (dimension?.type !== 'DATE' || !input.timeGrouping)) throw new DomainError(422, 'TIME_DIMENSION_REQUIRED', 'A line chart requires a date dimension and time grouping')
  if (input.chartType !== 'LINE' && input.timeGrouping) throw new DomainError(422, 'INVALID_TIME_GROUPING', 'Time grouping is supported only for line charts')
  const savedFilters = input.savedFilters == null ? input.savedFilters : validateRecordPayload(fields, input.savedFilters, { partial: true })
  return { dimension, measure, savedFilters }
}

function aggregateExpression(widget) {
  if (widget.aggregation === 'COUNT') return Prisma.sql`COUNT(*)::float8`
  const value = Prisma.sql`NULLIF(dr."payload" ->> ${widget.measureField.key}, '')::numeric`
  if (widget.aggregation === 'SUM') return Prisma.sql`COALESCE(SUM(${value}), 0)::float8`
  if (widget.aggregation === 'AVG') return Prisma.sql`COALESCE(AVG(${value}), 0)::float8`
  if (widget.aggregation === 'MIN') return Prisma.sql`COALESCE(MIN(${value}), 0)::float8`
  return Prisma.sql`COALESCE(MAX(${value}), 0)::float8`
}

function filterSql(widget) {
  const entries = Object.entries(widget.savedFilters || {})
  return entries.map(([key, value]) => Prisma.sql`dr."payload" ->> ${key} = ${String(value)}`)
}

export async function aggregateWidget(prisma, widget, role, level) {
  const levels = allowedAccessLevels(role).filter(value => !level || value === level)
  const ids = await authorizedCategoryIds(prisma, role)
  if (!levels.length || !ids.length) return widget.chartType === 'KPI' ? { value: 0 } : { series: [] }
  const access = Prisma.join(levels.map(level => Prisma.sql`${level}::"AccessLevel"`))
  const clauses = [
    Prisma.sql`dr."dataCollectionId" = ${widget.dataCollectionId}`,
    Prisma.sql`dr."archivedAt" IS NULL`,
    Prisma.sql`dr."accessLevel" IN (${access})`,
    Prisma.sql`EXISTS (SELECT 1 FROM "DataCollection" dc WHERE dc."id" = dr."dataCollectionId" AND dc."archivedAt" IS NULL AND dc."defaultAccessLevel" IN (${access}) AND dc."categoryId" IN (${Prisma.join(ids)}))`,
    Prisma.sql`dr."categoryId" IN (${Prisma.join(ids)})`,
    ...filterSql(widget),
  ]
  const where = Prisma.join(clauses, ' AND ')
  const aggregate = aggregateExpression(widget)

  if (widget.chartType === 'KPI') {
    const rows = await prisma.$queryRaw(Prisma.sql`SELECT ${aggregate} AS value FROM "DataRecord" dr WHERE ${where}`)
    return { value: Number(rows[0]?.value || 0) }
  }
  if (widget.chartType === 'CATEGORY_SUMMARY') {
    const rows = await prisma.$queryRaw(Prisma.sql`SELECT c."name" AS label, ${aggregate} AS value FROM "DataRecord" dr JOIN "Category" c ON c."id" = dr."categoryId" WHERE ${where} GROUP BY c."id", c."name" ORDER BY value DESC LIMIT 100`)
    return { series: rows.map(row => ({ label: row.label, value: Number(row.value) })) }
  }

  let dimension = Prisma.sql`dr."payload" ->> ${widget.dimensionField.key}`
  if (widget.chartType === 'LINE') {
    dimension = Prisma.sql`date_trunc(${widget.timeGrouping.toLowerCase()}, NULLIF(dr."payload" ->> ${widget.dimensionField.key}, '')::timestamptz)`
  }
  const rows = await prisma.$queryRaw(Prisma.sql`SELECT ${dimension} AS label, ${aggregate} AS value FROM "DataRecord" dr WHERE ${where} GROUP BY 1 ORDER BY ${widget.chartType === 'LINE' ? Prisma.sql`1` : Prisma.sql`value DESC`} LIMIT 100`)
  return { series: rows.map(row => ({ label: row.label instanceof Date ? row.label.toISOString() : String(row.label ?? 'Unspecified'), value: Number(row.value) })) }
}

export function createDashboardService(prisma) {
  async function fieldsForCollection(id, actor) {
    const collection = await prisma.dataCollection.findFirst({ where: { id, ...await collectionWhere(prisma, actor) }, include: { fields: true } })
    if (!collection) throw notFound('Data collection')
    return collection.fields
  }
  async function widget(id, actor, includeArchived = false) {
    const value = await prisma.dashboardWidget.findFirst({ where: { id, accessLevel: { in: allowedAccessLevels(actor) }, dataCollection: await collectionWhere(prisma, actor, includeArchived), ...(includeArchived ? {} : { archivedAt: null }) }, include: includeDefinition })
    if (!value) throw notFound('Dashboard widget')
    return value
  }
  return {
    async listAdmin(dataCollectionId, actor) {
      return prisma.dashboardWidget.findMany({ where: { archivedAt: null, accessLevel: { in: allowedAccessLevels(actor) }, dataCollection: await collectionWhere(prisma, actor), ...(dataCollectionId ? { dataCollectionId } : {}) }, include: includeDefinition, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    },
    get: widget,
    async create(input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      assertInputLevel(actor, input.accessLevel)
      const { savedFilters } = validateWidgetConfiguration(input, await fieldsForCollection(input.dataCollectionId, actor))
      return prisma.$transaction(async tx => {
        const created = await tx.dashboardWidget.create({ data: { ...input, savedFilters, createdById: actorId, updatedById: actorId }, include: includeDefinition })
        await createAuditService(tx).record({ actorId, action: 'DASHBOARD_WIDGET_CREATED', entityType: 'DashboardWidget', entityId: created.id, after: created })
        return created
      })
    },
    async update(id, input, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await widget(id, actor, true)
      if (input.accessLevel) assertInputLevel(actor, input.accessLevel, before.accessLevel)
      const proposed = { ...before, ...input }
      const { savedFilters } = validateWidgetConfiguration(proposed, await fieldsForCollection(proposed.dataCollectionId, actor))
      return prisma.$transaction(async tx => {
        const data = Object.hasOwn(input, 'savedFilters') ? { ...input, savedFilters } : input
        const after = await tx.dashboardWidget.update({ where: { id }, data: { ...data, updatedById: actorId }, include: includeDefinition })
        await createAuditService(tx).record({ actorId, action: 'DASHBOARD_WIDGET_UPDATED', entityType: 'DashboardWidget', entityId: id, before, after })
        return after
      })
    },
    async archive(id, actorId) {
      const actor = await resolveActor(prisma, actorId)
      const before = await widget(id, actor, true)
      return prisma.$transaction(async tx => {
        const after = await tx.dashboardWidget.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, updatedById: actorId }, include: includeDefinition })
        await createAuditService(tx).record({ actorId, action: 'DASHBOARD_WIDGET_ARCHIVED', entityType: 'DashboardWidget', entityId: id, before, after })
        return after
      })
    },
    async preview(id, role) {
      const selected = await widget(id, role)
      return { widget: selected, data: await aggregateWidget(prisma, selected, role) }
    },
    async previewConfiguration(input, actor) {
      assertInputLevel(actor, input.accessLevel)
      const { dimension, measure, savedFilters } = validateWidgetConfiguration(input, await fieldsForCollection(input.dataCollectionId, actor))
      const selected = { ...input, dimensionField: dimension, measureField: measure, savedFilters }
      return { widget: selected, data: await aggregateWidget(prisma, selected, actor) }
    },
    async viewerDashboard(role, level) {
      const widgets = await prisma.dashboardWidget.findMany({ where: { archivedAt: null, isActive: true, dataCollection: await collectionWhere(prisma, role), accessLevel: { in: allowedAccessLevels(role) } }, include: includeDefinition, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
      return Promise.all(widgets.map(async item => ({ widget: item, data: await aggregateWidget(prisma, item, role, level) })))
    },
  }
}
