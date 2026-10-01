import { describe, expect, it } from 'vitest'
import { createReportService } from '../server/modules/reports/report.service.js'

function database() {
  const collection = { id: 'collection-1', name: 'Budget 2026', archivedAt: null, fields: [{ key: 'department', label: 'Department', type: 'TEXT', position: 0 }, { key: 'budget', label: 'Budget', type: 'NUMBER', position: 1 }] }
  const rows = [
    { id: 'normal', title: 'Normal row', accessLevel: 'V4', payload: { department: 'Finance', budget: 500 }, createdAt: new Date() },
    { id: 'vip', title: 'VIP row', accessLevel: 'V2', payload: { department: 'Executive', budget: 900 }, createdAt: new Date() },
  ]
  const audits = []
  return {
    audits,
    category:{findMany:async()=>[{id:'category-1',parentId:null,accessLevel:'V4',archivedAt:null}]},
    dataCollection: { findFirst: async () => collection },
    dataRecord: { findMany: async ({ where }) => rows.filter(row => where.accessLevel.in.includes(row.accessLevel)) },
    auditLog: { create: async ({ data }) => { audits.push(data); return data } },
  }
}

describe('authorized reports', () => {
  it('uses the same V4/V2 access filter for print-friendly output', async () => {
    const db = database()
    const normal = await createReportService(db).generate({ dataCollectionId: 'collection-1', format: 'json' }, { id: 'normal-user', role: 'VIEWER', clearance: 'V4', permissionVersion: 0 })
    const vip = await createReportService(db).generate({ dataCollectionId: 'collection-1', format: 'json' }, { id: 'vip-user', role: 'VIEWER', clearance: 'V2', permissionVersion: 0 })
    expect(normal.body.records.map(row => row.id)).toEqual(['normal'])
    expect(vip.body.records.map(row => row.id)).toEqual(['normal', 'vip'])
    expect(db.audits.every(item => item.action === 'REPORT_EXPORTED')).toBe(true)
  })

  it('generates real Excel and PDF output buffers', async () => {
    const db = database()
    const excel = await createReportService(db).generate({ dataCollectionId: 'collection-1', format: 'xlsx' }, { id: 'admin', role: 'ADMIN', clearance: 'V1', permissionVersion: 0 })
    const pdf = await createReportService(db).generate({ dataCollectionId: 'collection-1', format: 'pdf' }, { id: 'admin', role: 'ADMIN', clearance: 'V1', permissionVersion: 0 })
    expect(excel.body.subarray(0, 2).toString()).toBe('PK')
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF')
  })
})
