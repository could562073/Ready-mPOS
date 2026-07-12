# 月結分析對帳報表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月結頁原地強化——未記帳日卡（固定週公休+臨時標記）、成本結構卡（二級展開/佔收入比/上月比較）、Hero 上月淨額比較、移除匯出 stub。

**Architecture:** 全部分析計算做成純函式（`lib/monthReport.ts`，Vitest 覆蓋），公休設定為 localStorage 薄封裝（`lib/closedDays.ts`）；UI 為兩個新元件（`MissingDaysCard`、`CostStructureCard`）插入既有 `MonthlyReportPage` 骨架。不動同步層、不動 DB schema、不動 Dexie 版本。

**Tech Stack:** React + TypeScript + Vite、Dexie（`useLiveQuery` 經既有 `useMonthTransactions`）、Vitest（node 環境，localStorage 用測試內 stub）、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-07-09-monthly-report-analytics-design.md`

## Global Constraints

- 分支：`feature/monthly-report-analytics`（已存在，從 main 切出）；每個 Task 完成即 commit + `git push origin feature/monthly-report-analytics`
- 關鍵業務邏輯一律加**繁體中文註解**
- 不在 repo 根目錄新增檔案；優先擴充既有檔案，禁止 `enhanced_`/`v2_` 命名
- 每個 Task 的驗證門檻：`cd frontend && npx tsc -b && npm test` 綠；改到 UI 的 Task 再加 `npm run build` 綠
- E2E 跑法：`cd frontend && E2E_PORT=5199 npx playwright test`（避免撞到使用者在 5173 的 dev server）
- 版本號只在最後一個 Task bump 成 `2.1.0`（單一事實來源 = `frontend/package.json`）
- 月曆的「當日淨額 = 毛額」與 Hero「扣手續費後淨額」的既有差異**維持不變**（spec 已定案）
- 佔收入比分母 = 本月總收入**毛額**（不扣手續費）；上月為 0 時只顯示金額差、不顯示 %

---

### Task 1: 公休日儲存層 `lib/closedDays.ts`

**Files:**
- Create: `frontend/src/lib/closedDays.ts`
- Test: `frontend/src/lib/closedDays.test.ts`

**Interfaces:**
- Consumes: 無（只依賴 localStorage）
- Produces:
  - `getWeeklyClosed(): number[]`（0=週日 … 6=週六，去重排序）
  - `setWeeklyClosed(days: number[]): void`
  - `getClosedDates(): string[]`（`'YYYY-MM-DD'` 臨時公休，排序）
  - `markClosed(date: string): void` / `unmarkClosed(date: string): void`

- [ ] **Step 1: Write the failing test**

Vitest 環境是 `node`（無 localStorage），測試內裝一個最小 stub：

```ts
// frontend/src/lib/closedDays.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getWeeklyClosed, setWeeklyClosed, getClosedDates, markClosed, unmarkClosed } from './closedDays'

// node 環境無 localStorage → 用 Map 做最小 stub（只實作本模組用到的 getItem/setItem）
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
  } as unknown as Storage
})

describe('每週公休（weekly）', () => {
  it('預設為空陣列', () => {
    expect(getWeeklyClosed()).toEqual([])
  })
  it('set 後可讀回，且去重 + 排序', () => {
    setWeeklyClosed([2, 0, 2])
    expect(getWeeklyClosed()).toEqual([0, 2])
  })
  it('localStorage 內容毀損時回退為空陣列（不拋錯）', () => {
    store.set('mpos_weekly_closed', '{oops')
    expect(getWeeklyClosed()).toEqual([])
  })
})

