import { test, expect, type Page, type Locator } from '@playwright/test'

// 逐筆交易記帳 E2E：驗證「帳目」tab（Phase 6：落地頁 + 月曆）的 LedgerPage + TransactionSheet
// 新增（含二級預設帶入）／儲存並繼續／編輯／刪除／reload 後持久化 全流程，
// 以及帳目落地頁 + 月曆點日切換的行為。
// 種子沿用 subcategories.spec 的預設類別陣列，額外讓「雜支」帶二級「瓦斯費」且設為預設，
// 以驗證選定一級類別時 resolveDefaultSub 自動帶入的行為。
// 另含案例：在「帳目」FAB 新增交易後，斷言小計「收入合計」「支出合計」兩卡反映該筆，
// 並切到「月結」斷言經 buildDailyRecordsFromTx 重算反映（分潤機制已拔除，見 CLAUDE.md 2.2.0 後續修正）。

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

// 交易列表中的一列：role="button" 且文字含金額符號 "$"，藉此與 Sheet 內的
// 收支切換／類別 chip／操作按鈕（皆無 "$" 文字）區分開來。
// 再疊加 hasText 過濾以鎖定特定類別名稱／金額組合的那一列。
function txRow(page: Page, ...mustContain: string[]): Locator {
  return mustContain.reduce(
    (loc, text) => loc.filter({ hasText: text }),
    page.getByRole('button').filter({ hasText: '$' }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // ⚠️ addInitScript 在每次載入（含 page.reload()）都會執行；為了讓 reload 能真的
    //    測到 IndexedDB 持久化，這裡只在「尚未有值」時種子，避免覆蓋測試中途存入的資料。
    if (!window.localStorage.getItem('mpos_onboarded')) {
      window.localStorage.setItem('mpos_onboarded', '1')
    }
    if (!window.localStorage.getItem('mpos_categories')) {
      // 對應 lib/categories.ts 的 DEFAULT_INCOME / DEFAULT_EXPENSE 真實預設值，
      // 「雜支」額外帶二級「瓦斯費」並設為預設，驗證記帳時自動帶入二級。
      const categories = [
        { id: 'cash',  name: '現金',      icon: 'cash',    color: 'mint',     fee: 0,    enabled: true, type: 'income' },
        { id: 'card',  name: '刷卡',      icon: 'card',    color: 'sky',      fee: 0,    enabled: true, type: 'income' },
        { id: 'uber',  name: 'Uber Eats', icon: 'bike',    color: 'lavender', fee: 0.30, enabled: true, type: 'income' },
        { id: 'panda', name: 'foodpanda', icon: 'package', color: 'pink',     fee: 0.35, enabled: true, type: 'income' },
        { id: 'food', name: '食材採購', icon: 'package', color: 'peach',    enabled: true, type: 'expense' },
        { id: 'wage', name: '員工薪資', icon: 'users',   color: 'lavender', enabled: true, type: 'expense' },
        {
          id: 'misc', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
          subs: [{ id: 'gas', name: '瓦斯費' }], defaultSubId: 'gas',
        },
      ]
      window.localStorage.setItem('mpos_categories', JSON.stringify(categories))
    }
  })
})

