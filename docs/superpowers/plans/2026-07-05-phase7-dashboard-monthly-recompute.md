# Phase 7：Dashboard / 月結改用 Transaction 重算（第 2 次優化最後一期）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** 讓 `DashboardPage` 與 `MonthlyReportPage` 從逐筆 `transactions` 重算所有數字，移除對舊 `DailyRecord` 的讀取依賴——完成後舊彙總模型在 UI 完全退場。

**Architecture:** 用一個純函式 `buildDailyRecordsFromTx(txs)` 把逐筆交易依日期 group 成**合成的 `DailyRecord[]`**（`incomes`/`expenses` 為 `categoryId→金額` 加總）。兩頁只把資料源從 `useDailyRecord`/`useMonthlyRecords` 換成 `useDayTransactions`/`useMonthTransactions` + 這個 adapter，既有的 `dayIncome`/`dayExpense`/`calcFees`/`TrendChart`/`CategoryBars`/明細表全部零改動重用。最低風險、最大重用。

**Tech Stack:** React、Dexie（`useTransactions` hooks）、Vitest、Playwright。

## Global Constraints

- 只碰 `DashboardPage` / `MonthlyReportPage` 的**資料源**與新純函式；**不改** UI 版面、`sheets.ts`、`useSyncService`、`LedgerPage`、`MonthCalendar` 的既有邏輯。
- **絕不 checkout/merge/push `main`**；只在 `feature/line-item-transactions-redesign` commit，每 task 完成 `git push origin feature/line-item-transactions-redesign`。
- 合成 `DailyRecord` 只填 UI 會讀的欄位（`date`/`incomes`/`expenses`/`syncStatus`/`createdAt`/`updatedAt`）；`id` 省略（明細表 key 改用 `r.date`）。
- 沿用「只計已知類別 id」的加總保護（未知一級以原始名稱進 map，但被 `knownIncomeIds`/`knownExpenseIds` 過濾，不虛增）。
- `calcFees(record, categories)` 現況只讀 `record.incomes[c.id]`（`categories.ts:70`），合成 record 天然相容，不需改。
- 業務邏輯繁體中文註解；commit 格式 `feat/fix/docs/refactor: ...`。
- 驗證門檻：`npx tsc --noEmit` exit 0、`npm test` 全綠、`npm run build` 成功；**UI 額外**：`npx playwright test` 綠。

## 範圍與已知取捨

- **月曆每日淨額維持「收入−支出」（不扣手續費）**，Dashboard Hero 維持「扣手續費後」——兩者定義不同是刻意的（月曆＝當日毛淨額、Hero＝實收淨額）。本期**不改** `monthDayNets`，僅於文檔說明差異。（來自 Phase 6 review Minor；評估後決定不動月曆 UX。）
- `hooks/useDailyRecord.ts`/`useMonthlyRecords.ts` 於本期後在 Dashboard/月結不再被使用；**保留檔案**（`DailyEntryPage` 舊頁仍引用 `useDailyRecord`，且不刪既有檔）。

## File Structure

- **Create** `frontend/src/lib/aggregate.ts` — `buildDailyRecordsFromTx` 純函式。
- **Create** `frontend/src/lib/aggregate.test.ts` — Vitest。
- **Modify** `frontend/src/pages/DashboardPage.tsx` — 資料源換交易 + adapter。
- **Modify** `frontend/src/pages/MonthlyReportPage.tsx` — 資料源換交易 + adapter，明細 key 改 `r.date`。
- **Modify** `frontend/e2e/transactions.spec.ts` — 加 Dashboard/月結反映交易的斷言。
- **Modify** `CLAUDE.md` / `AGENTS.md` / `README.md` — 文檔同步（第 2 次優化收官）。

**Interfaces（跨 task 共用）：**
- `import type { Transaction, DailyRecord } from '../types'`。
- 既有：`useDayTransactions(date)`、`useMonthTransactions(month)`（`hooks/useTransactions.ts`，回傳 `{ transactions, loading }`，`transactions` 載入中為 `[]`）。

---

### Task 1: `buildDailyRecordsFromTx` 純函式

**Files:**
- Create: `frontend/src/lib/aggregate.ts`
- Test: `frontend/src/lib/aggregate.test.ts`

**Interfaces:**
- Produces: `buildDailyRecordsFromTx(txs: Transaction[]): DailyRecord[]`（依日期升冪；每個 record 的 `incomes`/`expenses` 為 `categoryId→金額加總`）。

- [ ] **Step 1: 先寫失敗測試**

