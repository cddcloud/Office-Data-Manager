import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { accountAccessOptions, accountActionItems, accountMenuPosition, runAccountAction } from '../src/accounts/accounts-utils.js'
import { copyText } from '../src/accounts/copy-text.js'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/accounts/AccountsAccess.jsx'), 'utf8')
const linkPageSource = fs.readFileSync(path.resolve(process.cwd(), 'src/accounts/AccountLinkPage.jsx'), 'utf8')
const enhancementCss = fs.readFileSync(path.resolve(process.cwd(), 'src/accounts/accounts-access-enhancements.css'), 'utf8')

describe('User & Access acceptance UI', () => {
  it('uses the final role labels and assignment order without exposing Main Admin', () => {
    expect(accountAccessOptions).toEqual([
      { value: 'VIEWER', label: 'Viewer' },
      { value: 'ADMIN', label: 'Admin' },
    ])
    expect(accountAccessOptions.some(option => option.label === 'Main Admin')).toBe(false)
  })

  it('is one focused page with no duplicate body title or access-level tabs', () => {
    expect(source).not.toContain('role="tablist"')
    expect(source).not.toContain('Access Levels')
    expect(source).not.toContain('accounts-heading')
    expect(source).not.toContain('စနစ်စီမံခန့်ခွဲမှု')
    expect(source).not.toContain('<h1>Accounts')
  })

  it('contains the compact summaries, filters, sequential No column, and role entry point', () => {
    expect(source).toContain('Total Users')
    expect(source).toContain('Setup Required')
    expect(source).toContain('Deactivated')
    expect(source).toContain('Search users...')
    expect(source).toContain('All levels')
    expect(source).toContain('All Status')
    expect(source).toContain('<th>No</th>')
    expect(source).toContain('{index + 1}')
    expect(source).toContain('setChangeAccess({ ...row, nextClearance: row.clearance })')
  })

  it('keeps Search, Role, Status, and Add Account in one desktop toolbar', () => {
    const toolbar = source.slice(source.indexOf('<div className="accounts-toolbar account-filter-toolbar">'), source.indexOf('</div>\n      {loading ?'))
    for (const item of ['Search users...', 'Filter by clearance', 'Filter by status', 'Add Viewer']) expect(toolbar).toContain(item)
    expect(source).not.toContain('accounts-top-actions')
    expect(enhancementCss).toContain('width:400px')
    expect(enhancementCss).toContain('.account-toolbar-add{margin-left:auto')
  })

  it('keeps Add Account passwordless, concise, and role-card based', () => {
    const addDialog = source.slice(source.indexOf('{showAdd &&'), source.indexOf('{changeAccess &&'))
    expect(addDialog).toContain('title="Add Account"')
    expect(addDialog).toContain('Full Name')
    expect(addDialog).toContain('Email Address')
    expect(addDialog).toContain('submitLabel="Add Account"')
    expect(addDialog).toContain('<RoleOptions')
    expect(addDialog).not.toContain('type="password"')
    expect(source).not.toContain('secure one-time setup link')
    expect(source).not.toContain('Create Setup Link')
  })

  it('keeps account setup and reset frontend validation at 12 characters', () => {
    expect(linkPageSource).toContain('password.length < 12')
    expect((linkPageSource.match(/minLength="12"/g) || [])).toHaveLength(2)
    expect(linkPageSource).toContain('အနည်းဆုံး 12')
  })

  it('limits each row action menu to the approved lifecycle actions', () => {
    expect(accountActionItems({ status: 'ACTIVE', kind: 'USER' })).toEqual(['Reset Login', 'Deactivate'])
    expect(accountActionItems({ status: 'DISABLED', kind: 'USER' })).toEqual(['Reactivate'])
    expect(accountActionItems({ status: 'SETUP_REQUIRED', kind: 'INVITATION' })).toEqual([])
    expect(accountActionItems({ status: 'ACTIVE', kind: 'USER', isPrimaryAdmin: true })).toEqual([])
    const actionsSource = source.slice(source.indexOf('function AccountActions'), source.indexOf('function AccountDialog'))
    expect(actionsSource).not.toContain('Change Access')
    expect(actionsSource).not.toContain('Generate New Setup Link')
    expect(actionsSource).not.toContain('Cancel Invitation')
    expect(source).toContain('Deactivate this user?')
    expect(source).toContain('will be signed out and cannot log in until this account is reactivated.')
  })

  it('portals the row menu outside overflow containers and closes it safely', () => {
    const actionsSource = source.slice(source.indexOf('function AccountActions'), source.indexOf('function AccountDialog'))
    expect(actionsSource).toContain('createPortal(')
    expect(actionsSource).toContain('document.body')
    expect(actionsSource).toContain("document.addEventListener('pointerdown', closeOutside)")
    expect(actionsSource).toContain("window.addEventListener('resize', close)")
    expect(actionsSource).toContain("window.addEventListener('scroll', close, true)")
    expect(enhancementCss).toContain('.account-action-menu-popup{position:fixed')
    expect(enhancementCss).not.toContain('.account-action-menu>div{position:absolute')
  })

  it('positions the menu inside the viewport and flips it above bottom rows', () => {
    const below = accountMenuPosition({ buttonRect: { top: 100, right: 790, bottom: 134 }, menuWidth: 158, menuHeight: 91, viewportWidth: 800, viewportHeight: 700 })
    expect(below).toMatchObject({ position: 'fixed', left: 632, top: 139, opensUpward: false })
    const above = accountMenuPosition({ buttonRect: { top: 650, right: 790, bottom: 684 }, menuWidth: 158, menuHeight: 91, viewportWidth: 800, viewportHeight: 700 })
    expect(above).toMatchObject({ position: 'fixed', left: 632, top: 554, opensUpward: true })
  })

  it('closes before executing a selected lifecycle callback exactly once', () => {
    const setOpen = vi.fn()
    const action = vi.fn()
    runAccountAction(setOpen, action)
    expect(setOpen).toHaveBeenCalledOnce()
    expect(setOpen).toHaveBeenCalledWith(false)
    expect(action).toHaveBeenCalledOnce()
    expect(setOpen.mock.invocationCallOrder[0]).toBeLessThan(action.mock.invocationCallOrder[0])
    const actionsSource = source.slice(source.indexOf('function AccountActions'), source.indexOf('function AccountDialog'))
    expect(actionsSource.match(/run\(on(?:Reset|Deactivate|Reactivate)\)/g)).toHaveLength(3)
  })

  it('validates setup and reset tokens through POST bodies and removes them from browser history', () => {
    expect(linkPageSource).toContain("method: 'POST'")
    expect(linkPageSource).toContain('`${endpoint}/validate`')
    expect(linkPageSource).toContain('JSON.stringify({ token })')
    expect(linkPageSource).toContain('window.history.replaceState')
    expect(linkPageSource).not.toContain('?token=')
  })
})

describe('copyText', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn(async () => {})
    await expect(copyText('setup-link', { navigator: { clipboard: { writeText } } })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('setup-link')
  })

  it('falls back to a temporary selectable textarea when Clipboard API fails', async () => {
    const node = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn() }
    const document = { body: { appendChild: vi.fn() }, createElement: vi.fn(() => node), execCommand: vi.fn(() => true) }
    const navigator = { clipboard: { writeText: vi.fn(async () => { throw new Error('blocked') }) } }
    await expect(copyText('reset-link', { navigator, document })).resolves.toBe(true)
    expect(node.select).toHaveBeenCalledOnce()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(node.remove).toHaveBeenCalledOnce()
  })

  it('fails safely when neither copy path is available', async () => {
    await expect(copyText('visible-link', {})).resolves.toBe(false)
    expect(source).toContain('Copy failed. Select the link and copy it manually.')
  })
})
