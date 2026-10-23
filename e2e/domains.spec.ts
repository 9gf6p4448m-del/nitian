import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { applyAction, createRealm, legalActions, type Player, type RealmAction, type RealmState } from '../src/realm/engine'

type Victory = 'domains' | 'power'
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, at: number) => page.getByTestId(`realm-cell-${at}`)
const initial = (mode: 'full' | 'trial' = 'full', first: Player = 'asura', victory: Victory = 'domains') => createRealm(mode, first, victory)

async function state(page: Page): Promise<RealmState> {
  return JSON.parse(await page.getByTestId('realm-board').getAttribute('data-state') ?? 'null')
}
async function open(page: Page, victory?: Victory) {
  await page.goto(`./?mode=realm${victory ? `&victory=${victory}` : ''}`)
  const tutorial = page.getByRole('dialog', { name: '神域怎麼玩' })
  await expect(tutorial).toBeVisible()
  await expect(tutorial).toContainText(victory === 'power' ? '總分制' : '爭域制')
  await tutorial.getByRole('button', { name: '開始試玩', exact: true }).click()
  await expect(page.getByTestId('realm-board')).toBeVisible()
}
async function newGame(page: Page, mode: 'full' | 'trial' = 'full', victory: Victory = 'domains', opponent = 'local', humanSide: Player = 'asura', first: Player = 'asura') {
  await button(page, '新局').click()
  const dialog = page.getByRole('dialog', { name: '開始新局' })
  await dialog.getByLabel('試玩局面', { exact: true }).selectOption(mode)
  await dialog.getByLabel('勝利規則', { exact: true }).selectOption(victory)
  await dialog.getByLabel('對手', { exact: true }).selectOption(opponent)
  await dialog.getByLabel('我的陣營', { exact: true }).selectOption(humanSide)
  await dialog.getByLabel('先手', { exact: true }).selectOption(first)
  await dialog.getByRole('button', { name: '開始新局', exact: true }).click()
  await expect.poll(async () => (await state(page)).victory).toBe(victory)
}
async function scores(page: Page, asura: number, deva: number) {
  await expect(page.getByTestId('realm-score-asura')).toHaveText(String(asura))
  await expect(page.getByTestId('realm-score-deva')).toHaveText(String(deva))
}
async function counts(page: Page, asura: number, deva: number) {
  await expect(page.getByTestId('domain-score-asura')).toHaveText(String(asura))
  await expect(page.getByTestId('domain-score-deva')).toHaveText(String(deva))
}
async function domain(page: Page, id: number, asura: number, deva: number, controller: Player | 'none') {
  const card = page.getByTestId(`domain-${id}`)
  await expect(card).toContainText(['西北', '東北', '西南', '東南'][id])
  await expect(card).toHaveAttribute('data-asura', String(asura))
  await expect(card).toHaveAttribute('data-deva', String(deva))
  await expect(card).toHaveAttribute('data-controller', controller)
  await expect(card).toContainText(controller === 'none' ? /無主|無人|未控制/ : controller === 'asura' ? /修|阿修羅/ : /天/)
}
async function selectAction(page: Page, action: RealmAction, tap = false) {
  const press = (locator: Locator) => tap ? locator.tap() : locator.click()
  if (action.type === 'reverse') {
    await press(button(page, '犧牲逆轉'))
    await press(cell(page, action.sacrifice))
    await press(cell(page, action.power))
  } else {
    if (action.type === 'build') await press(button(page, action.rank === 1 ? '普通壇' : '大壇'))
    else {
      await press(button(page, `神力${action.strength}`))
      await press(button(page, action.axis === 'h' ? '橫向' : '縱向'))
    }
    await press(cell(page, action.at))
  }
  await expect(button(page, '確認落子')).toBeEnabled()
}
async function act(page: Page, action: RealmAction, observeAI = false) {
  const before = await state(page)
  expect(legalActions(before)).toContainEqual(action)
  await selectAction(page, action)
  expect(await state(page)).toEqual(before)
  if (!observeAI) {
    await button(page, '確認落子').click()
    await expect.poll(async () => (await state(page)).ply).toBe(before.ply + 1)
    return
  }
  const committed = applyAction(before, action)
  await page.evaluate(() => {
    const board = document.querySelector('[data-testid="realm-board"]') as HTMLElement & {
      domainActionObservation?: { states: string[]; observer: MutationObserver }
    }
    if (!board) throw new Error('神域棋盤不存在')
    board.domainActionObservation?.observer.disconnect()
    const states = [board.getAttribute('data-state') ?? 'null']
    const observer = new MutationObserver(records => {
      for (const record of records) if (record.oldValue) states.push(record.oldValue)
      states.push(board.getAttribute('data-state') ?? 'null')
    })
    board.domainActionObservation = { states, observer }
    observer.observe(board, { attributes: true, attributeFilter: ['data-state'], attributeOldValue: true })
  })
  try {
    await button(page, '確認落子').click()
    await expect.poll(async () => page.evaluate(() => {
      const board = document.querySelector('[data-testid="realm-board"]') as HTMLElement & {
        domainActionObservation?: { states: string[] }
      }
      return (board.domainActionObservation?.states ?? []).map(raw => JSON.parse(raw))
    })).toContainEqual(committed)
    const observed = await state(page)
    if (observed.ply === committed.ply) expect(observed).toEqual(committed)
    else {
      expect(observed.ply).toBe(committed.ply + 1)
      expect(legalActions(committed).some(reply => JSON.stringify(applyAction(committed, reply)) === JSON.stringify(observed)), '人類提交後最多一個合法AI回應').toBe(true)
    }
  } finally {
    await page.evaluate(() => {
      const board = document.querySelector('[data-testid="realm-board"]') as (HTMLElement & {
        domainActionObservation?: { observer: MutationObserver }
      }) | null
      board?.domainActionObservation?.observer.disconnect()
      if (board) delete board.domainActionObservation
    })
  }
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const webkit = info.project.use.browserName === 'webkit' ? '-webkit' : ''
  const live = process.env.TEST_URL ? '-live' : ''
  await page.screenshot({ path: `docs/screenshots/domain-${name}${webkit}${live}.png`, fullPage: true })
  await page.screenshot({ path: `docs/screenshots/domain-${name}-viewport${webkit}${live}.png` })
}
async function exported(page: Page, info: TestInfo, name: string) {
  const event = page.waitForEvent('download')
  await button(page, '匯出紀錄').first().click()
  const download = await event
  const destination = info.outputPath(`${name}.json`)
  await download.saveAs(destination)
  return JSON.parse(await readFile(destination, 'utf8'))
}
const symmetricDraw: RealmAction[] = [
  { type: 'build', at: 0, rank: 1 }, { type: 'build', at: 15, rank: 1 },
  { type: 'build', at: 4, rank: 2 }, { type: 'build', at: 11, rank: 2 },
  { type: 'channel', at: 1, strength: 1, axis: 'v' }, { type: 'channel', at: 14, strength: 1, axis: 'v' },
  { type: 'build', at: 5, rank: 2 }, { type: 'build', at: 10, rank: 2 },
  { type: 'channel', at: 6, strength: 3, axis: 'h' }, { type: 'channel', at: 9, strength: 3, axis: 'h' },
  { type: 'reverse', sacrifice: 4, power: 6 }, { type: 'reverse', sacrifice: 11, power: 9 },
]
// Fixed four legal moves. Independent totals: 13:12; domains: 1:2.
// NW 3:0, NE 5:6, SW 0:0, SE 5:6. Thus the winners differ.
const contrastScript: RealmAction[] = [
  { type: 'channel', at: 13, strength: 3, axis: 'h' },
  { type: 'channel', at: 9, strength: 3, axis: 'h' },
  { type: 'build', at: 6, rank: 1 },
  { type: 'build', at: 15, rank: 1 },
]

