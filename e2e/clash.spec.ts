import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { applyAction, legalActions, posLabel, type Action, type CardKind, type GameState } from '../src/clash/engine'

const app = (page: Page) => page.getByTestId('clash-app')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, at: number) => page.getByTestId(`cl-cell-${posLabel(at)}`)
const arrows = { N: '↑', E: '→', S: '↓', W: '←', NE: '↗', SE: '↘', SW: '↙', NW: '↖' }
const liveRun = !!process.env.TEST_URL && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.TEST_URL).hostname)
const shot = (page: Page, name: string) => `docs/screenshots/clash-${name}-${page.context().browser()!.browserType().name()}${liveRun ? '-live' : ''}.png`

class ClashJourney {
  constructor(readonly page: Page, readonly touch = false) {}
  async press(locator: Locator) { await (this.touch ? locator.tap() : locator.click()) }
  async state(): Promise<GameState> { return JSON.parse((await app(this.page).getAttribute('data-state'))!) as GameState }
  async reveal() {
    const dialog = this.page.getByRole('dialog', { name: /^交給/ })
    if (await dialog.count()) {
      await expect(this.page.locator('.cl-hand button')).toHaveCount(0)
      await this.press(dialog.getByRole('button', { name: '準備好了・顯示手牌' }))
    }
    if ((await this.state()).status === 'playing') await expect(this.page.locator('.cl-hand button').first()).toBeEnabled()
  }
  async setup(options: { scenario?: 'study' | 'full'; opponent?: 'ai' | 'local'; first?: 'xiu' | 'tian'; seed?: string; reduced?: boolean } = {}) {
    await this.page.goto('./?mode=clash&scenario=study')
    await expect(app(this.page)).toBeVisible()
    await this.press(button(this.page, '設定新局'))
    const settings = this.page.getByRole('dialog', { name: '開始一場奪勢' })
    await settings.getByRole('combobox', { name: '局型', exact: true }).selectOption(options.scenario || 'study')
    await settings.getByRole('combobox', { name: '對手', exact: true }).selectOption(options.opponent || 'local')
    if (options.first) await settings.getByRole('combobox', { name: '第一輪先手', exact: true }).selectOption(options.first)
    await settings.getByLabel('種子', { exact: true }).fill(options.seed || 'clash-browser-06')
    await settings.getByLabel('減少動態', { exact: true }).setChecked(options.reduced ?? true)
    await this.press(settings.getByRole('button', { name: '開始新局', exact: true }))
    if ((options.opponent || 'local') === 'local') await this.reveal()
  }
  async find(kind: CardKind, match: (action: Extract<Action, { type: 'play' }>) => boolean) {
    const state = await this.state()
    const cardIds = state.hands[state.turn].filter(c => c.kind === kind).map(c => c.id)
    const action = legalActions(state).find(a => a.type === 'play' && cardIds.includes(a.cardId) && match(a))
    expect(action, `${kind} action in ${JSON.stringify(state)}`).toBeTruthy()
    return action as Extract<Action, { type: 'play' }>
  }
  async select(action: Action) {
    await this.reveal()
    const state = await this.state()
    expect(legalActions(state)).toContainEqual(action)
    if (action.type === 'pass') return
    const card = state.hands[state.turn].find(c => c.id === action.cardId)!
    const sameKind = state.hands[state.turn].filter(c => c.kind === card.kind)
    await this.press(this.page.getByTestId(`cl-card-${card.kind}`).nth(sameKind.findIndex(c => c.id === card.id)))
    if (action.type === 'play') {
      if (card.kind === 'shift') await this.press(cell(this.page, state.pieces.find(p => p.id === action.pieceId)!.pos))
      await this.press(cell(this.page, action.to!))
      if (card.kind === 'spring') await this.press(cell(this.page, state.pieces.find(p => p.id === action.pieceId)!.pos))
      await this.press(button(this.page, `朝${arrows[action.direction]}`))
      await expect(button(this.page, '確認這一手')).toBeEnabled()
      await expect(this.page.getByLabel('這一手預覽', { exact: true })).toContainText('預覽 · 確認後才生效')
    }
    expect(await this.state()).toEqual(state)
  }
  async act(action: Action) {
    await this.select(action)
    const expected = applyAction(await this.state(), action)
    await this.press(button(this.page, action.type === 'prepare' ? '棄牌整備' : action.type === 'pass' ? '無牌・過手' : '確認這一手'))
    await expect(app(this.page)).toHaveAttribute('data-state', JSON.stringify(expected))
    return expected
  }
  async prepare() {
    await this.reveal()
    const state = await this.state()
    return this.act({ type: 'prepare', cardId: state.hands[state.turn][0].id })
  }
  async finish() {
    for (let i = 0; i < 12 && (await this.state()).status === 'playing'; i++) await this.prepare()
    await expect(this.page.locator('.cl-result')).toBeVisible()
    return this.state()
  }
}

