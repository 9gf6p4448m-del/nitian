import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { applyAction, createRealm, legalActions, type Player, type RealmAction, type RealmState } from '../src/realm/engine'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, at: number) => page.getByTestId(`realm-cell-${at}`)

async function state(page: Page): Promise<RealmState> {
  return JSON.parse(await page.getByTestId('realm-board').getAttribute('data-state') ?? 'null')
}

async function open(page: Page) {
  await page.goto('./?mode=realm&victory=power')
  const tutorial = page.getByRole('dialog', { name: '神域怎麼玩' })
  await expect(tutorial).toBeVisible()
  await tutorial.getByRole('button', { name: '開始試玩', exact: true }).click()
  await expect(page.getByTestId('realm-board')).toBeVisible()
}

async function newGame(page: Page, mode: 'full' | 'trial' = 'full', opponent = 'local', humanSide: Player = 'asura', first: Player = 'asura') {
  await button(page, '新局').click()
  const dialog = page.getByRole('dialog', { name: '開始新局' })
  await dialog.getByLabel('勝利規則', { exact: true }).selectOption('power')
  await dialog.getByLabel('試玩局面', { exact: true }).selectOption(mode)
  await dialog.getByLabel('對手', { exact: true }).selectOption(opponent)
  await dialog.getByLabel('我的陣營', { exact: true }).selectOption(humanSide)
  await dialog.getByLabel('先手', { exact: true }).selectOption(first)
  await dialog.getByRole('button', { name: '開始新局', exact: true }).click()
  await expect.poll(async () => (await state(page)).mode).toBe(mode)
}

async function scores(page: Page, asura: number, deva: number) {
  await expect(page.getByTestId('realm-score-asura')).toHaveText(String(asura))
  await expect(page.getByTestId('realm-score-deva')).toHaveText(String(deva))
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
  // Observe the actual human intermediate DOM state even when click I/O is slow.
  // oldValue also preserves intermediate values if changes share a callback batch.
  const committed = applyAction(before, action)
  await page.evaluate(() => {
    const board = document.querySelector('[data-testid="realm-board"]') as HTMLElement & {
      realmActionObservation?: { states: string[]; observer: MutationObserver }
    }
    if (!board) throw new Error('神域棋盤不存在')
    board.realmActionObservation?.observer.disconnect()
    const states = [board.getAttribute('data-state') ?? 'null']
    const observer = new MutationObserver(records => {
      for (const record of records) if (record.oldValue) states.push(record.oldValue)
      states.push(board.getAttribute('data-state') ?? 'null')
    })
    board.realmActionObservation = { states, observer }
    observer.observe(board, { attributes: true, attributeFilter: ['data-state'], attributeOldValue: true })
  })
  try {
    await button(page, '確認落子').click()
    await expect.poll(async () => page.evaluate(() => {
      const board = document.querySelector('[data-testid="realm-board"]') as HTMLElement & {
        realmActionObservation?: { states: string[] }
      }
      return (board.realmActionObservation?.states ?? []).map(raw => JSON.parse(raw))
    })).toContainEqual(committed)
    const observed = await state(page)
    if (observed.ply === committed.ply) expect(observed).toEqual(committed)
    else {
      expect(observed.ply).toBe(committed.ply + 1)
      expect(legalActions(committed).some(reply => JSON.stringify(applyAction(committed, reply)) === JSON.stringify(observed)), '捕捉到人類提交後，最多再有一個合法AI回應').toBe(true)
    }
  } finally {
    await page.evaluate(() => {
      const board = document.querySelector('[data-testid="realm-board"]') as (HTMLElement & {
        realmActionObservation?: { observer: MutationObserver }
      }) | null
      board?.realmActionObservation?.observer.disconnect()
      if (board) delete board.realmActionObservation
    })
  }
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const webkit = info.project.use.browserName === 'webkit' ? '-webkit' : ''
  const live = process.env.TEST_URL ? '-live' : ''
  await page.screenshot({ path: `docs/screenshots/realm-${name}${webkit}${live}.png`, fullPage: true })
  await page.screenshot({ path: `docs/screenshots/realm-${name}-viewport${webkit}${live}.png` })
}

