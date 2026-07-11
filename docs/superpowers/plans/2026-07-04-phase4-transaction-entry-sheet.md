# Phase 4 交易記帳底部 Sheet + FAB + 單日列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者以「逐筆交易」記帳——右下 FAB 開底部 `TransactionSheet`（收支切換 / 一級類別 / 二級自動帶入預設 / 金額 / 備註 / 日期 / 儲存並繼續 / 編輯刪除），寫入 `transactions`；新 `LedgerPage` 顯示當日逐筆列表並可點選編輯。

**Architecture:** `TransactionSheet` 沿用既有 `CategoryEditSheet` 的底部 Sheet 外殼樣式；記帳寫入透過既有純資料層 `lib/transactions.ts`（`addTransaction`/`updateTransaction`/`deleteTransaction`）。選一級類別時二級自動帶入該類別 `defaultSubId`，由**純函式 `resolveDefaultSub`**（Vitest 覆蓋，順帶修 Phase 3 Minor #3：驗證 defaultSubId 仍存在於 subs）。`LedgerPage` 用 `useDayTransactions` 即時查詢，取代 `記帳` tab 現有 `DailyEntryPage`。

**Tech Stack:** React + TypeScript + Vitest + Playwright；inline styles + design tokens；Dexie（transactions store）。

## Global Constraints

- **範圍界定（決策 D5，見 LOOP_STATE）**：本期只做「交易記帳 Sheet + FAB + 單日列表」，寫入/讀取本機 `transactions`。**不動 `syncAll` / `useSyncService` / Dashboard / 月結**（仍讀 `DailyRecord`）。雲端 pull 的 dailyRecords 不顯示於交易列表、交易也尚未同步到 Sheets——這些留待 **Phase 5**（月份分頁 Transaction 新格式 + `Transaction.id` 對帳）與 **Phase 6**（Dashboard/月結重算）。分支未併 main，開發期分歧可接受。
- 金額一律**正數**儲存，收支方向由 `type` 決定（沿用 `Transaction` 型別）。
- 二級**繼承**一級 icon/color/fee；選一級時二級自動帶入 `defaultSubId`，但 `defaultSubId` 若已不在該類別 `subs` 內則視為「無」（Phase 3 Minor #3）。
- UI phase → 驗證門檻含 **Playwright E2E**（`npm run test:e2e`）。
- 繁體中文註解；每 task commit + push feature 分支（**絕不碰 main**）。
- 不改 `Transaction` 型別、不改 `lib/transactions.ts` 既有函式（直接沿用）。

---

### Task 1: `resolveDefaultSub` 純函式（TDD）+ `TransactionSheet` 元件

**Files:**
- Create: `frontend/src/lib/txDraft.ts`（純函式，不 import Dexie）
- Test: `frontend/src/lib/txDraft.test.ts`
- Create: `frontend/src/components/TransactionSheet.tsx`

**Interfaces:**
- Consumes: `Category`（`types`）、`getCategories`（`lib/categories`）、`addTransaction`/`updateTransaction`/`deleteTransaction` + `TxInput`（`lib/transactions`）、`Transaction`（`types`）、`T`/`colorMap`/`Icon`/`fmt`。
- Produces:
  - `resolveDefaultSub(cat: Category | undefined): string | null`
  - `TransactionSheet`（見下方 props）

- [ ] **Step 1: 先寫失敗測試** — `frontend/src/lib/txDraft.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { resolveDefaultSub } from './txDraft'
import type { Category } from '../types'

const mk = (over: Partial<Category>): Category => ({
  id: 'misc', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense', ...over,
})

describe('resolveDefaultSub — 記帳時帶入的預設二級', () => {
  it('無二級 → null', () => {
    expect(resolveDefaultSub(mk({ subs: [], defaultSubId: null }))).toBeNull()
  })
  it('有預設且存在於 subs → 回傳該 id', () => {
    expect(resolveDefaultSub(mk({ subs: [{ id: 's1', name: '瓦斯費' }], defaultSubId: 's1' }))).toBe('s1')
  })
  it('預設 id 已不在 subs（dangling）→ null（Phase 3 Minor #3）', () => {
    expect(resolveDefaultSub(mk({ subs: [{ id: 's2', name: '水費' }], defaultSubId: 's1' }))).toBeNull()
  })
  it('有 subs 但無預設 → null', () => {
    expect(resolveDefaultSub(mk({ subs: [{ id: 's1', name: '瓦斯費' }], defaultSubId: null }))).toBeNull()
  })
  it('cat 為 undefined → null', () => {
    expect(resolveDefaultSub(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/txDraft.test.ts` → FAIL（未匯出）

