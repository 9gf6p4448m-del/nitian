import { test, expect, type Page } from '@playwright/test'
import { applyDuelMove, chooseDuelMove, createDuel, nextDuelRound, resolveDuel, type DuelState, type DuelTimelineCard } from '../src/game/duel'
import type { CardId, CombatEvent, Side } from '../src/game/types'

// Frozen against 41b7558 before the clarity UI was built. Real browser actions
// only: the independent engine fixtures below never enter application state.
const SEED = '20261023'
const hand = (page: Page) => page.getByTestId('player-hand')
const available = (page: Page) => hand(page).getByRole('button', { name: /手牌 .+ 未落牌/ })
const turn = (page: Page) => page.getByTestId('duel-turn')
const lesson = (page: Page) => page.getByRole('dialog', { name: '三招看懂結算', exact: true })
const liveCards = (page: Page) => page.getByTestId('duel-timeline').getByTestId('duel-card')

async function start(page: Page) {
  await page.goto('./')
  await page.getByLabel('交手種子', { exact: true }).fill(SEED)
  await page.getByLabel('首回合先手', { exact: true }).selectOption('player')
  await page.getByRole('button', { name: '開始交手', exact: true }).click()
  await expect(page.getByTestId('round')).toHaveText('1')
}

async function place(page: Page) {
  await expect(turn(page)).toHaveAttribute('data-side', 'player')
  await available(page).first().click()
  await page.getByRole('button', { name: '插入位置 0', exact: true }).click()
  await page.getByRole('button', { name: '確認落牌', exact: true }).click()
  await expect(turn(page)).toHaveAttribute('data-side', /^(player|ready)$/)
}

async function plan(page: Page) {
  await start(page)
  for (let i = 0; i < 3; i++) await place(page)
  await expect(turn(page)).toHaveAttribute('data-side', 'ready')
}

async function stored(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])))
}

async function battleSnapshot(page: Page) {
  return {
    hp: [await page.getByTestId('player-hp').innerText(), await page.getByTestId('enemy-hp').innerText()],
    resources: await page.getByRole('region', { name: '對峙舞台', exact: true }).locator('.resources').allTextContents(),
    seed: await page.getByTestId('run-seed').innerText(), round: await page.getByTestId('round').innerText(),
    side: await turn(page).getAttribute('data-side'),
    hands: [await hand(page).innerHTML(), await page.getByTestId('enemy-hand').innerHTML()],
    timeline: await page.getByTestId('duel-timeline').innerHTML(),
    previews: [await page.getByTestId('preview-player').innerText(), await page.getByTestId('preview-enemy').innerText()],
    storage: await stored(page),
  }
}

const scenarios: { name: string; cards: [Side, CardId][]; hp: [number, number] }[] = [
  { name: '倒刺在攻擊前', cards: [['player', 'thorns'], ['enemy', 'strike']], hp: [39, 39] },
  { name: '倒刺在攻擊後', cards: [['enemy', 'strike'], ['player', 'thorns']], hp: [39, 45] },
  { name: '先護身再倒刺', cards: [['player', 'guard'], ['player', 'thorns'], ['enemy', 'strike']], hp: [45, 39] },
  { name: '倒刺加避鋒', cards: [['player', 'thorns'], ['player', 'evade'], ['enemy', 'strike']], hp: [45, 45] },
]

function lessonOracle(cards: [Side, CardId][]) {
  const state: DuelState = createDuel('clarity-independent-oracle')
  // Move existing instances into hand without fabricating or duplicating cards.
  for (const side of ['player', 'enemy'] as const) {
    const deck = state.decks[side]
    const all = [...deck.hand, ...deck.drawPile, ...deck.discardPile]
    const required = cards.filter(([who]) => who === side).map(([, id]) => id)
    const chosen = required.map(id => {
      const index = all.findIndex(card => card.cardId === id)
      expect(index).toBeGreaterThanOrEqual(0)
      return all.splice(index, 1)[0]
    })
    deck.hand = [...chosen, ...all.splice(0, 5 - chosen.length)]
    deck.drawPile = all; deck.discardPile = []
  }
  const used = new Set<string>()
  state.timeline = cards.map(([side, cardId]): DuelTimelineCard => {
    const card = state.decks[side].hand.find(item => item.cardId === cardId && !used.has(item.instanceId))!
    used.add(card.instanceId)
    return { side, ...card }
  })
  state.status = 'ready'; state.activeSide = null; state.passed = { player: true, enemy: true }
  return resolveDuel(state)
}

