# Phase 5：月份分頁逐筆交易同步 + 舊格式改寫 + Drive 備份 + Transaction.id 對帳

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓雲端 Google Sheets 以「一列一筆交易」的新格式雙向同步 `transactions`，並在遇到舊彙總格式時先 Drive 備份再就地改寫，pull 時以 `Transaction.id` 去重對帳。

**Architecture:** 純函式（列⇄交易轉換、格式偵測、id 對帳）與網路層（Sheets/Drive API）分離；純函式 Vitest 全覆蓋，網路層靠純函式正確性 + 手動驗證清單（OAuth 無法 headless）。`syncAll` 從同步舊 `DailyRecord` 切換為同步 `transactions`。

**Tech Stack:** TypeScript、Dexie（`db.transactions`）、Google Sheets API v4、Drive API v3（`files.copy`）、Vitest。

## Global Constraints

- **🔴 真實資料保護（LOOP_STATE guardrail 9）**：分支 `AUTO_SHEET_NAME` 已隔離為測試試算表，本期**不得**改回正式名；任何「舊→新格式」改寫**之前**必須先 `backupSpreadsheet`（Drive `files.copy`，時間戳命名）成功才繼續；正式站 cutover 為硬停、不在本期。
- **絕不 checkout/merge/push `main`**；只在 `feature/line-item-transactions-redesign` commit，每 task 完成 `git push origin feature/line-item-transactions-redesign`。
- 新月份分頁表頭固定為 `日期 | 收支 | 一級類別 | 二級類別 | 金額 | 備註 | id`（`TX_MONTH_HEADERS`），不隨類別增減變動。
- 收支欄存中文「收入 / 支出」；一級/二級存**名稱**（人類可讀）；pull 時以名稱對回 `Category`，找不到對應者**保留原字串為 `categoryId`**（視為未知類別，不污染已知類別金額計算，沿用既有「未知欄位略過」精神），不得丟棄該筆。
- 金額一律正數；`subId` 為 `null` 表示無二級。
- 業務邏輯一律加**繁體中文**註解；commit 格式 `feat/fix/docs/refactor: ...`。
- 驗證門檻：`cd frontend && npx tsc --noEmit` exit 0、`npm test` 全綠、`npm run build` 成功。OAuth 相關以手動驗證清單覆蓋（本期不強制 E2E）。

## 範圍界定（決策 D7）

- **本期做**：`transactions` 的雲端雙向同步（新格式讀寫）、舊格式偵測 + Drive 備份 + 就地改寫、`Transaction.id` 去重對帳、`syncAll`/`restoreFromSheets` 切換到 `transactions`。
- **本期不做**（移 Phase 6/7）：月曆落地頁 + 導覽/落地頁（Phase 6）、Dashboard/月結改用 Transaction 重算（Phase 7）。這些是可 E2E 測的 UI，與 sync 資料層獨立。
- **接受開發期分歧**：Dashboard/月結仍讀舊 `DailyRecord`，本期把 `syncAll` 切走後它們暫時不再取得雲端更新——Phase 7 收斂；分支未併 main、cutover 硬停，安全。

## File Structure

- **Create** `frontend/src/lib/txSheets.ts` — 逐筆交易⇄Sheets 列的純函式 + 格式偵測 + id 對帳。
- **Create** `frontend/src/lib/txSheets.test.ts` — 上述純函式的 Vitest。
- **Modify** `frontend/src/lib/sheets.ts` — 抽出 `parseOldMonthRows`；新增 `TX_MONTH_HEADERS`、`pullAllTransactionsFromSheets`、`syncMonthTransactionsToSheets`、`backupSpreadsheet`；`SCOPES` 加 `drive.file`。
- **Modify** `frontend/src/hooks/useSyncService.ts` — `syncAll` / `restoreFromSheets` 改同步 `db.transactions`；舊格式改寫前先備份。
- **Modify** `CLAUDE.md` / `AGENTS.md` / `README.md` — 同步文檔（Phase 5 落地）。
- **Modify** `docs/superpowers/specs/2026-07-01-...-design.md` — 若有實作決策微調則回補。

**Interfaces（跨 task 共用簽名）：**
- `TxSeed = Omit<Transaction, 'localId'>` **已由 `lib/migrate.ts` export**（Phase 1）——**不得重複定義**，`txSheets.ts` 從 `./migrate` re-export 給 Task 3/4 用。
- `import type { Transaction, Category } from '../types'`。
- Phase 1 既有：`explodeDailyRecord(r: DailyRecord, makeId?, now?): TxSeed[]`（`lib/migrate.ts`）。

---

### Task 1: 交易→列 + 新格式偵測（純函式）