// Fixed legal scripts: these use independent, hand-calculated outcomes, not an AI recommendation.
const symmetricDraw: RealmAction[] = [
  { type: 'build', at: 0, rank: 1 }, { type: 'build', at: 15, rank: 1 },
  { type: 'build', at: 4, rank: 2 }, { type: 'build', at: 11, rank: 2 },
  { type: 'channel', at: 1, strength: 1, axis: 'v' }, { type: 'channel', at: 14, strength: 1, axis: 'v' },
  { type: 'build', at: 5, rank: 2 }, { type: 'build', at: 10, rank: 2 },
  { type: 'channel', at: 6, strength: 3, axis: 'h' }, { type: 'channel', at: 9, strength: 3, axis: 'h' },
  { type: 'reverse', sacrifice: 4, power: 6 }, { type: 'reverse', sacrifice: 11, power: 9 },
]
const trialWin: RealmAction[] = [
  { type: 'reverse', sacrifice: 4, power: 5 }, { type: 'build', at: 0, rank: 1 },
  { type: 'build', at: 9, rank: 2 }, { type: 'build', at: 15, rank: 2 },
]
const trialLoss: RealmAction[] = [
  { type: 'build', at: 0, rank: 1 }, { type: 'channel', at: 8, strength: 3, axis: 'h' },
  { type: 'build', at: 13, rank: 2 }, { type: 'build', at: 9, rank: 2 },
]

