# CLAUDE.md - Ready-mPOS

> **Documentation Version**: 1.6
> **Last Updated**: 2026-07-05
> **Project**: Ready-mPOS
> **Description**: 店家記帳系統 — 給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點
> **Features**: Offline-first PWA, Google Sheets sync, dynamic categories, push notifications, GitHub Pages deployment

This file provides essential guidance to Claude Code when working with this repository.

## 🚨 CRITICAL RULES - READ FIRST

### ❌ ABSOLUTE PROHIBITIONS
- **NEVER** create new files in root directory → use `frontend/` or `docs/`
- **NEVER** use `find`, `grep`, `cat`, `head`, `tail`, `ls` commands → use Read, Grep, Glob tools
- **NEVER** create duplicate files (manager_v2.py, enhanced_xyz.ts) → extend existing files
- **NEVER** hardcode values that belong in config/env → use `.env` or Vite env vars
- **NEVER** use naming like `enhanced_`, `improved_`, `new_`, `v2_` → extend original files

### 📝 MANDATORY REQUIREMENTS
- **PLAN FIRST** — explain the plan and wait for user confirmation before executing any task
- **STEP BY STEP** — build incrementally, do not generate all files at once
- **CHINESE COMMENTS** — add 繁體中文 comments on all critical business logic
- **COMMIT** after every completed task/phase — format: `feat/fix/docs/refactor: short description`
- **PUSH** after every commit: `git push origin main`
- **READ FILES FIRST** before editing — Edit tool requires prior Read
- **SEARCH FIRST** — use Grep/Glob to find existing code before creating anything new

### ⚡ EXECUTION PATTERNS
- Use **Task agents** for operations > 30 seconds
- After each feature: prompt user with suggested code review focus points

### 🔍 PRE-TASK COMPLIANCE CHECK
Before starting any task:
- [ ] Plan explained and confirmed by user
- [ ] Will this create files in root? → use proper subdirectory
- [ ] Does similar functionality exist? → extend it
- [ ] Business logic comments in 繁體中文 planned?

---

## 🏗️ PROJECT OVERVIEW

給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點：
每日帳目與月結對帳耗時且容易出錯。

**目標用戶**: 有員工的餐廳，目前用手寫本，每日一張 + 月結一筆對照。

**架構決策**: 無後端伺服器 — 前端直接走 IndexedDB 離線儲存 + Google Sheets 雲端同步。使用者場景為單純記帳，不需要中央伺服器。

