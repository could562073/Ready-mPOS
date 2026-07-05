# Phase 6：帳目頁月曆 + 落地頁/導覽調整

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** 在「帳目」頁的單日列表上方加一個月曆（每格顯示當日淨額、可點日切換、可切月），並把 App 落地頁與導覽首項改為「帳目」，貼近參考圖的「月曆＋逐筆列表」樣式。

**Architecture:** 月曆的日期排列與每日淨額計算抽成純函式（`lib/calendar.ts`，Vitest 覆蓋）；`MonthCalendar` 元件用 `useMonthTransactions` 取當月交易算淨額；`LedgerPage` 上方掛月曆、下方沿用既有 `useDayTransactions` 單日列表 + FAB。導覽/落地頁調整在 `App.tsx`。UI 以 Playwright E2E 驗收。

**Tech Stack:** React + inline styles + design tokens、Dexie（`useMonthTransactions`）、Vitest、Playwright。

## Global Constraints

- 只碰 UI/展示層與純函式；**不動** `syncAll` / `sheets.ts` / `Dashboard` / `月結`（Dashboard、月結仍讀 `DailyRecord`，Phase 7 才改）。
- **絕不 checkout/merge/push `main`**；只在 `feature/line-item-transactions-redesign` commit，每 task 完成 `git push origin feature/line-item-transactions-redesign`。
- 當日淨額定義：`Σ收入金額 − Σ支出金額`（金額皆正、方向由 `type` 決定）；**不扣手續費**（手續費重算屬 Phase 7，避免與尚未改的 Dashboard 不一致）。
- 週以**週日**為每週第一天（對齊既有 `getDay()` 慣例，0=日）。
- 業務邏輯一律**繁體中文**註解；commit 格式 `feat/fix/docs/refactor: ...`。
- 驗證門檻：`npx tsc --noEmit` exit 0、`npm test` 全綠、`npm run build` 成功；**UI 額外**：`npx playwright test` 綠。

## File Structure

- **Create** `frontend/src/lib/calendar.ts` — `buildMonthMatrix` / `monthDayNets` / `shiftMonth` 純函式。
- **Create** `frontend/src/lib/calendar.test.ts` — 上述純函式 Vitest。
- **Create** `frontend/src/components/MonthCalendar.tsx` — 月曆元件（週列、每日淨額、今天/選定高亮、切月）。
- **Modify** `frontend/src/pages/LedgerPage.tsx` — 上方掛 `MonthCalendar`，月份由 `date` 導出，接 `useMonthTransactions`。
- **Modify** `frontend/src/App.tsx` — 導覽首項改「帳目」、落地頁預設 `daily`。
- **Modify** `frontend/e2e/transactions.spec.ts`（或新增 `calendar.spec.ts`）— 月曆 E2E。
- **Modify** `CLAUDE.md` / `AGENTS.md` / `README.md` — 文檔同步。

**Interfaces（跨 task 共用）：**
- `import type { Transaction } from '../types'`。
- 既有：`useMonthTransactions(month: 'YYYY-MM')`、`useDayTransactions(date)`（`hooks/useTransactions.ts`）；`T` / `colorMap`（`lib/tokens`）；`fmt`（`lib/fmt`）；`Icon`（`components/Icon`，含 `calendar`/`chevron-l`/`chevron-r`/`home`/`chart`/`settings`/`plus`）。

---

### Task 1: 月曆純函式（`lib/calendar.ts`）

**Files:**
- Create: `frontend/src/lib/calendar.ts`
- Test: `frontend/src/lib/calendar.test.ts`

**Interfaces:**
- Produces:
  - `buildMonthMatrix(month: string): (string | null)[][]`（週列，每列 7 格；格為 `'YYYY-MM-DD'` 或 `null` 補白）
  - `monthDayNets(txs: Transaction[]): Record<string, number>`（date → 當日淨額）
  - `shiftMonth(month: string, delta: number): string`

- [ ] **Step 1: 先寫失敗測試**

