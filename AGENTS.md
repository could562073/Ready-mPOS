# AGENTS.md - Ready-mPOS

> **Documentation Version**: 2.0
> **Last Updated**: 2026-07-11
> **App Version**: 2.0.0（見下方「版本號規則」）
> **Project**: Ready-mPOS
> **Description**: 店家記帳系統 — 給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點
> **Features**: Offline-first PWA, Google Sheets sync, dynamic categories, push notifications, GitHub Pages deployment

This file provides essential guidance to Codex when working with this repository.

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
- **第 2 次優化（Phase 1–7 全部完成）**: 逐筆交易改造 — **全部完成**（Task 6 cutover 重複修正含於 Phase 5）。Phase 1：`Transaction` 型別、Dexie v3 自動遷移、`explodeDailyRecord` 拆解純函式 + Vitest、交易 CRUD/hook。Phase 2：二級分類純函式 CRUD + `CategoryEditSheet` 管理 UI + E2E。Phase 3：二級經 Sheets `_config` 跨裝置同步（`serializeSubs`/`parseSubs`）+ 修 push/pull 資料流失 + feature 分支同步隔離到獨立測試試算表（原為手改常數，2026-07-09 起已 env 化，見「Git 分支流程」）。Phase 4：記帳改逐筆交易 — 「記帳」tab 換成 `LedgerPage`（單日列表 + 右下 FAB → `TransactionSheet` 記帳，選一級自動帶入 `defaultSubId`），寫入 `transactions` + Playwright E2E。Phase 5：逐筆交易雲端同步 — 月份分頁改為新格式（`日期|收支|一級|二級|金額|備註|id`，`lib/txSheets.ts` 純函式：`isNewTxFormat` 偵測、`txToRow`/`rowToTx`、`mergeTransactionsById` 以 id 去重對帳）；舊格式 pull 時就地 `explodeDailyRecord` 拆解並標記待改寫，改寫前必先 `backupSpreadsheet`（Sheets API 逐分頁匯出到新建時間戳備份表；原 Drive `files.copy`+`drive.file` 因 403 已棄用），備份失敗則本輪跳過所有舊格式改寫；`syncAll`/`restoreFromSheets` 已切換讀寫 `db.transactions`。**Task 6（cutover 交易重複修正）**：`explodeDailyRecord` 改用決定性 id（`mpos:<date>:<type>:<categoryId>`），本機遷移與雲端 re-explode 對同一批歷史資料產生相同 id → `mergeTransactionsById` 正確去重，cutover 首次同步不再重複；此修正自動套用於新安裝及 v3 upgrade（只跑一次）。**Phase 6**：「帳目」頁改為**月曆 + 單日逐筆列表**（`lib/calendar.ts` 純函式 + `MonthCalendar` 元件，每格顯示當日淨額 = 收入−支出、不扣手續費），App **落地頁與導覽首項改為「帳目」** + Playwright E2E。**Phase 7**：Dashboard／月結改用 `transactions` 重算 —— 新增 `lib/aggregate.ts` 的 `buildDailyRecordsFromTx` adapter 把逐筆交易合成 `DailyRecord`，讓兩頁既有的 `dayIncome/dayExpense/calcFees/TrendChart/CategoryBars` 邏輯零改動重用；Dashboard/月結不再 import `useDailyRecord`/`useMonthlyRecords` + Playwright E2E 驗證「帳目新增一筆 → 首頁/月結皆反映」。**cutover 已於 2026-07-11 執行**（使用者核准）：併 main + tag `v2.0.0`，正式站 production build 自動採用正式表名（env 化，dev/staging=測試表，見「Git 分支流程」），真實資料由自動遷移（備份→改寫→阻擋層）處理。開發分支為 `feature/line-item-transactions-redesign`（已併入）。設計 spec：`docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`。

---

## 🔖 版本號規則 (Versioning)

