# 移除首頁（Dashboard）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除「首頁」tab，把它獨有的「扣分潤後淨額」與「外送佔比洞察」搬進帳目頁單日小計區，bump 2.2.0。

**Architecture:** 純函式（`dayFeesFromTx`/`dayFeeRatio`）進 `lib/aggregate.ts` 供 `LedgerPage` 小計區使用；`App.tsx` 導覽減為三 tab 並刪除 `DashboardPage.tsx`；E2E 斷言隨之改寫。無資料模型變更。

**Tech Stack:** React + Vite + TypeScript、Vitest（單元）、Playwright（E2E）、inline styles + `lib/tokens.ts`。

**Spec:** `docs/superpowers/specs/2026-07-14-remove-dashboard-design.md`

## Global Constraints

- 關鍵業務邏輯一律加**繁體中文註解**（CLAUDE.md 規範）。
- 禁止建 `enhanced_`/`v2_` 等重複檔案；一律擴充既有檔案。
- 版本單一事實來源 = `frontend/package.json` 的 `version`，本計畫 bump 至 `2.2.0`。
- 所有指令在 `frontend/` 下執行：`npm test`（Vitest）、`npx tsc --noEmit`、`npm run test:e2e`（Playwright）、`npm run build`。
- 未知 `categoryId`（同步帶入的陌生類別）**不計**平台費與外送佔比分子（防污染原則）。
- 每個 Task 完成即 commit（`feat/fix/docs/refactor: 描述`）。

## 檔案地圖

| 檔案 | 動作 | 職責 |
|---|---|---|
| `frontend/src/lib/aggregate.ts` | Modify | 新增純函式 `dayFeesFromTx`、`dayFeeRatio` |
| `frontend/src/lib/aggregate.test.ts` | Modify | 兩個新函式的 Vitest |
| `frontend/src/pages/LedgerPage.tsx` | Modify | 小計區兩卡→三卡＋洞察卡 |
| `frontend/src/App.tsx` | Modify | 導覽三 tab、移除 dashboard 分支 |
| `frontend/src/pages/DashboardPage.tsx` | **Delete** | 已無引用 |
| `frontend/e2e/smoke.spec.ts` | Modify | 移除首頁斷言 |
| `frontend/e2e/transactions.spec.ts` | Modify | Phase 7 案例改斷言小計淨額卡＋洞察卡 |
| `frontend/package.json` | Modify | version 2.2.0 |
| `CLAUDE.md` | Modify | 結構/導覽/版本描述 |
| `AGENTS.md` | Modify | 與 CLAUDE.md 內容同步維護的第二份指令文件（僅標題/對象行不同），同步套用相同編輯 |

---

### Task 1: 純函式 `dayFeesFromTx` / `dayFeeRatio`（TDD）

**Files:**
- Modify: `frontend/src/lib/aggregate.ts`
- Test: `frontend/src/lib/aggregate.test.ts`

**Interfaces:**
- Consumes: `Transaction`、`Category` 型別（`frontend/src/types/index.ts`；`Category.fee?: number` 為 0–1 小數）
- Produces:
  - `dayFeesFromTx(txs: Transaction[], categories: Category[]): number` — 當日平台費合計
  - `dayFeeRatio(txs: Transaction[], categories: Category[]): number` — fee>0 類別收入佔總收入比（0–1）
  - Task 2 的 `LedgerPage` 會 import 這兩個函式。

**設計決策（跟 Dashboard 原內聯邏輯的差異，皆為刻意）：**
1. 不過濾 `enabled`——停用類別的歷史交易照樣計費（錢已被抽走）。
2. `dayFeeRatio` 分母 = 全部收入交易合計（含未知 categoryId），與 LedgerPage 現有 `totalIncome` 一致；分子只計已知 fee>0 類別。

- [ ] **Step 1: 在 `aggregate.test.ts` 追加失敗測試**

在既有 `import` 區改為同時引入新函式與 `Category` 型別，檔尾追加兩個 describe：

