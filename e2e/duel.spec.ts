import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { applyDuelMove, chooseDuelMove, createDuel, nextDuelRound, resolveDuel, type DuelState } from '../src/game/duel'

// Frozen before the new UI was run: seeded public hands, real UI actions only.
const SEED = '20261023'
const hand = (page: Page) => page.getByTestId('player-hand')
const available = (page: Page) => hand(page).getByRole('button', { name: /手牌 .+ 未落牌/ })
const cards = (page: Page, side?: 'player' | 'enemy') => side
  ? page.getByTestId('duel-timeline').locator(`[data-testid="duel-card"][data-side="${side}"]`)
  : page.getByTestId('duel-timeline').getByTestId('duel-card')
const turn = (page: Page) => page.getByTestId('duel-turn')

async function start(page: Page, first: 'player' | 'enemy' = 'player', seed = SEED) {
  await page.goto('./')
  await page.getByLabel('交手種子', { exact: true }).fill(seed)
  await page.getByLabel('首回合先手', { exact: true }).selectOption(first)
  await page.getByRole('button', { name: '開始交手', exact: true }).click()
  await expect(page.getByTestId('round')).toHaveText('1')
}

async function waitForPlayerOrReady(page: Page) {
  await expect(turn(page)).toHaveAttribute('data-side', /^(player|ready)$/)
}

async function place(page: Page, index = 0, gap = 0) {
  await expect(turn(page)).toHaveAttribute('data-side', 'player')
  await available(page).nth(index).click()
  await page.getByRole('button', { name: `插入位置 ${gap}`, exact: true }).click()
  await page.getByRole('button', { name: '確認落牌', exact: true }).click()
  await waitForPlayerOrReady(page)
}

async function finishPlanning(page: Page) {
  await waitForPlayerOrReady(page)
  if (await turn(page).getAttribute('data-side') === 'player') {
    await page.getByRole('button', { name: '本回合停手', exact: true }).click()
  }
  await expect(turn(page)).toHaveAttribute('data-side', 'ready')
  await expect(page.getByRole('button', { name: '共同結算', exact: true })).toBeEnabled()
}

async function settle(page: Page, skip = true) {
  await page.getByRole('button', { name: '共同結算', exact: true }).click()
  if (skip) {
    const button = page.getByRole('button', { name: '略過演出', exact: true })
    if (await button.isVisible()) await button.click()
  }
  await expect(page.getByRole('button', { name: '下一回合', exact: true })).toBeVisible({ timeout: 15000 })
}

