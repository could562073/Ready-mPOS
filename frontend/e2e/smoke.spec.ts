import { test, expect, type Page } from '@playwright/test'

// Smoke 測試：確認 App 首次載入成功、底部導覽三個 tab 都能切換渲染，且過程中無未捕捉例外。
// 首次開啟會因 localStorage 沒有 `mpos_onboarded` 而進入 OnboardingPage，
// 這裡在頁面載入前就用 addInitScript 種好「已完成 onboarding」的狀態，直接測主畫面。

// 監聽頁面未捕捉例外（pageerror），收集起來供各測試斷言為空
function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on('pageerror', err => errors.push(err))
  return errors
}

// 底部導覽的 tab 按鈕：限定在 <nav> 內並精確比對，避免和頁面內含相同文字的按鈕衝突。
function navTab(page: Page, label: string) {
  return page.locator('nav').getByRole('button', { name: label, exact: true })
}

test.beforeEach(async ({ page }) => {
  // 在任何頁面 script 執行前，先寫入 localStorage 讓 App 略過 Onboarding
  await page.addInitScript(() => {
    window.localStorage.setItem('mpos_onboarded', '1')
  })
})

test('App 首次載入成功並直接進入主畫面（略過 Onboarding）', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')

  // 底部導覽列的三個 tab 按鈕都應該出現，代表主畫面（非 Onboarding、非空白頁）成功渲染
  await expect(navTab(page, '帳目')).toBeVisible()
  await expect(navTab(page, '月結')).toBeVisible()
  await expect(navTab(page, '設定')).toBeVisible()

  expect(errors).toEqual([])
})

test('底部導覽每個 tab 都能點擊切換且對應頁面渲染', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')

  // 帳目（LedgerPage）：落地頁，右下 FAB「新增交易」為該頁固定存在的元素（不受當日有無交易影響）
  await expect(page.getByRole('button', { name: '新增交易' })).toBeVisible()

  // 月結（MonthlyReportPage）：本月淨額 Hero 卡為該頁固定標題（不論有無資料都渲染）
  await navTab(page, '月結').click()
  await expect(page.getByText('本月淨額', { exact: false })).toBeVisible()

  // 設定（SettingsPage）：類別管理區塊為該頁特有文字
  await navTab(page, '設定').click()
  await expect(page.getByText('類別管理')).toBeVisible()

  // 切回帳目，確認可以來回切換
  await navTab(page, '帳目').click()
  await expect(page.getByRole('button', { name: '新增交易' })).toBeVisible()

  expect(errors).toEqual([])
})