### Development Status
- **Phase**: Phase 1 MVP — 核心記帳功能完整實作
- **Frontend**: ✅ Complete — DailyEntryPage, MonthlyReportPage, DashboardPage, SettingsPage, CategoriesPage, OnboardingPage
- **Dynamic Categories**: ✅ Complete — 收入/支出類別可自訂（新增、編輯、刪除、啟用停用）
- **Google Sheets Sync**: ✅ Complete — 雙向同步，token 持久化（localStorage），50 分鐘自動刷新
- **Push Notifications**: ✅ Complete — Service Worker + Web Push，自訂提醒時間
- **Deployment**: ✅ GitHub Pages (自動 CI/CD on push to main)
- **Backend**: ❌ Removed — 無後端伺服器，純前端架構
- **第 2 次優化（進行中）**: 逐筆交易改造 — **Phase 1–6 完成**（Task 6 cutover 重複修正含於 Phase 5）。Phase 1：`Transaction` 型別、Dexie v3 自動遷移、`explodeDailyRecord` 拆解純函式 + Vitest、交易 CRUD/hook。Phase 2：二級分類純函式 CRUD + `CategoryEditSheet` 管理 UI + E2E。Phase 3：二級經 Sheets `_config` 跨裝置同步（`serializeSubs`/`parseSubs`）+ 修 push/pull 資料流失 + feature 分支同步隔離到獨立測試試算表（🔴 併 main 前須改回正式名）。Phase 4：記帳改逐筆交易 — 「記帳」tab 換成 `LedgerPage`（單日列表 + 右下 FAB → `TransactionSheet` 記帳，選一級自動帶入 `defaultSubId`），寫入 `transactions` + Playwright E2E。Phase 5：逐筆交易雲端同步 — 月份分頁改為新格式（`日期|收支|一級|二級|金額|備註|id`，`lib/txSheets.ts` 純函式：`isNewTxFormat` 偵測、`txToRow`/`rowToTx`、`mergeTransactionsById` 以 id 去重對帳）；舊格式 pull 時就地 `explodeDailyRecord` 拆解並標記待改寫，改寫前必先 `backupSpreadsheet`（Drive 時間戳備份，`drive.file` scope，需重新授權），備份失敗則本輪跳過所有舊格式改寫；`syncAll`/`restoreFromSheets` 已切換讀寫 `db.transactions`。**Task 6（cutover 交易重複修正）**：`explodeDailyRecord` 改用決定性 id（`mpos:<date>:<type>:<categoryId>`），本機遷移與雲端 re-explode 對同一批歷史資料產生相同 id → `mergeTransactionsById` 正確去重，cutover 首次同步不再重複；此修正自動套用於新安裝及 v3 upgrade（只跑一次）。**Phase 6**：「帳目」頁改為**月曆 + 單日逐筆列表**（`lib/calendar.ts` 純函式 + `MonthCalendar` 元件，每格顯示當日淨額 = 收入−支出、不扣手續費），App **落地頁與導覽首項改為「帳目」** + Playwright E2E。⚠️ **Dashboard / 月結仍讀舊 `DailyRecord`**（含手續費後淨額），待 Phase 7。cutover（改回正式試算表名、遷移真實資料）為使用者核准的硬停，本期未執行，分支仍用 `AUTO_SHEET_NAME` 測試名。分支 `feature/line-item-transactions-redesign`。設計 spec：`docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`。

---

## 📁 PROJECT STRUCTURE

```
Ready-mPOS/
├── frontend/
│   ├── public/
│   │   └── sw.js              # Service Worker（打烊提醒推播通知）
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage.tsx      # 首頁：今日淨額、收支分解、7天趨勢（仍讀 DailyRecord，待 Phase 7）
│       │   ├── LedgerPage.tsx         # 「帳目」tab（落地頁）：月曆 + 單日逐筆列表 + FAB 記帳（Phase 4/6，讀 transactions）
│       │   ├── DailyEntryPage.tsx     # 舊每日彙總記帳頁（Phase 4 起已由 LedgerPage 取代，檔案暫留）
│       │   ├── MonthlyReportPage.tsx  # 月結報表（仍讀 DailyRecord，待 Phase 7）
│       │   ├── SettingsPage.tsx       # 設定：類別、Google Sheets、通知
│       │   ├── CategoriesPage.tsx     # 類別管理（收入/支出）
│       │   └── OnboardingPage.tsx     # 初次設定引導
│       ├── hooks/
│       │   ├── useDailyRecord.ts      # 單日記錄 CRUD（舊彙總模型）
│       │   ├── useMonthlyRecords.ts   # 月份記錄查詢
│       │   ├── useTransactions.ts     # 逐筆交易查詢（useMonthTransactions / useDayTransactions）
│       │   └── useSyncService.ts      # Google Sheets 同步服務
│       ├── components/
│       │   ├── Icon.tsx               # Lucide-style SVG icon
│       │   ├── TransactionSheet.tsx   # 交易記帳底部 Sheet（收支/類別/二級/金額/儲存並繼續，Phase 4）
│       │   ├── MonthCalendar.tsx       # 帳目頁月曆元件（每日淨額格/切月/點日，Phase 6）
│       │   └── CategoryEditSheet.tsx  # 類別新增/編輯底部 Sheet（共用）
│       ├── lib/
│       │   ├── sheets.ts              # Google Sheets API + GIS OAuth2
│       │   ├── categories.ts          # 類別 localStorage CRUD + calcFees
│       │   ├── notification.ts        # SW 通知工具（權限、sendReminderToSW）
│       │   ├── tokens.ts              # Design tokens（色彩、字體、圓角）
│       │   ├── fmt.ts                 # NT$ 金額格式化
│       │   ├── ids.ts                 # newId() 穩定 ID 產生器
│       │   ├── migrate.ts             # explodeDailyRecord：舊 DailyRecord→Transaction[] 拆解（純函式）
│       │   ├── txDraft.ts             # resolveDefaultSub：記帳帶入預設二級（純函式，防 dangling）
│       │   ├── txSheets.ts            # 逐筆交易⇄Sheets 列轉換、新舊格式偵測、id 對帳（純函式，Phase 5）
│       │   ├── calendar.ts            # 月曆：月份日期矩陣 / 每日淨額 / 切月（純函式，Phase 6）
│       │   └── transactions.ts        # 逐筆交易 CRUD（add / update / delete）
│       ├── db/
│       │   └── index.ts               # Dexie.js schema（v3：transactions 逐筆交易 store + 自動遷移）
│       └── types/
│           └── index.ts               # Transaction, DailyRecord, Category（含二級 subs / defaultSubId）, SyncStatus
└── docs/                              # ADR 架構決策紀錄 + superpowers specs/plans
```