test.describe('共享神域手機試玩', () => {
  test('手機touch預覽取消、重複確認及44px主要操作 @live', async ({ browser }, info) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      baseURL: info.project.use.baseURL, reducedMotion: 'reduce',
    })
    try {
      const page = await context.newPage()
      await open(page)
      await newGame(page)
      const initial = await state(page)
      expect(initial).toEqual(createRealm('full'))
      await scores(page, 2, 2)
      await expect(page.locator('[data-testid^="realm-cell-"]')).toHaveCount(16)
      await expect(cell(page, 0)).toHaveAccessibleName(/A1/)
      const action: RealmAction = { type: 'build', at: 0, rank: 1 }
      await selectAction(page, action, true)
      expect(await state(page)).toEqual(initial)
      await expect(button(page, '確認落子')).toBeInViewport({ ratio: 1 })
      await button(page, '取消預覽').tap()
      expect(await state(page)).toEqual(initial)
      await selectAction(page, action, true)
      // The touch selection stays intact; a double click must settle it only once.
      await button(page, '確認落子').click({ clickCount: 2 })
      await expect.poll(async () => (await state(page)).ply).toBe(1)
      expect(await state(page)).toEqual(applyAction(initial, action))
      const reply: RealmAction = { type: 'build', at: 15, rank: 1 }
      await selectAction(page, reply, true)
      await button(page, '確認落子').tap()
      await expect.poll(async () => (await state(page)).ply).toBe(2)
      expect(await state(page)).toEqual(applyAction(applyAction(initial, action), reply))
      for (const locator of [cell(page, 0), cell(page, 15), button(page, '普通壇'), button(page, '大壇'), button(page, '犧牲逆轉'), button(page, '新局')]) {
        const box = await locator.boundingBox()
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await screenshot(page, info, 'mobile')
    } finally { await context.close() }
  })

  test('四手試局人工三選項與多源分數、供應來源 @live', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await newGame(page, 'trial')
    await button(page, '玩法').click()
    await expect(page.getByRole('dialog')).toContainText('雙方各兩步')
    await expect(page.getByRole('dialog')).not.toContainText('六步')
    await page.getByRole('dialog').getByRole('button', { name: /關閉/ }).click()
    await selectAction(page, { type: 'reverse', sacrifice: 4, power: 5 })
    await expect(page.locator('.realm-confirm')).toContainText('修 5→8')
    await expect(page.locator('.realm-confirm')).toContainText('天 6→0')
    await scores(page, 5, 6)
    await button(page, '取消預覽').click()
    expect(await state(page)).toEqual(createRealm('trial'))
    const examples: { action: RealmAction; asura: number; deva: number }[] = [
      { action: { type: 'reverse', sacrifice: 4, power: 5 }, asura: 8, deva: 0 },
      // C2 receives both horizontal3 and vertical2: +10, not the original impossible +4.
      { action: { type: 'build', at: 6, rank: 2 }, asura: 15, deva: 6 },
      { action: { type: 'build', at: 2, rank: 2 }, asura: 9, deva: 6 },
      { action: { type: 'channel', at: 9, strength: 3, axis: 'v' }, asura: 11, deva: 6 },
    ]
    for (const example of examples) {
      await newGame(page, 'trial')
      await scores(page, 5, 6)
      await act(page, example.action)
      await scores(page, example.asura, example.deva)
    }
    await newGame(page, 'trial')
    await button(page, '查看供應').click()
    await cell(page, 4).click()
    await expect(page.getByTestId('realm-supply')).toContainText('B2')
    await expect(page.getByTestId('realm-supply')).toContainText('3')
    await screenshot(page, info, 'supply')
  })

  test('完整同機12手含逆轉形成和局，完整JSON與紀錄 @live', async ({ page }, info) => {
    await open(page)
    await newGame(page)
    let expected = createRealm('full')
    for (const action of symmetricDraw) {
      await act(page, action)
      expected = applyAction(expected, action)
      expect(await state(page)).toEqual(expected)
    }
    expect((await state(page)).winner).toBe('draw')
    expect((await state(page)).status).toBe('finished')
    await scores(page, 12, 12)
    await expect(page.getByTestId('realm-result')).toContainText(/平手|和局/)
    const downloadEvent = page.waitForEvent('download')
    await button(page, '匯出紀錄').first().click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toMatch(/realm.*\.json$/)
    const destination = info.outputPath('realm-record.json')
    await download.saveAs(destination)
    const record = JSON.parse(await readFile(destination, 'utf8'))
    expect(record).toMatchObject({ schema: 'nitian.realm.v1', settings: { mode: 'full', opponent: 'local', humanSide: 'asura', first: 'asura' }, outcome: { winner: 'draw', scores: { asura: 12, deva: 12 } } })
    expect(record.startedAt).toMatch(/^202\d-/)
    expect(record.completedAt).toMatch(/^202\d-/)
    expect(record.turns).toHaveLength(12)
    expect(record.turns.map((turn: { action: RealmAction }) => turn.action)).toEqual(symmetricDraw)
    expect(record.turns[0].before).toEqual(createRealm('full'))
    expect(record.turns.at(-1).after).toEqual(expected)
    expect(record.turns.every((turn: { decisionMs: number }) => turn.decisionMs >= 0)).toBe(true)
    await screenshot(page, info, 'draw-result')
    await button(page, '紀錄').click()
    await expect(page.getByRole('dialog')).toContainText(/平手|和局/)
    await page.getByRole('dialog').getByRole('button', { name: /關閉/ }).click()
    await button(page, '再玩一局').click()
    expect(await state(page)).toEqual(createRealm('full'))
  })

  test('AI完整局與換邊後手都會交還操作 @live', async ({ page }) => {
    await open(page)
    for (let step = 0; step < 12; step++) {
      const before = await state(page)
      if (before.status === 'finished') break
      if (before.turn === 'asura') await act(page, legalActions(before)[0], true)
      else await expect.poll(async () => (await state(page)).ply).toBeGreaterThan(before.ply)
    }
    expect((await state(page)).status).toBe('finished')
    await expect(page.getByTestId('realm-result')).toBeVisible()
    await newGame(page, 'full', 'ai', 'deva')
    await expect.poll(async () => (await state(page)).ply).toBe(1)
    expect((await state(page)).turn).toBe('deva')
    await act(page, legalActions(await state(page))[0], true)
    await expect.poll(async () => (await state(page)).ply).toBe(3)
    expect((await state(page)).turn).toBe('deva')
  })

  test('PWA從神域啟動並離線reload後可下棋 @live', async ({ page, context }) => {
    await open(page)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json())
    expect(manifest.start_url).toBe('./?mode=realm')
    await context.setOffline(true)
    try {
      await page.reload()
      await expect(page.getByTestId('realm-board')).toBeVisible()
      await newGame(page, 'trial')
      await act(page, { type: 'reverse', sacrifice: 4, power: 5 })
      await scores(page, 8, 0)
    } finally { await context.setOffline(false) }
  })

  for (const [name, script, expectedScores, winner] of [
    ['勝利', trialWin, [14, 0], 'asura'], ['敗北', trialLoss, [5, 15], 'deva'],
  ] as const) {
    test(`固定合法試局人工${name}路徑`, async ({ page }) => {
      await open(page)
      await newGame(page, 'trial')
      for (const action of script) await act(page, action)
      expect((await state(page)).winner).toBe(winner)
      await scores(page, expectedScores[0], expectedScores[1])
      await expect(page.getByTestId('realm-result')).toContainText(name)
    })
  }

  test('教學與玩法對話框焦點、暫停AI、換局清除舊AI', async ({ page }) => {
    await page.goto('./?mode=realm')
    const tutorial = page.getByRole('dialog', { name: '神域怎麼玩' })
    await expect(tutorial).toBeVisible()
    expect(await tutorial.evaluate(el => el.contains(document.activeElement))).toBe(true)
    const focusableCount = await tutorial.locator('button, select, input, textarea, a[href], [tabindex="0"]').count()
    for (let step = 0; step <= focusableCount; step++) {
      await page.keyboard.press('Tab')
      expect(await tutorial.evaluate(el => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await tutorial.evaluate(el => el.contains(document.activeElement))).toBe(true)
    await tutorial.getByRole('button', { name: '開始試玩' }).click()
    await newGame(page, 'full', 'ai', 'deva')
    await button(page, '玩法').click()
    const before = await state(page)
    // Longer than the documented AI delay: a modal must suppress the scheduled move.
    await page.waitForTimeout(850)
    expect(await state(page)).toEqual(before)
    await page.getByRole('dialog').getByRole('button', { name: /關閉/ }).click()
    await expect(button(page, '玩法')).toBeFocused()
    await expect.poll(async () => (await state(page)).ply).toBe(1)
    await act(page, legalActions(await state(page))[0])
    await newGame(page, 'trial', 'local', 'deva', 'deva')
    await page.waitForTimeout(850)
    expect(await state(page)).toEqual(createRealm('trial', 'deva'))
  })

  test('320手機與桌面無溢出且確認按鈕完整可見', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page)
    await newGame(page, 'trial')
    await selectAction(page, { type: 'channel', at: 9, strength: 3, axis: 'v' })
    await expect(button(page, '確認落子')).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const name of ['確認落子', '取消預覽', '神力3', '縱向', '橫向']) {
      const box = await button(page, name).boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await screenshot(page, info, 'narrow-preview')
    await button(page, '取消預覽').click()
    await page.setViewportSize({ width: 1366, height: 768 })
    await selectAction(page, { type: 'build', at: 6, rank: 2 })
    await expect(button(page, '確認落子')).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await screenshot(page, info, 'desktop-preview')
  })

  test('Storage拒絕會提示，仍能下棋與匯出前後狀態', async ({ page }, info) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage denied') }
      Storage.prototype.setItem = () => { throw new Error('storage denied') }
    })
    await open(page)
    await expect(page.getByText(/無法.*儲存|儲存.*失敗|無法.*紀錄|儲存.*不可用/)).toBeVisible()
    await newGame(page, 'trial')
    await act(page, { type: 'reverse', sacrifice: 4, power: 5 })
    await scores(page, 8, 0)
    const downloadEvent = page.waitForEvent('download')
    await button(page, '匯出紀錄').first().click()
    const download = await downloadEvent
    const destination = info.outputPath('realm-storage-denied.json')
    await download.saveAs(destination)
    const record = JSON.parse(await readFile(destination, 'utf8'))
    expect(record.outcome).toBeNull()
    expect(record.turns).toHaveLength(1)
    expect(record.turns[0].before).toEqual(createRealm('trial'))
    expect(record.turns[0].after).toEqual(await state(page))
  })
})
