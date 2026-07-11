# Phase 1 實作計畫：逐筆交易資料層 + 遷移

> **日期**: 2026-07-01
> **對應 spec**: `docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`
> **範圍**: 只做「實作分期」第 1 期 — 資料層 + 遷移。不含 UI、不含 Sheets 新格式（那些在 Phase 2+）。
> **方法**: TDD — 純函式（migration / 拆解）先寫測試，Dexie / hook 為薄殼。

## 本期目標

建立逐筆交易的**資料基礎**，讓後續 UI / 同步階段有可用的型別、儲存與存取層：

1. `Transaction` 型別 + `Category` 擴充二級欄位（不動 UI）。
2. 舊 `DailyRecord` → `Transaction[]` 的**純函式**拆解邏輯（可單元測試，與 Dexie 解耦）。
3. Dexie version 3：新增 `transactions` table + upgrade 就地遷移；保留舊 `dailyRecords` 當後備。
4. 交易 CRUD 函式 + `useTransactions` 查詢 hook（供 Phase 4/5 UI 使用）。

**本期不做**：任何頁面改動、FAB、Sheets 讀寫改格式、Dashboard/月結重算、二級分類 UI。舊 `DailyEntryPage` 等維持原樣仍可運作（讀舊 table）。

## 前置

- 引入 **Vitest** 作為單元測試框架（專案目前無測試框架）。
- 遷移/拆解邏輯抽成純函式放 `lib/migrate.ts`，不 import Dexie，方便在 node 環境測。

---

## Task 1 — 型別 + ID 產生器

### 1a. `frontend/src/lib/ids.ts`（新檔）

```ts
// 產生穩定 ID：優先用 crypto.randomUUID，環境不支援時退回 時間戳+亂數
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
```

### 1b. 擴充 `frontend/src/types/index.ts`

- 新增 `Transaction`（依 spec 欄位）；`localId?: number` 為 Dexie 自增主鍵（DB 層填入，型別上選填）。
- `Category` 增加 `subs?: { id: string; name: string }[]` 與 `defaultSubId?: string | null`。
- 保留 `DailyRecord`（遷移來源，勿刪）。

```ts
export interface Transaction {
  localId?: number       // Dexie 自增主鍵（++localId），DB 層產生
  id: string             // 穩定同步 ID（跨裝置去重）
  date: string           // 'YYYY-MM-DD'
  type: 'income' | 'expense'
  categoryId: string
  subId?: string | null  // 二級類別 id（null = 無）
  amount: number         // 正數；收支方向由 type 決定
  note?: string
  syncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}
```

### 驗證
- `npx tsc --noEmit` 通過（新型別不破壞既有引用）。

---

## Task 2 — Vitest + 遷移拆解純函式（TDD）

### 2a. Vitest 設定
- `cd frontend && npm install -D vitest`
- `frontend/package.json` scripts 增 `"test": "vitest run"`。
- `frontend/vitest.config.ts`：node 環境、`include: ['src/**/*.test.ts']`。

### 2b. 先寫測試 `frontend/src/lib/migrate.test.ts`

`explodeDailyRecord(r, makeId?, now?): TxSeed[]`，`TxSeed = Omit<Transaction, 'localId'>`。用可注入的 `makeId` / `now` 讓測試可預期。

四個測試：
1. **只拆非零金額**：`incomes` / `expenses` 中金額為 0 的 key 不產生交易。
2. **項目備註帶入**：`incomeNotes[key]` / `expenseNotes[key]` → 對應交易 `note`。
3. **日備註併入第一筆**：`notes`（今日備註）有值 → 以全形「｜」附加到當天產生的**第一筆**交易 `note`；當天有交易時不另建交易。
4. **當天無任何交易**：`incomes`/`expenses` 全零 → 回傳 `[]`（日備註直接捨棄，不建 amount=0 交易）。

每筆交易：`id = makeId()`、`syncStatus='PENDING'`、`subId=null`、`createdAt=updatedAt=now`。