```ts
import { describe, it, expect } from 'vitest'
import { buildMonthMatrix, monthDayNets, shiftMonth } from './calendar'
import type { Transaction } from '../types'

describe('buildMonthMatrix', () => {
  const m = buildMonthMatrix('2026-07')
  it('每列 7 格', () => { for (const row of m) expect(row).toHaveLength(7) })
  it('非空格恰為當月 1..31 日、依序', () => {
    const flat = m.flat().filter((x): x is string => x !== null)
    expect(flat[0]).toBe('2026-07-01')
    expect(flat[flat.length - 1]).toBe('2026-07-31')
    expect(flat).toHaveLength(31)
  })
  it('補白只在頭尾（中間無 null）', () => {
    const flat = m.flat()
    const firstIdx = flat.findIndex(x => x !== null)
    const lastIdx = flat.length - 1 - [...flat].reverse().findIndex(x => x !== null)
    for (let i = firstIdx; i <= lastIdx; i++) expect(flat[i]).not.toBeNull()
  })
})

describe('monthDayNets', () => {
  const tx = (over: Partial<Transaction>): Transaction => ({
    localId: 1, id: 'x', date: '2026-07-01', type: 'income', categoryId: 'c',
    subId: null, amount: 100, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x', ...over,
  })
  it('同日收入減支出得淨額；跨日分別加總', () => {
    const nets = monthDayNets([
      tx({ date: '2026-07-01', type: 'income', amount: 100 }),
      tx({ date: '2026-07-01', type: 'expense', amount: 30 }),
      tx({ date: '2026-07-02', type: 'expense', amount: 50 }),
    ])
    expect(nets['2026-07-01']).toBe(70)
    expect(nets['2026-07-02']).toBe(-50)
  })
})

describe('shiftMonth', () => {
  it('跨年進位/退位', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-07', 0)).toBe('2026-07')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`
Expected: FAIL（`calendar` 未建立）

- [ ] **Step 3: 實作**

```ts
// frontend/src/lib/calendar.ts
import type { Transaction } from '../types'

// 本地時區日期字串（比照 App/LedgerPage，避免 UTC 位移跨日）
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 'YYYY-MM' → 週列陣列，每列 7 格；格為當月某日 'YYYY-MM-DD' 或 null（前後補白）。
// 週日為每週第一天（getDay() 0=日）。
export function buildMonthMatrix(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const startPad = first.getDay()               // 該月 1 號是星期幾（0=日）
  const daysInMonth = new Date(y, m, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)          // 月初補白
  for (let d = 1; d <= daysInMonth; d++) cells.push(toLocalDateString(new Date(y, m - 1, d)))
  while (cells.length % 7 !== 0) cells.push(null)              // 月末補白到整週

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// 每日淨額：Σ收入 − Σ支出（金額皆正、方向由 type 決定）。不扣手續費（Phase 7 再算）。
export function monthDayNets(txs: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const t of txs) {
    const delta = t.type === 'income' ? t.amount : -t.amount
    map[t.date] = (map[t.date] ?? 0) + delta
  }
  return map
}

// 月份字串位移 delta 個月，跨年自動進退位
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: commit**

```bash
git add frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts
git commit -m "feat: 月曆純函式 buildMonthMatrix/monthDayNets/shiftMonth (Phase 6 Task 1)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 2: `MonthCalendar` 元件 + 掛進 LedgerPage

**Files:**
- Create: `frontend/src/components/MonthCalendar.tsx`
- Modify: `frontend/src/pages/LedgerPage.tsx`

**Interfaces:**
- Consumes: `buildMonthMatrix` / `monthDayNets` / `shiftMonth`（Task 1）、`useMonthTransactions`。
- `MonthCalendar` props：`{ month: string; selectedDate: string; onSelectDate: (date: string) => void; onShiftMonth: (delta: number) => void }`。

- [ ] **Step 1: 寫 `MonthCalendar.tsx`**

