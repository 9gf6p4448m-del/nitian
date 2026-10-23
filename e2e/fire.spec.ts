import { test, expect, type Page } from '@playwright/test'
import { applyAction, createGame, legalActions, currentSide, type Action, type FireState, type Side, type Variant } from '../src/fire/engine'
import { chooseAction } from '../src/fire/ai'
import { readFile } from 'node:fs/promises'

async function state(page: Page): Promise<FireState> {
  return JSON.parse(await page.getByTestId('fire-app').getAttribute('data-state') ?? 'null')
}

async function open(page: Page) {
  await page.goto('./?mode=fire')
  await expect(page.getByTestId('fire-app')).toBeVisible()
}

async function newGame(page: Page, variant: Variant = 'B', opponent = 'local', humanSide: Side = 'asura') {
  await page.getByRole('button', { name: '新局', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '開始新局' })
  await dialog.getByLabel('規則版本').selectOption(variant)
  await dialog.getByLabel('對手', { exact: true }).selectOption(opponent)
  await dialog.getByLabel('我方角色').selectOption(humanSide)
  await dialog.getByRole('button', { name: '開始奪火', exact: true }).click()
  await expect.poll(async () => (await state(page)).variant).toBe(variant)
}

const actionNames = { move: '移動', strike: '攻擊', throw: '投火', offer: '奉獻', wait: '待機', pickup: '拾火' } as const

async function act(page: Page, action: Action) {
  const before = await state(page)
  expect(legalActions(before)).toContainEqual(action)
  if (action.type === 'pass') {
    await expect.poll(async () => JSON.stringify(await state(page))).not.toBe(JSON.stringify(before))
    return
  }
  const unit = before.units.find(u => u.id === action.unitId)!
  await page.getByTestId(`fire-cell-${unit.cell}`).click()
  const name = actionNames[action.type]
  await page.getByRole('button', { name, exact: true }).click()
  if (action.type === 'strike') await page.getByTestId(action.push ? 'fire-push-yes' : 'fire-push-no').click()
  if (action.target !== undefined) await page.getByTestId(`fire-cell-${action.target}`).click()
  await expect(page.getByTestId('fire-preview')).toBeVisible()
  await page.getByRole('button', { name: `確認${name}`, exact: true }).click()
  await expect.poll(async () => JSON.stringify(await state(page))).not.toBe(JSON.stringify(before))
}

const wait = (unitId: string): Action => ({ type: 'wait', unitId })
const move = (unitId: string, target: number): Action => ({ type: 'move', unitId, target })
const strike = (unitId: string, target: number): Action => ({ type: 'strike', unitId, target, push: false })