describe('臨時公休（dates）', () => {
  it('mark 後可讀回且排序；重複 mark 不重複', () => {
    markClosed('2026-07-18')
    markClosed('2026-07-02')
    markClosed('2026-07-18')
    expect(getClosedDates()).toEqual(['2026-07-02', '2026-07-18'])
  })
  it('unmark 移除指定日期，其餘保留', () => {
    markClosed('2026-07-02')
    markClosed('2026-07-18')
    unmarkClosed('2026-07-02')
    expect(getClosedDates()).toEqual(['2026-07-18'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/closedDays.test.ts`
Expected: FAIL（`Cannot find module './closedDays'`）

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/closedDays.ts
// 公休日兩層規則（月結「未記帳日」檢查用）：
//   weekly = 固定每週公休（0=週日…6=週六，設定頁勾選，永久排除）
//   dates  = 臨時逐日標記（連假/臨時事件，月結漏記卡上點「標為公休」）
// 儲存於 localStorage、本機不跨裝置同步——月結核對通常在單一主力機進行（見設計 spec）。
const LS_WEEKLY = 'mpos_weekly_closed'
const LS_DATES  = 'mpos_closed_days'

// 讀取 + JSON 解析容錯：內容毀損一律回退 fallback，不讓公休設定壞掉拖垮月結頁
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function getWeeklyClosed(): number[] {
  return readJson<number[]>(LS_WEEKLY, [])
}

export function setWeeklyClosed(days: number[]): void {
  localStorage.setItem(LS_WEEKLY, JSON.stringify([...new Set(days)].sort((a, b) => a - b)))
}

export function getClosedDates(): string[] {
  return readJson<string[]>(LS_DATES, [])
}

export function markClosed(date: string): void {
  const next = new Set(getClosedDates())
  next.add(date)
  localStorage.setItem(LS_DATES, JSON.stringify([...next].sort()))
}

export function unmarkClosed(date: string): void {
  localStorage.setItem(LS_DATES, JSON.stringify(getClosedDates().filter(d => d !== date)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/closedDays.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: 全套驗證 + Commit**

Run: `cd frontend && npx tsc -b && npm test`（全綠）

```bash
git add frontend/src/lib/closedDays.ts frontend/src/lib/closedDays.test.ts
git commit -m "feat: 公休日儲存層（每週公休 + 臨時逐日標記，localStorage）"
git push origin feature/monthly-report-analytics
```

---

### Task 2: 月結分析純函式 `lib/monthReport.ts`

**Files:**
- Create: `frontend/src/lib/monthReport.ts`
- Test: `frontend/src/lib/monthReport.test.ts`

**Interfaces:**
- Consumes: `shiftMonth(month: string, delta: number): string`（`lib/calendar.ts` 既有）、`Transaction`/`Category` 型別（`types/index.ts`）
- Produces（後續 Task 4/5/6 依賴，簽名如下）:
  - `daysInMonth(month: string): number`
  - `missingDays(month: string, txDates: Set<string>, weeklyClosed: number[], closedDates: Set<string>, today: string): string[]`
  - `comparisonRange(month: string, today: string): { prevMonth: string; mode: 'same-period' | 'full'; endDay: number }`
  - `limitToDay(txs: Transaction[], month: string, endDay: number): Transaction[]`
  - `delta(cur: number, prev: number): { diff: number; pct: number | null }`
  - `sumByCategoryAndSub(txs: Transaction[], categories: Category[], type: 'income' | 'expense'): CatSubBreakdown[]`，其中 `CatSubBreakdown = { categoryId: string; total: number; subs: { label: string; amount: number }[] }`（皆依金額降冪；無二級與失效 subId 合併為 `（未分類）`）

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/monthReport.test.ts
import { describe, it, expect } from 'vitest'
import { daysInMonth, missingDays, comparisonRange, limitToDay, delta, sumByCategoryAndSub } from './monthReport'
import type { Transaction, Category } from '../types'

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: null,
  amount: 100, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x', ...over,
})
const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
  subs: [{ id: 's1', name: '瓦斯費' }], ...over,
})

describe('daysInMonth', () => {
  it('大小月與閏年', () => {
    expect(daysInMonth('2026-07')).toBe(31)
    expect(daysInMonth('2026-06')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29) // 閏年
  })
})

describe('missingDays', () => {
  it('進行中月份只檢查到今天；已記帳日排除', () => {
    const txDates = new Set(['2026-07-01', '2026-07-03'])
    expect(missingDays('2026-07', txDates, [], new Set(), '2026-07-04'))
      .toEqual(['2026-07-02', '2026-07-04'])
  })
  it('固定週公休排除（2026-07-05 是週日）', () => {
    expect(missingDays('2026-07', new Set(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']), [0], new Set(), '2026-07-05'))
      .toEqual([]) // 7/5 週日公休 → 不算漏記
  })
  it('臨時公休排除', () => {
    expect(missingDays('2026-07', new Set(['2026-07-01']), [], new Set(['2026-07-02']), '2026-07-02'))
      .toEqual([])
  })
  it('歷史月份檢查整月', () => {
    const all = new Set(Array.from({ length: 29 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`))
    expect(missingDays('2026-06', all, [], new Set(), '2026-07-04')).toEqual(['2026-06-30'])
  })
  it('未來月份回空', () => {
    expect(missingDays('2026-08', new Set(), [], new Set(), '2026-07-04')).toEqual([])
  })
})

describe('comparisonRange', () => {
  it('進行中月份 → 上月同期（1 號到同日）', () => {
    expect(comparisonRange('2026-07', '2026-07-15'))
      .toEqual({ prevMonth: '2026-06', mode: 'same-period', endDay: 15 })
  })
  it('同期天數超過上月天數 → 取上月最後一天（3/30 vs 2月）', () => {
    expect(comparisonRange('2026-03', '2026-03-30'))
      .toEqual({ prevMonth: '2026-02', mode: 'same-period', endDay: 28 })
  })
  it('歷史月份 → 上月全月', () => {
    expect(comparisonRange('2026-06', '2026-07-15'))
      .toEqual({ prevMonth: '2026-05', mode: 'full', endDay: 31 })
  })
  it('1 月跨年比去年 12 月', () => {
    expect(comparisonRange('2026-01', '2026-07-15'))
      .toEqual({ prevMonth: '2025-12', mode: 'full', endDay: 31 })
  })
})

describe('limitToDay', () => {
  it('只留該月 endDay（含）以前的交易', () => {
    const txs = [tx({ id: 'a', date: '2026-06-10' }), tx({ id: 'b', date: '2026-06-20' })]
    expect(limitToDay(txs, '2026-06', 15).map(t => t.id)).toEqual(['a'])
  })
})

describe('delta', () => {
  it('一般情況：金額差 + 百分比（四捨五入）', () => {
    expect(delta(1120, 1000)).toEqual({ diff: 120, pct: 12 })
    expect(delta(900, 1000)).toEqual({ diff: -100, pct: -10 })
  })
  it('上月為 0 → pct 為 null（避免除以零）', () => {
    expect(delta(500, 0)).toEqual({ diff: 500, pct: null })
  })
})