```ts
import { describe, it, expect } from 'vitest'
import { buildDailyRecordsFromTx } from './aggregate'
import type { Transaction } from '../types'

const tx = (over: Partial<Transaction>): Transaction => ({
  localId: 1, id: 'x', date: '2026-07-01', type: 'income', categoryId: 'cash',
  subId: null, amount: 100, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x', ...over,
})

describe('buildDailyRecordsFromTx', () => {
  it('依日期 group、收入/支出分流、同類別加總', () => {
    const recs = buildDailyRecordsFromTx([
      tx({ date: '2026-07-01', type: 'income', categoryId: 'cash', amount: 100 }),
      tx({ date: '2026-07-01', type: 'income', categoryId: 'cash', amount: 50 }),
      tx({ date: '2026-07-01', type: 'expense', categoryId: 'food', amount: 30 }),
    ])
    expect(recs).toHaveLength(1)
    expect(recs[0].date).toBe('2026-07-01')
    expect(recs[0].incomes).toEqual({ cash: 150 })
    expect(recs[0].expenses).toEqual({ food: 30 })
  })
  it('多日期依日期升冪排序', () => {
    const recs = buildDailyRecordsFromTx([
      tx({ date: '2026-07-03' }), tx({ date: '2026-07-01' }), tx({ date: '2026-07-02' }),
    ])
    expect(recs.map(r => r.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })
  it('未知一級（categoryId 為原始名稱）照樣進 map（由 UI 以已知 id 過濾）', () => {
    const recs = buildDailyRecordsFromTx([tx({ categoryId: '外星收入', amount: 9 })])
    expect(recs[0].incomes).toEqual({ 外星收入: 9 })
  })
  it('空陣列回空', () => {
    expect(buildDailyRecordsFromTx([])).toEqual([])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/aggregate.test.ts`
Expected: FAIL（`aggregate` 未建立）

- [ ] **Step 3: 實作**

```ts
// frontend/src/lib/aggregate.ts
import type { Transaction, DailyRecord } from '../types'

// 把逐筆交易依日期 group 成合成的 DailyRecord[]（incomes/expenses 為 categoryId→金額加總），
// 讓既有讀 DailyRecord 的 Dashboard/月結/圖表邏輯（dayIncome/dayExpense/calcFees）零改動重用。
// 未知一級（categoryId 為雲端保留的原始名稱）照樣累加；UI 以「已知類別 id」過濾，不污染加總。
export function buildDailyRecordsFromTx(txs: Transaction[]): DailyRecord[] {
  const byDate = new Map<string, DailyRecord>()
  for (const t of txs) {
    let rec = byDate.get(t.date)
    if (!rec) {
      rec = { date: t.date, incomes: {}, expenses: {}, syncStatus: 'SYNCED', createdAt: '', updatedAt: '' }
      byDate.set(t.date, rec)
    }
    const map = t.type === 'income' ? rec.incomes : rec.expenses
    map[t.categoryId] = (map[t.categoryId] ?? 0) + t.amount
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/aggregate.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add frontend/src/lib/aggregate.ts frontend/src/lib/aggregate.test.ts
git commit -m "feat: buildDailyRecordsFromTx 交易→合成 DailyRecord 純函式 (Phase 7 Task 1)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 2: DashboardPage 改用交易重算

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `buildDailyRecordsFromTx`（Task 1）、`useDayTransactions`、`useMonthTransactions`。

- [ ] **Step 1: 換資料源**

把三個資料 hook 換掉，其餘**所有**衍生計算（`dayIncome`/`dayExpense`/`calcFees`/`todayNetAfterFees`/`mtd*`/`last7`/`prev7`/成本率/收支分解）保持不動：

```tsx
// 舊：
// import { useDailyRecord } from '../hooks/useDailyRecord'
// import { useMonthlyRecords } from '../hooks/useMonthlyRecords'
// const { record: todayRecord } = useDailyRecord(todayStr)
// const { records: monthRecords } = useMonthlyRecords(monthStr)
// const { records: prevMonthRecords } = useMonthlyRecords(prevMonthStr)

// 新：
import { useDayTransactions, useMonthTransactions } from '../hooks/useTransactions'
import { buildDailyRecordsFromTx } from '../lib/aggregate'
// …
const { transactions: todayTxs }     = useDayTransactions(todayStr)
const { transactions: monthTxs }     = useMonthTransactions(monthStr)
const { transactions: prevMonthTxs } = useMonthTransactions(prevMonthStr)

// 合成 DailyRecord 供既有邏輯重用（今日取單筆合成 record）
const todayRecord     = buildDailyRecordsFromTx(todayTxs)[0] ?? null
const monthRecords    = buildDailyRecordsFromTx(monthTxs)
const prevMonthRecords = buildDailyRecordsFromTx(prevMonthTxs)
```
（移除舊 import；`todayRecord` 型別為 `DailyRecord | null`，與既有 `todayRecord?.incomes[...]` 用法相容。）

- [ ] **Step 2: 驗證編譯/測試/建置**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: 皆綠。

- [ ] **Step 3: commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: Dashboard 改用 transactions 重算（buildDailyRecordsFromTx adapter）(Phase 7 Task 2)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 3: MonthlyReportPage 改用交易重算

**Files:**
- Modify: `frontend/src/pages/MonthlyReportPage.tsx`

**Interfaces:**
- Consumes: `buildDailyRecordsFromTx`（Task 1）、`useMonthTransactions`。

- [ ] **Step 1: 換資料源 + 明細 key**

```tsx
// 舊：
// import { useMonthlyRecords } from '../hooks/useMonthlyRecords'
// const { records, loading } = useMonthlyRecords(month)

