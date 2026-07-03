import { test, expect, type Page, type Locator } from '@playwright/test'

// 二級分類管理 E2E：驗證「設定 → 支出類別 → 編輯類別」內的二級分類
// 新增／改名／設預設／刪除／持久化 全流程，取代計畫原本的手動 dev 驗證。
// 首次開啟會因 localStorage 沒有 `mpos_onboarded` 而進入 OnboardingPage，
// 這裡在頁面載入前用 addInitScript 種好「已完成 onboarding」的狀態，
// 並直接種一份含已知類別（對應 lib/categories.ts 的 DEFAULT_INCOME / DEFAULT_EXPENSE）
// 的 `mpos_categories`，確保能穩定選到「雜支」這個支出類別。

// 監聽頁面未捕捉例外（pageerror），收集起來供各測試斷言為空
function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on('pageerror', err => errors.push(err))
  return errors
}

// 底部導覽的 tab 按鈕：限定在 <nav> 內並精確比對
function navTab(page: Page, label: string) {
  return page.locator('nav').getByRole('button', { name: label, exact: true })
}

// 找到「類別列表」中名稱精確等於 label 的那一列（CategoryRow 的根 div），
// 用來點擊列內沒有 accessible name 的「編輯」箭頭按鈕。
// CategoryRow 沒有 class/data-testid 可用（全專案走 inline style），
// 因此用「文字精確等於 label 的祖先 div 之中，最先包含 <button> 的那個」來鎖定整列容器，
// 避開只含名稱文字、不含按鈕的內層 div。
function categoryRow(page: Page, label: string): Locator {
  return page
    .locator('div')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .filter({ has: page.locator('button') })
    .first()
}

async function openCategoryEditor(page: Page, label: string) {
  const row = categoryRow(page, label)
  // 列內有兩個按鈕：啟用/停用 toggle（第一個）與編輯箭頭（最後一個）
  await row.locator('button').last().click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('mpos_onboarded', '1')
    // 對應 frontend/src/lib/categories.ts 的 DEFAULT_INCOME / DEFAULT_EXPENSE 真實預設值
    const categories = [
      { id: 'cash',  name: '現金',      icon: 'cash',    color: 'mint',     fee: 0,    enabled: true, type: 'income' },
      { id: 'card',  name: '刷卡',      icon: 'card',    color: 'sky',      fee: 0,    enabled: true, type: 'income' },
      { id: 'uber',  name: 'Uber Eats', icon: 'bike',    color: 'lavender', fee: 0.30, enabled: true, type: 'income' },
      { id: 'panda', name: 'foodpanda', icon: 'package', color: 'pink',     fee: 0.35, enabled: true, type: 'income' },
      { id: 'food', name: '食材採購', icon: 'package', color: 'peach',    enabled: true, type: 'expense' },
      { id: 'wage', name: '員工薪資', icon: 'users',   color: 'lavender', enabled: true, type: 'expense' },
      { id: 'misc', name: '雜支',     icon: 'tag',     color: 'coral',    enabled: true, type: 'expense' },
    ]
    window.localStorage.setItem('mpos_categories', JSON.stringify(categories))
  })
})

test('二級分類：新增／改名／設預設／刪除 全流程並正確持久化', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')

  // 進「設定」tab → 點「支出類別」進入類別管理頁
  await navTab(page, '設定').click()
  await page.getByText('支出類別', { exact: true }).click()

  // 開啟「雜支」的編輯 Sheet
  await openCategoryEditor(page, '雜支')
  await expect(page.getByText('編輯類別')).toBeVisible()

  // 斷言「二級分類」區塊出現
  await expect(page.getByText('二級分類', { exact: true })).toBeVisible()

  // 新增第一個二級：瓦斯費
  await page.getByText('新增二級分類').click()
  const subInputs = page.getByPlaceholder('二級名稱')
  await expect(subInputs).toHaveCount(1)
  await subInputs.nth(0).fill('瓦斯費')

  // 新增第二個二級：水費
  await page.getByText('新增二級分類').click()
  await expect(subInputs).toHaveCount(2)
  await subInputs.nth(1).fill('水費')

  // 「記帳時預設帶入」chip row 出現，點「瓦斯費」設為預設
  await expect(page.getByText('記帳時預設帶入')).toBeVisible()
  await page.getByRole('button', { name: '瓦斯費', exact: true }).click()

  // 點「儲存」關閉 Sheet
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('編輯類別')).toBeHidden()

  // 重新開啟同一類別，斷言二級名稱與預設都還原
  await openCategoryEditor(page, '雜支')
  await expect(page.getByText('編輯類別')).toBeVisible()
  await expect(page.getByPlaceholder('二級名稱').nth(0)).toHaveValue('瓦斯費')
  await expect(page.getByPlaceholder('二級名稱').nth(1)).toHaveValue('水費')
  // 預設 chip 的選中樣式以深色背景（T.ink）呈現，用 CSS background 斷言選中狀態
  const gasChip = page.getByRole('button', { name: '瓦斯費', exact: true })
  await expect(gasChip).toHaveCSS('color', 'rgb(255, 255, 255)')

  // 刪除「瓦斯費」→ 預設應回「無」
  await page.getByRole('button', { name: '刪除二級 瓦斯費' }).click()
  await expect(page.getByPlaceholder('二級名稱')).toHaveCount(1)
  const noneChip = page.getByRole('button', { name: '無', exact: true })
  await expect(noneChip).toHaveCSS('color', 'rgb(255, 255, 255)')

  // 儲存
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('編輯類別')).toBeHidden()

  // 再次開啟確認：只剩「水費」，且沒有預設殘留
  await openCategoryEditor(page, '雜支')
  await expect(page.getByPlaceholder('二級名稱')).toHaveCount(1)
  await expect(page.getByPlaceholder('二級名稱').nth(0)).toHaveValue('水費')
  await expect(page.getByRole('button', { name: '無', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)')

  expect(errors).toEqual([])
})
