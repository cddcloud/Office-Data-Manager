import { describe, expect, it } from 'vitest'
import { validateMappings } from '../server/scripts/workflow-mapping.js'

const empty = () => Object.fromEntries(['User','AccountInvite','Category','DataCollection','DataRecord','Document','ImportJob','DashboardWidget'].map(table => [table, []]))

describe('explicit legacy mapping validation', () => {
  it('fails closed on unmapped or unknown IDs and preserves the Main Admin identity', () => {
    const current = empty()
    current.User = [{ id: 'primary', isPrimaryAdmin: 'true', role: 'ADMIN' }]
    expect(() => validateMappings(current, {})).toThrow('Explicit mapping required')
    expect(() => validateMappings(current, { User: { missing: { role: 'ADMIN', clearance: 'V1' } } })).toThrow('Unknown User ID')
    expect(() => validateMappings(current, { User: { primary: { role: 'VIEWER', clearance: 'V4' } } })).toThrow('Preserve the existing Main Admin')
    expect(validateMappings(current, { User: { primary: { role: 'ADMIN', clearance: 'V1' } } })).toEqual([{ table: 'User', id: 'primary', data: { role: 'ADMIN', clearance: 'V1' } }])
  })
  it('requires unique explicit root slots and never converts children to roots', () => {
    const current = empty()
    current.Category = [{ id: 'root-a', parentId: null, mainSlot: null }, { id: 'root-b', parentId: null, mainSlot: null }, { id: 'child', parentId: 'root-a', mainSlot: null }]
    const mapping = { Category: { 'root-a': { accessLevel: 'V4', mainSlot: 1 }, 'root-b': { accessLevel: 'V4', mainSlot: 1 }, child: { accessLevel: 'V2' } } }
    expect(() => validateMappings(current, mapping)).toThrow('six-slot decision')
    mapping.Category['root-b'].mainSlot = 2
    expect(validateMappings(current, mapping)).toHaveLength(3)
    mapping.Category.child.mainSlot = 3
    expect(() => validateMappings(current, mapping)).toThrow('Do not convert child')
  })
})