for (const scenario of scenarios) {
  test(`教學逐事件與真引擎一致：${scenario.name}`, async ({ page }) => {
    const result = lessonOracle(scenario.cards)
    expect([result.nextState.player.hp, result.nextState.enemy.hp]).toEqual(scenario.hp)
    await page.goto('./')
    await page.getByRole('button', { name: '教學', exact: true }).click()
    const dialog = lesson(page)
    await dialog.getByRole('button', { name: scenario.name, exact: true }).click()
    await expect(dialog.getByTestId('lesson-timeline')).toBeVisible()
    await expect(dialog.getByTestId('lesson-player-hp')).toHaveText('45')
    await expect(dialog.getByTestId('lesson-enemy-hp')).toHaveText('45')
    await expect(dialog).toContainText(/落牌/)
    await expect(dialog).toContainText(/執行/)
    await expect(dialog).toContainText(/同回合|本回合/)
    for (const event of result.events) {
      await dialog.getByRole('button', { name: '教學下一步', exact: true }).click()
      await expect(dialog.getByTestId('lesson-player-hp')).toHaveText(String(event.after.player.hp))
      await expect(dialog.getByTestId('lesson-enemy-hp')).toHaveText(String(event.after.enemy.hp))
      await expect(dialog.getByTestId('lesson-explanation')).toContainText(event.label)
    }
    await expect(dialog).toContainText(/下回合|回合結束/)
    await dialog.getByRole('button', { name: '倒刺在攻擊前', exact: true }).click()
    await expect(dialog.getByTestId('lesson-player-hp')).toHaveText('45')
    await expect(dialog.getByTestId('lesson-enemy-hp')).toHaveText('45')
    expect(await page.evaluate(() => localStorage.getItem('nitian.duel.records.v1'))).toBeNull()
    await dialog.getByRole('button', { name: '我懂了，回到交手', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  })
}

test('正式交手開教學不改生命、牌序、已排牌、待確認選擇或保存資料', async ({ page }) => {
  await start(page)
  await place(page)
  await available(page).first().click()
  await page.getByRole('button', { name: '插入位置 0', exact: true }).click()
  const before = await battleSnapshot(page)
  await page.getByRole('button', { name: '教學', exact: true }).click()
  const dialog = lesson(page)
  await dialog.getByRole('button', { name: '先護身再倒刺', exact: true }).click()
  for (const _event of lessonOracle(scenarios[2].cards).events) {
    await dialog.getByRole('button', { name: '教學下一步', exact: true }).click()
  }
  await dialog.getByRole('button', { name: '略過教學', exact: true }).click()
  expect(await battleSnapshot(page)).toEqual(before)
  await page.getByRole('button', { name: '確認落牌', exact: true }).click()
  await expect(turn(page)).toHaveAttribute('data-side', /^(player|ready)$/)
  await expect(page.getByTestId('duel-timeline').locator('[data-testid="duel-card"][data-side="player"]')).toHaveCount(2)
})

test('暫停結算可等待及逐事件，教學視窗不偷跑，略過與試算一致', async ({ page }) => {
  await plan(page)
  const predicted = [await page.getByTestId('preview-player').innerText(), await page.getByTestId('preview-enemy').innerText()]
  await page.getByRole('button', { name: '共同結算', exact: true }).click()
  await page.getByRole('button', { name: '暫停結算', exact: true }).click()
  const explanation = page.getByTestId('resolution-explanation')
  const before = await explanation.innerText()
  const hp = [await page.getByTestId('player-hp').innerText(), await page.getByTestId('enemy-hp').innerText()]
  // Deliberate elapsed-time assertion: exceeds both old 350ms and new 1000ms.
  await page.waitForTimeout(1300)
  await expect.poll(() => explanation.innerText()).toBe(before)
  expect([await page.getByTestId('player-hp').innerText(), await page.getByTestId('enemy-hp').innerText()]).toEqual(hp)
  await page.getByRole('button', { name: '下一個事件', exact: true }).click()
  await expect.poll(() => explanation.innerText()).not.toBe(before)
  await expect(explanation).toContainText(/盾/)
  await expect(explanation).toContainText(/HP|生命/)
  await expect(explanation).toContainText(/雷/)
  const stepped = await explanation.innerText()
  await page.getByRole('button', { name: '教學', exact: true }).click()
  await page.waitForTimeout(1300)
  await lesson(page).getByRole('button', { name: '略過教學', exact: true }).click()
  await expect(page.getByRole('button', { name: '繼續結算', exact: true })).toBeVisible()
  await expect.poll(() => explanation.innerText()).toBe(stepped)
  await page.getByRole('button', { name: '略過演出', exact: true }).click()
  await expect(page.getByRole('button', { name: '下一回合', exact: true })).toBeVisible()
  expect([await page.getByTestId('player-hp').innerText(), await page.getByTestId('enemy-hp').innerText()]).toEqual(predicted)
})

test('每招有結果且重看逐事件不改正式資源、牌與紀錄', async ({ page }) => {
  await plan(page)
  const count = await liveCards(page).count()
  await page.getByRole('button', { name: '共同結算', exact: true }).click()
  await page.getByRole('button', { name: '略過演出', exact: true }).click()
  await expect(page.getByTestId('round-summary')).toBeVisible()
  await expect(liveCards(page).getByTestId('action-explanation')).toHaveCount(count)
  for (const explanation of await liveCards(page).getByTestId('action-explanation').all()) await expect(explanation).not.toHaveText('')
  const before = await battleSnapshot(page)
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.getByRole('button', { name: '重看本回合', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '重看本回合', exact: true })
    await expect(dialog.getByTestId('replay-player-hp')).toHaveText('45')
    await expect(dialog.getByTestId('replay-enemy-hp')).toHaveText('45')
    const step = dialog.getByRole('button', { name: '重看下一步', exact: true })
    let steps = 0
    while (await step.isEnabled()) {
      expect(steps++).toBeLessThan(20)
      await step.click()
      await expect(dialog.getByTestId('replay-explanation')).not.toHaveText('')
    }
    expect(steps).toBeGreaterThanOrEqual(count)
    await expect(dialog.getByTestId('replay-player-hp')).toHaveText(before.hp[0])
    await expect(dialog.getByTestId('replay-enemy-hp')).toHaveText(before.hp[1])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await battleSnapshot(page)).toEqual(before)
  }
})