describe('sumByCategoryAndSub', () => {
  const cats = [cat({}), cat({ id: 'c2', name: '食材', subs: [] })]
  it('依一級彙總、二級細目降冪、只取指定 type', () => {
    const txs = [
      tx({ id: 'a', categoryId: 'c1', subId: 's1', amount: 300 }),
      tx({ id: 'b', categoryId: 'c1', subId: null, amount: 100 }),
      tx({ id: 'c', categoryId: 'c2', amount: 900 }),
      tx({ id: 'd', type: 'income', categoryId: 'cash', amount: 9999 }), // income 不計入
    ]
    expect(sumByCategoryAndSub(txs, cats, 'expense')).toEqual([
      { categoryId: 'c2', total: 900, subs: [{ label: '（未分類）', amount: 900 }] },
      { categoryId: 'c1', total: 400, subs: [{ label: '瓦斯費', amount: 300 }, { label: '（未分類）', amount: 100 }] },
    ])
  })
  it('失效 subId（dangling）併入（未分類）', () => {
    const txs = [
      tx({ id: 'a', subId: 'ghost', amount: 50 }),
      tx({ id: 'b', subId: null, amount: 70 }),
    ]
    expect(sumByCategoryAndSub(txs, cats, 'expense')[0].subs)
      .toEqual([{ label: '（未分類）', amount: 120 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/monthReport.test.ts`
Expected: FAIL（`Cannot find module './monthReport'`）

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/monthReport.ts
// 月結分析純函式（不碰 Dexie / localStorage，Vitest 覆蓋）：
// 未記帳日檢查、上月比較基準、二級細目彙總——月結頁的所有新計算都在這裡。
import type { Transaction, Category } from '../types'
import { shiftMonth } from './calendar'

const pad2 = (n: number) => String(n).padStart(2, '0')

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// 該月「完全沒交易」的日期清單（取代紙本月底逐日核對的漏記檢查）。
// 排除：固定週公休、臨時公休、未來日（進行中月份只算到 today；未來月份不檢查）。
export function missingDays(
  month: string,
  txDates: Set<string>,
  weeklyClosed: number[],
  closedDates: Set<string>,
  today: string,
): string[] {
  const thisMonth = today.slice(0, 7)
  if (month > thisMonth) return []
  const end = month === thisMonth ? Number(today.slice(8, 10)) : daysInMonth(month)
  const out: string[] = []
  for (let d = 1; d <= end; d++) {
    const date = `${month}-${pad2(d)}`
    if (txDates.has(date) || closedDates.has(date)) continue
    // 'T00:00:00' 固定本地時區解析，避免 UTC 位移造成星期算錯
    if (weeklyClosed.includes(new Date(`${date}T00:00:00`).getDay())) continue
    out.push(date)
  }
  return out
}

export interface ComparisonRange {
  prevMonth: string
  mode: 'same-period' | 'full'
  endDay: number
}

// 「與上月比較」基準：進行中月份用上月同期（1 號～同日，上月天數不足取最後一天），
// 歷史月份用上月全月——月底核對時即為完整月比較（見設計 spec）。
export function comparisonRange(month: string, today: string): ComparisonRange {
  const prevMonth = shiftMonth(month, -1)
  const prevDays = daysInMonth(prevMonth)
  if (month === today.slice(0, 7)) {
    return { prevMonth, mode: 'same-period', endDay: Math.min(Number(today.slice(8, 10)), prevDays) }
  }
  return { prevMonth, mode: 'full', endDay: prevDays }
}

export function limitToDay(txs: Transaction[], month: string, endDay: number): Transaction[] {
  const cutoff = `${month}-${pad2(endDay)}`
  return txs.filter(t => t.date <= cutoff)
}

export interface Delta {
  diff: number
  pct: number | null // null = 上月為 0，不顯示百分比（避免除以零的無意義 ∞%）
}

export function delta(cur: number, prev: number): Delta {
  return { diff: cur - prev, pct: prev === 0 ? null : Math.round(((cur - prev) / prev) * 100) }
}

export interface CatSubBreakdown {
  categoryId: string
  total: number
  subs: { label: string; amount: number }[] // 金額降冪；無二級與失效 subId 合併為（未分類）
}

// 一級類別 → 二級細目彙總。直接從逐筆交易算——buildDailyRecordsFromTx 合成時會丟掉 subId，
// 不能重用（這正是既有月結卡看不到二級的原因）。
export function sumByCategoryAndSub(
  txs: Transaction[],
  categories: Category[],
  type: 'income' | 'expense',
): CatSubBreakdown[] {
  const catById = new Map(categories.map(c => [c.id, c]))
  const acc = new Map<string, Map<string, number>>() // categoryId → subLabel → amount
  for (const t of txs) {
    if (t.type !== type) continue
    const cat = catById.get(t.categoryId)
    // 找不到二級名稱（無 subId 或 dangling）一律歸（未分類），不丟資料
    const label = (t.subId ? cat?.subs?.find(s => s.id === t.subId)?.name : undefined) ?? '（未分類）'
    const bySub = acc.get(t.categoryId) ?? new Map<string, number>()
    bySub.set(label, (bySub.get(label) ?? 0) + t.amount)
    acc.set(t.categoryId, bySub)
  }
  return [...acc.entries()]
    .map(([categoryId, bySub]) => ({
      categoryId,
      total: [...bySub.values()].reduce((s, v) => s + v, 0),
      subs: [...bySub.entries()]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.total - a.total)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/monthReport.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 5: 全套驗證 + Commit**

Run: `cd frontend && npx tsc -b && npm test`（全綠）

```bash
git add frontend/src/lib/monthReport.ts frontend/src/lib/monthReport.test.ts
git commit -m "feat: 月結分析純函式（未記帳日/上月比較基準/二級細目彙總）"
git push origin feature/monthly-report-analytics
```

---

### Task 3: 設定頁「每週公休日」

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`（「應用程式」區塊，約 309–360 行，打烊提醒列之後）

**Interfaces:**
- Consumes: `getWeeklyClosed` / `setWeeklyClosed`（Task 1）
- Produces: 無程式介面；使用者設定寫入 localStorage `mpos_weekly_closed`

- [ ] **Step 1: 加 import 與 state**

在 `SettingsPage.tsx` 頂部 import 區加入：

```ts
import { getWeeklyClosed, setWeeklyClosed } from '../lib/closedDays'
```

在元件內既有 useState 群（約 96–116 行）之後加入：

```ts
// 每週公休日（0=週日…6=週六）；勾選的星期在月結「未記帳日」檢查中永久排除
const [weeklyClosed, setWeeklyClosedState] = useState<number[]>(() => getWeeklyClosed())
const toggleWeekday = (day: number) => {
  const next = weeklyClosed.includes(day)
    ? weeklyClosed.filter(d => d !== day)
    : [...weeklyClosed, day]
  setWeeklyClosed(next)          // 寫 localStorage
  setWeeklyClosedState(getWeeklyClosed()) // 讀回（已去重排序）
}
```

- [ ] **Step 2: 加 UI 區塊**

在「應用程式」卡片內、打烊提醒相關列（含提醒時間展開區）**之後**、卡片閉合 `</div>` 之前，插入：

```tsx
{/* 每週公休日：勾選的星期在月結「未記帳日」檢查中自動排除（臨時公休在月結漏記卡逐日標） */}
<div style={{ padding: '12px 16px', borderTop: `1px solid ${T.hairline}` }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
    <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>每週公休日</span>
    <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>不列入月結漏記檢查</span>
  </div>
  <div style={{ display: 'flex', gap: 6 }}>
    {['日', '一', '二', '三', '四', '五', '六'].map((label, i) => {
      const on = weeklyClosed.includes(i)
      return (
        <button
          key={i}
          onClick={() => toggleWeekday(i)}
          aria-label={`週${label}公休`}
          aria-pressed={on}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontFamily: T.font.sans, fontSize: 13, fontWeight: 800,
            background: on ? T.ink : T.bg, color: on ? '#fff' : T.ink2,
            transition: 'all 140ms ease',
          }}
        >{label}</button>
      )
    })}
  </div>
</div>
```

- [ ] **Step 3: 驗證**

Run: `cd frontend && npx tsc -b && npm test && npm run build`（全綠）
手動 spot-check（可選）：`npm run dev` → 設定頁勾「二」→ 重新整理仍勾選。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: 設定頁每週公休日（週日～週六 chips 多選）"
git push origin feature/monthly-report-analytics
```

---

### Task 4: 月結 Hero「vs 上月」+ 移除匯出 stub

**Files:**
- Modify: `frontend/src/pages/MonthlyReportPage.tsx`

**Interfaces:**
- Consumes: `comparisonRange` / `limitToDay` / `delta`（Task 2）、既有 `useMonthTransactions`（回傳 `{ transactions: Transaction[], loading: boolean }`）、既有 `buildDailyRecordsFromTx` / `dayIncome` / `dayExpense` / `calcFees`
- Produces: 元件內變數 `prevTxs: Transaction[]`（**Task 6 的成本結構卡會用**）、`cmp: ComparisonRange`

- [ ] **Step 1: 加 import 與比較計算**

`MonthlyReportPage.tsx` 頂部加：

```ts
import { comparisonRange, limitToDay, delta } from '../lib/monthReport'
```

元件內、既有 `const { transactions, loading } = useMonthTransactions(month)` 之後加：

```ts
// 本地時區今天（比照 App.tsx toLocalDateString，避免 UTC 位移跨日）
const now = new Date()
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

// 與上月比較：進行中月份用上月同期（1 號～同日），歷史月份用上月全月
const cmp = comparisonRange(month, todayStr)
const { transactions: prevMonthTxs } = useMonthTransactions(cmp.prevMonth)
const prevTxs = limitToDay(prevMonthTxs, cmp.prevMonth, cmp.endDay)
```

既有 `const avgDaily = ...` 之後加（沿用同檔既有的 `dayIncome`/`dayExpense`/`calcFees` 計算慣例）：

```ts
// 上月基準淨額（同公式：收入 − 支出 − 手續費）；上月完全無資料則不顯示比較行
const prevRecords = buildDailyRecordsFromTx(prevTxs)
const prevNet =
  prevRecords.reduce((s, r) => s + dayIncome(r, knownIncomeIds), 0) -
  prevRecords.reduce((s, r) => s + dayExpense(r, knownExpenseIds), 0) -
  prevRecords.reduce((s, r) => s + calcFees(r, allCategories), 0)
const netDelta = delta(net, prevNet)
const hasPrevData = prevRecords.length > 0
```

- [ ] **Step 2: Hero 加比較行**

Hero 卡內、淨額大字 `<div style={{ fontSize: 38, ... }}>{fmt(net, ...)}</div>` 之後插入：

```tsx
{hasPrevData && (
  <div
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
      padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.92)',
      fontSize: 12, fontWeight: 800, fontFamily: T.font.num,
      color: netDelta.diff >= 0 ? T.mintInk : T.coralInk, // 增=綠、減=紅
    }}
  >
    vs {cmp.mode === 'same-period' ? '上月同期' : '上月'}
    {' '}{fmt(netDelta.diff, { plus: true, sign: true })}
    {netDelta.pct !== null && `（${netDelta.pct >= 0 ? '+' : ''}${netDelta.pct}%）`}
  </div>
)}
```

- [ ] **Step 3: 移除匯出 stub 按鈕**

刪除月份選擇器列裡整顆無功能按鈕（含註解 `{/* 匯出 stub */}`，即 `<button style={{ width: 36, height: 36, ... }}><Icon name="receipt" ... /></button>` 區塊，約 232–241 行）。

- [ ] **Step 4: 驗證**

Run: `cd frontend && npx tsc -b && npm test && npm run build`（全綠；tsc 若報 `Icon` unused 一併清 import）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MonthlyReportPage.tsx
git commit -m "feat: 月結 Hero 上月淨額比較（進行中=同期/歷史=全月）+ 移除匯出 stub"
git push origin feature/monthly-report-analytics
```

---

### Task 5: 未記帳日卡 `MissingDaysCard`

**Files:**
- Create: `frontend/src/components/MissingDaysCard.tsx`
- Modify: `frontend/src/pages/MonthlyReportPage.tsx`（Hero 之後插入）

**Interfaces:**
- Consumes: `missingDays`（Task 2）、`getWeeklyClosed` / `getClosedDates` / `markClosed` / `unmarkClosed`（Task 1）、tokens `T`（琥珀色 = `T.sun/sunSoft/sunInk`）
- Produces: `<MissingDaysCard month={string} txDates={Set<string>} today={string} onGoToDate={(date: string) => void} />`

- [ ] **Step 1: 建立元件**

```tsx
// frontend/src/components/MissingDaysCard.tsx
// 月結「未記帳日」提示卡——取代紙本月底逐日核對的漏記檢查。
// 顯示規則：該月完全無交易（txDates 空）不顯示（避免用前史空月洗版）；
// 無漏記且無臨時公休標記也不顯示（零干擾）；無漏記但有臨時標記時顯示瘦身版（可取消誤標）。
import { useState } from 'react'
import { T } from '../lib/tokens'
import { missingDays } from '../lib/monthReport'
import { getWeeklyClosed, getClosedDates, markClosed, unmarkClosed } from '../lib/closedDays'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const dayLabel = (date: string) =>
  `${parseInt(date.slice(5, 7))}/${parseInt(date.slice(8))}（${WEEKDAY[new Date(`${date}T00:00:00`).getDay()]}）`

export function MissingDaysCard({ month, txDates, today, onGoToDate }: {
  month: string
  txDates: Set<string>   // 該月有交易的日期集合
  today: string          // 'YYYY-MM-DD'（本地時區）
  onGoToDate: (date: string) => void // 「去補記」→ 導到帳目頁該日
}) {
  // closedVersion：標記/取消後 bump 觸發重讀 localStorage（公休設定不進 React 樹的其他地方）
  const [closedVersion, setClosedVersion] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  void closedVersion

  const weekly = getWeeklyClosed()
  const closedDates = getClosedDates()
  const monthClosed = closedDates.filter(d => d.startsWith(`${month}-`))
  const missing = missingDays(month, txDates, weekly, new Set(closedDates), today)

  if (txDates.size === 0) return null
  if (missing.length === 0 && monthClosed.length === 0) return null

  const mark = (date: string) => {
    markClosed(date)             // 標為臨時公休 → 立即從漏記清單消失
    setSelected(null)
    setClosedVersion(v => v + 1)
  }
  const unmark = (date: string) => {
    unmarkClosed(date)           // 取消誤標 → 回到漏記清單
    setClosedVersion(v => v + 1)
  }

  return (
    <div style={{ background: T.sunSoft, borderRadius: T.r.lg, padding: 16, boxShadow: T.shadow.card }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.sunInk }}>
        {missing.length > 0
          ? `${parseInt(month.slice(5))} 月未記帳：${missing.length} 天`
          : `${parseInt(month.slice(5))} 月無漏記 ✓`}
        {weekly.length > 0 && (
          <span style={{ fontWeight: 600, marginLeft: 6 }}>
            （每週{weekly.map(d => WEEKDAY[d]).join('、')}公休已排除）
          </span>
        )}
      </div>

      {missing.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {missing.map(date => (
            <button
              key={date}
              onClick={() => setSelected(selected === date ? null : date)}
              style={{
                padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontFamily: T.font.num, fontSize: 12, fontWeight: 800,
                background: selected === date ? T.sunInk : T.card,
                color: selected === date ? '#fff' : T.sunInk,
                boxShadow: T.shadow.card,
              }}
            >{dayLabel(date)}</button>
          ))}
        </div>
      )}

      {/* 點選日期 → 兩個動作：去補記 / 標為公休 */}
      {selected && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.sunInk, fontFamily: T.font.num }}>{dayLabel(selected)}</span>
          <button
            onClick={() => onGoToDate(selected)}
            style={{ padding: '8px 14px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', background: T.ink, color: '#fff', fontSize: 12, fontWeight: 800, fontFamily: T.font.sans }}
          >去補記</button>
          <button
            onClick={() => mark(selected)}
            style={{ padding: '8px 14px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', background: T.card, color: T.ink2, fontSize: 12, fontWeight: 800, fontFamily: T.font.sans }}
          >標為公休</button>
        </div>
      )}

      {/* 臨時公休管理：可展開取消誤標 */}
      {monthClosed.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setManaging(!managing)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, color: T.sunInk, textDecoration: 'underline', fontFamily: T.font.sans }}
          >本月已標公休 {monthClosed.length} 天{managing ? '（收合）' : '（管理）'}</button>
          {managing && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {monthClosed.map(date => (
                <button
                  key={date}
                  onClick={() => unmark(date)}
                  aria-label={`取消 ${date} 公休`}
                  style={{ padding: '6px 12px', borderRadius: 999, border: `1px dashed ${T.sunInk}`, cursor: 'pointer', background: 'transparent', color: T.sunInk, fontSize: 12, fontWeight: 700, fontFamily: T.font.num }}
                >{dayLabel(date)} ✕</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 插入月結頁**

`MonthlyReportPage.tsx` 加 import：

```ts
import { MissingDaysCard } from '../components/MissingDaysCard'
```

Hero 卡的閉合 `</div>` 之後、`{loading ? ...}` 分支**之前**插入：

```tsx
{/* 未記帳日提示卡（無漏記且無臨時標記時整卡不渲染，零干擾） */}
<MissingDaysCard
  month={month}
  txDates={new Set(transactions.map(t => t.date))}
  today={todayStr}
  onGoToDate={onSelectDate}
/>
```

- [ ] **Step 3: 驗證**

Run: `cd frontend && npx tsc -b && npm test && npm run build`（全綠）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MissingDaysCard.tsx frontend/src/pages/MonthlyReportPage.tsx
git commit -m "feat: 月結未記帳日卡（漏記 chips / 去補記 / 標公休 / 誤標管理）"
git push origin feature/monthly-report-analytics
```

---

### Task 6: 成本結構卡 `CostStructureCard`（取代 CategoryBars）

**Files:**
- Create: `frontend/src/components/CostStructureCard.tsx`
- Modify: `frontend/src/pages/MonthlyReportPage.tsx`（刪除內部 `CategoryBars`，render 改用新卡）

**Interfaces:**
- Consumes: `sumByCategoryAndSub` / `delta`（Task 2）、`prevTxs`（Task 4 產出）、tokens `T` / `colorMap`、`fmt`
- Produces: `<CostStructureCard txs={Transaction[]} prevTxs={Transaction[]} categories={Category[]} totalIncome={number} />`

- [ ] **Step 1: 建立元件**

```tsx
// frontend/src/components/CostStructureCard.tsx
// 成本結構卡（升級自月結「本月分類」橫條卡）：
//   每列 = 一級類別：金額 + 佔組內比條 + vs 上月增減；支出列另顯示「佔收入比」（食材率/人事率）。
//   點列展開二級細目（金額 + 佔該一級 %）。未知類別（不在 categories 內）不顯示，
//   與既有 dayIncome/dayExpense 只計已知類別的慣例一致。
import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { sumByCategoryAndSub, delta } from '../lib/monthReport'
import type { Transaction, Category } from '../types'

export function CostStructureCard({ txs, prevTxs, categories, totalIncome }: {
  txs: Transaction[]       // 本月交易
  prevTxs: Transaction[]   // 上月比較基準交易（已 limitToDay，同期/全月由呼叫端決定）
  categories: Category[]
  totalIncome: number      // 本月總收入毛額（佔收入比分母；0 時不顯示佔收入比）
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const catById = new Map(categories.map(c => [c.id, c]))

  const renderGroup = (type: 'income' | 'expense', title: string, totalColor: string) => {
    // 只顯示已知類別（未知 categoryId 略過，防雲端陌生資料污染畫面）
    const rows = sumByCategoryAndSub(txs, categories, type).filter(r => catById.has(r.categoryId))
    if (rows.length === 0) return null
    const prevRows = new Map(
      sumByCategoryAndSub(prevTxs, categories, type).map(r => [r.categoryId, r.total]),
    )
    const groupTotal = rows.reduce((s, r) => s + r.total, 0)

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.4, textTransform: 'uppercase' as const }}>{title}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: totalColor, fontFamily: T.font.num }}>{fmt(groupTotal)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {rows.map(r => {
            const cat = catById.get(r.categoryId)!
            const pct = groupTotal > 0 ? Math.round((r.total / groupTotal) * 100) : 0
            const prev = prevRows.get(r.categoryId)
            const d = prev === undefined ? null : delta(r.total, prev) // null = 上月無此類別 →「新」
            // 支出增加=紅、支出減少=綠；收入相反；持平=灰
            const deltaColor =
              d === null || d.diff === 0 ? T.muted
              : (type === 'expense') === (d.diff > 0) ? T.coralInk : T.mintInk
            const incomePct = type === 'expense' && totalIncome > 0
              ? Math.round((r.total / totalIncome) * 100) : null
            const open = expanded === r.categoryId
            const hasSubs = r.subs.length > 1 || r.subs[0]?.label !== '（未分類）'

            return (
              <div key={r.categoryId}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={open}
                  aria-label={`${cat.name} 細目`}
                  onClick={() => hasSubs && setExpanded(open ? null : r.categoryId)}
                  onKeyDown={e => { if (e.key === 'Enter' && hasSubs) setExpanded(open ? null : r.categoryId) }}
                  style={{ cursor: hasSubs ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, color: T.ink2, fontWeight: 700 }}>
                      {cat.name}
                      {incomePct !== null && (
                        <span style={{ color: T.muted, fontWeight: 600, marginLeft: 6 }}>佔收入 {incomePct}%</span>
                      )}
                      {hasSubs && <span style={{ color: T.muted, marginLeft: 4 }}>{open ? '▾' : '▸'}</span>}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>
                      <span style={{ color: deltaColor, fontFamily: T.font.num, fontWeight: 700, marginRight: 8 }}>
                        {d === null ? '新'
                          : d.diff === 0 ? '─ 持平'
                          : `${d.diff > 0 ? '▲' : '▼'}${fmt(Math.abs(d.diff))}${d.pct !== null ? `（${d.pct > 0 ? '+' : ''}${d.pct}%）` : ''}`}
                      </span>
                      <span style={{ color: T.muted, fontFamily: T.font.num, fontWeight: 700, marginRight: 6 }}>{pct}%</span>
                      <span style={{ color: T.ink, fontFamily: T.font.num }}>{fmt(r.total)}</span>
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: T.bg, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(pct, r.total > 0 ? 1.5 : 0)}%`, height: '100%', background: (colorMap[cat.color] ?? colorMap['mint']).bg, borderRadius: 4, transition: 'width 400ms ease' }} />
                  </div>
                </div>

                {/* 二級細目（點一級展開） */}
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${T.hairline}` }}>
                    {r.subs.map(s => (
                      <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.num }}>
                          <span style={{ color: T.muted, marginRight: 6 }}>{r.total > 0 ? Math.round((s.amount / r.total) * 100) : 0}%</span>
                          <span style={{ color: T.ink }}>{fmt(s.amount)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  const income = renderGroup('income', '收入', T.mintInk)
  const expense = renderGroup('expense', '支出', T.coralInk)
  if (!income && !expense) return null

  return (
    <div style={{ background: T.card, borderRadius: T.r.lg, padding: 18, boxShadow: T.shadow.card }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 14 }}>本月分類</div>
      {income}
      {expense}
    </div>
  )
}
```

- [ ] **Step 2: 月結頁換卡**

`MonthlyReportPage.tsx`：

1. 加 import：`import { CostStructureCard } from '../components/CostStructureCard'`
2. **整段刪除**檔內的 `CategoryBars` 函式（`// 分類橫條圖（動態類別，收入/支出分組）` 註解起，至該函式閉合，約 111–177 行）
3. render 內 `<CategoryBars records={records} />` 換成：

```tsx
<CostStructureCard
  txs={transactions}
  prevTxs={prevTxs}
  categories={allCategories}
  totalIncome={totalIncome}
/>
```

4. 若 `getCategories` 因刪除 `CategoryBars` 只剩元件內使用，import 保留不動（元件內 `allCategories` 仍在用）。

- [ ] **Step 3: 驗證**

Run: `cd frontend && npx tsc -b && npm test && npm run build`（全綠；tsc unused 警告一併清）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CostStructureCard.tsx frontend/src/pages/MonthlyReportPage.tsx
git commit -m "feat: 成本結構卡（二級展開/佔收入比/上月增減，取代 CategoryBars）"
git push origin feature/monthly-report-analytics
```

---

### Task 7: Playwright E2E + 文檔 + bump 2.1.0

**Files:**
- Create: `frontend/e2e/monthly-report.spec.ts`
- Modify: `frontend/package.json`（version 2.1.0）、`frontend/package-lock.json`（`npm install --package-lock-only`）
- Modify: `CLAUDE.md`、`AGENTS.md`、`README.md`

**Interfaces:**
- Consumes: Task 1–6 全部完成後的整合行為；`e2e/transactions.spec.ts` 既有的 `beforeEach` 種子與 helper 寫法（**先讀該檔**，複製其 onboarding/類別種子的 `beforeEach` 與 `navTab` helper 到新檔）
- Produces: 可重複執行的月結分析 E2E；版本 `2.1.0`

- [ ] **Step 1: 撰寫 E2E**

新檔 `frontend/e2e/monthly-report.spec.ts`。**先讀 `frontend/e2e/transactions.spec.ts`**，複製其檔頭（`test.beforeEach` 的 onboarding 種子、`navTab` helper、BASE_URL 慣例）後加入以下兩個測試（日期都用程式算，任何一天跑都 deterministic）：

```ts
// 動態算月份，避免寫死日期造成跨月 flaky
const now = new Date()
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

test('月結：成本結構卡展開二級細目 + Hero 顯示 vs 上月比較', async ({ page }) => {
  // 1. 帳目 FAB 新增「上月 1 號」支出（雜支 $100）——上月同期基準必含 1 號，任何日期跑都成立
  await navTab(page, '帳目').click()
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '雜支' }).click()
  await page.getByLabel('金額', { exact: true }).fill('100')
  await page.getByLabel('日期').fill(`${prevMonth}-01`)
  await page.getByRole('button', { name: '儲存', exact: true }).click()

  // 2. 新增「今天」支出（雜支 $150，就地新增二級「瓦斯費」）
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '雜支' }).click()
  await page.getByRole('button', { name: '＋新增二級' }).click()
  await page.getByPlaceholder('二級名稱').fill('瓦斯費')
  await page.getByRole('button', { name: '加入' }).click()
  await page.getByLabel('金額', { exact: true }).fill('150')
  await page.getByRole('button', { name: '儲存', exact: true }).click()

  // 3. 月結：Hero 顯示 vs 上月同期；成本結構卡點「雜支」展開見「瓦斯費」細目
  await navTab(page, '月結').click()
  await expect(page.getByText('vs 上月同期')).toBeVisible()
  await page.getByRole('button', { name: '雜支 細目' }).click()
  await expect(page.getByText('瓦斯費')).toBeVisible()
  await expect(page.getByText('$150').first()).toBeVisible()
})