- [ ] **Step 3: 實作純函式** — `frontend/src/lib/txDraft.ts`

```ts
import type { Category } from '../types'

// 記帳選定一級類別時，計算應自動帶入的二級 id。
// 帶入 defaultSubId，但必須驗證它仍存在於該類別的 subs（防 dangling，Phase 3 Minor #3）；否則視為「無」。
export function resolveDefaultSub(cat: Category | undefined): string | null {
  if (!cat || !cat.subs || cat.subs.length === 0) return null
  const def = cat.defaultSubId ?? null
  return def && cat.subs.some(s => s.id === def) ? def : null
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd frontend && npx vitest run src/lib/txDraft.test.ts` → PASS（5/5）

- [ ] **Step 5: 實作 `TransactionSheet.tsx`**

沿用 `components/CategoryEditSheet.tsx` 的底部 Sheet 外殼（半透明遮罩 + 圓角底部面板 + 頂部把手 + 可捲動內容區 maxHeight 55vh + 固定底部按鈕區）。**props**：

```ts
export function TransactionSheet({ date, editing, onClose, onSaved }: {
  date: string                    // 新增時的預設日期 'YYYY-MM-DD'
  editing: Transaction | null     // null = 新增；非 null = 編輯此筆
  onClose: () => void
  onSaved: () => void             // 儲存/刪除成功後通知（呼叫端可關閉或刷新）
}): JSX.Element
```

**內部 state**（`draft`）：`type: 'income'|'expense'`、`categoryId: string`、`subId: string|null`、`amount: number`、`note: string`、`d: string`（日期）。
- 初始：`editing` 非 null → 由該筆帶入；否則 `type='expense'`、`categoryId=''`、`subId=null`、`amount=0`、`note=''`、`d=date`。

**行為**：
1. **收入/支出切換**（兩顆 pill，沿用選中深色樣式）：切換時清空 `categoryId`/`subId`（因類別依 type 過濾）。
2. **一級類別 chips**：`getCategories().filter(c => c.type === draft.type && c.enabled)`；每個 chip 顯示 icon + name。點選 → `categoryId = c.id`、`subId = resolveDefaultSub(c)`。
3. **二級 chips**：僅當選定類別有 `subs?.length` 才顯示；一律含「無」（值 `null`）+ 各 sub；點選設定 `subId`。
4. **金額**：數字輸入（`inputMode="decimal"`，取正數；`Math.max(0, Number(v))`）。
5. **備註**：選填文字。
6. **日期**：`<input type="date">` 綁 `d`。
7. **底部按鈕**：
   - 新增模式：「儲存」+「儲存並繼續」。「儲存並繼續」= 儲存後**不關閉**，只清空 `amount` 與 `note`（保留 type/category/sub/date），讓連續記帳。
   - 編輯模式：「刪除」（`deleteTransaction(editing.localId!)` → `onSaved()`）+「儲存」。
   - 「儲存」啟用條件：`categoryId !== '' && amount > 0`。
8. **儲存動作**：
   - 新增：`await addTransaction({ date: draft.d, type: draft.type, categoryId: draft.categoryId, subId: draft.subId, amount: draft.amount, note: draft.note.trim() || undefined })`
   - 編輯：`await updateTransaction(editing.localId!, { date: draft.d, type, categoryId, subId, amount, note: draft.note.trim() || undefined })`
   - 成功後：新增且「儲存」→ `onSaved()`；「儲存並繼續」→ 保持開啟並重置金額/備註；編輯 → `onSaved()`。

> 為 E2E 穩定，關鍵可互動元素加 `aria-label`：類別 chip `aria-label={`類別 ${c.name}`}`、二級 chip `aria-label={`二級 ${opt.name}`}`、收入/支出 pill 用文字即可。金額 input `aria-label="金額"`。

- [ ] **Step 6: 型別檢查 + build**

Run: `cd frontend && npx tsc --noEmit`（Expected: 無錯）
Run: `cd frontend && npm run build`（Expected: 成功）
（本 task 無 E2E；行為由 Task 2 的 E2E 覆蓋。）