```ts
// import 區改為：
import { buildDailyRecordsFromTx, dayFeesFromTx, dayFeeRatio } from './aggregate'
import type { Transaction, Category } from '../types'

// 檔尾追加：
const cat = (over: Partial<Category>): Category => ({
  id: 'cash', name: '現金', icon: 'cash', color: 'mint', enabled: true, type: 'income', ...over,
})

describe('dayFeesFromTx', () => {
  const cats = [
    cat({ id: 'cash', fee: 0 }),
    cat({ id: 'uber',  name: 'Uber Eats', fee: 0.30 }),
    cat({ id: 'panda', name: 'foodpanda', fee: 0.35 }),
    cat({ id: 'food',  name: '食材採購', type: 'expense' }),
  ]
  it('收入交易金額 × 類別 fee 加總（多 fee 類別）', () => {
    expect(dayFeesFromTx([
      tx({ categoryId: 'uber',  amount: 1000 }),
      tx({ categoryId: 'panda', amount: 200 }),
      tx({ categoryId: 'cash',  amount: 500 }),
    ], cats)).toBeCloseTo(1000 * 0.30 + 200 * 0.35)
  })
  it('支出交易不計費（即使 categoryId 撞名 fee 類別）', () => {
    expect(dayFeesFromTx([tx({ type: 'expense', categoryId: 'uber', amount: 100 })], cats)).toBe(0)
  })
  it('無 fee>0 類別 → 0', () => {
    expect(dayFeesFromTx([tx({ categoryId: 'cash', amount: 999 })], [cat({ id: 'cash', fee: 0 })])).toBe(0)
  })
  it('未知 categoryId 不計費', () => {
    expect(dayFeesFromTx([tx({ categoryId: '外星收入', amount: 1000 })], cats)).toBe(0)
  })
  it('停用的 fee 類別照樣計費（歷史交易的錢已被抽走）', () => {
    expect(dayFeesFromTx([tx({ categoryId: 'uber', amount: 100 })],
      [cat({ id: 'uber', fee: 0.30, enabled: false })])).toBeCloseTo(30)
  })
  it('空交易 → 0', () => {
    expect(dayFeesFromTx([], cats)).toBe(0)
  })
})

describe('dayFeeRatio', () => {
  const cats = [
    cat({ id: 'cash', fee: 0 }),
    cat({ id: 'uber', name: 'Uber Eats', fee: 0.30 }),
  ]
  it('fee 類別收入佔總收入比', () => {
    expect(dayFeeRatio([
      tx({ categoryId: 'uber', amount: 400 }),
      tx({ categoryId: 'cash', amount: 600 }),
    ], cats)).toBeCloseTo(0.4)
  })
  it('總收入為 0（只有支出）→ 0', () => {
    expect(dayFeeRatio([tx({ type: 'expense', categoryId: 'food', amount: 100 })], cats)).toBe(0)
  })
  it('全為 fee 類別收入 → 1', () => {
    expect(dayFeeRatio([tx({ categoryId: 'uber', amount: 100 })], cats)).toBe(1)
  })
  it('未知 categoryId 收入進分母、不進分子', () => {
    expect(dayFeeRatio([
      tx({ categoryId: 'uber', amount: 500 }),
      tx({ categoryId: '外星收入', amount: 500 }),
    ], cats)).toBeCloseTo(0.5)
  })
  it('停用的 fee 類別仍計入分子（與 dayFeesFromTx 的 enabled 政策一致）', () => {
    expect(dayFeeRatio([
      tx({ categoryId: 'uber', amount: 400 }),
      tx({ categoryId: 'cash', amount: 600 }),
    ], [cat({ id: 'cash', fee: 0 }), cat({ id: 'uber', name: 'Uber Eats', fee: 0.30, enabled: false })]))
      .toBeCloseTo(0.4)
  })
  it('空交易 → 0', () => {
    expect(dayFeeRatio([], cats)).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npm test -- aggregate`
Expected: FAIL — `dayFeesFromTx is not a function`（或 import 錯誤）

- [ ] **Step 3: 在 `aggregate.ts` 實作**

`import type` 行改為 `import type { Transaction, DailyRecord, Category } from '../types'`，檔尾追加：