test('月結：未記帳日卡 → 標公休消失 → reload 持久 → 管理可取消', async ({ page }) => {
  // 上月只記 1 號一筆 → 上月 2 號起全是漏記日（deterministic，不受今天是幾號影響）
  await navTab(page, '帳目').click()
  await page.getByRole('button', { name: '新增交易' }).click()
  await page.getByRole('button', { name: '支出', exact: true }).click()
  await page.getByRole('button', { name: '雜支' }).click()
  await page.getByLabel('金額', { exact: true }).fill('100')
  await page.getByLabel('日期').fill(`${prevMonth}-01`)
  await page.getByRole('button', { name: '儲存', exact: true }).click()

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
})
```

⚠️ 撰寫時以 `TransactionSheet.tsx` 實際的 aria-label / placeholder 為準（「新增交易」FAB、「＋新增二級」、二級名稱輸入框、「加入」按鈕——若與上述文字不符，改測試配合實作，不要反過來改實作）。

- [ ] **Step 2: 跑 E2E**

Run: `cd frontend && E2E_PORT=5199 npx playwright test`
Expected: 既有 7 條 + 新 2 條全部 PASS

- [ ] **Step 3: bump 2.1.0 + 文檔**

1. `frontend/package.json`：`"version": "2.1.0"`；`cd frontend && npm install --package-lock-only`
2. `CLAUDE.md`：header `App Version` 改 `2.1.0`；「版本號規則」的「目前 =」行改 `2.1.0（月結分析對帳報表 → MINOR）`；Development Status 加一行：

```
- **月結分析對帳報表（2.1.0）**: ✅ 月結頁原地強化——未記帳日卡（設定頁固定週公休 + 臨時逐日標記，`lib/closedDays.ts`）、成本結構卡（二級細目展開/支出佔收入比/vs 上月增減，`CostStructureCard`）、Hero vs 上月淨額（進行中=同期、歷史=全月，`lib/monthReport.ts` 純函式）、移除匯出 stub。spec：`docs/superpowers/specs/2026-07-09-monthly-report-analytics-design.md`。
```

3. PROJECT STRUCTURE 的 lib/ 清單加 `closedDays.ts`、`monthReport.ts`，components/ 加 `MissingDaysCard.tsx`、`CostStructureCard.tsx`
4. 重新產生 `AGENTS.md`：

```bash
sed -e '1s/# CLAUDE.md - Ready-mPOS/# AGENTS.md - Ready-mPOS/' -e 's/This file provides essential guidance to Claude Code when working with this repository./This file provides essential guidance to Codex when working with this repository./' CLAUDE.md > AGENTS.md
```

5. `README.md`：版本行改 `2.1.0`；Features 表加一列「月結分析對帳（未記帳日/成本結構/上月比較）｜✅」

- [ ] **Step 4: 最終驗證 + Commit**

Run: `cd frontend && npx tsc -b && npm test && npm run build && E2E_PORT=5199 npx playwright test`（全綠）

```bash
git add -A
git commit -m "feat: 月結分析對帳報表 E2E + 文檔 + bump 2.1.0"
git push origin feature/monthly-report-analytics
```

完成後**不自行併 main**——依 Git 分支流程 SOP：使用者 `npm run dev` 本機驗收（連測試表）→ 核准後才併 main（`--no-ff`）+ tag `v2.1.0`。

---

## Self-Review 紀錄

- **Spec coverage**：公休兩層規則→Task 1/3/5；未記帳日卡→Task 2/5；成本結構（二級/佔收入比/上月比較）→Task 2/6；Hero 上月比較（同期/全月/跨年/除零）→Task 2/4；移除匯出 stub→Task 4；不動同步層/DB→無任務觸碰；測試清單（進行中月份只算到今天、公休排除、跨年、2 月、未分類、dangling subId、上月為 0）→Task 1/2 測試碼；E2E 兩情境→Task 7。無缺口。
- **佔收入比分母**：`totalIncome` 由頁面既有毛額 `totalIncome` 傳入（不扣手續費），與 spec 一致。
- **型別一致性**：`ComparisonRange`/`CatSubBreakdown`/`Delta` 於 Task 2 定義，Task 4/5/6 引用簽名一致；`prevTxs` 由 Task 4 產出、Task 6 消費，名稱一致。
- **顯示規則補充決策**（spec 未明說，已定案入計畫）：整月零交易不顯示未記帳卡（避免前史空月洗版）；無漏記但有臨時公休標記時顯示瘦身版卡（否則誤標無法取消）。