test.describe('爭域制與總分制手機對照', () => {
  test('四區初始數值與touch預覽取消、雙擊僅一步 @live', async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: info.project.use.baseURL, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      await open(page)
      await newGame(page)
      const before = initial()
      expect(await state(page)).toEqual(before)
      await scores(page, 2, 2)
      await counts(page, 1, 1)
      await domain(page, 0, 0, 0, 'none')
      await domain(page, 1, 0, 2, 'deva')
      await domain(page, 2, 2, 0, 'asura')
      await domain(page, 3, 0, 0, 'none')
      const action: RealmAction = { type: 'build', at: 0, rank: 1 }
      await selectAction(page, action, true)
      expect(await state(page)).toEqual(before)
      // A1 receives C1's horizontal2 across the domain boundary.
      await expect(page.locator('.realm-confirm')).toContainText(/修\s*1→2區/)
      await expect(page.locator('.realm-confirm')).toContainText(/天\s*1→1區/)
      await expect(button(page, '確認落子')).toBeInViewport({ ratio: 1 })
      await button(page, '取消預覽').tap()
      expect(await state(page)).toEqual(before)
      await selectAction(page, action, true)
      await button(page, '確認落子').click({ clickCount: 2 })
      await expect.poll(async () => (await state(page)).ply).toBe(1)
      expect(await state(page)).toEqual(applyAction(before, action))
      await counts(page, 2, 1)
      await scores(page, 4, 2)
      for (const locator of [cell(page, 0), cell(page, 15), button(page, '普通壇'), button(page, '大壇'), button(page, '犧牲逆轉'), button(page, '新局')]) {
        const box = await locator.boundingBox()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await screenshot(page, info, 'mobile')
    } finally { await context.close() }
  })

  test('跨區多源只歸受益壇，區數與總神力預覽可取消 @live', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await newGame(page, 'trial')
    await scores(page, 5, 6)
    await counts(page, 2, 1)
    await domain(page, 0, 3, 0, 'asura')
    await domain(page, 1, 0, 6, 'deva')
    await domain(page, 2, 0, 0, 'none')
    await domain(page, 3, 2, 0, 'asura')
    await expect(page.getByText('目前四域', { exact: true })).toBeVisible()
    const before = await state(page)
    const action: RealmAction = { type: 'build', at: 6, rank: 2 }
    await selectAction(page, action)
    expect(await state(page)).toEqual(before)
    await expect(page.locator('.realm-confirm')).toContainText(/修\s*2→3區/)
    await expect(page.locator('.realm-confirm')).toContainText(/天\s*1→0區/)
    await expect(page.locator('.realm-confirm')).toContainText(/5→15/)
    await expect(page.locator('.realm-confirm')).toContainText(/6→6/)
    await expect(page.getByText('四域預覽 · 尚未落子', { exact: true })).toBeVisible()
    await scores(page, 5, 6)
    await counts(page, 2, 1)
    await domain(page, 1, 10, 6, 'asura')
    await screenshot(page, info, 'cross-preview')
    await button(page, '取消預覽').click()
    expect(await state(page)).toEqual(before)
    await counts(page, 2, 1)
    await act(page, action)
    await scores(page, 15, 6)
    await counts(page, 3, 0)
    await domain(page, 0, 3, 0, 'asura')
    await domain(page, 1, 10, 6, 'asura')
    await domain(page, 2, 0, 0, 'none')
    await domain(page, 3, 2, 0, 'asura')
    await button(page, '查看供應').click()
    await cell(page, 6).click()
    await expect(page.getByTestId('realm-supply')).toContainText('B2')
    await expect(page.getByTestId('realm-supply')).toContainText('C3')
    await expect(page.getByTestId('realm-supply')).toContainText('6')
    await expect(page.getByTestId('realm-supply')).toContainText('4')
    await screenshot(page, info, 'cross-supply')
  })

  test('兩制AI完整局與玩家後手採合法回應 @live', async ({ page }) => {
    await open(page)
    for (const victory of ['domains', 'power'] as const) {
      await newGame(page, 'full', victory, 'ai')
      for (let step = 0; step < 12; step++) {
        const before = await state(page)
        if (before.status === 'finished') break
        if (before.turn === 'asura') await act(page, legalActions(before)[0], true)
        else await expect.poll(async () => (await state(page)).ply).toBeGreaterThan(before.ply)
      }
      expect((await state(page)).status).toBe('finished')
      expect((await state(page)).victory).toBe(victory)
      await expect(page.getByTestId('realm-result')).toContainText(/控制區數|總神力|平手/)
      await newGame(page, 'full', victory, 'ai', 'deva')
      await expect.poll(async () => (await state(page)).ply).toBe(1)
      expect((await state(page)).turn).toBe('deva')
      await act(page, legalActions(await state(page))[0], true)
      await expect.poll(async () => (await state(page)).ply).toBe(3)
      expect((await state(page)).turn).toBe('deva')
    }
  })

  test('同四手兩制贏家相反、保留設定重開與JSON紀錄 @live', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await newGame(page, 'trial', 'domains', 'local', 'deva')
    for (const victory of ['domains', 'power'] as const) {
      for (const action of contrastScript) await act(page, action)
      const result = await state(page)
      expect(result.status).toBe('finished')
      expect(result.victory).toBe(victory)
      expect(result.winner).toBe(victory === 'domains' ? 'deva' : 'asura')
      await scores(page, 13, 12)
      await counts(page, 1, 2)
      await domain(page, 0, 3, 0, 'asura')
      await domain(page, 1, 5, 6, 'deva')
      await domain(page, 2, 0, 0, 'none')
      await domain(page, 3, 5, 6, 'deva')
      await expect(page.getByTestId('realm-result')).toContainText(victory === 'domains' ? '勝利' : '敗北')
      await expect(page.getByTestId('realm-result')).toContainText(victory === 'domains' ? '控制區數' : '總神力')
      const record = await exported(page, info, `domain-contrast-${victory}`)
      expect(record.settings).toEqual({ mode: 'trial', victory, opponent: 'local', humanSide: 'deva', first: 'asura' })
      expect(record.outcome).toMatchObject({ winner: victory === 'domains' ? 'deva' : 'asura', rule: victory, reason: victory, domains: { asura: 1, deva: 2 }, scores: { asura: 13, deva: 12 } })
      expect(record.turns.map((turn: { action: RealmAction }) => turn.action)).toEqual(contrastScript)
      expect(record.turns.every((turn: { before: RealmState; after: RealmState }) => turn.before.victory === victory && turn.after.victory === victory)).toBe(true)
      expect(record.turns.at(-1).after).toEqual(result)
      await screenshot(page, info, `contrast-${victory}`)
      const next = victory === 'domains' ? 'power' : 'domains'
      await button(page, victory === 'domains' ? '切換總分制重開' : '切換爭域制重開').click()
      expect(await state(page)).toEqual(initial('trial', 'asura', next))
      const restarted = await exported(page, info, `domain-restarted-${next}`)
      expect(restarted.settings).toEqual({ mode: 'trial', victory: next, opponent: 'local', humanSide: 'deva', first: 'asura' })
      expect(restarted.turns).toEqual([])
      expect(restarted.outcome).toBeNull()
    }
    await button(page, '紀錄').click()
    await expect(page.getByRole('dialog')).toContainText('爭域制')
    await expect(page.getByRole('dialog')).toContainText('總分制')
  })

  test('PWA離線重開仍能選兩制並下棋 @live', async ({ page, context }) => {
    await open(page)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    try {
      await page.reload()
      await expect(page.getByTestId('realm-board')).toBeVisible()
      for (const victory of ['domains', 'power'] as const) {
        await newGame(page, 'trial', victory)
        await act(page, { type: 'build', at: 6, rank: 2 })
        await scores(page, 15, 6)
        await counts(page, 3, 0)
        expect((await state(page)).victory).toBe(victory)
      }
    } finally { await context.setOffline(false) }
  })

  test('爭域完整12手同分同區平手與規則原因', async ({ page }, info) => {
    await open(page)
    await newGame(page)
    for (const action of symmetricDraw) await act(page, action)
    expect((await state(page)).winner).toBe('draw')
    await scores(page, 12, 12)
    await counts(page, 2, 2)
    await domain(page, 0, 10, 0, 'asura')
    await domain(page, 1, 0, 2, 'deva')
    await domain(page, 2, 2, 0, 'asura')
    await domain(page, 3, 0, 10, 'deva')
    await expect(page.getByTestId('realm-result')).toContainText(/平手|和局/)
    await expect(page.getByTestId('realm-result')).toContainText(/控制區數|總神力/)
    const record = await exported(page, info, 'domain-draw')
    expect(record.settings.victory).toBe('domains')
    expect(record.outcome).toMatchObject({ winner: 'draw', rule: 'domains', reason: 'draw', domains: { asura: 2, deva: 2 }, scores: { asura: 12, deva: 12 } })
    await screenshot(page, info, 'draw-result')
  })

  test('新局選規則視窗暫停AI且換局不收舊回應', async ({ page }, info) => {
    await open(page)
    await newGame(page, 'full', 'domains', 'ai', 'deva')
    await button(page, '新局').click()
    const dialog = page.getByRole('dialog', { name: '開始新局' })
    await expect(dialog.getByLabel('勝利規則', { exact: true })).toHaveValue('domains')
    const before = await state(page)
    await dialog.getByLabel('勝利規則', { exact: true }).selectOption('power')
    await page.waitForTimeout(850)
    expect(await state(page)).toEqual(before)
    await dialog.getByLabel('試玩局面', { exact: true }).selectOption('trial')
    await dialog.getByLabel('對手', { exact: true }).selectOption('local')
    await dialog.getByLabel('我的陣營', { exact: true }).selectOption('deva')
    await dialog.getByLabel('先手', { exact: true }).selectOption('deva')
    await dialog.getByRole('button', { name: '開始新局', exact: true }).click()
    await page.waitForTimeout(850)
    expect(await state(page)).toEqual(initial('trial', 'deva', 'power'))
    await button(page, '玩法').click()
    await expect(page.getByRole('dialog')).toContainText('總分制')
    await expect(page.getByRole('dialog')).toContainText('雙方各兩步')
    await page.getByRole('dialog').getByRole('button', { name: /關閉/ }).click()
    await button(page, '切換爭域制重開').click()
    expect(await state(page)).toEqual(initial('trial', 'deva', 'domains'))
    const switched = await exported(page, info, 'domain-nondefault-first')
    expect(switched.settings).toEqual({ mode: 'trial', victory: 'domains', opponent: 'local', humanSide: 'deva', first: 'deva' })
  })

  test('320手機與1366桌面主要操作44px、無溢出', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page)
    await newGame(page, 'trial')
    for (const [width, height, name] of [[320, 700, 'narrow-preview'], [1366, 768, 'desktop-preview']] as const) {
      await page.setViewportSize({ width, height })
      await selectAction(page, { type: 'channel', at: 9, strength: 3, axis: 'v' })
      await expect(button(page, '確認落子')).toBeInViewport({ ratio: 1 })
      await expect(button(page, '取消預覽')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const locator of [cell(page, 0), cell(page, 15), ...['確認落子', '取消預覽', '神力3', '縱向', '橫向', '新局'].map(name => button(page, name))]) {
        const box = await locator.boundingBox()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      await screenshot(page, info, name)
      await button(page, '取消預覽').click()
    }
  })

  test('舊紀錄缺勝利規則仍可讀並標示總分制', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nitian.realm.history.v1', JSON.stringify([{
        schema: 'nitian.realm.v1', id: 'legacy-domain-browser', startedAt: '2026-10-20T00:00:00Z', completedAt: '2026-10-20T00:01:00Z',
        settings: { mode: 'trial', opponent: 'local', humanSide: 'asura', first: 'asura' }, turns: [],
        outcome: { winner: 'asura', scores: { asura: 14, deva: 0 } }, feedback: '舊紀錄相容檢查',
      }]))
    })
    await open(page)
    await button(page, '紀錄').click()
    const dialog = page.getByRole('dialog', { name: '本機試玩紀錄' })
    await expect(dialog).toContainText('舊紀錄相容檢查')
    await expect(dialog).toContainText('總分制')
    await expect(dialog).toContainText('14')
    await expect(dialog).not.toContainText('紀錄損壞')
  })
})
