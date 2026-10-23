import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { applyAction, coord, createMatch, legalActions, type Action, type MatchState } from '../src/tactics/engine'
import { chooseAIAction } from '../src/tactics/ai'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, at: number) => page.getByTestId(`tactics-cell-${coord(at)}`)
const app = (page: Page) => page.getByTestId('tactics-app')
const liveRun = !!process.env.TEST_URL && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.TEST_URL).hostname)
const screenshotPath = (page: Page, profile: string, stage: string) => `docs/screenshots/tactics-${profile}-${page.context().browser()!.browserType().name()}-${stage}${liveRun ? '-live' : ''}.png`

class TacticsJourney {
  constructor(readonly page: Page, readonly touch: boolean, public state: MatchState) {}
  async press(locator: Locator) { await (this.touch ? locator.tap() : locator.click()) }
  async reveal() {
    const handoff = this.page.getByRole('dialog', { name: /^請交給/ })
    if (await handoff.count()) {
      await expect(this.page.locator('.tk-hand button')).toHaveCount(0)
      await this.press(handoff.getByRole('button', { name: /^我是/ }))
    }
  }
  async assertState() {
    await expect(app(this.page)).toHaveAttribute('data-serial', String(this.state.serial))
    await expect(app(this.page)).toHaveAttribute('data-turn', this.state.turn)
    await expect(app(this.page)).toHaveAttribute('data-status', this.state.status)
    for (const side of ['asura', 'deva'] as const) {
      await expect(cell(this.page, this.state.players[side].pos)).toHaveAccessibleName(new RegExp(side === 'asura' ? '阿修羅主將' : '天眾主將'))
    }
  }
  async select(action: Action) {
    await this.reveal()
    if (action.type === 'end') await this.press(button(this.page, '結束回合'))
    else if (action.type === 'card') {
      const hand = this.state.players[this.state.turn].hand
      const card = hand.find(c => c.instanceId === action.instanceId)!
      const index = hand.filter(c => c.id === card.id).findIndex(c => c.instanceId === card.instanceId)
      await this.press(this.page.getByTestId(`tactics-card-${card.id}`).nth(index))
      if (action.to !== undefined) await this.press(cell(this.page, action.to))
    } else {
      await this.press(button(this.page, action.type === 'move' ? '移動' : action.type === 'attack' ? '攻擊' : '占壇'))
      await this.press(cell(this.page, action.type === 'claim' ? action.at : action.to))
    }
    await expect(this.page.locator('.tk-confirm-bar .tk-primary')).toBeEnabled()
    await this.assertState() // A preview cannot commit state.
  }
  async act(action: Action) {
    expect(legalActions(this.state)).toContainEqual(action)
    await this.select(action)
    this.state = applyAction(this.state, action)
    await this.press(this.page.locator('.tk-confirm-bar .tk-primary'))
    await this.assertState()
    if (this.state.status === 'playing') {
      await this.reveal()
      await expect(button(this.page, '結束回合')).toBeEnabled()
      await expect(this.page.getByLabel(`剩餘${this.state.ap}行動`, { exact: true })).toBeVisible()
    }
  }
  card(id: string, to?: number): Action {
    const card = this.state.players[this.state.turn].hand.find(c => c.id === id)
    expect(card, `seed=${this.state.seed}, turn=${this.state.turnNumber}, hand=${this.state.players[this.state.turn].hand.map(c => c.id)}`).toBeTruthy()
    return { type: 'card', instanceId: card!.instanceId, ...(to === undefined ? {} : { to }) }
  }
}

async function open(page: Page, touch: boolean, scenario: 'lesson' | 'full' = 'lesson', seed = 'nitian-browser-05') {
  await page.goto(`./?mode=tactics&opponent=local&scenario=${scenario}&seed=${seed}`)
  const journey = new TacticsJourney(page, touch, createMatch({ seed, scenario }))
  await expect(app(page)).toBeVisible()
  await journey.reveal()
  await journey.assertState()
  return journey
}

