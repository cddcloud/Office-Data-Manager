import { describe, expect, it } from 'vitest'
import { adminNavigation } from '../src/admin-navigation.js'
import fs from 'node:fs'
import path from 'node:path'

const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8')

describe('Admin navigation', () => {
  it('uses the final visible drawer labels in order', () => {
    const labels = adminNavigation.map(([, label]) => label)
    expect(labels).toEqual(['Home Page', 'File Manager', 'Data', 'User & Access', 'Dashboard', 'Demo / Design Reference'])
    expect(labels).not.toContain('လုပ်ဆောင်ချက်မှတ်တမ်း')
  })

  it('removes Settings, labels server-backed sign-out Logout, and suppresses duplicate account context', () => {
    const shell = appSource.slice(appSource.indexOf('return <div className={`app drawer-shell'), appSource.indexOf("{page==='overview'&&"))
    expect(shell).not.toContain('စနစ်ဆက်တင်များ')
    expect(shell).toContain('<span className="foot-label">Logout</span>')
    expect(shell).toContain("!['entry','categories','accounts','dashboard','overview'].includes(page)")
  })
})