### Frontend (`frontend/`)
- **Framework**: React + Vite + TypeScript
- **Offline storage**: Dexie.js (IndexedDB wrapper)
- **Testing**: Vitest（單元測試，`npm test`）
- **UI**: Inline styles + design tokens（`tokens.ts`），Cash App / Toss 風格
- **Cloud sync**: Google Sheets API v4 + Drive API v3 (OAuth2 via GIS)
- **Notifications**: Service Worker + Web Push Notification API
- **Target**: Android browser-first, desktop-compatible
- **Deploy**: GitHub Pages via GitHub Actions

---

## 🎯 CORE FUNCTIONALITY

1. **每日收入記錄** — 動態類別（預設：現金、刷卡、Uber Eats、foodpanda）
2. **每日支出記錄** — 動態類別（預設：食材採購、員工薪資、雜支）
3. **外送平台手續費** — 每個收入類別可設定費率，自動從淨額扣除
4. **自動加總** — 每日小計、月結彙整，消除對帳錯誤
5. **離線優先** — IndexedDB 本地儲存，儲存後即時同步 Google Sheets
6. **跨裝置** — 同一 Google 帳號共用同一試算表，類別設定也同步
7. **打烊提醒** — Service Worker 推播，自訂時間，即使 App 最小化也能收到

---

## 🔑 KEY IMPLEMENTATION NOTES

### 逐筆交易資料層（第 2 次優化 Phase 1）
- `Transaction` 為新記帳單位（同一天同一類別可多筆）：金額一律正數、收支方向由 `type` 決定，`subId` 為二級類別（`null` = 無）。定義於 `types/index.ts`。
- **Dexie v3**（`db/index.ts`）：新增 `transactions` store（`++localId, id, date, syncStatus, categoryId`）；upgrade 時用 `explodeDailyRecord` 就地把舊 `dailyRecords` 拆成逐筆交易，**舊 table 保留為後備**（失敗自動回滾）。
- `explodeDailyRecord`（`lib/migrate.ts`）為**純函式**（不 import Dexie，Vitest 覆蓋）：零金額略過、項目備註帶入、日備註以全形「｜」併入當天第一筆交易；當天無交易則捨棄日備註。
- `lib/transactions.ts`：`addTransaction / updateTransaction / deleteTransaction`，寫入時設 `syncStatus='PENDING'` 並更新 `updatedAt`。
- `hooks/useTransactions.ts`：`useMonthTransactions('YYYY-MM')` 以 `date` 前綴查詢（用 `startsWith('YYYY-MM-')` 避免跨月誤配）、`useDayTransactions('YYYY-MM-DD')` 查單日；沿用 `useDailyRecord` 的 `undefined=載入中` 慣例。
- **記帳 UI（Phase 4）**：「記帳」tab = `LedgerPage`（`useDayTransactions` 單日列表 + 右下 FAB）；`TransactionSheet` 底部 Sheet 收支切換 / 一級類別 chips / 二級 chips（含「無」）/ 金額（正數）/ 備註 / 日期 / 「儲存並繼續」連續記帳 / 編輯可刪。選一級類別時二級自動帶入 `resolveDefaultSub(cat)`（`lib/txDraft.ts` 純函式，Vitest 覆蓋；`defaultSubId` 若已不在 `subs` 內視為「無」）。寫入透過 `lib/transactions.ts`。
- ⚠️ **Dashboard / 月結仍讀舊 `DailyRecord` 模型**（待 Phase 7）；帳目頁月曆與落地頁見下方 Phase 6。雲端同步已於 Phase 5 切換到 `transactions`（見下方）。