// 新：
import { useMonthTransactions } from '../hooks/useTransactions'
import { buildDailyRecordsFromTx } from '../lib/aggregate'
// …
const { transactions, loading } = useMonthTransactions(month)
const records = buildDailyRecordsFromTx(transactions)
```
`TrendChart`/`CategoryBars`/Hero/合計/明細表**全部不動**，唯一必要調整：每日明細表的 `key={r.id}` 改為 `key={r.date}`（合成 record 無 `id`）。

- [ ] **Step 2: 驗證編譯/測試/建置**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: 皆綠。

- [ ] **Step 3: commit**

```bash
git add frontend/src/pages/MonthlyReportPage.tsx
git commit -m "feat: 月結改用 transactions 重算（buildDailyRecordsFromTx adapter）(Phase 7 Task 3)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 4: E2E + 文檔（第 2 次優化收官）

**Files:**
- Modify: `frontend/e2e/transactions.spec.ts`
- Modify: `CLAUDE.md`, `AGENTS.md`, `README.md`

- [ ] **Step 1: E2E — Dashboard/月結反映交易**

沿用既有 test 的啟動與新增交易輔助手法（純本機 IndexedDB、無 OAuth），新增斷言：用 FAB 在「帳目」新增一筆今日收入後，切到「首頁」確認今日淨額/收入反映該筆（金額文字可見），切到「月結」確認本月總收入含該筆。用穩定 selector（getByText/getByRole/nav aria/label）。

- [ ] **Step 2: 跑 E2E + 三門檻**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx playwright test`
Expected: 皆綠。（若 chromium 系統函式庫缺 → 記 Blocker「`sudo npx playwright install-deps chromium`」，E2E 該項暫緩、tsc/build 須綠、測試碼仍寫好 commit。）

- [ ] **Step 3: 文檔（第 2 次優化全部完成）**

- CLAUDE.md/AGENTS.md：`PROJECT STRUCTURE` 加 `lib/aggregate.ts`；把 DashboardPage/MonthlyReportPage 的「仍讀 DailyRecord，待 Phase 7」註記改為「讀 transactions（`buildDailyRecordsFromTx` 合成）」；`KEY IMPLEMENTATION NOTES` 補「Phase 7：Dashboard/月結改用交易重算」；Development Status 的「第 2 次優化」行改為 **Phase 1–7 全部完成**（逐筆交易改造完成），並保留 cutover 硬停/`AUTO_SHEET_NAME` 測試名的併 main 提醒。文件版本 1.6→1.7、日期。
- README.md：Features 表狀態改為「✅ 完成（Phase 1–7）」、開發歷程補 Phase 7；標明月曆淨額（毛）與 Hero（扣費後）定義差異。

- [ ] **Step 4: commit**

```bash
git add frontend/e2e/transactions.spec.ts CLAUDE.md AGENTS.md README.md
git commit -m "feat+docs: Dashboard/月結交易重算 E2E + 第 2 次優化收官文檔 (Phase 7 Task 4)"
git push origin feature/line-item-transactions-redesign
```

---

## 完成準則（Definition of Done）
- [ ] Task 1 Vitest 綠；`tsc`/`build`/`playwright` 綠。
- [ ] Dashboard 今日淨額（扣費後）/本月淨額/7 天圖/成本率/收支分解、月結 Hero/趨勢圖/分類/明細**皆從 `transactions` 重算**，數字與逐筆一致。
- [ ] Dashboard/月結不再 import `useDailyRecord`/`useMonthlyRecords`（改讀 transactions）。
- [ ] 三份使用者文檔同步，標第 2 次優化全部完成。
- [ ] 全期 review（subagent-driven）Spec ✅ + Quality Approved，Critical/Important 清零或記錄。

## 收官後（非本期，供用戶決策）
- 🔴 **cutover（併 main）硬停仍在**：需用戶批准把 `AUTO_SHEET_NAME` 改回「Ready-mPOS 記帳」、對真實資料執行遷移（有 Drive 備份保護、決定性 id 去重）。這步 loop 不自動做。
- 可選清理：`DailyEntryPage`（舊彙總頁）與 `useDailyRecord`/`useMonthlyRecords` 若確認全無引用可移除（另開 refactor task，非本期）。