**Files:**
- Create: `frontend/src/lib/txSheets.ts`
- Test: `frontend/src/lib/txSheets.test.ts`

**Interfaces:**
- Produces:
  - `TX_MONTH_HEADERS: readonly string[]`（`['日期','收支','一級類別','二級類別','金額','備註','id']`）
  - `isNewTxFormat(header: string[]): boolean`
  - `txToRow(tx: Transaction | TxSeed, catById: Map<string, Category>): (string | number)[]`

- [ ] **Step 1: 先寫失敗測試**

```ts
import { describe, it, expect } from 'vitest'
import { TX_MONTH_HEADERS, isNewTxFormat, txToRow } from './txSheets'
import type { Category, Transaction } from '../types'

const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '雜項', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
  subs: [{ id: 's1', name: '瓦斯費' }], defaultSubId: null, ...over,
})
const catById = new Map<string, Category>([['c1', cat({})]])

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: 's1',
  amount: 300, note: '七月', syncStatus: 'PENDING', createdAt: 'x', updatedAt: 'x', ...over,
})

describe('isNewTxFormat', () => {
  it('新格式表頭（含 收支 + id）為 true', () => {
    expect(isNewTxFormat([...TX_MONTH_HEADERS])).toBe(true)
  })
  it('舊彙總表頭（日期/現金/總收入…）為 false', () => {
    expect(isNewTxFormat(['日期', '現金', '總收入', '總支出', '淨利'])).toBe(false)
  })
})

describe('txToRow', () => {
  it('依固定欄序輸出，收支轉中文、類別/二級轉名稱', () => {
    expect(txToRow(tx({}), catById)).toEqual(['2026-07-04', '支出', '雜項', '瓦斯費', 300, '七月', 't1'])
  })
  it('無二級（subId=null）二級欄為空字串', () => {
    expect(txToRow(tx({ subId: null }), catById)).toEqual(['2026-07-04', '支出', '雜項', '', 300, '七月', 't1'])
  })
  it('收入 type 轉「收入」', () => {
    expect(txToRow(tx({ type: 'income' }), catById)[1]).toBe('收入')
  })
  it('未知 categoryId 時一級欄保留原始 id 字串（不丟資料）', () => {
    expect(txToRow(tx({ categoryId: 'gone' }), catById)[2]).toBe('gone')
  })
  it('備註缺省輸出空字串', () => {
    expect(txToRow(tx({ note: undefined }), catById)[5]).toBe('')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/txSheets.test.ts`
Expected: FAIL（`txSheets` 尚未建立）

- [ ] **Step 3: 實作最小程式**

```ts
// frontend/src/lib/txSheets.ts
import type { Transaction, Category } from '../types'
import type { TxSeed } from './migrate'   // TxSeed 已由 Phase 1 migrate.ts 定義，勿重複宣告

export type { TxSeed }   // re-export 供 Task 3/4（sheets.ts / useSyncService）使用

// 新月份分頁固定表頭（一列一筆交易，不隨類別增減變動）
export const TX_MONTH_HEADERS = ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id'] as const

// 以表頭判斷是否為新逐筆格式：含「收支」與「id」兩欄即視為新格式，否則為舊彙總格式
export function isNewTxFormat(header: string[]): boolean {
  return header.includes('收支') && header.includes('id')
}

// 單筆交易 → Sheets 列（依 TX_MONTH_HEADERS 欄序）
// 一級/二級以名稱輸出（人類可讀）；找不到類別時保留原始 categoryId 字串，避免丟資料
export function txToRow(tx: Transaction | TxSeed, catById: Map<string, Category>): (string | number)[] {
  const cat = catById.get(tx.categoryId)
  const primaryName = cat?.name ?? tx.categoryId
  const subName = tx.subId ? (cat?.subs?.find(s => s.id === tx.subId)?.name ?? '') : ''
  return [
    tx.date,
    tx.type === 'income' ? '收入' : '支出',
    primaryName,
    subName,
    tx.amount,
    tx.note ?? '',
    tx.id,
  ]
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/txSheets.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: commit**

```bash
git add frontend/src/lib/txSheets.ts frontend/src/lib/txSheets.test.ts
git commit -m "feat: 逐筆交易→Sheets 列 + 新格式偵測純函式 (Phase 5 Task 1)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 2: 列→交易 + Transaction.id 對帳（純函式）

**Files:**
- Modify: `frontend/src/lib/txSheets.ts`
- Test: `frontend/src/lib/txSheets.test.ts`