test.describe('奪火手機原型', () => {
  test('手機點選、取消、確認與AI單步回應 @live', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    const initial = await state(page)
    expect(initial.variant).toBe('B')
    await expect(page.locator('[data-testid^="fire-cell-"]')).toHaveCount(25)
    await page.getByTestId('fire-cell-21').click()
    await page.getByRole('button', { name: '移動', exact: true }).click()
    await page.getByTestId('fire-cell-11').click()
    await expect(page.getByRole('button', { name: '確認移動', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('fire-preview')).toBeVisible()
    expect(await state(page)).toEqual(initial)
    await page.getByRole('button', { name: '取消選擇', exact: true }).click()
    expect(await state(page)).toEqual(initial)
    await page.getByTestId('fire-cell-21').click()
    await page.getByRole('button', { name: '移動', exact: true }).click()
    await page.getByTestId('fire-cell-11').click()
    await page.getByRole('button', { name: '確認移動', exact: true }).click({ clickCount: 2 })
    await expect.poll(async () => (await state(page)).slot).toBe(2)
    expect((await state(page)).units.find(u => u.id === 'a1')).toMatchObject({ cell: 11, used: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const browserSuffix = test.info().project.use.browserName === 'webkit' ? '-webkit' : ''
    const liveSuffix = process.env.TEST_URL ? '-live' : ''
    await page.screenshot({ path: `docs/screenshots/fire-mobile${browserSuffix}${liveSuffix}.png`, fullPage: true })
  })

  test('新局A/B、後手、玩法視窗及主要按鈕尺寸 @live', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await newGame(page, 'A', 'local', 'deva')
    expect(await state(page)).toEqual(createGame('A'))
    await page.getByRole('button', { name: '玩法', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('接火')
    await expect(dialog).toContainText('奉獻')
    await dialog.getByRole('button', { name: /關閉/ }).click()
    await expect(page.getByRole('button', { name: '玩法', exact: true })).toBeFocused()
    for (const id of [0, 12, 21, 24]) {
      const box = await page.getByTestId(`fire-cell-${id}`).boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('開玩法視窗會暫停AI，關閉後才回應', async ({ page }) => {
    await open(page)
    await act(page, move('a1', 11))
    await page.getByRole('button', { name: '玩法', exact: true }).click()
    await page.waitForTimeout(850)
    expect((await state(page)).slot).toBe(1)
    await page.getByRole('dialog').getByRole('button', { name: /關閉/ }).click()
    await expect.poll(async () => (await state(page)).slot).toBe(2)
  })

  test('同機等待八手形成和局，重開與交換角色', async ({ page }) => {
    await open(page)
    await newGame(page)
    for (let round = 0; round < 2; round++) {
      for (const id of ['a1', 'd1', 'a2', 'd2']) await act(page, wait(id))
    }
    expect((await state(page)).result).toEqual({ winner: null, reason: 'repetition' })
    await expect(page.getByTestId('fire-result')).toContainText('和局')
    await page.getByRole('button', { name: '同設定重開', exact: true }).click()
    expect(await state(page)).toEqual(createGame('B'))
    await page.getByRole('button', { name: '新局', exact: true }).click()
    await page.getByRole('dialog', { name: '開始新局' }).getByRole('button', { name: /關閉/ }).click()
  })

  for (const variant of ['A', 'B'] as const) {
    test(`${variant}合法行動fixture走到奉獻，並匯出完整紀錄`, async ({ page }) => {
      await open(page)
      await newGame(page, variant)
      // This scripted legal path tests UI settlement, not an optimal/cooperative AI strategy.
      const script: Action[] = variant === 'A' ? [
        move('a1', 11), wait('d1'), wait('a2'), wait('d2'),
        move('a1', 12), wait('d1'), move('a2', 22), wait('d2'),
        { type: 'throw', unitId: 'a1', target: 22 }, wait('d1'), { type: 'offer', unitId: 'a2' },
      ] : [
        move('a1', 11), wait('d1'), move('a2', 13), move('d2', 4),
        move('a1', 12), wait('d1'), move('a2', 3), wait('d2'),
        wait('a1'), wait('d1'), move('a2', 2), wait('d2'),
        { type: 'throw', unitId: 'a1', target: 2 }, wait('d1'), { type: 'offer', unitId: 'a2' },
      ]
      let expected = createGame(variant)
      for (const action of script) {
        expected = applyAction(expected, action).state
        await act(page, action)
        expect(await state(page)).toEqual(expected)
      }
      await expect(page.getByTestId('fire-result')).toBeVisible()
      expect((await state(page)).result).toEqual({ winner: 'asura', reason: 'offering' })
      await page.getByLabel('這局的轉折／規則疑問').fill('投火接應測試')
      await page.getByRole('button', { name: '儲存回饋', exact: true }).click()
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: '匯出紀錄', exact: true }).first().click()
      const file = await download
      expect(file.suggestedFilename()).toMatch(/nitian.*\.json$/)
      await file.saveAs(`test-results/fire-${variant}-record.json`)
      const record = JSON.parse(await readFile(`test-results/fire-${variant}-record.json`, 'utf8'))
      expect(record).toMatchObject({ schema: 'nitian.fire.v1', status: 'completed', variant, opponent: 'local', feedback: '投火接應測試', outcome: { winner: 'asura', reason: 'offering' } })
      expect(record.turns).toHaveLength(script.length)
      expect(record.completedAt).toMatch(/^202\d-/)
      expect(record.turns.at(-1).after).toEqual(expected)
      await page.getByRole('button', { name: '交換角色重開', exact: true }).click()
      expect(await state(page)).toEqual(createGame(variant))
    })
  }

  for (const human of ['asura', 'deva'] as const) {
    test(`殲滅結束流程，觀看方${human}`, async ({ page }) => {
      await open(page)
      await newGame(page, 'B', 'local', human)
      const setup = [move('a1', 11), move('d1', 6), move('a2', 13), move('d2', 8)]
      for (const action of setup) await act(page, action)
      for (let hit = 0; hit < 2; hit++) {
        for (const action of [strike('a1', 6), wait('d1'), strike('a2', 8), wait('d2')]) await act(page, action)
      }
      for (const action of [strike('a1', 6), wait('d2'), strike('a2', 8)]) await act(page, action)
      expect((await state(page)).result).toEqual({ winner: 'asura', reason: 'elimination' })
      await expect(page.getByTestId('fire-result')).toContainText(human === 'asura' ? '勝利' : '敗')
      await expect(page.getByTestId('fire-result')).toContainText('阿修羅勝利')
      await expect(page.getByTestId('fire-result')).toContainText('天眾落敗')
    })
  }

  test('剩一人且用過後會自動略過，不會卡輪', async ({ page }) => {
    await open(page)
    await newGame(page)
    for (const action of [move('a1', 11), move('d1', 6), move('a2', 13), wait('d2')]) await act(page, action)
    for (let hit = 0; hit < 2; hit++) {
      for (const action of [strike('a1', 6), wait('d1'), wait('a2'), wait('d2')]) await act(page, action)
    }
    for (const action of [strike('a1', 6), wait('d2'), wait('a2')]) await act(page, action)
    await expect.poll(async () => (await state(page)).round).toBe(5)
    expect((await state(page)).slot).toBe(0)
    await expect(page.getByTestId('fire-last-events')).toContainText('略過')
  })

  test('公開狀態驅動的完整同機自動對局，可終局再開', async ({ page }) => {
    test.setTimeout(120000)
    await open(page)
    await newGame(page)
    for (let step = 0; step < 160; step++) {
      const current = await state(page)
      if (current.result) break
      await act(page, chooseAction(current))
    }
    expect((await state(page)).result).not.toBeNull()
    await expect(page.getByTestId('fire-result')).toBeVisible()
    await page.getByRole('button', { name: '同設定重開', exact: true }).click()
    expect((await state(page)).round).toBe(1)
  })

  test('人機後手設定，AI先行後交還玩家', async ({ page }) => {
    await open(page)
    await newGame(page, 'B', 'ai', 'deva')
    await expect.poll(async () => currentSide(await state(page))).toBe('deva')
    const current = await state(page)
    const action = legalActions(current).find(a => a.type === 'move')!
    await act(page, action)
    await expect.poll(async () => (await state(page)).slot).toBe(3)
  })

  test('人機實際敗北可重開：玩家待機，對手自行決策', async ({ page }) => {
    test.setTimeout(120000)
    await open(page)
    await newGame(page, 'B', 'ai', 'asura')
    for (let step = 0; step < 160; step++) {
      const current = await state(page)
      if (current.result) break
      if (currentSide(current) === 'deva' || legalActions(current)[0].type === 'pass') {
        await expect.poll(async () => JSON.stringify(await state(page)), { timeout: 6000 }).not.toBe(JSON.stringify(current))
      } else {
        await act(page, legalActions(current).find(a => a.type === 'wait')!)
      }
    }
    expect((await state(page)).result?.winner).toBe('deva')
    await expect(page.getByTestId('fire-result')).toContainText('敗北')
    await expect(page.getByTestId('fire-result')).toContainText('阿修羅落敗')
    await page.getByRole('button', { name: '同設定重開', exact: true }).click()
    expect((await state(page)).round).toBe(1)
  })

  test('320窄螢幕及減少動態效果仍可選步確認', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 667 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page)
    await page.getByTestId('fire-cell-21').click()
    await page.getByRole('button', { name: '移動', exact: true }).click()
    await page.getByTestId('fire-cell-11').click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: '確認移動', exact: true })).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: '確認移動', exact: true }).click()
    await expect.poll(async () => (await state(page)).slot).toBe(2)
    const flash = page.locator('.fire-arrival-flash').first()
    if (await flash.count()) expect(await flash.evaluate(el => getComputedStyle(el).display)).toBe('none')
  })

  test('本機儲存故障不妨礙下棋與未完局匯出', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('blocked') }
      Storage.prototype.setItem = () => { throw new Error('blocked') }
    })
    await open(page)
    await newGame(page, 'A')
    await act(page, move('a1', 11))
    expect((await state(page)).units[0].cell).toBe(11)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出紀錄', exact: true }).first().click()
    expect((await download).suggestedFilename()).toMatch(/\.json$/)
  })

  test('桌面棋盤與控制可達，無橫向溢出 @live', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await open(page)
    await page.getByTestId('fire-cell-21').click()
    await page.getByRole('button', { name: '移動', exact: true }).click()
    await page.getByTestId('fire-cell-11').click()
    await expect(page.getByRole('button', { name: '確認移動', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const browserSuffix = test.info().project.use.browserName === 'webkit' ? '-webkit' : ''
    const liveSuffix = process.env.TEST_URL ? '-live' : ''
    await page.screenshot({ path: `docs/screenshots/fire-desktop${browserSuffix}${liveSuffix}.png`, fullPage: true })
  })

  test('PWA離線重新開啟仍是奪火且可走子 @live', async ({ page, context }) => {
    await open(page)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json())
    expect(manifest.start_url).toBe('./?mode=fire')
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('fire-app')).toBeVisible()
    await newGame(page, 'A')
    await act(page, move('a1', 11))
    expect((await state(page)).units[0].cell).toBe(11)
    await context.setOffline(false)
  })
})