```tsx
import { T } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from './Icon'
import { buildMonthMatrix, monthDayNets, shiftMonth } from '../lib/calendar'
import { useMonthTransactions } from '../hooks/useTransactions'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function toLocalDateString(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface MonthCalendarProps {
  month: string
  selectedDate: string
  onSelectDate: (date: string) => void
  onShiftMonth: (delta: number) => void
}

// 月曆：每格顯示日期與當日淨額（+綠/−紅），今天描邊、選定填色，點日切換
export function MonthCalendar({ month, selectedDate, onSelectDate, onShiftMonth }: MonthCalendarProps) {
  const { transactions } = useMonthTransactions(month)
  const nets = monthDayNets(transactions)
  const weeks = buildMonthMatrix(month)
  const today = toLocalDateString(new Date())
  const [y, mo] = month.split('-').map(Number)

  return (
    <div style={{ background: T.card, borderRadius: T.r.xl, boxShadow: T.shadow.card, padding: '12px 10px' }}>
      {/* 月份切換列 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 10px' }}>
        <button aria-label="上個月" onClick={() => onShiftMonth(-1)} style={navBtn}>
          <Icon name="chevron-l" size={16} stroke={2.4} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{y} 年 {mo} 月</div>
        <button aria-label="下個月" onClick={() => onShiftMonth(1)} style={navBtn}>
          <Icon name="chevron-r" size={16} stroke={2.4} />
        </button>
      </div>
      {/* 星期列 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: T.muted, padding: '2px 0' }}>{w}</div>
        ))}
      </div>
      {/* 日期格 */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {week.map((cell, ci) => {
            if (!cell) return <div key={ci} />
            const day = Number(cell.split('-')[2])
            const net = nets[cell]
            const isToday = cell === today
            const isSelected = cell === selectedDate
            return (
              <button
                key={ci}
                onClick={() => onSelectDate(cell)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  border: isToday && !isSelected ? `1.5px solid ${T.lavenderInk}` : '1.5px solid transparent',
                  background: isSelected ? T.ink : 'transparent',
                  borderRadius: 10, padding: '5px 0 3px', cursor: 'pointer', minHeight: 40,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#fff' : T.ink }}>{day}</span>
                {net !== undefined && net !== 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: T.font.num,
                    color: isSelected ? '#fff' : (net > 0 ? T.mintInk : T.coralInk),
                  }}>
                    {net > 0 ? '+' : '-'}{fmt(Math.abs(net))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const navBtn = {
  border: 'none', background: T.bg, borderRadius: 9, width: 30, height: 30,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.ink2,
} as const
```
> `shiftMonth` 由 `MonthCalendar` import 但實際切月動作交給父層（`onShiftMonth`），避免元件自持 month 狀態與父層不同步；若 lint 報未使用可移除該 import。

- [ ] **Step 2: LedgerPage 掛入月曆**

在 `LedgerPage` 內：由 `date` 導出 `month = date.slice(0, 7)`；在最上方（日期標頭之前）插入：
```tsx
<MonthCalendar
  month={date.slice(0, 7)}
  selectedDate={date}
  onSelectDate={onDateChange}
  onShiftMonth={delta => onDateChange(`${shiftMonth(date.slice(0, 7), delta)}-01`)}
/>
```
import：`import { MonthCalendar } from '../components/MonthCalendar'` 與 `import { shiftMonth } from '../lib/calendar'`。切月時把選定日設為新月份 1 號（`-01`）。既有的日期前後切換、單日列表、小計、FAB、TransactionSheet **保留不動**。

- [ ] **Step 3: 驗證編譯/測試/建置**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: 皆綠。

- [ ] **Step 4: commit**

```bash
git add frontend/src/components/MonthCalendar.tsx frontend/src/pages/LedgerPage.tsx
git commit -m "feat: MonthCalendar 月曆元件（每日淨額/切月/點日）掛進帳目頁 (Phase 6 Task 2)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 3: 落地頁/導覽改「帳目」+ Playwright E2E

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/e2e/transactions.spec.ts`（新增月曆相關案例）

**Interfaces:**
- Consumes: 現有 `LedgerPage`（Task 2 已含月曆）。

- [ ] **Step 1: App 導覽首項與落地頁**

- `NAV_ITEMS` 重排為：`帳目`(id `daily`, icon `calendar`) → `首頁`(dashboard, home) → `月結`(monthly, chart) → `設定`(settings, settings)。把原 `daily` 的 label 由「記帳」改「帳目」、icon 由 `pencil` 改 `calendar`。
- 落地頁預設：`const [tab, setTab] = useState<Tab>('daily')`（原為 `'dashboard'`）。
- 其餘（`handleSelectDate` 導到 `daily`、Dashboard `onNavigate`）保持不變——月結點日仍會進「帳目」並定位到該日（月曆會落在該月）。