**Interfaces:**
- Consumes: `TxSeed`（Task 1）、`Transaction`。
- Produces:
  - `rowToTx(row: string[], header: string[], catByName: Map<string, Category>, now: string): TxSeed | null`
  - `interface TxMergePlan { toAdd: TxSeed[]; toUpdate: { localId: number; seed: TxSeed }[] }`
  - `mergeTransactionsById(local: Transaction[], remote: TxSeed[]): TxMergePlan`

- [ ] **Step 1: 先寫失敗測試（追加到 txSheets.test.ts）**

```ts
import { rowToTx, mergeTransactionsById } from './txSheets'

const catByName = new Map<string, Category>([['雜項', cat({})]])
const H = ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id']

describe('rowToTx', () => {
  it('解析新格式列：名稱對回 id、收支轉 type、二級對回 subId', () => {
    const seed = rowToTx(['2026-07-04', '支出', '雜項', '瓦斯費', '300', '七月', 't1'], H, catByName, 'NOW')
    expect(seed).toEqual({
      id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: 's1',
      amount: 300, note: '七月', syncStatus: 'SYNCED', createdAt: 'NOW', updatedAt: 'NOW',
    })
  })
  it('二級名稱找不到 → subId=null', () => {
    expect(rowToTx(['2026-07-04', '支出', '雜項', '未知子', '300', '', 't2'], H, catByName, 'NOW')!.subId).toBeNull()
  })
  it('未知一級名稱 → categoryId 保留原始名稱字串（不丟資料）', () => {
    expect(rowToTx(['2026-07-04', '收入', '外星收入', '', '50', '', 't3'], H, catByName, 'NOW')!.categoryId).toBe('外星收入')
  })
  it('缺 id 或缺日期 → 回 null（略過該列）', () => {
    expect(rowToTx(['2026-07-04', '支出', '雜項', '', '300', '', ''], H, catByName, 'NOW')).toBeNull()
    expect(rowToTx(['', '支出', '雜項', '', '300', '', 't4'], H, catByName, 'NOW')).toBeNull()
  })
})

describe('mergeTransactionsById', () => {
  const local: Transaction[] = [
    { localId: 1, id: 'a', date: '2026-07-01', type: 'income', categoryId: 'c1', subId: null, amount: 10, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x' },
    { localId: 2, id: 'b', date: '2026-07-01', type: 'income', categoryId: 'c1', subId: null, amount: 20, syncStatus: 'PENDING', createdAt: 'x', updatedAt: 'x' },
  ]
  const seed = (id: string, amount: number): TxSeed => ({ id, date: '2026-07-01', type: 'income', categoryId: 'c1', subId: null, amount, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x' })

  it('雲端有、本機無 → toAdd', () => {
    const plan = mergeTransactionsById(local, [seed('c', 30)])
    expect(plan.toAdd.map(t => t.id)).toEqual(['c'])
    expect(plan.toUpdate).toEqual([])
  })
  it('本機 SYNCED 同 id → toUpdate（以雲端覆蓋）', () => {
    const plan = mergeTransactionsById(local, [seed('a', 99)])
    expect(plan.toAdd).toEqual([])
    expect(plan.toUpdate).toEqual([{ localId: 1, seed: seed('a', 99) }])
  })
  it('本機 PENDING 同 id → 保留本機、不動', () => {
    const plan = mergeTransactionsById(local, [seed('b', 99)])
    expect(plan.toAdd).toEqual([])
    expect(plan.toUpdate).toEqual([])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/txSheets.test.ts`
Expected: FAIL（`rowToTx` / `mergeTransactionsById` 未定義）

- [ ] **Step 3: 實作最小程式（追加到 txSheets.ts）**