test.describe('phone touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('phone initial board, touch targets, no horizontal overflow', async ({ page }) => {
    const journey = new ClashJourney(page, true)
    await journey.setup()
    await expect(page.getByRole('group', { name: '四乘四共享棋盤' }).getByRole('button')).toHaveCount(16)
    await expect(page.locator('.cl-order')).toContainText('下一輪 天眾 → 阿修羅')
    await expect(page.locator('.cl-board-note')).toContainText('不會自動反擊')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const rect = await button(page, '確認這一手').boundingBox()
    expect(rect!.height).toBeGreaterThanOrEqual(44)
    const board = await page.locator('.cl-board').boundingBox()
    expect(board!.width).toBeGreaterThanOrEqual(340)
    await page.screenshot({ path: shot(page, 'phone-initial-viewport') })
    await page.screenshot({ path: shot(page, 'phone-initial'), fullPage: true })
  })

  test('spear preview direction, cancel, reselect and duplicate confirm are atomic', async ({ page }) => {
    const journey = new ClashJourney(page, true)
    await journey.setup({ reduced: false })
    const before = await journey.state()
    const attack = await journey.find('spear', a => a.to === 2 && a.direction === 'S')
    await journey.select(attack)
    await expect(page.getByLabel('這一手預覽', { exact: true })).toContainText('傷害 2＝基礎2')
    await expect(page.getByLabel('預覽攻擊路徑')).toBeVisible()
    await page.screenshot({ path: shot(page, 'phone-attack-preview-viewport') })
    await page.screenshot({ path: shot(page, 'phone-attack-preview'), fullPage: true })
    await journey.press(button(page, '取消'))
    await expect(button(page, '確認這一手')).toBeDisabled()
    expect(await journey.state()).toEqual(before)
    await journey.select(attack)
    // A real browser double click sends two pointer click events; no handler is invoked directly.
    await button(page, '確認這一手').dblclick()
    await expect(app(page)).toHaveAttribute('data-state', JSON.stringify(applyAction(before, attack)))
    await expect(page.getByRole('dialog', { name: '交給天眾' })).toBeVisible()
    expect((await journey.state()).history).toHaveLength(1)
  })

  test('spring placement activates chosen adjacent unit, bonus kills and wins study', async ({ page }) => {
    const journey = new ClashJourney(page, true)
    await journey.setup()
    const action = await journey.find('spring', a => a.to === 13 && a.pieceId === 'start-xiu-b' && a.direction === 'E')
    await journey.select(action)
    await expect(page.getByLabel('這一手預覽', { exact: true })).toContainText('傷害 3＝基礎2＋雷泉1')
    await journey.act(action)
    expect((await journey.state()).pieces.some(p => p.id === 'start-tian-b')).toBe(false)
    expect((await journey.state()).springs).toEqual([13])
    const ended = await journey.finish()
    expect(ended.history).toHaveLength(4)
    expect(ended.winner).toBe('xiu')
    await expect(page.locator('.cl-result h2')).toHaveText('阿修羅獲勝')
    await page.screenshot({ path: shot(page, 'phone-finished-viewport') })
    await page.screenshot({ path: shot(page, 'phone-finished'), fullPage: true })
  })

  test('shift selects own unit, swaps without activating displaced unit, preserves HP', async ({ page }) => {
    const journey = new ClashJourney(page, true)
    await journey.setup()
    const action = await journey.find('shift', a => a.to === 10 && a.pieceId === 'start-xiu-b' && a.direction === 'N')
    const after = await journey.act(action)
    expect(after.pieces.find(p => p.id === 'start-tian-b')).toMatchObject({ pos: 9, direction: 'W', hp: 3 })
    expect(after.pieces.find(p => p.id === 'start-xiu-b')).toMatchObject({ pos: 10, direction: 'N', hp: 3 })
    expect(after.pieces.find(p => p.id === 'start-tian-a')!.hp).toBe(1)
    expect(after.history[0].events.filter(e => e.type === 'attack')).toHaveLength(1)
  })
})