test('LedgerPage：FAB 新增（二級預設帶入）／儲存並繼續／編輯／刪除／reload 後持久化', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')
  await navTab(page, '帳目').click()

  // 首次進入本日尚無交易 → 空狀態文字
  await expect(page.getByText('本日尚無記帳，點右下＋新增')).toBeVisible()

  // 1. FAB 開啟新增 Sheet
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()

  // 2. 選「支出」→ 選類別「雜支」→ 斷言二級「瓦斯費」自動選中（defaultSubId 帶入）
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '類別 雜支' }).click()
  const gasChip = page.getByRole('button', { name: '二級 瓦斯費' })
  await expect(gasChip).toHaveCSS('color', 'rgb(255, 255, 255)')

  // 3. 金額填 100 → 儲存 → Sheet 關 → 列表出現含「雜支」「瓦斯費」「100」的列
  await page.getByLabel('金額', { exact: true }).fill('100')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()
  await expect(txRow(page, '雜支', '瓦斯費', '100')).toBeVisible()

  // 4. FAB → 選「收入」→ 選「現金」→ 金額 500 →「儲存並繼續」→ Sheet 仍開且金額欄已清空
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '收入', exact: true }).click()
  await page.getByRole('button', { name: '類別 現金' }).click()
  await page.getByLabel('金額', { exact: true }).fill('500')
  await page.getByRole('button', { name: '儲存並繼續' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await expect(page.getByLabel('金額', { exact: true })).toHaveValue('')

  // 再填 300 → 儲存 → 列表含 500、300 兩列（現金）
  await page.getByLabel('金額', { exact: true }).fill('300')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()
  await expect(txRow(page, '現金', '500')).toBeVisible()
  await expect(txRow(page, '現金', '300')).toBeVisible()

  // 5. 點「雜支 100」列 → 編輯 Sheet 開（金額欄帶入 100）→ 改成 150 → 儲存 → 列表該列顯示 150
  await txRow(page, '雜支', '100').click()
  await expect(page.getByText('編輯交易')).toBeVisible()
  await expect(page.getByLabel('金額', { exact: true })).toHaveValue('100')
  await page.getByLabel('金額', { exact: true }).fill('150')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('編輯交易')).toBeHidden()
  await expect(txRow(page, '雜支', '150')).toBeVisible()
  await expect(txRow(page, '雜支', '100')).toHaveCount(0)

  // 6. 編輯「現金 500」列 → 點「刪除」→ 確認視窗出現 → 「取消」不刪 → 再點「刪除」→ 「確認刪除」→ 該列消失
  await txRow(page, '現金', '500').click()
  await expect(page.getByText('編輯交易')).toBeVisible()
  await page.getByRole('button', { name: '刪除交易' }).click()
  await expect(page.getByText('確定要刪除這筆交易嗎？')).toBeVisible()
  // 取消 → 視窗關閉、交易仍在、編輯 Sheet 仍開
  await page.getByRole('button', { name: '取消刪除' }).click()
  await expect(page.getByText('確定要刪除這筆交易嗎？')).toBeHidden()
  await expect(page.getByText('編輯交易')).toBeVisible()
  // 再刪一次並確認 → Sheet 關閉、該列消失（軟刪除墓碑，查詢已過濾）
  await page.getByRole('button', { name: '刪除交易' }).click()
  await page.getByRole('button', { name: '確認刪除' }).click()
  await expect(page.getByText('編輯交易')).toBeHidden()
  await expect(txRow(page, '現金', '500')).toHaveCount(0)

  // 7. reload 後回「帳目」tab → 剩餘交易仍在（雜支 150、現金 300），Dexie 持久
  await page.reload()
  await navTab(page, '帳目').click()
  await expect(txRow(page, '雜支', '150')).toBeVisible()
  await expect(txRow(page, '現金', '300')).toBeVisible()
  await expect(txRow(page, '現金', '500')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('帳目為落地頁、月曆顯示當日淨額並可點日切換', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')

  // (a) 落地頁即「帳目」：不需點任何 tab，月曆星期列（單字「日」）與空狀態文案即可見
  await expect(page.getByText('日', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('本日尚無記帳，點右下＋新增')).toBeVisible()

  // (b) 用 FAB 新增一筆收入（沿用上一個 test 的新增交易步驟）：選「收入」→「現金」→ 金額 800 → 儲存
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await page.getByRole('button', { name: '收入', exact: true }).click()
  await page.getByRole('button', { name: '類別 現金' }).click()
  await page.getByLabel('金額', { exact: true }).fill('800')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()

  // 該筆金額出現在當日交易列表
  await expect(txRow(page, '現金', '800')).toBeVisible()

  // (c) 點「前一天」切換到沒有交易的日子 → 單日列表切回空狀態文案
  await page.getByRole('button', { name: '前一天' }).click()
  await expect(page.getByText('本日尚無記帳，點右下＋新增')).toBeVisible()
  await expect(txRow(page, '現金', '800')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('帳目新增交易後，小計兩卡／月結總收入皆反映（transactions 重算）', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')

  // 落地頁即「帳目」→ 用 FAB 新增一筆今日收入「現金 1234」（無手續費類別，金額用好辨識的數字）
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await page.getByRole('button', { name: '收入', exact: true }).click()
  await page.getByRole('button', { name: '類別 現金' }).click()
  await page.getByLabel('金額', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()
  await expect(txRow(page, '現金', '1,234')).toBeVisible()

  // 小計兩張卡（收入合計／支出合計）：收入合計卡反映該筆 +$1,234，支出合計卡維持 $0
  await expect(page.getByText('收入合計')).toBeVisible()
  await expect(page.getByText('支出合計')).toBeVisible()
  // 收入合計卡的金額是 <div>，交易列的金額則是 <span>（同樣文字「$1,234」）
  // → 用 tag 限定在 div 才能唯一鎖定小計卡，避免 strict mode violation
  await expect(page.locator('div').filter({ hasText: /^\$1,234$/ })).toBeVisible()

  // 切到「月結」→ 本月「總收入」（經 buildDailyRecordsFromTx 重算）含這筆 $1,234
  await navTab(page, '月結').click()
  const totalIncomeStat = page.locator('div')
    .filter({ hasText: '總收入' })
    .filter({ hasNotText: '總支出' })
    .first()
  await expect(totalIncomeStat).toContainText('$1,234')

  expect(errors).toEqual([])
})

test('TransactionSheet：二級就地新增後自動選取，且記住這個一級下次帶入同一個二級', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')
  await navTab(page, '帳目').click()

  // 1. FAB 開啟新增 Sheet → 選「支出」→ 選「食材採購」（種子資料尚未設任何二級）
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '類別 食材採購' }).click()

  // 二級區塊選一級即恆顯示：「無」chip 與「新增二級」按鈕皆可見
  await expect(page.getByRole('button', { name: '二級 無' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增二級' })).toBeVisible()

  // 2. 點「新增二級」→ 在「新二級名稱」輸入「瓦斯費」→ 按「加入」→ 新二級 chip 出現且已選取
  await page.getByRole('button', { name: '新增二級' }).click()
  await page.getByLabel('新二級名稱').fill('瓦斯費')
  await page.getByRole('button', { name: '確認新增二級' }).click()
  const gasChip = page.getByRole('button', { name: '二級 瓦斯費' })
  await expect(gasChip).toBeVisible()
  await expect(gasChip).toHaveCSS('color', 'rgb(255, 255, 255)')

  // 3. 填金額、一般儲存（關閉 Sheet）
  await page.getByLabel('金額', { exact: true }).fill('220')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()
  await expect(txRow(page, '食材採購', '瓦斯費', '220')).toBeVisible()

  // 4. 再開 FAB、重新選同一個支出一級 → 二級預設已是「瓦斯費」（記住上次用的二級）
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '類別 食材採購' }).click()
  const gasChipAgain = page.getByRole('button', { name: '二級 瓦斯費' })
  await expect(gasChipAgain).toBeVisible()
  await expect(gasChipAgain).toHaveCSS('color', 'rgb(255, 255, 255)')

  expect(errors).toEqual([])
})