- [ ] **Step 7: commit**

```bash
git add frontend/src/lib/txDraft.ts frontend/src/lib/txDraft.test.ts frontend/src/components/TransactionSheet.tsx
git commit -m "feat: TransactionSheet 交易記帳底部 Sheet + resolveDefaultSub 純函式 (Phase 4 Task 1)"
```

---

### Task 2: `LedgerPage` 單日列表 + FAB + App 接線 + E2E

**Files:**
- Create: `frontend/src/pages/LedgerPage.tsx`
- Modify: `frontend/src/App.tsx`（`tab === 'daily'` 改渲染 `LedgerPage`）
- Create: `frontend/src/e2e/transactions.spec.ts`

**Interfaces:**
- Consumes: `useDayTransactions`（`hooks/useTransactions`）、`TransactionSheet`（Task 1）、`getCategories`、`T`/`Icon`/`fmt`、`Transaction`。
- Produces: `LedgerPage`（props：`date: string`、`onDateChange: (d: string) => void`）。

- [ ] **Step 1: 實作 `LedgerPage.tsx`**

```ts
export function LedgerPage({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }): JSX.Element
```

內容：
1. **日期標頭**：顯示 `date`，左右各一顆「前一天／後一天」箭頭（用 `Icon`），點擊以 `onDateChange` 調整（日期加減用純字串→Date→字串，注意本地時區，可重用 App 的 `toLocalDateString` 邏輯，於本檔內置一份同名 helper）。今天則標示「今天」。
2. **當日交易列表**：`const { transactions, loading } = useDayTransactions(date)`。
   - `loading` → 顯示「載入中⋯」。
   - 空 → 空狀態「本日尚無記帳，點右下＋新增」。
   - 每列：以 `getCategories()` 對 `categoryId` 取得類別（icon/color/name）；顯示 icon 圓底 + 一級名（若 `subId` 有值，取該類別 subs 內對應 name 顯示為次要標籤）+ 收/支標籤 + 備註（若有）+ 金額（`fmt`，支出以紅、收入以綠或依 tokens）+ 同步狀態小點（`syncStatus`）。整列可點 → 開 `TransactionSheet` 編輯該筆（`editing={tx}`）。
   - 列表可加當日小計（收入合計 / 支出合計）。
3. **FAB**：右下角浮動圓鈕「＋」（`position: fixed`，`bottom` 預留 tab bar，`right: 16`，`aria-label="新增交易"`）。點擊 → 開 `TransactionSheet`（`editing={null}`, `date={date}`）。
4. **Sheet 狀態**：`const [sheet, setSheet] = useState<{ editing: Transaction | null } | null>(null)`；開啟時渲染 `<TransactionSheet date={date} editing={sheet.editing} onClose={() => setSheet(null)} onSaved={() => setSheet(null)} />`。（`onSaved` 關閉即可，列表由 `useDayTransactions` 即時更新。）

- [ ] **Step 2: App 接線** — `frontend/src/App.tsx`

import `LedgerPage`（`import { LedgerPage } from './pages/LedgerPage'`）。`tab === 'daily'` 區塊由：
```tsx
<DailyEntryPage date={dailyDate} onDateChange={setDailyDate} onSync={syncAll} syncing={syncing} />
```
改為：
```tsx
<LedgerPage date={dailyDate} onDateChange={setDailyDate} />
```
> 保留 `DailyEntryPage.tsx` 檔案不刪（Phase 5 前的後備參考）；若 `DailyEntryPage` import 變成未使用導致 lint/tsc noUnusedLocals 報錯，移除該 import 行即可（其餘不動）。`handleSelectDate`/Dashboard 導到 'daily' 仍有效（改為進 LedgerPage）。

- [ ] **Step 3: E2E** — `frontend/src/e2e/transactions.spec.ts`