test('desktop 1366x768 board, hand and footer fit; invalid altar selection rejects', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  const journey = new ClashJourney(page)
  await journey.setup()
  await journey.press(page.getByTestId('cl-card-spear'))
  await journey.press(cell(page, 4))
  await expect(button(page, '確認這一手')).toBeDisabled()
  await expect(page.getByLabel('這一手預覽', { exact: true })).toContainText('祭壇不能放牌')
  const board = await page.locator('.cl-board').boundingBox()
  const footer = await page.locator('.cl-footer').boundingBox()
  expect(board!.y + board!.height).toBeLessThan(footer!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: shot(page, 'desktop-initial-viewport') })
  await page.screenshot({ path: shot(page, 'desktop-initial'), fullPage: true })
})

test('320 width with selected card, directions and preview never overflows', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  const journey = new ClashJourney(page)
  await journey.setup()
  await journey.select(await journey.find('spear', a => a.to === 2 && a.direction === 'S'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const direction = await button(page, '朝↓').boundingBox()
  expect(direction!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: shot(page, '320-preview'), fullPage: true })
})

test('hotseat handoff hides cards and Escape, Tab and background clicks cannot bypass it', async ({ page }) => {
  const journey = new ClashJourney(page)
  await journey.setup()
  await journey.prepare()
  const state = await journey.state()
  const handoff = page.getByRole('dialog', { name: '交給天眾' })
  await expect(handoff).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(handoff).toBeVisible()
  await expect(page.locator('.cl-hand button')).toHaveCount(0)
  const coords = await cell(page, 0).boundingBox()
  await page.mouse.click(coords!.x + 5, coords!.y + 5)
  await expect(handoff).toBeVisible()
  expect(await journey.state()).toEqual(state)
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await journey.reveal()
  await expect(page.locator('.cl-hand button').first()).toBeVisible()
})

test('help and settings keyboard dialogs pause pending AI and restore focus', async ({ page }) => {
  const journey = new ClashJourney(page)
  await journey.setup({ scenario: 'full', opponent: 'ai', first: 'tian', reduced: false })
  await button(page, '玩法').focus()
  await page.keyboard.press('Enter')
  const help = page.getByRole('dialog', { name: '一張牌，改變一場爭奪' })
  await expect(help).toBeVisible()
  let samples = 0
  await expect.poll(async () => { expect((await journey.state()).history).toHaveLength(0); return ++samples }, { intervals: [250], timeout: 3000 }).toBe(5)
  await page.keyboard.press('Escape')
  await expect(help).not.toBeVisible()
  await expect(button(page, '玩法')).toBeFocused()
  await button(page, '設定新局').focus()
  await page.keyboard.press('Enter')
  const settings = page.getByRole('dialog', { name: '開始一場奪勢' })
  await settings.getByLabel('種子', { exact: true }).fill('keyboard-seed')
  samples = 0
  await expect.poll(async () => { expect((await journey.state()).history).toHaveLength(0); return ++samples }, { intervals: [250], timeout: 3000 }).toBe(5)
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(button(page, '設定新局')).toBeFocused()
  await expect.poll(async () => (await journey.state()).history.length).toBe(1)
})

test('study loss completes; same-seed restart resets board and new seed changes identity', async ({ page }) => {
  const journey = new ClashJourney(page)
  await journey.setup()
  const initial = await journey.state()
  await journey.prepare()
  await journey.act(await journey.find('blade', a => a.to === 5 && a.direction === 'SW'))
  expect((await journey.state()).scores).toEqual({ xiu: 0, tian: 1 })
  const ended = await journey.finish()
  expect(ended.winner).toBe('tian')
  await expect(page.locator('.cl-result h2')).toHaveText('天眾獲勝')
  await journey.press(button(page, '相同種子重開'))
  expect(await journey.state()).toEqual(initial)
  await journey.finish()
  await journey.press(button(page, '新種子重開'))
  expect((await journey.state()).seed).not.toBe(initial.seed)
  expect((await journey.state()).history).toHaveLength(0)
})

test('full six rounds alternate first player, accumulate scores, draw and reject end actions', async ({ page }) => {
  const journey = new ClashJourney(page)
  await journey.setup({ scenario: 'full' })
  const ended = await journey.finish()
  expect(ended.maxRounds).toBe(6)
  expect(ended.history).toHaveLength(12)
  expect(ended.history.map(t => t.side)).toEqual(['xiu', 'tian', 'tian', 'xiu', 'xiu', 'tian', 'tian', 'xiu', 'xiu', 'tian', 'tian', 'xiu'])
  expect(ended.scores).toEqual({ xiu: 6, tian: 6 })
  expect(ended.winner).toBe('draw')
  await expect(page.locator('.cl-result h2')).toHaveText('雙方平手')
  await expect(button(page, '確認這一手')).toHaveCount(0)
  await expect(cell(page, 0)).toBeDisabled()
  expect(await journey.state()).toEqual(ended)
})

