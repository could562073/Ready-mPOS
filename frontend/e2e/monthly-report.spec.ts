import { test, expect, type Page } from '@playwright/test'

// 月結分析對帳報表 E2E（第 3 次優化）：驗證 CostStructureCard 二級細目展開 + Hero「vs 上月」比較，
// 以及 MissingDaysCard 未記帳日卡的「標為公休」／持久化／取消誤標 全流程。
// 種子沿用 transactions.spec.ts 的預設類別陣列，「雜支」不預帶二級——
// 讓本檔第一個測試走「就地新增二級」流程建立「瓦斯費」，驗證 CostStructureCard 的二級細目展開。
// 日期一律用程式算（本月／上月），避免寫死日期造成跨月 flaky。

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // ⚠️ addInitScript 在每次載入（含 page.reload()）都會執行；為了讓 reload 能真的
    //    測到 localStorage 持久化（公休標記），這裡只在「尚未有值」時種子，
    //    避免覆蓋測試中途存入的資料。
    if (!window.localStorage.getItem('mpos_onboarded')) {
      window.localStorage.setItem('mpos_onboarded', '1')
    }
    if (!window.localStorage.getItem('mpos_categories')) {
      // 對應 lib/categories.ts 的 DEFAULT_INCOME / DEFAULT_EXPENSE 真實預設值。
      // 「雜支」刻意不預帶二級／defaultSubId——本檔測試要驗證「就地新增二級」流程。
      const categories = [
        { id: 'cash',  name: '現金',      icon: 'cash',    color: 'mint',     fee: 0,    enabled: true, type: 'income' },
        { id: 'card',  name: '刷卡',      icon: 'card',    color: 'sky',      fee: 0,    enabled: true, type: 'income' },
        { id: 'uber',  name: 'Uber Eats', icon: 'bike',    color: 'lavender', fee: 0,    enabled: true, type: 'income' },
        { id: 'panda', name: 'foodpanda', icon: 'package', color: 'pink',     fee: 0,    enabled: true, type: 'income' },
        { id: 'food', name: '食材採購', icon: 'package', color: 'peach',    enabled: true, type: 'expense' },
        { id: 'wage', name: '員工薪資', icon: 'users',   color: 'lavender', enabled: true, type: 'expense' },
        { id: 'misc', name: '雜支',     icon: 'tag',     color: 'coral',    enabled: true, type: 'expense' },
      ]
      window.localStorage.setItem('mpos_categories', JSON.stringify(categories))
    }
  })
})

// 動態算月份，避免寫死日期造成跨月 flaky
const now = new Date()
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
void thisMonth // 月結頁預設就是當月，不需另外導頁，保留變數供可讀性對照 prevMonth

test('月結：成本結構卡展開二級細目 + Hero 顯示 vs 上月比較', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')

  // 1. 帳目 FAB 新增「上月 1 號」支出（雜支 $100）——上月同期基準必含 1 號，任何日期跑都成立
  await navTab(page, '帳目').click()
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '類別 雜支' }).click()
  await page.getByLabel('金額', { exact: true }).fill('100')
  await page.getByLabel('日期').fill(`${prevMonth}-01`)
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()

  // 2. 新增「今天」支出（雜支 $150，就地新增二級「瓦斯費」）
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '類別 雜支' }).click()
  await page.getByRole('button', { name: '新增二級' }).click()
  await page.getByLabel('新二級名稱').fill('瓦斯費')
  await page.getByRole('button', { name: '確認新增二級' }).click()
  await page.getByLabel('金額', { exact: true }).fill('150')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()

  // 3. 月結（預設落在本月）：Hero 顯示 vs 上月同期；成本結構卡點「雜支」展開見「瓦斯費」細目
  await navTab(page, '月結').click()
  await expect(page.getByText('vs 上月同期')).toBeVisible()
  await page.getByRole('button', { name: '雜支 細目' }).click()
  await expect(page.getByText('瓦斯費')).toBeVisible()
  await expect(page.getByText('$150').first()).toBeVisible()

  expect(errors).toEqual([])
})

test('月結：未記帳日卡 → 標公休消失 → reload 持久 → 管理可取消', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')

  // 上月只記 1 號一筆 → 上月 2 號起全是漏記日（deterministic，不受今天是幾號影響）
  await navTab(page, '帳目').click()
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '類別 雜支' }).click()
  await page.getByLabel('金額', { exact: true }).fill('100')
  await page.getByLabel('日期').fill(`${prevMonth}-01`)
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()

  // 月結切到上月 → 漏記卡出現
  await navTab(page, '月結').click()
  await page.locator('input[type="month"]').fill(prevMonth)
  await expect(page.getByText(/未記帳/)).toBeVisible()

  // 點上月 2 號 chip → 標為公休 → 該 chip 從漏記清單消失、出現已標公休管理列
  const d2 = `${parseInt(prevMonth.slice(5))}/2`
  await page.getByRole('button', { name: new RegExp(`^${d2}（`) }).click()
  await page.getByRole('button', { name: '標為公休' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^${d2}（.）$`) })).toHaveCount(0)
  await expect(page.getByText(/已標公休 1 天/)).toBeVisible()

  // reload 持久（localStorage）
  await page.reload()
  await navTab(page, '月結').click()
  await page.locator('input[type="month"]').fill(prevMonth)
  await expect(page.getByText(/已標公休 1 天/)).toBeVisible()

  // 管理 → 取消誤標 → chip 回到漏記清單
  await page.getByText(/已標公休 1 天（管理）/).click()
  await page.getByRole('button', { name: `取消 ${prevMonth}-02 公休` }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^${d2}（`) }).first()).toBeVisible()

  expect(errors).toEqual([])
})
