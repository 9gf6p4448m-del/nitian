import { test, expect } from '@playwright/test'

test('手機觸控tap可選棋、預覽與確認 @live', async ({ browser }, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    baseURL: info.project.use.baseURL, reducedMotion: 'reduce',
  })
  try {
    const page = await context.newPage()
    await page.goto('./?mode=fire')
    const root = page.getByTestId('fire-app')
    await expect(root).toBeVisible()
    const initial = await root.getAttribute('data-state')
    await page.getByTestId('fire-cell-21').tap()
    await page.getByRole('button', { name: '移動', exact: true }).tap()
    await page.getByTestId('fire-cell-11').tap()
    expect(await root.getAttribute('data-state')).toBe(initial)
    await expect(page.getByRole('button', { name: '確認移動', exact: true })).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: '確認移動', exact: true }).tap()
    await expect.poll(async () => JSON.parse(await root.getAttribute('data-state') ?? '{}').slot).toBe(2)
    const final = JSON.parse(await root.getAttribute('data-state') ?? '{}')
    expect(final.units.find((unit: { id: string }) => unit.id === 'a1')).toMatchObject({ cell: 11, used: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await context.close()
  }
})