### 2c. 實作 `frontend/src/lib/migrate.ts` 讓測試轉綠
- 純函式，不 import Dexie。
- 遍歷 `incomes` 再 `expenses`，非零才產生 `TxSeed`。
- 日備註處理：拆完後若 `r.notes` 有值且陣列非空，附加到 `[0].note`。

### 驗證
- `npm test` 4 個測試全綠。

---

## Task 3 — Dexie version 3 + upgrade 遷移

### `frontend/src/db/index.ts`
- `this.version(3).stores({ transactions: '++localId, id, date, syncStatus, categoryId', dailyRecords: /* 原樣保留 */ ... })`。
- `.upgrade(async tx => { ... })`：
  - `await tx.table('dailyRecords').toArray()` 讀全部舊記錄。
  - 對每筆呼叫 `explodeDailyRecord(r)`（用真正的 `newId` 與 `new Date().toISOString()`）。
  - `bulkAdd` 到 `transactions`。
  - **不**刪 `dailyRecords`（後備 + 回滾保護；升級 transaction 失敗自動回滾）。
- 型別上 `db.transactions` 對應 `Table<Transaction, number>`。

### 驗證
- `npx tsc --noEmit` 通過。
- 手動：開現有帳號 → DevTools 檢查 IndexedDB `transactions` 已由舊 `dailyRecords` 生成、金額/備註正確、舊 table 仍在。

---

## Task 4 — 交易 CRUD + 查詢 hook

### 4a. `frontend/src/lib/transactions.ts`（新檔）
- `TxInput` 型別（呼叫端提供的欄位，不含 `localId`/`syncStatus`/時間戳）。
- `addTransaction(input)`：補 `id=newId()`、`syncStatus='PENDING'`、`createdAt=updatedAt=now`，`db.transactions.add`。
- `updateTransaction(localId, patch)`：更新並設 `syncStatus='PENDING'`、`updatedAt=now`。
- `deleteTransaction(localId)`：`db.transactions.delete`。

### 4b. `frontend/src/hooks/useTransactions.ts`（新檔）
- `useMonthTransactions(month: 'YYYY-MM')`：`useLiveQuery` 查該月（`date` 前綴），依 `date` 排序。
- `useDayTransactions(date: 'YYYY-MM-DD')`：`useLiveQuery` 查單日。
- 沿用 `useDailyRecord` 的 `undefined=載入中 / [] =無資料` 慣例。

### 驗證
- `npx tsc --noEmit` 通過。
- （UI 尚未接，故此期不做端到端手動驗證；留待 Phase 4/5。）

---

## 完成準則（Definition of Done）
- [ ] `npm test` 全綠、`npx tsc --noEmit` 無錯、`npm run build` 成功。
- [ ] 既有 App 功能不回歸（舊頁面仍讀舊 table 正常）。
- [ ] 開現有帳號可見 `transactions` 已正確遷移、舊 `dailyRecords` 保留。
- [ ] commit：`feat: 逐筆交易資料層 + Dexie v3 遷移（Phase 1）`。
- [ ] 文件更新（同 commit 或緊接 commit）：CLAUDE.md / AGENTS.md 的 PROJECT STRUCTURE 補 `lib/ids.ts`、`lib/migrate.ts`、`lib/transactions.ts`、`hooks/useTransactions.ts`、`types` 補 `Transaction`；Development Status 加「第 2 次優化 — 逐筆交易改造（進行中）」。

## 後續階段（Phase 2–6，待本期驗證後逐一展開）
2. 類別二級：`Category` 二級 CRUD + `CategoriesPage` UI。
3. Sheets 同步：新月份分頁格式讀寫、舊格式偵測改寫、`_config` subs/defaultSub 序列化。
4. 記帳輸入：FAB + 新增/編輯交易底部 Sheet（「儲存並繼續新增」）。
5. 帳目頁：月曆 + 逐筆列表新主畫面 + 導覽/落地頁調整。
6. Dashboard / 月結：改用 `Transaction` 重算（`calcFees` 吃 `Transaction[]`）。
