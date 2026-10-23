import { test, expect, type Page } from '@playwright/test'

async function start(page: Page, mode = '紙上試煉') {
  await page.goto('./')
  await page.getByRole('button', { name: mode, exact: false }).click()
  await page.getByRole('button', { name: '開始借招', exact: true }).click()
}
async function put(page: Page, name: string, slot: number) {
  await page.getByRole('button', { name: `手牌 ${name}`, exact: false }).first().click()
  await page.getByRole('button', { name: `插入區 ${slot}`, exact: false }).click()
}
async function commit(page: Page) {
  await page.getByRole('button', { name: '出手', exact: true }).click()
  const skip = page.getByRole('button', { name: '略過演出', exact: true })
  if (await skip.isVisible()) await skip.click()
}
const turns: [string, number][][] = [
  [['引雷印', 1], ['護身', 1], ['破勢', 2]],
  [['護身', 0], ['倒刺', 0], ['破勢', 0]],
  [['引雷印', 1], ['奉還', 1], ['避鋒', 1]],
  [['借甲', 1], ['倒刺', 1], ['破勢', 1]],
]

test('紙上試煉：真實點選、預覽、勝利、紀錄匯出及同種子重開', async ({ page }) => {
  await start(page)
  const checkpoints = [[45, 42], [45, 34], [45, 12], [43, 0]]
  for (let r = 0; r < turns.length; r++) {
    for (const [name, slot] of turns[r]) await put(page, name, slot)
    await expect(page.getByTestId('preview-player')).toContainText(String(checkpoints[r][0]))
    await expect(page.getByTestId('preview-enemy')).toContainText(String(checkpoints[r][1]))
    await commit(page)
    if (r < 3) {
      await expect(page.getByTestId('player-hp')).toHaveText(String(checkpoints[r][0]))
      await expect(page.getByTestId('enemy-hp')).toHaveText(String(checkpoints[r][1]))
      await page.getByRole('button', { name: '下一回合', exact: true }).click()
    }
  }
  await expect(page.getByRole('heading', { name: '雷霆，已奉還。' })).toBeVisible()
  await expect(page.getByTestId('result-hp')).toHaveText('43')
  await expect(page.getByTestId('result-rounds')).toHaveText('4')
  await page.getByLabel('試玩感受').fill('借甲接倒刺有感，想換一種打法。')
  await page.getByRole('button', { name: '儲存感受' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出局內紀錄 JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/nitian.*\.json$/)
  const seed = await page.getByTestId('run-seed').textContent()
  await page.getByRole('button', { name: '同種子再戰' }).click()
  await expect(page.getByTestId('run-seed')).toHaveText(seed!)
  await expect(page.getByTestId('round')).toHaveText('1')
  await page.screenshot({ path: 'test-results/desktop-battle.png', fullPage: true })
})

test('撤回、移動、區內調序、三張上限與清空', async ({ page }) => {
  await start(page)
  await put(page, '引雷印', 1)
  await put(page, '奉還', 1)
  await put(page, '護身', 1)
  await put(page, '破勢', 0)
  await expect(page.getByRole('status')).toContainText('最多三張')
  await expect(page.getByTestId('planned-card')).toHaveCount(3)
  await page.getByRole('button', { name: '手牌 奉還', exact: false }).click()
  await page.getByRole('button', { name: '同區向前' }).click()
  await expect(page.getByTestId('planned-card').first()).toContainText('奉還')
  await page.getByRole('button', { name: '插入區 2', exact: false }).click()
  await expect(page.getByTestId('planned-card')).toHaveCount(3)
  await page.getByRole('button', { name: '撤回此牌' }).click()
  await expect(page.getByTestId('planned-card')).toHaveCount(2)
  await page.getByRole('button', { name: '清空編排' }).click()
  await expect(page.getByTestId('planned-card')).toHaveCount(0)
})

test('零張出手可死亡，新種子重開與本機紀錄存在', async ({ page }) => {
  await start(page)
  for (let i = 0; i < 10; i++) {
    await commit(page)
    if (await page.getByRole('heading', { name: '再借一次天光。' }).isVisible()) break
    await page.getByRole('button', { name: '下一回合', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: '再借一次天光。' })).toBeVisible()
  const oldSeed = await page.getByTestId('run-seed').textContent()
  await page.getByRole('button', { name: '換種子再戰' }).click()
  await expect(page.getByTestId('run-seed')).not.toHaveText(oldSeed!)
  await page.getByRole('button', { name: '試煉紀錄', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('敗北')
})

test('正常演出與略過得到同一結果，出手期間鎖定重複輸入', async ({ page }) => {
  await start(page)
  await put(page, '引雷印', 1); await put(page, '護身', 1); await put(page, '奉還', 2)
  await page.getByRole('button', { name: '出手', exact: true }).click()
  await expect(page.getByRole('button', { name: '清空編排' })).toBeDisabled()
  await page.getByRole('button', { name: '下一回合', exact: true }).waitFor({ timeout: 15000 })
  await expect(page.getByTestId('player-hp')).toHaveText('45')
  await expect(page.getByTestId('enemy-hp')).toHaveText('35')
  await page.getByRole('button', { name: '重新開始', exact: true }).click()
  await page.getByRole('button', { name: '同種子重開', exact: true }).click()
  await put(page, '引雷印', 1); await put(page, '護身', 1); await put(page, '奉還', 2)
  await commit(page)
  await expect(page.getByTestId('enemy-hp')).toHaveText('35')
  await expect(page.getByTestId('round')).toHaveText('1')
})

test('手機與桌面無橫向溢出、主要觸控目標44px、設定與減少動態', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport)
    await start(page)
    await put(page, '引雷印', 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const button of [page.getByRole('button', { name: '出手', exact: true }), page.getByRole('button', { name: '手牌 引雷印', exact: false }), page.getByRole('button', { name: '插入區 0', exact: false })]) {
      const box = await button.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.width).toBeGreaterThanOrEqual(44)
    }
    await page.screenshot({ path: `test-results/battle-${viewport.width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('減少動態效果').check()
  await page.getByRole('button', { name: '關閉視窗' }).click()
  await page.getByRole('button', { name: '出手', exact: true }).click()
  await expect(page.getByRole('button', { name: '下一回合', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '略過演出' })).toHaveCount(0)
})

test('無法使用localStorage仍可開始及操作，並顯示保存失敗', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    Storage.prototype.setItem = () => { throw new Error('blocked') }
  })
  await start(page)
  await expect(page.getByTestId('storage-warning')).toBeVisible()
  await put(page, '引雷印', 1)
  await expect(page.getByTestId('planned-card')).toHaveCount(1)
})

test('PWA安裝資源及離線重新載入', async ({ page, context }) => {
  page.on('pageerror', error => console.log('OFFLINE_PAGE_ERROR', error.message))
  page.on('requestfailed', req => console.log('OFFLINE_REQUEST_FAILED', req.url(), req.failure()?.errorText))
  await page.goto('./')
  const manifest = await page.request.get('manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect((await manifest.json()).display).toBe('standalone')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  })
  const sw = context.serviceWorkers()[0]
  await context.setOffline(true)
  console.log('OFFLINE_CACHE', JSON.stringify(await page.evaluate(async () => {
    return await Promise.all((await caches.keys()).map(async k => {
      const c = await caches.open(k)
      return { k, files: await Promise.all((await c.keys()).filter(r => r.url.endsWith('.js')).map(async req => ({ url: req.url, request: [...req.headers], headers: [...(await c.match(req))!.headers], empty: !!await c.match(new Request(req.url)), origin: !!await c.match(new Request(req.url, { headers: { Origin: location.origin } })) }))) }
    }))
  })))
  await page.reload()
  console.log('OFFLINE_HTML', await page.content())
  console.log('OFFLINE_SW', JSON.stringify(await sw.evaluate('self.__diag')))
  await expect(page.getByRole('button', { name: '開始借招', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '開始借招', exact: true }).click()
  await expect(page.getByTestId('round')).toHaveText('1')
  await context.setOffline(false)
})

test('演出期間品牌入口不繞過出手鎖定', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: '出手', exact: true }).click()
  await page.getByRole('link', { name: '逆天首頁' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '略過演出' }).click()
  await expect(page.getByRole('button', { name: '下一回合', exact: true })).toBeVisible()
})

test('教學演出結束不覆蓋剛修改的音效設定', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-23T00:00:01Z'))
  await start(page)
  await page.getByRole('button', { name: '出手', exact: true }).click()
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.action-dock strong').textContent() === '回合結束') break
    await page.clock.runFor(350)
  }
  await expect(page.locator('.action-dock strong')).toHaveText('回合結束')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByLabel('合成音效').check()
  await page.clock.runFor(350)
  await expect(page.getByLabel('合成音效')).toBeChecked()
})