async function identities(page: Page) {
  return cards(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-instance-id')))
}

test('雙方五張手牌與資源公開，試算明示仍可改變且不改真實生命', async ({ page }) => {
  await start(page)
  await expect(hand(page).getByRole('button')).toHaveCount(5)
  await expect(page.getByTestId('enemy-hand').locator('span')).toHaveCount(5)
  await expect(page.getByTestId('enemy-hand').getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('enemy-hand')).toContainText(/破勢|護身|引雷印|奉還|借甲|倒刺|避鋒|汲能/)
  const stage = page.getByRole('region', { name: '對峙舞台', exact: true })
  await expect(stage.getByRole('meter')).toHaveCount(2)
  await expect(stage).toContainText('盾 0')
  await expect(stage).toContainText('雷 0 / 6')
  const forecast = page.getByRole('region', { name: '目前軌道試算', exact: true })
  await expect(forecast).toContainText('僅依目前軌道試算')
  await expect(forecast).toContainText('後續插牌仍可能改變結果')
  await available(page).first().click()
  await page.getByRole('button', { name: '插入位置 0', exact: true }).click()
  await expect(forecast).toContainText('含待確認的一張牌')
  await expect(forecast).toContainText('後續插牌仍可能改變結果')
  await expect(page.getByTestId('player-hp')).toHaveText('45')
  await expect(page.getByTestId('enemy-hp')).toHaveText('45')
  await expect(cards(page)).toHaveCount(0)
})

test('公平輪流：三次單張落牌、AI合法回應、既有牌鎖定與第四張禁止', async ({ page }) => {
  await start(page)
  let previous: (string | null)[] = []
  for (let i = 0; i < 3; i++) {
    const enemyBefore = await cards(page, 'enemy').count()
    await place(page, 0, i === 1 ? 1 : 0)
    await expect(cards(page, 'player')).toHaveCount(i + 1)
    const enemyAfter = await cards(page, 'enemy').count()
    expect(enemyAfter - enemyBefore).toBeGreaterThanOrEqual(0)
    expect(enemyAfter - enemyBefore).toBeLessThanOrEqual(1)
    expect(enemyAfter).toBeLessThanOrEqual(3)
    const current = await identities(page)
    expect(new Set(current).size).toBe(current.length)
    expect(current.filter(id => previous.includes(id))).toEqual(previous)
    previous = current
    await expect(hand(page).getByRole('button', { name: /已鎖定/ })).toHaveCount(i + 1)
    await expect(hand(page).getByRole('button', { name: /已鎖定/ }).first()).toBeDisabled()
  }
  await expect(turn(page)).toHaveAttribute('data-side', 'ready')
  await expect(page.getByRole('button', { name: '確認落牌', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /撤回|向前|向後|清空編排/ })).toHaveCount(0)
})

test('未確認可改選與改間隙，快速重複確認只落一張', async ({ page }) => {
  await start(page)
  const firstName = await available(page).nth(0).getAttribute('aria-label')
  const secondIndex = (await available(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))).findIndex(name => name !== firstName)
  expect(secondIndex).toBeGreaterThan(0)
  const secondName = await available(page).nth(secondIndex).getAttribute('aria-label')
  await available(page).nth(0).click()
  await available(page).nth(secondIndex).click()
  await page.getByRole('button', { name: '插入位置 0', exact: true }).click()
  await expect(cards(page)).toHaveCount(0)
  await page.getByRole('button', { name: '確認落牌', exact: true }).dblclick()
  await waitForPlayerOrReady(page)
  await expect(cards(page, 'player')).toHaveCount(1)
  await expect(cards(page, 'player').first()).toContainText(secondName!.replace('手牌 ', '').replace(' 未落牌', ''))
  await expect(hand(page).getByRole('button', { name: firstName!, exact: true }).first()).toBeEnabled()
  await available(page).first().click()
  await page.getByRole('button', { name: '插入位置 0', exact: true }).click()
  const end = await cards(page).count()
  await page.getByRole('button', { name: `插入位置 ${end}`, exact: true }).click()
  await page.getByRole('button', { name: '確認落牌', exact: true }).click()
  await waitForPlayerOrReady(page)
  await expect(cards(page, 'player')).toHaveCount(2)
})

test('玩家停手後不可恢復，AI完成合法回應後共同結算，下一回合交換先手', async ({ page }) => {
  await start(page)
  await finishPlanning(page)
  await expect(cards(page, 'player')).toHaveCount(0)
  expect(await cards(page, 'enemy').count()).toBeLessThanOrEqual(3)
  await expect(page.getByRole('button', { name: '確認落牌', exact: true })).toBeDisabled()
  const previewPlayer = await page.getByTestId('preview-player').textContent()
  const previewEnemy = await page.getByTestId('preview-enemy').textContent()
  await settle(page)
  await expect(page.getByTestId('player-hp')).toHaveText(previewPlayer!)
  await expect(page.getByTestId('enemy-hp')).toHaveText(previewEnemy!)
  await page.getByRole('button', { name: '下一回合', exact: true }).click()
  await expect(page.getByTestId('round')).toHaveText('2')
  await expect(turn(page)).toHaveAttribute('data-side', 'enemy')
  await waitForPlayerOrReady(page)
})

test('可指定敵方先手，首回合AI先合法落牌或停手', async ({ page }) => {
  await start(page, 'enemy')
  await expect(turn(page)).toHaveAttribute('data-side', 'enemy')
  await expect(page.getByRole('button', { name: '確認落牌', exact: true })).toBeDisabled()
  await waitForPlayerOrReady(page)
  await expect(cards(page, 'player')).toHaveCount(0)
  expect(await cards(page, 'enemy').count()).toBeLessThanOrEqual(1)
  await place(page)
  await expect(cards(page, 'player')).toHaveCount(1)
})