- [ ] **Step 2: 先寫/擴充 E2E（`frontend/e2e/transactions.spec.ts`）**

新增案例（沿用既有 test 的 app 啟動與新增交易輔助流程；純本機 IndexedDB、無 OAuth）：
```ts
test('帳目為落地頁、月曆顯示當日淨額並可點日切換', async ({ page }) => {
  await page.goto('/')
  // 落地頁即帳目：月曆的星期列可見
  await expect(page.getByText('日', { exact: true }).first()).toBeVisible()

  // 用 FAB 新增一筆收入（沿用既有輔助步驟：開 sheet → 選類別 → 金額 → 儲存）
  // …（比照本檔既有新增交易的操作）…

  // 該筆金額出現在當日列表小計；月曆該日格顯示淨額
  // 點另一天 → 單日列表切換為空狀態文案
  await expect(page.getByText('本日尚無記帳，點右下＋新增')).toBeVisible()
})
```
> 實作者：請對照 `transactions.spec.ts` 既有的新增交易步驟，沿用相同 selector 手法補完上面的「…」；斷言至少涵蓋 (a) 落地頁為帳目（月曆可見）、(b) 新增交易後可在帳目看到、(c) 點不同日切換單日列表。

- [ ] **Step 3: 跑 E2E + 三門檻**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx playwright test`
Expected: 型別綠、build 綠、Playwright 全綠。
> 若 chromium 因系統函式庫起不來，依 LOOP_STATE Task 0 註記記 Blocker「請用戶 `sudo npx playwright install-deps chromium`」，E2E 該項暫緩、其餘門檻須綠。

- [ ] **Step 4: commit**

```bash
git add frontend/src/App.tsx frontend/e2e/transactions.spec.ts
git commit -m "feat: 落地頁與導覽首項改為帳目（月曆）+ 月曆 E2E (Phase 6 Task 3)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 4: 文檔同步

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md`, `README.md`

- [ ] **Step 1: 更新文檔（只描述已落地）**

- CLAUDE.md/AGENTS.md：`PROJECT STRUCTURE` 加 `lib/calendar.ts`、`components/MonthCalendar.tsx`；`KEY IMPLEMENTATION NOTES` 補「Phase 6：帳目頁月曆（`lib/calendar.ts` 純函式 + `MonthCalendar`，每日淨額 = 收入−支出、不扣手續費）、落地頁與導覽首項改為『帳目』」；`LedgerPage` 描述改為「月曆 + 單日列表」；Development Status 標 Phase 1–6 完成、Dashboard/月結（含手續費淨額）待 Phase 7。
- README.md：Features/開發歷程補一行 Phase 6。

- [ ] **Step 2: commit**

```bash
git add CLAUDE.md AGENTS.md README.md
git commit -m "docs: Phase 6 帳目頁月曆 + 落地頁調整落地 — 同步文檔 (Phase 6 Task 4)"
git push origin feature/line-item-transactions-redesign
```

---

## 完成準則（Definition of Done）
- [ ] Task 1 純函式 Vitest 綠；`tsc`/`build` 綠；`playwright test` 綠（或 chromium libs Blocker 記錄）。
- [ ] 帳目為落地頁、月曆顯示每日淨額、點日切換單日列表、可切月；既有記帳/編輯/FAB 不回歸。
- [ ] Dashboard/月結未被更動（仍讀 `DailyRecord`）。
- [ ] 三份使用者文檔同步更新。
- [ ] 全期 review（subagent-driven）Spec ✅ + Quality Approved，Critical/Important 清零或轉後期記錄。

## 後續（Phase 7）
- Dashboard / 月結改用 `Transaction` 重算（`calcFees` 吃 `Transaction[]`、手續費後淨額），移除對 `DailyRecord` 的讀取依賴；屆時月曆淨額是否改為「扣手續費後」一併評估一致性。