```ts
// Sheets 列 → 交易 seed；名稱對回 Category id，找不到則保留原始名稱字串（未知類別，不丟資料）
// 缺 id 或缺日期視為無效列，回 null 讓呼叫端略過
export function rowToTx(
  row: string[], header: string[], catByName: Map<string, Category>, now: string,
): TxSeed | null {
  const g = (col: string) => row[header.indexOf(col)]
  const date = (g('日期') ?? '').trim()
  const id   = (g('id') ?? '').trim()
  if (!date || !id) return null

  const type: 'income' | 'expense' = g('收支') === '支出' ? 'expense' : 'income'
  const primaryName = (g('一級類別') ?? '').trim()
  const cat = catByName.get(primaryName)
  const categoryId = cat?.id ?? primaryName            // 未知一級 → 保留原名
  const subName = (g('二級類別') ?? '').trim()
  const subId = subName && cat ? (cat.subs?.find(s => s.name === subName)?.id ?? null) : null
  const note = (g('備註') ?? '').trim()

  return {
    id, date, type, categoryId, subId,
    amount: Number(g('金額')) || 0,
    note: note || undefined,
    syncStatus: 'SYNCED',
    createdAt: now,
    updatedAt: now,
  }
}

export interface TxMergePlan {
  toAdd: TxSeed[]
  toUpdate: { localId: number; seed: TxSeed }[]
}

// 以 Transaction.id 去重對帳：雲端無對應 → 新增；本機 SYNCED 同 id → 以雲端覆蓋；本機 PENDING 同 id → 保留本機修改
export function mergeTransactionsById(local: Transaction[], remote: TxSeed[]): TxMergePlan {
  const byId = new Map(local.map(t => [t.id, t]))
  const toAdd: TxSeed[] = []
  const toUpdate: { localId: number; seed: TxSeed }[] = []
  for (const r of remote) {
    const l = byId.get(r.id)
    if (!l) toAdd.push(r)
    else if (l.syncStatus === 'SYNCED' && l.localId !== undefined) toUpdate.push({ localId: l.localId, seed: r })
  }
  return { toAdd, toUpdate }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/txSheets.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: commit**

```bash
git add frontend/src/lib/txSheets.ts frontend/src/lib/txSheets.test.ts
git commit -m "feat: Sheets 列→交易解析 + Transaction.id 去重對帳純函式 (Phase 5 Task 2)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 3: sheets.ts — 新格式讀寫 + 舊格式偵測 + Drive 備份

**Files:**
- Modify: `frontend/src/lib/sheets.ts`

**Interfaces:**
- Consumes: `txToRow` / `rowToTx` / `isNewTxFormat` / `TX_MONTH_HEADERS` / `TxSeed`（Task 1–2）、`explodeDailyRecord`（`lib/migrate.ts`）。
- Produces:
  - `pullAllTransactionsFromSheets(spreadsheetId: string, categories: Category[]): Promise<{ seeds: TxSeed[]; oldFormatMonths: string[] }>`
  - `syncMonthTransactionsToSheets(spreadsheetId: string, month: string, txs: (Transaction|TxSeed)[], categories: Category[]): Promise<void>`
  - `backupSpreadsheet(spreadsheetId: string): Promise<string>`（回傳備份檔 id）
  - `parseOldMonthRows(rows: string[][], categories: Category[]): DailyRecord[]`（自 `pullAllFromSheets` 抽出）

> 說明：本 task 為網路整合層，無法 headless E2E。正確性由 Task 1–2 純函式保證 + 下方手動驗證清單。tsc/build 為硬門檻。

- [ ] **Step 1: 抽出 `parseOldMonthRows`（純資料轉換，供舊格式共用）**

把 `pullAllFromSheets` 迴圈內「單月 rows → DailyRecord[]」的解析邏輯抽成獨立函式 `parseOldMonthRows(rows, categories)`（含未知欄位略過、項目備註反解析），並讓 `pullAllFromSheets` 改呼叫它（行為不變）。

```ts
// 舊彙總格式：單一月份分頁 rows → DailyRecord[]（沿用既有解析：未知欄位略過、項目備註反解析）
export function parseOldMonthRows(rows: string[][], categories: Category[]): DailyRecord[] {
  const now = new Date().toISOString()
  const catByName = new Map(categories.map(c => [c.name, c]))
  const out: DailyRecord[] = []
  if (rows.length < 2) return out
  const header = rows[0]
  for (const row of rows.slice(1)) {
    const date = row[header.indexOf(COL_DATE)]
    if (!date) continue
    const incomes: Record<string, number> = {}
    const expenses: Record<string, number> = {}
    header.forEach((colName, i) => {
      if (FIXED_COLS.has(colName)) return
      const val = Number(row[i]) || 0
      if (val === 0) return
      const cat = catByName.get(colName)
      if (cat?.type === 'expense') expenses[cat.id] = val
      else if (cat) incomes[cat.id] = val
    })
    const incomeNotes: Record<string, string> = {}
    const expenseNotes: Record<string, string> = {}
    const rawItemNotes = (row[header.indexOf(COL_ITEM_NOTES)] ?? '').trim()
    if (rawItemNotes) {
      for (const part of rawItemNotes.split(';')) {
        const sep = part.indexOf(':')
        if (sep < 1) continue
        const catName = part.slice(0, sep).trim()
        const noteVal = part.slice(sep + 1).trim()
        if (!noteVal) continue
        const cat = catByName.get(catName)
        if (cat?.type === 'expense') expenseNotes[cat.id] = noteVal
        else if (cat) incomeNotes[cat.id] = noteVal
      }
    }
    out.push({
      date, incomes, expenses, incomeNotes, expenseNotes,
      notes: row[header.indexOf(COL_NOTES)] ?? '',
      syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    })
  }
  return out
}
```