test('同種子與交換首手重開保留雙方牌序，換種子產生新局', async ({ page }) => {
  await start(page)
  const originalPlayer = await hand(page).getByRole('button').allTextContents()
  const originalEnemy = await page.getByTestId('enemy-hand').textContent()
  await place(page)
  for (const action of ['同種子重開', '交換首手重開']) {
    await page.getByRole('button', { name: '重新開始', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByTestId('run-seed')).toHaveText(SEED)
    expect(await hand(page).getByRole('button').allTextContents()).toEqual(originalPlayer)
    expect(await page.getByTestId('enemy-hand').textContent()).toEqual(originalEnemy)
    await expect(cards(page, 'player')).toHaveCount(0)
    await expect(page.getByTestId('round')).toHaveText('1')
    if (action === '交換首手重開') await expect(turn(page)).toHaveAttribute('data-side', 'enemy')
  }
  await waitForPlayerOrReady(page)
  await page.getByRole('button', { name: '重新開始', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '換種子重開', exact: true }).click()
  await expect(page.getByTestId('run-seed')).not.toHaveText(SEED)
})

test('正常演出、略過與減少動態保有相同預覽與結算結果', async ({ page }) => {
  const outcomes: string[][] = []
  for (const mode of ['normal', 'skip', 'reduced']) {
    await start(page)
    if (mode === 'reduced') {
      await page.getByRole('button', { name: '設定', exact: true }).click()
      await page.getByLabel('減少動態效果', { exact: true }).check()
      await page.getByRole('button', { name: '關閉視窗', exact: true }).click()
    }
    for (let i = 0; i < 3; i++) await place(page)
    await finishPlanning(page)
    const previews = [await page.getByTestId('preview-player').textContent(), await page.getByTestId('preview-enemy').textContent()]
    await settle(page, mode === 'skip')
    const result = [await page.getByTestId('player-hp').innerText(), await page.getByTestId('enemy-hp').innerText()]
    expect(result).toEqual(previews)
    outcomes.push(result)
    if (mode === 'reduced') await expect(page.getByRole('button', { name: '略過演出', exact: true })).toHaveCount(0)
  }
  expect(outcomes[1]).toEqual(outcomes[0])
  expect(outcomes[2]).toEqual(outcomes[0])
})

test('普通演出中品牌入口保持鎖定，不開重開對話框', async ({ page }) => {
  await start(page)
  for (let i = 0; i < 3; i++) await place(page)
  await finishPlanning(page)
  await page.getByRole('button', { name: '共同結算', exact: true }).click()
  const brand = page.getByRole('link', { name: /逆天/ }).first()
  await expect(brand).toHaveAttribute('aria-disabled', 'true')
  await brand.click({ force: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '略過演出', exact: true }).click()
  await expect(page.getByRole('button', { name: '下一回合', exact: true })).toBeVisible()
  await expect(page.getByTestId('round')).toHaveText('1')
})

test('390與1366寬度無橫向溢出，主要點選目標至少44px', async ({ page }) => {
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 })
    await start(page)
    await available(page).first().click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const target of [available(page).first(), page.getByRole('button', { name: '插入位置 0', exact: true }), page.getByRole('button', { name: '確認落牌', exact: true }), page.getByRole('button', { name: '本回合停手', exact: true })]) {
      const box = await target.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    for (let i = 0; i < 3; i++) await place(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/duel-${width}.png`, fullPage: true })
  }
})

test('觸控手機可選牌插位確認，操作列可見', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL })
  try {
    const page = await context.newPage()
    await start(page)
    await available(page).first().tap()
    await page.getByRole('button', { name: '插入位置 0', exact: true }).tap()
    const confirm = page.getByRole('button', { name: '確認落牌', exact: true })
    const box = await confirm.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    await confirm.tap()
    await waitForPlayerOrReady(page)
    await expect(cards(page, 'player')).toHaveCount(1)
  } finally { await context.close() }
})

test('鍵盤可落牌，設定對話框Escape回復焦點', async ({ page }) => {
  await start(page)
  await available(page).first().focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '插入位置 0', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '確認落牌', exact: true }).focus()
  await page.keyboard.press('Enter')
  await waitForPlayerOrReady(page)
  await expect(cards(page, 'player')).toHaveCount(1)
  const settings = page.getByRole('button', { name: '設定', exact: true })
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(settings).toBeFocused()
})

test('localStorage故障仍可交手與落牌並提示保存失敗', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    Storage.prototype.setItem = () => { throw new Error('blocked') }
  })
  await start(page)
  await expect(page.getByTestId('storage-warning')).toBeVisible()
  await place(page)
  await expect(cards(page, 'player')).toHaveCount(1)
})

test('PWA在線載入後離線重載仍可交手', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  })
  await context.setOffline(true)
  try {
    await page.reload()
    await page.getByLabel('交手種子', { exact: true }).fill(SEED)
    await page.getByRole('button', { name: '開始交手', exact: true }).click()
    await expect(page.getByTestId('round')).toHaveText('1')
    await place(page)
    await expect(cards(page, 'player')).toHaveCount(1)
  } finally { await context.setOffline(false) }
})

// This shadow state never enters the app. Each move is sent through the real
// buttons, and the resulting timeline and HP must match the independent replay.
// chooseDuelMove itself strips private piles; strip them here as well so this
// browser journey cannot accidentally use a future-card order for its policy.
function publicChoice(state: DuelState) {
  const visible = structuredClone(state)
  for (const side of ['player', 'enemy'] as const) {
    visible.decks[side].drawPile = []
    visible.decks[side].discardPile = []
    visible.decks[side].rng = 0
  }
  return chooseDuelMove(visible)
}

async function playWholeDuel(page: Page, seed: string) {
  await start(page, 'player', seed)
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('減少動態效果', { exact: true }).check()
  await page.getByRole('button', { name: '關閉視窗', exact: true }).click()
  let state = createDuel(seed)
  while (state.status !== 'won' && state.status !== 'lost') {
    expect(state.round).toBeLessThanOrEqual(12)
    while (state.status === 'placing') {
      if (state.activeSide === 'player') {
        await expect(turn(page)).toHaveAttribute('data-side', 'player')
        const move = publicChoice(state)
        if (move.kind === 'pass') await page.getByRole('button', { name: '本回合停手', exact: true }).click()
        else {
          const index = state.decks.player.hand.findIndex(card => card.instanceId === move.instanceId)
          await hand(page).getByRole('button').nth(index).click()
          await page.getByRole('button', { name: `插入位置 ${move.index}`, exact: true }).click()
          await page.getByRole('button', { name: '確認落牌', exact: true }).click()
        }
        state = applyDuelMove(state, move)
      } else state = applyDuelMove(state, publicChoice(state))
    }
    await expect(turn(page)).toHaveAttribute('data-side', 'ready')
    expect(await identities(page)).toEqual(state.timeline.map(card => card.instanceId))
    const resolved = resolveDuel(state).nextState
    await page.getByRole('button', { name: '共同結算', exact: true }).click()
    await expect(page.getByTestId('player-hp')).toHaveText(String(resolved.player.hp))
    await expect(page.getByTestId('enemy-hp')).toHaveText(String(resolved.enemy.hp))
    state = resolved
    if (state.status === 'resolved') {
      await page.getByRole('button', { name: '下一回合', exact: true }).click()
      state = nextDuelRound(state)
    }
  }
  return state
}

test('固定勝利全戰：合法UI落牌、8回合2生命勝利與JSON匯出', async ({ page }) => {
  test.setTimeout(90000)
  const state = await playWholeDuel(page, 'e2e-win-2')
  expect([state.status, state.round, state.player.hp, state.enemy.hp]).toEqual(['won', 8, 2, 0])
  await expect(page.getByRole('heading', { name: '雷霆，已奉還。', exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出交手紀錄 JSON', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  const record = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(record.seed).toBe('e2e-win-2')
  expect(record.outcome).toBe('won')
  expect(record.turns).toHaveLength(8)
})

test('固定敗北全戰：合法UI落牌、7回合敗北與新版紀錄獨立保存', async ({ page }) => {
  test.setTimeout(90000)
  const legacy = '[{"id":"legacy-sentinel"}]'
  await page.addInitScript(value => window.localStorage.setItem('nitian.records.v1', value), legacy)
  const state = await playWholeDuel(page, SEED)
  expect([state.status, state.round, state.player.hp, state.enemy.hp]).toEqual(['lost', 7, 0, 1])
  await expect(page.getByRole('heading', { name: '這一戰，留待再借。', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.localStorage.getItem('nitian.records.v1'))).toBe(legacy)
  const stored = await page.evaluate(() => Object.keys(window.localStorage)
    .filter(key => key !== 'nitian.records.v1')
    .map(key => ({ key, value: JSON.parse(window.localStorage.getItem(key)!) })))
  const records = stored.filter(item => Array.isArray(item.value) && item.value.some((record: { outcome?: string; seed?: string }) => record.outcome === 'lost' && record.seed === '20261023'))
  expect(records).toHaveLength(1)
})