async function newGame(journey: TacticsJourney, options: { scenario?: string; opponent?: string; player?: string; first?: string; seed?: string }) {
  await journey.press(button(journey.page, '新局'))
  const dialog = journey.page.getByRole('dialog', { name: '踏入新的神域' })
  for (const [label, value] of [['局面', options.scenario], ['對手', options.opponent], ['你的陣營', options.player], ['先手', options.first]] as const) {
    if (value) await dialog.getByRole('combobox', { name: label, exact: true }).selectOption(value)
  }
  if (options.seed) await dialog.getByLabel('種子', { exact: true }).fill(options.seed)
  await journey.press(dialog.getByRole('button', { name: '開始新局', exact: true }))
}

for (const profile of [{ name: 'phone', width: 390, height: 844, touch: true }, { name: 'desktop', width: 1366, height: 768, touch: false }]) {
  test.describe(profile.name, () => {
    test.use({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch, isMobile: profile.touch })

    test('@live lesson preview damage cancel AP and duplicate confirmation', async ({ page }) => {
      const journey = await open(page, profile.touch)
      await expect(page.locator('.tk-own-bar')).toContainText('長槍')
      await expect(page.locator('.tk-opponent-bar')).toContainText('月刃')
      await journey.select({ type: 'attack', to: 11 })
      await expect(page.locator('.tk-confirm-summary')).toContainText('預估傷害 3')
      await expect(page.locator('.tk-confirm-summary')).toContainText('長槍2＋雷泉1')
      await page.screenshot({ path: screenshotPath(page, profile.name, 'attack-preview'), fullPage: true })
      await journey.press(button(page, '取消'))
      await journey.assertState()
      await expect(page.getByLabel('剩餘2行動', { exact: true })).toBeVisible()
      await journey.select({ type: 'attack', to: 11 })
      // Two real pointer activations in the same browser task exercise the lock.
      const confirm = page.locator('.tk-confirm-bar .tk-primary')
      const box = await confirm.boundingBox()
      expect(box).toBeTruthy()
      if (profile.touch) {
        await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2)
        await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2)
      }
      else await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { clickCount: 2, delay: 10 })
      journey.state = applyAction(journey.state, { type: 'attack', to: 11 })
      await journey.assertState()
      await expect(cell(page, 11)).toContainText('3♥')
      await expect(button(page, '攻擊')).toBeDisabled()
      await expect(page.getByLabel('剩餘1行動', { exact: true })).toBeVisible()
      await expect(button(page, '結束回合')).toBeEnabled()
      await page.screenshot({ path: screenshotPath(page, profile.name, 'lesson'), fullPage: true })
    })

    test('@live real assets layout reachable controls and reduced motion', async ({ page }) => {
      await open(page, profile.touch)
      for (const selector of ['.tk-sprite', '.tk-card-art']) {
        const atlas = await page.locator(selector).first().evaluate(async el => {
          const url = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
          if (!url) return { width: 0, height: 0 }
          const image = new Image(); image.src = url; await image.decode()
          return { width: image.naturalWidth, height: image.naturalHeight }
        })
        expect(atlas.width).toBeGreaterThan(100)
        expect(atlas.height).toBeGreaterThan(100)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.getByTestId('tactics-cell-A1')).toBeInViewport()
      for (const selector of ['.tk-confirm-bar button', '.tk-modes button', '.tk-header button']) {
        for (const target of await page.locator(selector).all()) {
          const box = await target.boundingBox()
          expect(box!.width).toBeGreaterThanOrEqual(44)
          expect(box!.height).toBeGreaterThanOrEqual(44)
        }
      }
      for (const target of await page.locator('.tk-confirm-bar button').all()) await expect(target).toBeInViewport()
      await button(page, '規則').click()
      await page.getByLabel('減少動態效果').check()
      await button(page, '關閉視窗').click()
      await expect(app(page)).toHaveClass(/tk-reduced/)
      await page.screenshot({ path: screenshotPath(page, profile.name, 'full-layout'), fullPage: true })
      await page.screenshot({ path: screenshotPath(page, profile.name, 'viewport') })
    })

    test('@live weapon replacement diagonal and dash fog blood claim through UI', async ({ page }) => {
      const journey = await open(page, profile.touch)
      await journey.act(journey.card('blade'))
      await expect(page.locator('.tk-own-bar')).toContainText('月刃')
      await expect(page.locator('.tk-weapon-info')).toContainText('↖ ↗ ↙ ↘')
      await expect(button(page, '攻擊')).toBeDisabled() // D3 is orthogonal to C3.
      await journey.act(journey.card('dash', 14)) // C3 -> C4; dash may also turn.
      await expect(button(page, '攻擊')).toBeEnabled() // Deva D3 -> C4 is diagonal.
      await journey.act({ type: 'attack', to: 14 })
      await expect(cell(page, 14)).toContainText('3♥')
    })

    test('@live terrain blood and altar UI retain cancellation and handoff privacy', async ({ page }) => {
      const journey = await open(page, profile.touch)
      await journey.select(journey.card('fog', 6))
      await journey.press(button(page, '取消'))
      await expect(page.locator('.tk-hand button')).toHaveCount(4)
      await journey.act(journey.card('fog', 6))
      await expect(cell(page, 6)).toHaveAccessibleName(/迷霧/)
      await journey.act(journey.card('blood', 12))
      await expect(page.locator('.tk-domain-key span').filter({ hasText: 'A4' })).toContainText('無主')
      // Complete the opposing turn with two positional decisions, then reclaim the sacrificed altar.
      await journey.act({ type: 'move', to: 7 })
      await journey.act({ type: 'move', to: 3 })
      await journey.act({ type: 'move', to: 14 })
      await journey.act({ type: 'move', to: 13 })
      await journey.act({ type: 'move', to: 7 })
      await journey.act({ type: 'move', to: 3 })
      await journey.act({ type: 'claim', at: 12 })
      await expect(page.locator('.tk-domain-key span').filter({ hasText: 'A4' })).toContainText('修')
    })

    test('@live blood oath adds damage5 and turning two-step dash is playable', async ({ page }) => {
      const journey = await open(page, profile.touch)
      await journey.act(journey.card('blood', 12))
      await expect(page.locator('.tk-domain-key span').filter({ hasText: 'A4' })).toContainText('無主')
      await journey.select({ type: 'attack', to: 11 })
      await expect(page.locator('.tk-confirm-summary')).toContainText('預估傷害 5')
      await expect(page.locator('.tk-confirm-summary')).toContainText('長槍2＋雷泉1＋血誓2')
      await journey.press(button(page, '取消'))
      await journey.act({ type: 'attack', to: 11 })
      await expect(cell(page, 11)).toContainText('1♥')
      await newGame(journey, { scenario: 'lesson', seed: 'nitian-browser-05' })
      journey.state = createMatch({ seed: 'nitian-browser-05', scenario: 'lesson' })
      await journey.reveal()
      // C3 -> C4 -> B4 turns around the blocking spring at B3.
      await journey.act(journey.card('dash', 13))
      await expect(cell(page, 13)).toHaveAccessibleName(/阿修羅主將/)
      await expect(page.getByLabel('剩餘1行動', { exact: true })).toBeVisible()
    })

    test('@live handoff keyboard focus and canceling replacement never expose cards', async ({ page }) => {
      await page.goto('./?mode=tactics&opponent=local&scenario=full&seed=handoff-privacy')
      const handoff = page.getByRole('dialog', { name: '請交給阿修羅' })
      await expect(handoff).toBeVisible()
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab')
        expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
        await expect(page.locator('.tk-hand button')).toHaveCount(0)
      }
      await handoff.getByRole('button', { name: '更換對局', exact: true }).click()
      await expect(page.locator('.tk-hand button')).toHaveCount(0)
      await button(page, '關閉視窗').click()
      await expect(handoff).toBeVisible()
      await expect(page.locator('.tk-hand button')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(handoff).toBeVisible()
      await expect(page.locator('.tk-hand button')).toHaveCount(0)
      await handoff.getByRole('button', { name: /^我是/ }).click()
      await expect(page.locator('.tk-hand button')).toHaveCount(4)
    })

    test('@live full eight-round played match exports replay and restarts', async ({ page }, testInfo) => {
      test.setTimeout(120000)
      const journey = await open(page, profile.touch, 'full', 'nitian-complete-05')
      const decisions: Action[] = []
      while (journey.state.status === 'playing') {
        const action = chooseAIAction(journey.state)
        expect(action).not.toBeNull()
        decisions.push(action!)
        await journey.act(action!)
        expect(decisions.length).toBeLessThan(60)
      }
      const types = new Set(journey.state.log.map(e => e.type))
      expect(types.has('move')).toBe(true)
      expect(types.has('claim')).toBe(true)
      expect(types.has('attack')).toBe(true)
      expect([...types].some(type => type.startsWith('card:'))).toBe(true)
      await testInfo.attach('seed-decision-record', { body: JSON.stringify({ seed: journey.state.seed, decisions, log: journey.state.log }, null, 2), contentType: 'application/json' })
      const result = page.getByRole('dialog', { name: '神域已有歸屬' })
      await expect(result).toBeVisible()
      await expect(page.locator('.tk-round')).toContainText('第 8 輪')
      await result.getByRole('textbox').fill('瀏覽器實際操作八輪；武器角度與占壇均有操作。')
      await journey.press(button(page, '儲存回饋'))
      const downloadPromise = page.waitForEvent('download')
      await journey.press(button(page, '匯出本局JSON'))
      const download = await downloadPromise
      const path = await download.path()
      const exported = JSON.parse(await readFile(path!, 'utf8'))
      expect(exported.state).toEqual(journey.state)
      expect(exported.feedback).toContain('八輪')
      expect(exported.history.length).toBe(1)
      await page.screenshot({ path: screenshotPath(page, profile.name, 'finished'), fullPage: true })
      await journey.press(button(page, '同種子再戰'))
      journey.state = createMatch({ seed: 'nitian-complete-05' })
      await journey.reveal()
      await journey.assertState()
      await expect(page.locator('.tk-hand button')).toHaveCount(4)
    })

    test('@live seeded spring spear legal UI and new-game first/player choices', async ({ page }, testInfo) => {
      const journey = await open(page, profile.touch, 'full')
      // Frozen after the initial public seed scan: spear, dash, blood, spring.
      const seed = 'nitian-cards-0'
      expect(createMatch({ seed }).players.asura.hand.map(c => c.id)).toEqual(['spear', 'dash', 'blood', 'spring'])
      await newGame(journey, { seed, scenario: 'full', opponent: 'local', first: 'asura' })
      journey.state = createMatch({ seed }); await journey.reveal()
      await journey.act(journey.card('spring', 9))
      await expect(cell(page, 9)).toHaveAccessibleName(/共用雷泉/)
      await journey.act(journey.card('spear'))
      await journey.act({ type: 'move', to: 6 })
      await journey.act({ type: 'move', to: 10 })
      await expect(page.locator('.tk-own-bar')).toContainText('長槍')
      await testInfo.attach('card-seed', { body: JSON.stringify({ seed, log: journey.state.log }), contentType: 'application/json' })
      await newGame(journey, { player: 'deva', first: 'deva', opponent: 'local', seed: 'deva-first' })
      journey.state = createMatch({ seed: 'deva-first', first: 'deva' }); await journey.reveal(); await journey.assertState()
      await expect(page.locator('.tk-own-bar')).toContainText('天眾')
    })

    test('@live AI timers pause in teaching new-game dialogs and cannot pollute restart', async ({ page }) => {
      await page.clock.install()
      const journey = await open(page, profile.touch)
      await newGame(journey, { opponent: 'ai', player: 'deva', first: 'asura', scenario: 'full', seed: 'ai-timer-old' })
      const serial = await app(page).getAttribute('data-serial')
      await journey.press(button(page, '教學'))
      await page.clock.runFor(3000)
      await expect(app(page)).toHaveAttribute('data-serial', serial!)
      await journey.press(button(page, '回到目前對局'))
      await journey.press(button(page, '新局'))
      await page.clock.runFor(3000)
      await expect(app(page)).toHaveAttribute('data-serial', serial!)
      const dialog = page.getByRole('dialog', { name: '踏入新的神域' })
      await dialog.getByRole('combobox', { name: '你的陣營', exact: true }).selectOption('asura')
      await dialog.getByLabel('種子', { exact: true }).fill('ai-timer-fresh')
      await journey.press(dialog.getByRole('button', { name: '開始新局', exact: true }))
      await page.clock.runFor(5000)
      await expect(app(page)).toHaveAttribute('data-serial', '1')
      journey.state = createMatch({ seed: 'ai-timer-fresh' })
      await journey.act({ type: 'move', to: 9 })
      await journey.select({ type: 'move', to: 10 })
      await journey.press(page.locator('.tk-confirm-bar .tk-primary'))
      await page.clock.runFor(5000)
      await expect.poll(async () => Number(await app(page).getAttribute('data-serial'))).toBeGreaterThan(4)
    })
  })
}