採 **SemVer**（`MAJOR.MINOR.PATCH`）。單一事實來源 = `frontend/package.json` 的 `version`，
經 `vite.config.ts` 的 `define` 注入為全域常數 `__APP_VERSION__`（宣告於 `src/vite-env.d.ts`），
設定頁底部顯示 `Ready-mPOS v{__APP_VERSION__}`。**改版本只改 `package.json` 一處**。

- **MAJOR**：資料模型 / 架構破壞性變更（例：本次逐筆交易改造、Dexie schema 升版、Sheets 分頁格式改版）。
- **MINOR**：向後相容的新功能（例：二級分類、月曆帳目頁、記帳 Sheet UX）。
- **PATCH**：修正與小調整（bug fix、文案、樣式）。
- **預發布**：尚未上正式資料的大改在合併前掛 `-beta.N` 尾碼（本次逐筆交易改造 cutover 前即為 `2.0.0-beta.1/2`）。

**目前 = `2.0.0`**（2026-07-11 cutover 併 main、tag `v2.0.0`）：逐筆交易是資料模型大改 → MAJOR 進位到 2。
其後功能→bump MINOR、修正→bump PATCH。

---

## 🔀 Git 分支流程 (Branch Workflow)

輕量 GitHub Flow（個人開發）。完整設計見 `docs/superpowers/specs/2026-07-09-git-branch-workflow-design.md`。

| 分支 | 角色 | 規則 |
|---|---|---|
| `main` | **正式**（= production） | push 即自動部署 GitHub Pages；只接受驗收完成的合併，每次合併打 tag `vX.Y.Z` |
| `feature/*` `fix/*` | 開發 | 從 main 切出，短命，合併後刪除 |
| `verify/*` | 預發驗收（可選） | 驗收裝置拉此分支本機跑，開發端可繼續動 feature 分支 |

**測試 vs 正式試算表由 Vite env 控制**（不再手改常數）：`useSyncService.ts` 讀
`import.meta.env.VITE_SHEET_NAME`，值來自已提交的 env 檔——

- `.env.development`（`npm run dev`）／`.env.staging`（`npm run build:staging`）→ 測試表 `Ready-mPOS 記帳（逐筆交易測試）`
- `.env.production`（`npm run build`，CI 亦同）→ 正式表 `Ready-mPOS 記帳`

🔴 **防呆紅線**（`assertSheetNameSafe`）：非 production build 的表名必須含「測試」字樣、表名為空一律拒絕同步——環境設定錯誤 fail-safe 成「不同步」，開發／驗收環境絕不碰真實帳目。

**新 feature SOP**：main 切 `feature/x` → 開發（tsc/vitest/build 綠）→ `npm run dev` 本機驗收（自動連測試表）→（可選）推 `verify/x` 真機驗收 → bump 版本（MINOR/PATCH/MAJOR）→ 併 main（`--no-ff`）+ tag + push → 刪分支。**Hotfix** 同構：`fix/x` → 驗證 → bump PATCH → 併 main + tag。

---

## 📁 PROJECT STRUCTURE