test('AI actions consume its legal card, follow same resolver, and repeat with same seed', async ({ page }) => {
  const journey = new ClashJourney(page)
  const runs: Action[][] = []
  for (let run = 0; run < 2; run++) {
    await journey.setup({ opponent: 'ai', seed: 'clash-ai-repeat' })
    const start = await journey.state()
    await journey.prepare()
    await expect(page.locator('.cl-hidden')).toBeVisible()
    await expect(page.locator('.cl-hand button')).toHaveCount(0)
    await expect.poll(async () => (await journey.state()).history.length).toBe(3)
    await journey.prepare()
    const ended = await journey.state()
    expect(ended.status).toBe('finished')
    let expected = start
    for (const turn of ended.history) {
      expect(legalActions(expected)).toContainEqual(turn.action)
      expected = applyAction(expected, turn.action)
    }
    expect(ended).toEqual(expected)
    expect(ended.hands.tian.length + ended.decks.tian.length + ended.discards.tian.length).toBe(12)
    runs.push(ended.history.filter(t => t.side === 'tian').map(t => t.action))
  }
  expect(runs[0]).toEqual(runs[1])
})

test('completed study draw, JSON export, feedback save and reload retain exact history', async ({ page }) => {
  const journey = new ClashJourney(page)
  await journey.setup()
  const ended = await journey.finish()
  expect(ended.winner).toBe('draw')
  await journey.press(button(page, '這局感覺如何'))
  const dialog = page.getByRole('dialog', { name: '留下這局感受' })
  await dialog.getByRole('textbox').fill('雷泉的取捨清楚；這是自動化測試回饋。')
  await journey.press(dialog.getByRole('button', { name: '保存回饋' }))
  const downloadPromise = page.waitForEvent('download')
  await journey.press(button(page, '下載JSON'))
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^nitian-clash-.*\.json$/)
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported).toMatchObject({ game: '逆天・奪勢', version: '0.6', completed: true, state: ended, feedback: '雷泉的取捨清楚；這是自動化測試回饋。' })
  expect(exported.history).toHaveLength(1)
  expect(exported.history[0].feedback).toBe(exported.feedback)
  await page.goto('./?mode=clash')
  await journey.reveal()
  expect((await journey.state()).scenario).toBe('study')
  const reloadedDownload = page.waitForEvent('download')
  await journey.press(button(page, '下載JSON'))
  const stored = JSON.parse(await readFile((await (await reloadedDownload).path())!, 'utf8'))
  expect(stored.history).toEqual(exported.history)
  expect(stored.completed).toBe(false)
  expect(stored.state).not.toHaveProperty('hands')
  expect(stored.state).not.toHaveProperty('decks')
  expect(stored.state).toHaveProperty('handCounts')
})

test('clash manifest has separate identity and legacy manifest content retains baseline', async ({ page, request }) => {
  await page.goto('./?mode=clash')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/nitian/clash.webmanifest')
  const manifest = await (await request.get('./clash.webmanifest')).json()
  expect(manifest).toMatchObject({ id: './?mode=clash', start_url: './?mode=clash', display: 'standalone', name: '逆天｜奪勢' })
  for (const file of ['manifest.webmanifest', 'tactics.webmanifest']) {
    const baseline = execFileSync('git', ['show', `b01bcb2:public/${file}`], { encoding: 'utf8' })
    // Windows Git checkout uses CRLF; compare every content character after newline normalization.
    expect((await readFile(`public/${file}`, 'utf8')).replaceAll('\r\n', '\n')).toBe(baseline)
    expect((await (await request.get(`./${file}`)).text()).replaceAll('\r\n', '\n')).toBe(baseline)
  }
  await page.goto('./?mode=realm')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/)
  await page.goto('./?mode=tactics')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/nitian/tactics.webmanifest')
})

test('production service worker installs and reloads playable clash while offline', async ({ page, context }) => {
  const journey = new ClashJourney(page)
  await journey.setup()
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active)).toBe(true)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  try {
    await page.reload()
    await expect(app(page)).toBeVisible()
    await journey.reveal()
    await journey.act(await journey.find('spear', a => a.to === 2 && a.direction === 'S'))
    expect((await journey.state()).history).toHaveLength(1)
    const assets = await page.locator('.cl-unit').first().evaluate(el => getComputedStyle(el).backgroundImage)
    expect(assets).toContain('tactics-units.png')
    await page.screenshot({ path: shot(page, 'offline'), fullPage: true })
  } finally { await context.setOffline(false) }
})