test('@live storage unavailable still permits actual moves and reports write failure', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new Error('read denied') } })
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new Error('quota denied') } })
  })
  const journey = await open(page, false)
  await newGame(journey, { scenario: 'full', opponent: 'local', seed: 'storage-denied' })
  journey.state = createMatch({ seed: 'storage-denied' }); await journey.reveal()
  await expect(page.getByText('本機儲存不可用，仍可繼續玩；終局可匯出紀錄。')).toBeVisible()
  await journey.act({ type: 'move', to: 9 })
})

test('@live offline reload retains tactics artwork and playable lesson', async ({ page, context }) => {
  await open(page, false)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (registration.active?.state !== 'activated') await new Promise<void>(resolve => registration.active?.addEventListener('statechange', () => resolve(), { once: true }))
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!
    const response = await fetch(link.href)
    if (!response.ok) throw new Error(`offline manifest HTTP ${response.status}`)
    return response.json()
  })
  expect(manifest).toMatchObject({ id: './?mode=tactics', start_url: './?mode=tactics' })
  const journey = new TacticsJourney(page, false, createMatch({ seed: 'nitian-browser-05', scenario: 'lesson' }))
  await journey.reveal(); await journey.assertState()
  for (const selector of ['.tk-sprite', '.tk-card-art']) {
    const loaded = await page.locator(selector).first().evaluate(async el => {
      const url = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
      const image = new Image(); image.src = url!; await image.decode(); return image.naturalWidth
    })
    expect(loaded).toBeGreaterThan(100)
  }
  await journey.act({ type: 'attack', to: 11 })
  await context.setOffline(false)
})

test('@live tactics manifest has its own install identity and launch URL', async ({ page }) => {
  await open(page, false)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /\/tactics\.webmanifest$/)
  const manifest = await page.evaluate(async () => {
    const response = await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`)
    return response.json()
  })
  expect(manifest).toMatchObject({ id: './?mode=tactics', start_url: './?mode=tactics', scope: './', display: 'standalone' })
})

test('@live retained realm fire duel entry smoke', async ({ page }) => {
  await page.goto('./?mode=realm'); await expect(page.getByTestId('realm-board')).toBeAttached()
  await page.goto('./?mode=fire'); await expect(page.getByTestId('fire-app')).toBeAttached()
  await page.goto('./?mode=duel')
  await button(page, '開始交手').click()
  await expect(page.getByTestId('duel-turn')).toBeAttached()
})