```ts
// 當日平台手續費合計：收入交易金額 × 所屬一級類別 fee（只計 fee>0 的收入類別）。
// 未知 categoryId 不計費；不過濾 enabled——停用類別的歷史交易照樣計費（錢已被平台抽走）。
export function dayFeesFromTx(txs: Transaction[], categories: Category[]): number {
  const feeById = new Map(
    categories.filter(c => c.type === 'income' && (c.fee ?? 0) > 0).map(c => [c.id, c.fee!]),
  )
  const total = txs.reduce(
    (s, t) => t.type === 'income' ? s + t.amount * (feeById.get(t.categoryId) ?? 0) : s, 0)
  return Math.max(0, total)  // 金額不變式為正數，此為防禦
}

// fee>0 類別收入佔當日總收入比例（0–1）：分母為全部收入交易（含未知 categoryId，
// 與 LedgerPage 小計一致）、分子只計已知 fee>0 類別；總收入為 0 回傳 0。
export function dayFeeRatio(txs: Transaction[], categories: Category[]): number {
  const feeIds = new Set(
    categories.filter(c => c.type === 'income' && (c.fee ?? 0) > 0).map(c => c.id),
  )
  let feeIncome = 0
  let totalIncome = 0
  for (const t of txs) {
    if (t.type !== 'income') continue
    totalIncome += t.amount
    if (feeIds.has(t.categoryId)) feeIncome += t.amount
  }
  return totalIncome > 0 ? feeIncome / totalIncome : 0
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && npm test -- aggregate`
Expected: PASS（既有 `buildDailyRecordsFromTx` 4 案例 + 新 12 案例全綠）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/aggregate.ts frontend/src/lib/aggregate.test.ts
git commit -m "feat: dayFeesFromTx/dayFeeRatio 純函式（帳目頁扣分潤淨額前置）"
```

---

### Task 2: LedgerPage 小計三卡＋外送佔比洞察卡

**Files:**
- Modify: `frontend/src/pages/LedgerPage.tsx`（小計區約在 165–181 行）

**Interfaces:**
- Consumes: Task 1 的 `dayFeesFromTx(txs, categories)`、`dayFeeRatio(txs, categories)`；既有 `transactions`（`useDayTransactions(date)`）、`cats`（`getCategories()`）、`totalIncome`/`totalExpense`、`fmt(n, { plus?: boolean })`、tokens `T.sunSoft/T.peachSoft/T.peachInk/T.ink/T.ink2`、`Icon name="sparkle"`。
- Produces: UI 文字「淨額（扣分潤）」／「淨額」與「外送佔比偏高」——Task 4 的 E2E 斷言依賴這些字串，不可改字。

- [ ] **Step 1: 加 import**

第 5 行 `useDayTransactions` import 之後（或併入既有 lib import 區）加：

```ts
import { dayFeesFromTx, dayFeeRatio } from '../lib/aggregate'
```

- [ ] **Step 2: 替換小計區塊**

把現有整段（含註解 `{/* 當日小計：收入/支出各自加總 */}` 到其收尾 `)}`，即「收入合計/支出合計」兩卡的 `{!loading && transactions.length > 0 && ( ... )}`）替換為：

```tsx
      {/* 當日小計：收入/支出/淨額（扣分潤）三張卡 + 外送佔比洞察（自移除的首頁搬入，適用任一選定日） */}
      {!loading && transactions.length > 0 && (() => {
        const fees = dayFeesFromTx(transactions, cats)
        const netAfterFees = totalIncome - totalExpense - fees
        const feeRatio = dayFeeRatio(transactions, cats)
        // 有任何 fee>0 收入類別時 label 標示「扣分潤」；fee 類別名稱清單供洞察卡文案
        const feeCatNames = cats.filter(c => c.type === 'income' && (c.fee ?? 0) > 0).map(c => c.name)
        return (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: T.mintSoft, borderRadius: T.r.lg, padding: '12px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.mintInk }}>收入合計</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.mintInk, fontFamily: T.font.num, marginTop: 2 }}>
                  {fmt(totalIncome)}
                </div>
              </div>
              <div style={{ flex: 1, background: T.coralSoft, borderRadius: T.r.lg, padding: '12px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.coralInk }}>支出合計</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.coralInk, fontFamily: T.font.num, marginTop: 2 }}>
                  {fmt(totalExpense)}
                </div>
              </div>
              {/* 深色卡=當日結論（扣分潤實收），與月曆格毛額刻意不同（Phase 7 既有決策） */}
              <div style={{ flex: 1, background: T.ink, borderRadius: T.r.lg, padding: '12px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
                  {feeCatNames.length > 0 ? '淨額（扣分潤）' : '淨額'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: T.font.num, marginTop: 2 }}>
                  {fmt(netAfterFees, { plus: true })}
                </div>
              </div>
            </div>

            {/* 外送佔比洞察：fee>0 類別收入佔比 > 40% 才顯示（沿用原首頁文案，改「當日」措辭） */}
            {feeRatio > 0.4 && feeCatNames.length > 0 && (
              <div style={{ padding: 14, borderRadius: T.r.lg, background: `linear-gradient(135deg, ${T.sunSoft} 0%, ${T.peachSoft} 100%)`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: '#fff', color: T.peachInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="sparkle" size={16} stroke={2.4} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>外送佔比偏高</div>
                  <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
                    {feeCatNames.join('、')} 合計佔當日收入 {Math.round(feeRatio * 100)}%，
                    已扣手續費 {fmt(fees)}，建議多推內用方案提升毛利。
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}
```

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 4: 手動驗證（dev server）**

Run: `cd frontend && npm run dev` → 開 `http://localhost:5173`
確認：帳目頁有交易的日子顯示三張小計卡；新增一筆 Uber Eats 收入讓外送佔比 >40% 時洞察卡出現。（無法開瀏覽器的環境可跳過，Task 4 的 E2E 會覆蓋同樣行為。）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LedgerPage.tsx
git commit -m "feat: 帳目頁小計加淨額（扣分潤）卡與外送佔比洞察（首頁指標搬家）"
```

---

### Task 3: App.tsx 移除首頁 tab、刪除 DashboardPage.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: 無（純移除）。
- Produces: 導覽只剩 帳目/月結/設定；`Tab` 型別為 `'daily' | 'monthly' | 'settings'`。Task 4 E2E 依賴 nav 內只有三個 tab 按鈕。

- [ ] **Step 1: App.tsx 移除 dashboard**

依序修改（皆在 `frontend/src/App.tsx`）：

1. 刪除第 2 行 `import { DashboardPage } from './pages/DashboardPage'`
2. 第 13 行 `Tab` 型別改為：

```ts
type Tab = 'daily' | 'monthly' | 'settings'
```

3. `NAV_ITEMS`（第 23–29 行）改為：

```ts
// 導覽順序：帳目（落地頁，月曆＋逐筆列表）→ 月結 → 設定（首頁已於 2.2.0 移除，指標併入帳目頁小計）
const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'daily',    label: '帳目', icon: 'calendar' },
  { id: 'monthly',  label: '月結', icon: 'chart'    },
  { id: 'settings', label: '設定', icon: 'settings' },
]
```

4. 刪除 `handleNavigate`（第 69–70 行，含註解——唯一用途是首頁「編輯今日帳目」按鈕）
5. 刪除渲染分支（第 94–96 行）：

```tsx
        {tab === 'dashboard' && (
          <DashboardPage onNavigate={handleNavigate} syncing={syncing} />
        )}
```

- [ ] **Step 2: 刪除 DashboardPage.tsx**

```bash
git rm frontend/src/pages/DashboardPage.tsx
```

- [ ] **Step 3: 型別檢查 + 單元測試**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: 皆綠（若 tsc 報 `DashboardPage` 引用殘留，回 Step 1 檢查漏刪）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: 移除首頁 tab 與 DashboardPage（導覽減為帳目/月結/設定）"
```

---

### Task 4: E2E 更新（smoke + transactions）

**Files:**
- Modify: `frontend/e2e/smoke.spec.ts`
- Modify: `frontend/e2e/transactions.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 UI 字串「淨額（扣分潤）」「外送佔比偏高」；Task 3 的三 tab 導覽；種子類別 `uber`（Uber Eats, fee 0.30）。

- [ ] **Step 1: smoke.spec.ts 改寫**

1. 檔頭註解（第 3 行）「四個 tab」→「三個 tab」。
2. 第 14–15 行 `navTab` 註解改為：

```ts
// 底部導覽的 tab 按鈕：限定在 <nav> 內並精確比對，避免和頁面內含相同文字的按鈕衝突。
```

3. 第一個 test：刪除 `await expect(navTab(page, '首頁')).toBeVisible()`（原第 34 行）。
4. 第二個 test：刪除「首頁（Dashboard）」區塊（原第 49–51 行的註解 + `navTab(page, '首頁').click()` + Hero 斷言）。其餘（帳目/月結/設定/切回帳目）不動。

- [ ] **Step 2: transactions.spec.ts 改寫 Phase 7 案例**

1. 檔頭註解第 8–9 行改為：

```ts
// 另含案例：在「帳目」FAB 新增交易後，斷言小計「淨額（扣分潤）」與洞察卡（帳目頁內），
// 並切到「月結」斷言經 buildDailyRecordsFromTx 重算反映（2.2.0 起首頁已移除）。
```

2. 原 `test('Phase 7：帳目新增交易後，首頁與月結皆反映該筆（transactions 重算）', ...)`（第 165–193 行）整個替換為：

```ts
test('帳目新增交易後，小計淨額（扣分潤）／洞察卡／月結皆反映（transactions 重算）', async ({ page }) => {
  const errors = collectPageErrors(page)

  await page.goto('/')

  // 落地頁即「帳目」→ 用 FAB 新增一筆今日收入「現金 1234」（無手續費，金額用好辨識的數字）
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await page.getByRole('button', { name: '收入', exact: true }).click()
  await page.getByRole('button', { name: '類別 現金' }).click()
  await page.getByLabel('金額', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()
  await expect(txRow(page, '現金', '1,234')).toBeVisible()

  // 小計三張卡（原首頁指標搬入帳目頁）：現金無手續費 → 淨額（扣分潤）= +$1,234
  // 種子含 fee>0 類別（Uber Eats/foodpanda）→ label 帶「扣分潤」字樣
  await expect(page.getByText('收入合計')).toBeVisible()
  await expect(page.getByText('支出合計')).toBeVisible()
  await expect(page.getByText('淨額（扣分潤）')).toBeVisible()
  await expect(page.getByText('+$1,234')).toBeVisible()
  // 外送佔比 0% → 洞察卡不出現
  await expect(page.getByText('外送佔比偏高')).toHaveCount(0)

  // 再新增「Uber Eats 1000」（fee 30%）→ 淨額 = 2234 − 300 = +$1,934；
  // 外送佔比 1000/2234 ≈ 45% > 40% → 洞察卡出現
  await page.getByRole('button', { name: '新增交易' }).click()
  await expect(page.getByText('新增交易').last()).toBeVisible()
  await page.getByRole('button', { name: '收入', exact: true }).click()
  await page.getByRole('button', { name: '類別 Uber Eats' }).click()
  await page.getByLabel('金額', { exact: true }).fill('1000')
  await page.getByRole('button', { name: '儲存', exact: true }).click()
  await expect(page.getByText('新增交易').last()).toBeHidden()
  await expect(page.getByText('+$1,934')).toBeVisible()
  await expect(page.getByText('外送佔比偏高')).toBeVisible()

  // 切到「月結」→ 本月「總收入」（經 buildDailyRecordsFromTx 重算）含 1234 + 1000 = $2,234
  await navTab(page, '月結').click()
  const totalIncomeStat = page.locator('div')
    .filter({ hasText: '總收入' })
    .filter({ hasNotText: '總支出' })
    .first()
  await expect(totalIncomeStat).toContainText('$2,234')

  expect(errors).toEqual([])
})
```

- [ ] **Step 3: 跑 E2E**

Run: `cd frontend && E2E_PORT=5174 npm run test:e2e`
（本機同時存在 main checkout 與本 worktree，固定用 `E2E_PORT` 避免 `playwright.config.ts` 的
`reuseExistingServer` 連到另一個 checkout 佔用 5173 的舊 server 而測到舊程式碼假綠。）
Expected: 全綠（smoke 2 + transactions 4 + 其他既有 spec）。若環境缺瀏覽器先 `npx playwright install chromium`。

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/smoke.spec.ts frontend/e2e/transactions.spec.ts
git commit -m "fix: E2E 改斷言帳目頁小計淨額卡與洞察卡（首頁已移除）"
```

---

### Task 5: 版本 bump 2.2.0 + CLAUDE.md + AGENTS.md + memory + 全量驗證

**Files:**
- Modify: `frontend/package.json`（`"version": "2.1.0"` → `"2.2.0"`）
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`（與 `CLAUDE.md` 內容同步維護，僅標題「CLAUDE.md」→「AGENTS.md」與「Claude Code」→「Codex」兩行不同，其餘逐字相同——同一份編輯套用兩次）
- Modify: `/home/rex/.claude/projects/-mnt-c-IdeaProjects-Ready-mPOS/memory/`（memory 檔，不進 repo commit）

**Interfaces:**
- Consumes: 前四個 Task 全部完成。

- [ ] **Step 1: bump 版本**

`frontend/package.json` 第 4 行改為 `"version": "2.2.0",`

- [ ] **Step 2: 更新 CLAUDE.md 與 AGENTS.md（同步套用相同編輯）**

以下 1–5 對 `CLAUDE.md` 與 `AGENTS.md` 各做一次（兩檔內容逐字相同，僅檔頭標題/對象行不同，其餘行號一致）：

1. 檔頭 `> **Last Updated**: 2026-07-14`、`> **App Version**: 2.2.0`
2. 「版本號規則」的現況行改為：`**目前 = \`2.2.0\`**（移除首頁、指標併入帳目頁 → MINOR）。`
3. Development Status 加一條：

```markdown
- **移除首頁（2.2.0）**: ✅ 「首頁」tab 移除（導覽剩 帳目/月結/設定），獨有指標搬進帳目頁單日小計：第三張「淨額（扣分潤）」卡（`lib/aggregate.ts` 純函式 `dayFeesFromTx`/`dayFeeRatio`，Vitest 覆蓋）＋外送佔比 >40% 洞察卡，適用任一選定日。`DashboardPage.tsx` 已刪除。spec：`docs/superpowers/specs/2026-07-14-remove-dashboard-design.md`。
```

4. 專案結構：刪 `DashboardPage.tsx` 條目；`aggregate.ts` 描述補「＋ dayFeesFromTx/dayFeeRatio（帳目頁扣分潤淨額/外送佔比，2.2.0）」。
5. Phase 6 段落「導覽順序 帳目 / 首頁 / 月結 / 設定」補註「（2.2.0 起移除首頁，剩 帳目/月結/設定）」；Phase 7 段落 Dashboard 敘述句尾補「（Dashboard 已於 2.2.0 移除，`buildDailyRecordsFromTx` 仍為月結所用）」。

完成後 `diff CLAUDE.md AGENTS.md` 應只剩原本就有的兩行標題/對象差異，確認未漏改其中一份。

- [ ] **Step 3: 更新 memory**

更新 `/home/rex/.claude/projects/-mnt-c-IdeaProjects-Ready-mPOS/memory/future-analytics-reports.md`：補記 2026-07-14 決策——首頁移除（使用者確認打開 App 只為記帳/看帳目）、扣分潤淨額與外送洞察併入帳目頁、2.2.0。`MEMORY.md` 索引行 hook 同步更新。

- [ ] **Step 4: 全量驗證**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: 全綠、build 成功（production build 不在此部署，僅驗證可建）

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json CLAUDE.md AGENTS.md
git commit -m "feat: 移除首頁收尾 — bump 2.2.0 + 文檔更新"
```

---

### Task 6: 推分支 + Draft PR

分支已於規劃階段從 `worktree-remove-dashboard` 更名為 `feature/remove-dashboard`
（對齊 CLAUDE.md「Git 分支流程」`feature/*` 命名慣例；更名時尚未推送到 origin，無需 force-push）。

- [ ] **Step 1: 推分支**

```bash
git push -u origin feature/remove-dashboard
```

- [ ] **Step 2: 開 Draft PR**

PR body 用 `cat <<'EOF'` heredoc 組字串（本機為 WSL2 bash，非 PowerShell，此寫法可正常執行）：

```bash
gh pr create --draft --title "feat: 移除首頁，指標併入帳目頁（2.2.0）" --body "$(cat <<'EOF'
## Summary
- 移除「首頁」tab（導覽剩 帳目/月結/設定），刪除 DashboardPage.tsx
- 首頁獨有指標搬進帳目頁單日小計：第三張「淨額（扣分潤）」卡 + 外送佔比 >40% 洞察卡（適用任一選定日）
- 新純函式 lib/aggregate.ts: dayFeesFromTx / dayFeeRatio（Vitest 覆蓋）
- E2E 改斷言帳目頁小計與洞察卡；bump 2.2.0

Spec: docs/superpowers/specs/2026-07-14-remove-dashboard-design.md

## Test plan
- [ ] `npm test`（Vitest 全綠，含新 12 案例）
- [ ] `E2E_PORT=5174 npm run test:e2e`（smoke + transactions 全綠，固定 port 避免連到其他 checkout 的舊 server）
- [ ] `npm run build` 成功
- [ ] 本機 `npm run dev` 驗收：三 tab、小計三卡、Uber Eats 收入 >40% 時洞察卡

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

依專案 SOP，驗收與 `--no-ff` 併 main + tag `v2.2.0` 由使用者核准後進行，不在本計畫內。

---

## Self-Review 紀錄

- **Spec 覆蓋**：導覽/刪檔（Task 3）、指標搬家（Task 1–2）、E2E（Task 4）、版本/文檔（Task 5）✅。spec 提到「smoke 改驗三卡」——smoke 未種交易、小計不渲染，三卡斷言改放 transactions.spec（意圖一致，已在 Task 4 落實；spec §4 已同步改字，見下方外部審查一節）。
- **Placeholder**：無 TBD/「適當處理」；所有步驟含完整程式碼。
- **型別一致**：`dayFeesFromTx(txs, categories)`/`dayFeeRatio(txs, categories)` 於 Task 1 定義、Task 2 使用，簽名一致；E2E 字串「淨額（扣分潤）」「外送佔比偏高」與 Task 2 UI 一致。

## 外部審查修正紀錄（2026-07-16）

初版經 ChatGPT 審查後逐項對照現有 worktree 程式碼驗證，5 項屬實已修正、1 項核實後判定不成立：

- ✅ 分支名稱：spec 原定 `feature/remove-dashboard`，worktree 建立時實際分支為 `worktree-remove-dashboard`。未推送到 origin，已於規劃階段 `git branch -m` 更名為 `feature/remove-dashboard`；Task 6 Step 1 同步改推新名。
- ✅ AGENTS.md 漏更：確認 `CLAUDE.md`/`AGENTS.md` 為手動同步的兩份近乎逐字相同檔案（`diff` 僅標題/對象行不同），原 Task 5 只改前者。已將 AGENTS.md 併入 Task 5 檔案地圖、Step 2、Step 5 commit。
- ✅ smoke 三卡斷言與 spec 不符：確認 `smoke.spec.ts` 的 `beforeEach` 未種任何交易，小計區 `transactions.length > 0` 門檻不會渲染，三卡斷言確實只能放在有種資料的 `transactions.spec.ts`。已同步修正 spec §4（見下）。
- ✅ E2E port 衝突：確認 `playwright.config.ts` 已內建 `E2E_PORT` 機制（且註解明講本機同時有 main + worktree checkout 並行的風險），原 Task 4 Step 3 指令未使用。已改為 `E2E_PORT=5174 npm run test:e2e`。
- ✅ `dayFeeRatio` 缺停用類別回歸案例：確認 `dayFeesFromTx` 的 describe 有「停用的 fee 類別照樣計費」案例、`dayFeeRatio` 沒有對應案例，而實作本身也未過濾 `enabled`。已於 Task 1 補上對應測試（12 案例，原 11）。
- ❌ Task 6 heredoc 判定為 PowerShell 不相容、違反 AGENTS 禁用 cat 規範：**不成立，維持原寫法**。`uname -a` 確認本機為 WSL2 bash（非原生 PowerShell），`cat <<'EOF' ... EOF` heredoc 是建構多行字串給 `--body` 用，並非用 `cat` 讀取既有檔案——AGENTS.md 第 16 行禁用 `cat` 的規範針對的是「用 shell 指令讀檔取代 Read/Grep/Glob 工具」，兩者不是同一件事。若實際執行環境改為原生 Windows PowerShell（非 WSL），才需要換成 `gh pr create --body-file`。