先讀既有 `frontend/e2e/subcategories.spec.ts` 沿用 pattern（idempotent 種子 `mpos_onboarded`+`mpos_categories`、`navTab` 限定 `<nav>` 精確、baseURL 已含 base）。種子的 `mpos_categories` 讓「雜支」帶一個 `subs:[{id:'gas',name:'瓦斯費'}]` 且 `defaultSubId:'gas'`，以測預設二級帶入。測試流程（`page.on('pageerror')` 收集斷言為空）：
1. 進「記帳」tab → 點 FAB（`aria-label="新增交易"`）→ Sheet 出現。
2. 選「支出」→ 選類別「雜支」→ 斷言二級「瓦斯費」已被選中（預設帶入）。
3. 填金額 100 → 儲存 → Sheet 關閉 → 列表出現一列含「雜支」「瓦斯費」「100」。
4. 點 FAB → 選「收入」→ 選「現金」→ 金額 500 →「儲存並繼續」→ 斷言 Sheet **仍開著**且金額已清空 → 再填 300 → 儲存 → 列表含 500 與 300 兩列收入。
5. 點「雜支 100」那列 → 編輯 Sheet 開 → 改金額 150 → 儲存 → 列表該列顯示 150。
6. 編輯任一列 → 點「刪除」→ 該列從列表消失。
7. `page.reload()` → 回「記帳」tab → 斷言剩餘交易仍在（Dexie 持久化）。

> 若既有元素難定位可在 `LedgerPage`/`TransactionSheet` 補最小 `aria-label`（Task 1 已規劃部分）。不為測試改動視覺版面。

- [ ] **Step 4: 全門檻**

Run: `cd frontend && npx tsc --noEmit`（無錯）
Run: `cd frontend && npm test`（Vitest：15 + 5 新 = 20 全綠）
Run: `cd frontend && npm run build`（成功）
Run: `cd frontend && npm run test:e2e`（Playwright：smoke 2 + subcategories 1 + transactions 新測全綠）

- [ ] **Step 5: commit**

```bash
git add frontend/src/pages/LedgerPage.tsx frontend/src/App.tsx frontend/e2e/transactions.spec.ts
git commit -m "feat: LedgerPage 單日逐筆列表 + FAB 記帳 + E2E，記帳 tab 改用交易 (Phase 4 Task 2)"
```

---

### Task 3: 文件更新（guardrail 5b）

**Files:**
- Modify: `CLAUDE.md`、`AGENTS.md`（PROJECT STRUCTURE 加 `TransactionSheet.tsx`/`LedgerPage.tsx`/`txDraft.ts`；Development Status Phase 4；KEY IMPLEMENTATION NOTES 記記帳流程）
- Modify: `README.md`（開發歷程 Phase 4）

- [ ] **Step 1: CLAUDE.md / AGENTS.md**

PROJECT STRUCTURE 樹補三個新檔。Development Status「第 2 次優化」把 Phase 4 標完成、說明「記帳改逐筆交易（FAB + TransactionSheet + LedgerPage），寫入 `transactions`、自動帶入預設二級；⚠️ Dashboard/月結/雲端同步仍為 `DailyRecord`，待 Phase 5/6（見 D5）」。加一段記帳流程說明（`resolveDefaultSub` 帶入預設二級、金額正數 type 定方向）。

- [ ] **Step 2: README.md**

開發歷程加「Phase 4 — 逐筆交易記帳 UI（✅）」條列（FAB + 底部 Sheet + 單日列表 + 預設二級帶入 + E2E；註明分歧點 D5）。

- [ ] **Step 3: commit**

```bash
git add CLAUDE.md AGENTS.md README.md
git commit -m "docs: Phase 4 逐筆交易記帳 UI 落地 — 更新 CLAUDE/AGENTS/README"
```

---

## 完成準則（Definition of Done）
- [ ] `npm test` 全綠（20）、`npx tsc --noEmit` 無錯、`npm run build` 成功、`npm run test:e2e` 全綠。
- [ ] FAB 開 Sheet 可新增交易；選一級類別自動帶入有效的預設二級（dangling 視為無）。
- [ ] 「儲存並繼續」連續記帳；編輯可改可刪；列表即時更新且 reload 後持久。
- [ ] `記帳` tab 改用 `LedgerPage`；Dashboard/月結/sync 未受影響（仍 `DailyRecord`）。
- [ ] 文件三份更新。

## 下一步（非本期）
- **Phase 5**：帳目頁月曆 + 落地頁/導覽調整 + **月份分頁 Transaction 新格式讀寫 + 舊格式偵測改寫 + Drive 備份 + `Transaction.id` 對帳**（D4 移入）。
- **Phase 6**：Dashboard / 月結改用 Transaction 重算。