test('390手機教學可鍵盤步進、Escape回焦且無橫向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const opener = page.getByRole('button', { name: '先學倒刺與順序', exact: true })
  await opener.focus(); await page.keyboard.press('Enter')
  const dialog = lesson(page)
  await expect(dialog).toBeVisible()
  const step = dialog.getByRole('button', { name: '教學下一步', exact: true })
  await step.focus(); await page.keyboard.press('Enter')
  await expect(dialog.getByTestId('lesson-explanation')).toContainText('倒刺')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  const box = await step.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(await dialog.getByRole('button', { name: '我懂了，回到交手', exact: true }).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/clarity-lesson-390.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('減少動態效果直接結算，仍可手動重看且不自動前進', async ({ page }) => {
  await plan(page)
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('減少動態效果', { exact: true }).check()
  await page.getByRole('button', { name: '關閉視窗', exact: true }).click()
  await page.getByRole('button', { name: '共同結算', exact: true }).click()
  await expect(page.getByRole('button', { name: '略過演出', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重看本回合', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '重看本回合', exact: true })
  const initial = await dialog.getByTestId('replay-explanation').innerText()
  await page.waitForTimeout(1300)
  await expect(dialog.getByTestId('replay-explanation')).toHaveText(initial)
  await dialog.getByRole('button', { name: '重看下一步', exact: true }).click()
  await expect(dialog.getByTestId('replay-explanation')).not.toHaveText(initial)
})

test('手動暫停後勾減少動態效果仍停在原事件，關閉設定不自行提交', async ({ page }) => {
  await plan(page)
  const predicted = [await page.getByTestId('preview-player').innerText(), await page.getByTestId('preview-enemy').innerText()]
  await page.getByRole('button', { name: '共同結算', exact: true }).click()
  await page.getByRole('button', { name: '暫停結算', exact: true }).click()
  const explanation = page.getByTestId('resolution-explanation')
  const before = await explanation.innerText()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('減少動態效果', { exact: true }).check()
  await expect(explanation).toBeVisible()
  await expect.poll(() => explanation.innerText()).toBe(before)
  await page.getByRole('button', { name: '關閉視窗', exact: true }).click()
  await expect(page.getByRole('button', { name: '繼續結算', exact: true })).toBeVisible()
  await page.waitForTimeout(1300)
  await expect.poll(() => explanation.innerText()).toBe(before)
  await page.getByRole('button', { name: '略過演出', exact: true }).click()
  await expect(page.getByRole('button', { name: '下一回合', exact: true })).toBeVisible()
  expect([await page.getByTestId('player-hp').innerText(), await page.getByTestId('enemy-hp').innerText()]).toEqual(predicted)
})

test('用戶SUMERU四回合：同回合倒刺反殺、死後兩招未執行及敗北重看不重存', async ({ page }) => {
  test.setTimeout(90000)
  const plans: [string, number][][] = [
    [['player-9', 0], ['player-6', 1], ['player-3', 4]],
    [['player-2', 0], ['player-8', 2], ['player-7', 2]],
    [['player-0', 1], ['player-9', 3], ['player-4', 1]],
    [['player-3', 0], ['player-1', 2], ['player-8', 4]],
  ]
  const hp = [[35, 39], [29, 39], [23, 39], [0, 33]]
  await page.goto('./')
  await page.getByLabel('交手種子', { exact: true }).fill('SUMERU')
  await page.getByLabel('首回合先手', { exact: true }).selectOption('enemy')
  await page.getByRole('button', { name: '開始交手', exact: true }).click()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('減少動態效果', { exact: true }).check()
  await page.getByRole('button', { name: '關閉視窗', exact: true }).click()
  let state = createDuel('SUMERU', 'enemy')
  let lastEvents: CombatEvent[] = []
  for (let round = 0; round < plans.length; round++) {
    let placed = 0
    while (state.status === 'placing') {
      if (state.activeSide === 'enemy') state = applyDuelMove(state, chooseDuelMove(state))
      else {
        const [instanceId, index] = plans[round][placed++]
        const handIndex = state.decks.player.hand.findIndex(card => card.instanceId === instanceId)
        expect(handIndex).toBeGreaterThanOrEqual(0)
        await expect(turn(page)).toHaveAttribute('data-side', 'player')
        await hand(page).getByRole('button').nth(handIndex).click()
        await page.getByRole('button', { name: `插入位置 ${index}`, exact: true }).click()
        await page.getByRole('button', { name: '確認落牌', exact: true }).click()
        state = applyDuelMove(state, { side: 'player', kind: 'place', instanceId, index })
      }
    }
    expect(placed).toBe(3)
    await expect(turn(page)).toHaveAttribute('data-side', 'ready')
    expect(await liveCards(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-instance-id')))).toEqual(state.timeline.map(card => card.instanceId))
    const result = resolveDuel(state)
    expect([result.nextState.player.hp, result.nextState.enemy.hp]).toEqual(hp[round])
    lastEvents = result.events
    await page.getByRole('button', { name: '共同結算', exact: true }).click()
    await expect(page.getByTestId('player-hp')).toHaveText(String(hp[round][0]))
    await expect(page.getByTestId('enemy-hp')).toHaveText(String(hp[round][1]))
    state = result.nextState
    if (state.status === 'resolved') {
      await page.getByRole('button', { name: '下一回合', exact: true }).click()
      state = nextDuelRound(state)
    }
  }
  expect(state.status).toBe('lost')
  expect(state.timeline.map(card => [card.side, card.cardId])).toEqual([
    ['enemy', 'channel'], ['enemy', 'thorns'], ['enemy', 'return'],
    ['player', 'strike'], ['player', 'return'], ['player', 'strike'],
  ])
  const reflection = lastEvents.find(event => event.effect === 'reflect')!
  expect([reflection.actor, reflection.amount, reflection.before.player.hp, reflection.after.player.hp]).toEqual(['enemy', 4, 4, 0])
  const summary = page.getByTestId('round-summary')
  await expect(summary).toBeVisible()
  await expect(summary.locator('.action-result-list li')).toHaveCount(6)
  await expect(summary.getByText('前面死亡，此招未執行', { exact: true })).toHaveCount(2)
  await expect(summary).toContainText('受到反傷6（護盾擋0／實傷4）')
  const cause = page.getByTestId('final-cause')
  for (const text of ['倒刺反擊', '反傷6', '實傷4', '後面的招式不再執行']) await expect(cause).toContainText(text)
  await expect(page.getByRole('heading', { name: '這一戰，留待再借。', exact: true })).toBeVisible()
  const before = await stored(page)
  const records = JSON.parse(before['nitian.duel.records.v1']!)
  expect(records).toHaveLength(1)
  expect([records[0].seed, records[0].outcome, records[0].turns.length]).toEqual(['SUMERU', 'lost', 4])
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.getByRole('button', { name: '重看本回合', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '重看本回合', exact: true })
    await expect(dialog.getByTestId('replay-player-hp')).toHaveText('23')
    await expect(dialog.getByTestId('replay-enemy-hp')).toHaveText('39')
    for (const event of lastEvents) {
      await dialog.getByRole('button', { name: '重看下一步', exact: true }).click()
      await expect(dialog.getByTestId('replay-player-hp')).toHaveText(String(event.after.player.hp))
      await expect(dialog.getByTestId('replay-enemy-hp')).toHaveText(String(event.after.enemy.hp))
      await expect(dialog.getByTestId('replay-explanation')).toContainText(event.label)
    }
    await expect(dialog.getByRole('button', { name: '重看下一步', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('player-hp')).toHaveText('0')
    await expect(page.getByTestId('enemy-hp')).toHaveText('33')
    expect(await stored(page)).toEqual(before)
  }
})