- [ ] **Step 2: `SCOPES` 加入 Drive 寫入權限（備份用）**

`files.copy` 需要對「app 建立的檔案」的寫入權限。在 `SCOPES` 陣列加入 `'https://www.googleapis.com/auth/drive.file'`（試算表由本 app 經 `getOrCreateSpreadsheet` 建立，`drive.file` 即涵蓋）。⚠️ scope 變更需使用者**重新授權**（登出再登入）——記入手動驗證清單。

- [ ] **Step 3: `backupSpreadsheet`（Drive `files.copy`，時間戳命名）**

```ts
// 舊→新格式改寫前的安全備份：整份試算表複製一份（時間戳命名），回傳備份檔 id
export async function backupSpreadsheet(spreadsheetId: string): Promise<string> {
  const token = await acquireToken()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Ready-mPOS 備份 ${stamp}` }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`備份試算表失敗：${res.status} ${msg}`)
  }
  const data = (await res.json()) as { id: string }
  return data.id
}
```

- [ ] **Step 4: `pullAllTransactionsFromSheets`（偵測新/舊格式）**

```ts
import { TX_MONTH_HEADERS, isNewTxFormat, txToRow, rowToTx, type TxSeed } from './txSheets'
import { explodeDailyRecord } from './migrate'

// 讀所有月份分頁 → 交易 seeds；同時回報哪些分頁仍是舊格式（需改寫）
export async function pullAllTransactionsFromSheets(
  spreadsheetId: string, categories: Category[],
): Promise<{ seeds: TxSeed[]; oldFormatMonths: string[] }> {
  const token = await acquireToken()
  const titles = await getSheetTitles(spreadsheetId, token)
  const monthTabs = titles.filter(t => /^\d{4}-\d{2}$/.test(t))
  const catByName = new Map(categories.map(c => [c.name, c]))
  const now = new Date().toISOString()
  const seeds: TxSeed[] = []
  const oldFormatMonths: string[] = []

  for (const month of monthTabs) {
    const data = await sheetsGet<{ values?: string[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1:ZZ')}`, token,
    ).catch(() => ({ values: undefined }))
    const rows = data.values ?? []
    if (rows.length < 2) continue
    const header = rows[0]

    if (isNewTxFormat(header)) {
      for (const row of rows.slice(1)) {
        const seed = rowToTx(row, header, catByName, now)
        if (seed) seeds.push(seed)
      }
    } else {
      // 舊彙總格式：解析成 DailyRecord 再逐筆拆解為交易，並標記此月需改寫
      oldFormatMonths.push(month)
      for (const rec of parseOldMonthRows(rows, categories)) {
        for (const s of explodeDailyRecord(rec)) seeds.push(s)
      }
    }
  }
  return { seeds, oldFormatMonths }
}
```

- [ ] **Step 5: `syncMonthTransactionsToSheets`（新格式覆蓋寫）**

```ts
// 將某月所有交易以新格式整批覆蓋寫入（先 clear 再 put，天然去除筆數變動殘留）
export async function syncMonthTransactionsToSheets(
  spreadsheetId: string, month: string, txs: (Transaction | TxSeed)[], categories: Category[],
): Promise<void> {
  const token = await acquireToken()
  await ensureSheet(spreadsheetId, month, token)
  const catById = new Map(categories.map(c => [c.id, c]))
  const values: (string | number)[][] = [
    [...TX_MONTH_HEADERS],
    ...txs.map(t => txToRow(t, catById)),
  ]
  await sheetsValuesClear(spreadsheetId, month, token)
  await sheetsPut(
    `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1')}?valueInputOption=USER_ENTERED`,
    { range: `${month}!A1`, majorDimension: 'ROWS', values },
    token,
  )
}
```
（同時 `import type { Transaction } ...` 補進 sheets.ts 既有 type import。）

- [ ] **Step 6: 驗證編譯 / 建置**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 皆成功（無型別錯、build 綠）

- [ ] **Step 7: commit**

```bash
git add frontend/src/lib/sheets.ts
git commit -m "feat: Sheets 月份分頁逐筆交易新格式讀寫 + 舊格式偵測 + Drive 備份 (Phase 5 Task 3)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 4: useSyncService — syncAll/restore 切換到 transactions

**Files:**
- Modify: `frontend/src/hooks/useSyncService.ts`

**Interfaces:**
- Consumes: `pullAllTransactionsFromSheets` / `syncMonthTransactionsToSheets` / `backupSpreadsheet`（Task 3）、`mergeTransactionsById`（Task 2）、`db.transactions`。

> 網路整合層，無 headless E2E；靠 Task 1–2 純函式 + 手動驗證清單。tsc/build 為硬門檻。

- [ ] **Step 1: `syncAll` 的資料同步段改為 transactions**

保留既有 `_config` push/pull 與鎖 (`lockRef`) 邏輯不動；把「Phase 1 Pull / Phase 2 Push（dailyRecords）」整段替換為：

```ts
// ── Pull：Sheets → 本機 transactions（以 Transaction.id 去重對帳） ──
const { seeds, oldFormatMonths } = await pullAllTransactionsFromSheets(sheetId, categories)
const localTx = await db.transactions.toArray()
const plan = mergeTransactionsById(localTx, seeds)
if (plan.toAdd.length) await db.transactions.bulkAdd(plan.toAdd)
for (const u of plan.toUpdate) await db.transactions.update(u.localId, u.seed)

// ── 舊格式分頁需就地改寫成新格式：改寫前先 Drive 備份（🔴 資料保護，guardrail 9b） ──
const monthsToRewrite = new Set<string>(oldFormatMonths)

// ── Push：本機 PENDING 交易 → Sheets（連同需改寫的舊格式月份一起重寫） ──
const pendingTx = await db.transactions.where('syncStatus').equals('PENDING').toArray()
for (const m of pendingTx.map(t => t.date.slice(0, 7))) monthsToRewrite.add(m)

if (monthsToRewrite.size > 0) {
  if (oldFormatMonths.length > 0) {
    try {
      await backupSpreadsheet(sheetId)  // 改寫前備份，失敗則中止改寫（保護真實資料）
    } catch (err) {
      console.error('[sync] 備份失敗，跳過舊格式改寫：', err)
      oldFormatMonths.length = 0
      for (const m of oldFormatMonths) monthsToRewrite.delete(m)
    }
  }
  for (const month of monthsToRewrite) {
    const monthTx = await db.transactions.filter(t => t.date.startsWith(month)).sortBy('date')
    await syncMonthTransactionsToSheets(sheetId, month, monthTx, categories)
    await Promise.all(
      monthTx.filter(t => t.localId !== undefined)
             .map(t => db.transactions.update(t.localId!, { syncStatus: 'SYNCED' })),
    )
  }
}
```

> ⚠️ 備份失敗時**只跳過舊格式改寫**（避免無備份就動舊資料），但仍可推送本機 PENDING 到「本來就是新格式或不存在」的月份。實作時把 `oldFormatMonths` 的月份從 `monthsToRewrite` 移除後再進迴圈（上方示意；實作請用一個 `backedUp` 布林旗標控制，勿依賴清空陣列的副作用）。**實作者請改用清楚的旗標版本**，見 Step 2。

- [ ] **Step 2: 用明確旗標改寫備份保護（取代 Step 1 示意的副作用寫法）**

```ts
// 需要改寫的月份 = 舊格式月份 ∪ 有本機 PENDING 的月份
const oldSet = new Set(oldFormatMonths)
const pendingMonths = new Set(pendingTx.map(t => t.date.slice(0, 7)))

let allowOldRewrite = true
if (oldSet.size > 0) {
  try {
    await backupSpreadsheet(sheetId)     // 🔴 改寫舊格式前必須先成功備份
  } catch (err) {
    console.error('[sync] 備份失敗，本輪不改寫舊格式分頁：', err)
    allowOldRewrite = false
  }
}

// 🔴 備份失敗（allowOldRewrite=false）時，凡屬舊格式的月份一律排除——即使該月有本機 PENDING，
//    也不得在「無成功備份」下 clear+覆蓋舊格式分頁（否則毀掉使用者原始彙總資料）。
//    注意：v3 遷移把所有歷史交易標為 PENDING，故 cutover 時 pendingMonths ⊇ 全部歷史（舊格式）月份，
//    這個交集保護是資料保護紅線的主場景，不是邊角情境。
const monthsToRewrite = new Set<string>()
for (const m of pendingMonths) if (allowOldRewrite || !oldSet.has(m)) monthsToRewrite.add(m)
if (allowOldRewrite) for (const m of oldSet) monthsToRewrite.add(m)

for (const month of monthsToRewrite) {
  const monthTx = await db.transactions.filter(t => t.date.startsWith(month)).sortBy('date')
  await syncMonthTransactionsToSheets(sheetId, month, monthTx, categories)
  await Promise.all(
    monthTx.filter(t => t.localId !== undefined)
           .map(t => db.transactions.update(t.localId!, { syncStatus: 'SYNCED' })),
  )
}
```
（Step 1 僅為理解流程；**實際提交以 Step 2 的旗標版本為準**，並移除 Step 1 的副作用片段。）

- [ ] **Step 3: `restoreFromSheets` 改為還原 transactions**

把 `restoreFromSheets` 內 `pullAllFromSheets` + `db.dailyRecords.clear/bulkAdd` 換成：

```ts
const { seeds } = await pullAllTransactionsFromSheets(sheetId, categories)
await db.transactions.clear()
if (seeds.length > 0) await db.transactions.bulkAdd(seeds)
```
（`clearLocalData` 也一併清 `db.transactions`：`await db.transactions.clear()`，dailyRecords 舊資料保留為後備、不動。）

- [ ] **Step 4: 調整 import**

從 `../lib/sheets` 改引入 `pullAllTransactionsFromSheets`、`syncMonthTransactionsToSheets`、`backupSpreadsheet`（移除已不使用的 `pullAllFromSheets`、`syncMonthToSheets`）；從 `../lib/txSheets` 引入 `mergeTransactionsById`。

- [ ] **Step 5: 驗證編譯 / 測試 / 建置**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: tsc 綠、Vitest 全綠、build 成功。

- [ ] **Step 6: commit**

```bash
git add frontend/src/hooks/useSyncService.ts
git commit -m "feat: syncAll/restore 切換到逐筆交易同步 + 舊格式改寫前 Drive 備份 (Phase 5 Task 4)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 5: 文檔同步 + 手動驗證清單

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md`, `README.md`
- Modify: `docs/superpowers/loop/LOOP_STATE.md`（手動驗證清單 + Phase 5 收官）
- Modify: `docs/superpowers/specs/2026-07-01-...-design.md`（如實作決策與 spec 有出入則回補：未知一級保留原名、備份 scope、備份失敗只跳過舊改寫）

- [ ] **Step 1: 更新三份使用者文檔（只描述已落地功能）**

- CLAUDE.md / AGENTS.md：`KEY IMPLEMENTATION NOTES` 補「Phase 5：月份分頁逐筆交易新格式 `日期|收支|一級|二級|金額|備註|id`、`isNewTxFormat` 偵測舊格式、`explodeDailyRecord` 就地拆解舊資料、`backupSpreadsheet` 改寫前 Drive 備份、`mergeTransactionsById` 以 id 去重對帳；`syncAll` 已改同步 `transactions`（Dashboard/月結仍讀 `DailyRecord`，待 Phase 7）」；`PROJECT STRUCTURE` 補 `lib/txSheets.ts`；Development Status 標 Phase 5 完成。
- README.md：Features / 開發歷程補一行 Phase 5。

- [ ] **Step 2: 在 LOOP_STATE.md 寫「Phase 5 手動驗證清單」**

至少涵蓋：①登出再登入（Drive `drive.file` 重新授權）②首次同步舊格式測試表 → 確認產生「Ready-mPOS 備份 …」副本、月份分頁被改寫成新 7 欄格式 ③LedgerPage 新增交易 → 重新整理/換裝置 pull → 同一筆不重複（id 對帳）④停用/刪除類別後該類別歷史交易仍以名稱保留、金額不虛增。

- [ ] **Step 3: commit**

```bash
git add CLAUDE.md AGENTS.md README.md docs/superpowers/loop/LOOP_STATE.md docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md
git commit -m "docs: Phase 5 逐筆交易雲端同步落地 — 同步文檔 + 手動驗證清單 (Phase 5 Task 5)"
git push origin feature/line-item-transactions-redesign
```

---

### Task 6: `explodeDailyRecord` 改用決定性 id（修全期 review Important + 收掉 cutover Blocker）

**背景**：全期 review 指出 `explodeDailyRecord` 用隨機 `newId()`，導致本機遷移份與雲端對同批舊格式資料 re-explode 出的份 **id 不同** → `mergeTransactionsById` 無法去重。兩處爆發：①cutover 首次同步一次性重複；②**備份失敗路徑**（舊格式月份被 pull+explode 但未 rewrite）每輪 `syncAll` **無上限累積重複**。根因單一：非決定性 id。改用決定性 id 讓 re-explode 冪等，一次解掉兩者。

**Files:**
- Modify: `frontend/src/lib/migrate.ts`
- Test: `frontend/src/lib/migrate.test.ts`

**Interfaces:**
- Produces: `deterministicTxId(date, type, categoryId): string`（export）；`explodeDailyRecord` 的 `makeId` 參數改型別為 `(date, type: 'income'|'expense', categoryId: string) => string`，預設 `deterministicTxId`。
- 註：既有測試若注入 `() => 'fixed'` 之類 `() => string`，因 TS 允許少參數函式賦值給多參數函式型別，**仍相容**，不需改；但需**新增**決定性預設的測試。
- `lib/transactions.ts` 的 `addTransaction` **維持 `newId()` 隨機 id**（使用者手動新增的交易本就該唯一，不套決定性）——本 task 不動它。

- [ ] **Step 1: 先寫失敗測試（追加到 migrate.test.ts）**

```ts
import { explodeDailyRecord, deterministicTxId } from './migrate'

describe('deterministicTxId / explode 冪等', () => {
  const rec = {
    date: '2026-07-01',
    incomes: { cash: 100 }, expenses: { food: 50 },
    incomeNotes: {}, expenseNotes: {}, notes: '',
    syncStatus: 'SYNCED' as const, createdAt: 'x', updatedAt: 'x',
  }
  it('同一 (日期,收支,一級) 永遠得到同一 id', () => {
    expect(deterministicTxId('2026-07-01', 'income', 'cash')).toBe('mpos:2026-07-01:income:cash')
    expect(deterministicTxId('2026-07-01', 'income', 'cash'))
      .toBe(deterministicTxId('2026-07-01', 'income', 'cash'))
  })
  it('預設（不注入 makeId）時 explode 兩次 id 完全相同（冪等，可去重）', () => {
    const a = explodeDailyRecord(rec).map(t => t.id)
    const b = explodeDailyRecord(rec).map(t => t.id)
    expect(a).toEqual(b)
    expect(a).toEqual(['mpos:2026-07-01:income:cash', 'mpos:2026-07-01:expense:food'])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/migrate.test.ts`
Expected: FAIL（`deterministicTxId` 未定義 / 預設 id 目前是隨機）

- [ ] **Step 3: 實作（改 migrate.ts）**

```ts
// 決定性交易 ID：同一 (日期, 收支, 一級類別) 永遠導出同一 id。
// 目的：本機遷移 explode 與雲端對同批舊格式資料 re-explode 產生「相同 id」，
//      讓 mergeTransactionsById 能以 id 去重，避免 cutover 一次性重複與備份失敗路徑的無上限累積。
export function deterministicTxId(
  date: string, type: 'income' | 'expense', categoryId: string,
): string {
  return `mpos:${date}:${type}:${categoryId}`
}
```
把 `explodeDailyRecord` 的 `makeId` 參數改為：
```ts
makeId: (date: string, type: 'income' | 'expense', categoryId: string) => string = deterministicTxId,
```
並把兩處 `id: makeId()` 改為 `id: makeId(r.date, 'income', categoryId)` / `id: makeId(r.date, 'expense', categoryId)`。移除已不再使用的 `import { newId } from './ids'`（若無其他用途）。

- [ ] **Step 4: 跑測試確認通過（含既有 migrate 測試不回歸）**

Run: `cd frontend && npm test`
Expected: 全綠（既有 migrate 測試 + 新增決定性測試 + 其他）

- [ ] **Step 5: 驗證編譯/建置**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: 皆成功

- [ ] **Step 6: commit**

```bash
git add frontend/src/lib/migrate.ts frontend/src/lib/migrate.test.ts
git commit -m "fix: explodeDailyRecord 改用決定性 id，修 re-explode 重複（全期 review Important + cutover Blocker）"
git push origin feature/line-item-transactions-redesign
```

> 註：已在分支上遷移過（v3 已套用）的 dev 裝置，其本機交易仍是舊隨機 id、不會回溯改變（upgrade 只跑一次）；可用 restore/clearLocalData 重置。對**全新安裝 / 正式 cutover**（main），v3 upgrade 一開始就用決定性 id，兩端一致——cutover 重複問題根除。

## 完成準則（Definition of Done）
- [ ] Task 1–2 純函式 Vitest 全綠；`npx tsc --noEmit`、`npm run build` 綠。
- [ ] `syncAll`/`restoreFromSheets` 已同步 `db.transactions`；舊格式改寫前必先 `backupSpreadsheet`。
- [ ] 三份使用者文檔 + spec + LOOP_STATE 手動驗證清單同步更新。
- [ ] 全期 review（subagent-driven）Spec ✅ + Quality Approved，Critical/Important 清零或轉後期並記錄。
- [ ] 🔴 併 main 前檢查仍未通過（`AUTO_SHEET_NAME` 仍為測試名、cutover 硬停）——本期不解除。

## 後續（Phase 6/7，待本期完成後 loop 逐一 writing-plans）
- **Phase 6**：帳目頁月曆（月淨額格）+ 導覽/落地頁調整（落地頁＝帳目）；讀 `useMonthTransactions`，E2E 覆蓋。
- **Phase 7**：Dashboard / 月結改用 `Transaction` 重算（`calcFees` 吃 `Transaction[]`），移除對 `DailyRecord` 的讀取依賴。