### 逐筆交易雲端同步（第 2 次優化 Phase 5）
- `lib/txSheets.ts`（純函式，Vitest 覆蓋）：`TX_MONTH_HEADERS` 固定 7 欄表頭 `日期|收支|一級類別|二級類別|金額|備註|id`（不隨類別增減變動）；`isNewTxFormat` 偵測月份分頁是否已是新格式；`txToRow`/`rowToTx` 單筆轉換；`mergeTransactionsById` 以 `Transaction.id` 去重合併（本機 `PENDING` 優先於雲端版本）。
- `lib/sheets.ts`：`pullAllTransactionsFromSheets` 逐月偵測格式——新格式直接讀；舊彙總格式用抽出的純函式 `parseOldMonthRows` + `explodeDailyRecord` 就地拆成交易，並標記該月待改寫。`syncMonthTransactionsToSheets` 對新格式月份 `values:clear` + 整表覆蓋寫回。`backupSpreadsheet`（Drive `files.copy`）在改寫任何舊格式分頁前建立時間戳備份副本；`SCOPES` 新增 `drive.file`（既有登入使用者需重新授權）。
- **資料保護紅線**：舊格式分頁改寫前必先 `backupSpreadsheet` 成功；備份失敗則該輪同步**跳過所有舊格式分頁改寫**（即使該月同時有本機 `PENDING` 待寫也不改寫，等下次同步重試）。
- `hooks/useSyncService.ts`：`syncAll`/`restoreFromSheets`/`clearLocalData` 已改讀寫 `db.transactions`（以 id 去重對帳，本機 `PENDING` 優先）。
- ✅ **cutover 交易重複已解決（Task 6）**：`explodeDailyRecord` 現採決定性 id `mpos:<date>:<type>:<categoryId>`，本機 v3 upgrade 時產生的 id 與雲端 pull 時 re-explode 同一批舊資料產生的 id 完全相同，`mergeTransactionsById` 可正確辨識並去重，cutover 首次同步不再發生重複。此修正自動套用於新安裝及 v3 upgrade 過程（upgrade 僅執行一次）；在此修正前已於 dev 分支跑過舊版遷移的裝置，其本機交易仍為舊隨機 id，可使用 `restoreFromSheets`（覆蓋本機）或 `clearLocalData`（重置）重新同步。cutover（改回正式試算表名、對真實使用者資料執行遷移）為使用者核准的硬停，本期未執行，分支仍使用 `AUTO_SHEET_NAME` 測試試算表名。

### 帳目頁月曆 + 落地頁（第 2 次優化 Phase 6）
- `lib/calendar.ts`（純函式，Vitest 覆蓋）：`buildMonthMatrix('YYYY-MM')` 產生週列陣列（每列 7 格、`'YYYY-MM-DD'` 或 `null` 補白、週日為每週第一天）；`monthDayNets(txs)` 算 date→當日淨額（`Σ收入 − Σ支出`，**不扣手續費**，Phase 7 再一併評估一致性）；`shiftMonth(month, delta)` 跨年切月。
- `components/MonthCalendar.tsx`：用 `useMonthTransactions(month)` 取當月交易算每日淨額；每格顯示日期 + 淨額（+綠/−紅、0 或無資料不顯示）、今天描邊、選定填 `T.ink`、點格切換選定日、上方切月列。元件不自持 month 狀態（由父層 `date.slice(0,7)` 導出，單一事實來源）。
- `LedgerPage`（第 2 次優化「帳目」頁）= `MonthCalendar` 月曆 + 既有單日逐筆列表 + 小計 + FAB；切月時把選定日設為新月 1 號。
- `App.tsx`：**落地頁與導覽首項改為「帳目」**（`daily` tab、icon `calendar`、`useState<Tab>('daily')`）；導覽順序 帳目 / 首頁 / 月結 / 設定。月結點日仍導到「帳目」並落在該月。
- Playwright E2E 覆蓋：落地即帳目、FAB 新增交易後可見、點日切換單日列表。