```
Ready-mPOS/
├── frontend/
│   ├── public/
│   │   └── sw.js              # Service Worker（打烊提醒推播通知）
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage.tsx      # 首頁：今日淨額、收支分解、7天趨勢（讀 transactions，buildDailyRecordsFromTx 合成，Phase 7）
│       │   ├── LedgerPage.tsx         # 「帳目」tab（落地頁）：月曆 + 單日逐筆列表 + FAB 記帳（Phase 4/6，讀 transactions）
│       │   ├── DailyEntryPage.tsx     # 舊每日彙總記帳頁（Phase 4 起已由 LedgerPage 取代，檔案暫留）
│       │   ├── MonthlyReportPage.tsx  # 月結報表（讀 transactions，buildDailyRecordsFromTx 合成，Phase 7）
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
│       │   ├── aggregate.ts           # buildDailyRecordsFromTx：交易→合成 DailyRecord（純函式，Phase 7）
│       │   ├── subMemory.ts           # 記「每個一級上次用的二級」（localStorage）
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
- **記帳 UI（Phase 4）**：「記帳」tab = `LedgerPage`（`useDayTransactions` 單日列表 + 右下 FAB）；`TransactionSheet` 底部 Sheet 收支切換 / 一級類別 chips / 二級 chips（含「無」）/ 金額（正數）/ 備註 / 日期 / 「儲存並繼續」連續記帳 / 編輯可刪。選一級類別時二級自動帶入 `resolveDefaultSub(cat)`（`lib/txDraft.ts` 純函式，Vitest 覆蓋；`defaultSubId` 若已不在 `subs` 內視為「無」）。寫入透過 `lib/transactions.ts`。二級區塊選一級即恆顯示（含「無」+ 既有二級 + 「＋新增二級」），可就地新增二級（`addSub` + `saveCategories`，經 `_config` 同步）並自動選取；選一級時二級改為優先帶入「該一級上次用的二級」（`lib/subMemory` 記憶 + `pickInitialSub` 純函式，無記憶則退回 `defaultSubId`）。
- ✅ **Dashboard / 月結已於 Phase 7 改讀 `transactions`**（經 `buildDailyRecordsFromTx` 合成 `DailyRecord`，見下方 Phase 7 說明）；帳目頁月曆與落地頁見下方 Phase 6。雲端同步已於 Phase 5 切換到 `transactions`（見下方）。

### 逐筆交易雲端同步（第 2 次優化 Phase 5）
- `lib/txSheets.ts`（純函式，Vitest 覆蓋）：`TX_MONTH_HEADERS` 固定 7 欄表頭 `日期|收支|一級類別|二級類別|金額|備註|id`（不隨類別增減變動）；`isNewTxFormat` 偵測月份分頁是否已是新格式；`txToRow`/`rowToTx` 單筆轉換；`mergeTransactionsById` 以 `Transaction.id` 去重合併（本機 `PENDING` 優先於雲端版本）。
- `lib/sheets.ts`：`pullAllTransactionsFromSheets` 逐月偵測格式——新格式直接讀；舊彙總格式用抽出的純函式 `parseOldMonthRows` + `explodeDailyRecord` 就地拆成交易，並標記該月待改寫。`syncMonthTransactionsToSheets` 對新格式月份 `values:clear` + 整表覆蓋寫回。`backupSpreadsheet` 在改寫任何舊格式分頁前建立時間戳備份：**Sheets API 匯出**（逐分頁讀值寫入新建備份表，走既有 `spreadsheets` scope）——原 Drive `files.copy` 方案因 `drive.file` scope 只授權 app 自建檔案、對既有表 403 `appNotAuthorizedToFile` 而棄用，`drive.file` 已自 `SCOPES` 移除。
- **資料保護紅線**：舊格式分頁改寫前必先 `backupSpreadsheet` 成功；備份失敗則該輪同步**跳過所有舊格式分頁改寫**（即使該月同時有本機 `PENDING` 待寫也不改寫，等下次同步重試）。
- `hooks/useSyncService.ts`：`syncAll`/`restoreFromSheets`/`clearLocalData` 已改讀寫 `db.transactions`（以 id 去重對帳，本機 `PENDING` 優先）。
- **刪除同步 = 軟刪除墓碑（2026-07-09 修正）**：`deleteTransaction` 改標 `syncStatus='DELETED'`（不硬刪）——硬刪會讓雲端列永不移除、且下次 pull 對帳把該列當新資料「復活」加回。機制：畫面查詢（`useDay/useMonthTransactions`）過濾墓碑；`syncAll` 待改寫月份含 `DELETED`，寫回時排除墓碑列（整月 clear+覆蓋 → 雲端該列消失），**寫回成功後才真正清除墓碑**（失敗保留、下次重試）；墓碑存在期間 merge 不 toAdd 也不覆蓋（Vitest 鎖定）。**儲存/刪除後自動同步**：`App → LedgerPage → TransactionSheet` 的 `onSync`（=`syncAll`）在每次成功寫入後觸發（修 Phase 4 換頁漏接「儲存後即時同步」）；刪除有二次確認小視窗。
- ✅ **cutover 交易重複已解決（Task 6）**：`explodeDailyRecord` 現採決定性 id `mpos:<date>:<type>:<categoryId>`，本機 v3 upgrade 時產生的 id 與雲端 pull 時 re-explode 同一批舊資料產生的 id 完全相同，`mergeTransactionsById` 可正確辨識並去重，cutover 首次同步不再發生重複。此修正自動套用於新安裝及 v3 upgrade 過程（upgrade 僅執行一次）；在此修正前已於 dev 分支跑過舊版遷移的裝置，其本機交易仍為舊隨機 id，可使用 `restoreFromSheets`（覆蓋本機）或 `clearLocalData`（重置）重新同步。cutover 已於 2026-07-11 執行（併 main + tag `v2.0.0`）；表名 env 化，dev/staging 自動連測試表、production build 自動連正式表（見「Git 分支流程」）。

### 帳目頁月曆 + 落地頁（第 2 次優化 Phase 6）
- `lib/calendar.ts`（純函式，Vitest 覆蓋）：`buildMonthMatrix('YYYY-MM')` 產生週列陣列（每列 7 格、`'YYYY-MM-DD'` 或 `null` 補白、週日為每週第一天）；`monthDayNets(txs)` 算 date→當日淨額（`Σ收入 − Σ支出`，**不扣手續費**——Phase 7 已評估並刻意保留此差異，見下方 Phase 7 說明）；`shiftMonth(month, delta)` 跨年切月。
- `components/MonthCalendar.tsx`：用 `useMonthTransactions(month)` 取當月交易算每日淨額；每格顯示日期 + 淨額（+綠/−紅、0 或無資料不顯示）、今天描邊、選定填 `T.ink`、點格切換選定日、上方切月列。元件不自持 month 狀態（由父層 `date.slice(0,7)` 導出，單一事實來源）。
- `LedgerPage`（第 2 次優化「帳目」頁）= `MonthCalendar` 月曆 + 既有單日逐筆列表 + 小計 + FAB；切月時把選定日設為新月 1 號。
- `App.tsx`：**落地頁與導覽首項改為「帳目」**（`daily` tab、icon `calendar`、`useState<Tab>('daily')`）；導覽順序 帳目 / 首頁 / 月結 / 設定。月結點日仍導到「帳目」並落在該月。
- Playwright E2E 覆蓋：落地即帳目、FAB 新增交易後可見、點日切換單日列表。

### Dashboard/月結改用交易重算（第 2 次優化 Phase 7）
- `lib/aggregate.ts` 的 `buildDailyRecordsFromTx(txs)`（純函式）把逐筆交易依 `date` group 成合成的 `DailyRecord[]`（`incomes`/`expenses` 為 categoryId→金額加總），讓 `DashboardPage`/`MonthlyReportPage` 既有的 `dayIncome`/`dayExpense`/`calcFees`/`TrendChart`/`CategoryBars` 等彙總與圖表邏輯**零改動**重用——兩頁改用 `useDayTransactions`/`useMonthTransactions` 取交易後餵給這個 adapter，不再 import `useDailyRecord`/`useMonthlyRecords`。
- **月曆（Phase 6）與 Dashboard Hero（Phase 7）的每日淨額定義刻意保留差異**：`MonthCalendar` 每格顯示的當日淨額為**毛額**（`Σ收入 − Σ支出`，不扣外送手續費），Dashboard Hero「今日淨額」則為**扣手續費後**淨額（`todayNetAfterFees`）。兩者用途不同（月曆給一眼掃視全月概況、Hero 給當日實收），評估後決定不強行統一。
- Playwright E2E（`e2e/transactions.spec.ts`）覆蓋：在「帳目」用 FAB 新增一筆今日收入後，切到「首頁」斷言今日淨額 Hero 反映該筆、切到「月結」斷言本月「總收入」含該筆——驗證兩頁確實從 `transactions` 重算而非讀舊快照。

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

# Build frontend（production mode → 正式試算表名）
cd frontend && npm run build

# Build for 本機驗收（staging mode → 測試試算表名）
cd frontend && npm run build:staging
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