### 類別系統（`lib/categories.ts`）
- 類別儲存在 `localStorage`（key: `mpos_categories`）
- `Category` 型別：`{ id, name, icon, color, fee?, enabled, type, subs?, defaultSubId? }`
- **二級分類（Phase 2 CRUD/UI + Phase 3 同步完成）**：`subs: { id, name }[]`（二級**繼承**一級 icon/color/fee，本身只有 id/name）、`defaultSubId: string|null`（記帳時預設帶入，`null` = 無）。純函式 CRUD `addSub / renameSub / deleteSub / setDefaultSub`（不 mutate、回傳新 `Category`；`deleteSub` 刪到預設二級時自動清 `defaultSubId`），Vitest 覆蓋。管理 UI 在 `CategoryEditSheet` 內（點類別→編輯→「二級分類」區），儲存時 trim + 去空名 + 修正失效的 `defaultSubId`。**跨裝置同步（Phase 3）**：`serializeSubs`/`parseSubs`（`id:encodeURIComponent(name)`，`|` 分隔）序列化進 `_config` 的 `subs`/`defaultSub` 兩欄；`pushConfigToSheets`/`pullConfigFromSheets` lockstep 帶上這兩欄（push 在清 dirty **前**序列化，修掉 Phase 2 的資料流失），舊 7 欄 `_config` pull 容錯視為無二級。「記帳時自動帶入預設二級」待 Phase 4。
- `fee` 為小數（0.3 = 30%），用於外送平台手續費計算
- `calcFees(record, categories)` — 計算單日總手續費
- 類別變更後透過 `syncCategories` 同步到 Sheets `_config` tab

### Dashboard 計算邏輯
- `dayIncome(r, ids)` / `dayExpense(r, ids)` — 只加總已知類別 ID，防止 Sheets 同步帶入的陌生欄位污染金額
- Hero 顯示 `todayNetAfterFees`（扣手續費後淨額），淨額為負時顯示紅色漸層
- 首頁收入/支出列表：value = 0 的類別不顯示

### Google Auth（`lib/sheets.ts`）
- Token 儲存在 `localStorage`（跨 session 持久化）
- `warmToken()` — 啟動時靜默預取，每 50 分鐘自動刷新
- `acquireToken(prompt='')` — 靜默取得 token，有 token 且未過期直接回傳

### Service Worker（`public/sw.js`）
- 設定儲存在 SW 內的 IndexedDB（`mpos-reminder` DB）
- 通知 30 分鐘視窗機制：超過設定時間 30 分鐘就不補發
- 每天只通知一次（`lastShown` key 防重複）
- 支援 Periodic Background Sync（Chrome Android 安裝 PWA 後可用）

---

## 🚀 COMMON COMMANDS

```bash
# Frontend dev server
cd frontend && npm run dev

# Unit tests (Vitest)
cd frontend && npm test

# Type check
cd frontend && npx tsc --noEmit

# Build frontend
cd frontend && npm run build
```

---

## 📋 COMMIT CONVENTION

```
feat: add daily income entry form
fix: correct monthly total calculation
docs: update ADR for offline sync strategy
refactor: extract sync logic to dedicated service
```

---

## 🚨 TECHNICAL DEBT PREVENTION

### Before creating ANY new file:
1. **Search first** — `Grep(pattern="...", path="frontend/src")` or `Glob`
2. **Read existing** — understand current patterns
3. **Extend existing** — prefer Edit over Write
4. **Single source of truth** — one implementation per concept
