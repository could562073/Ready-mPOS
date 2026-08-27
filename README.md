# Ready-mPOS — 店家記帳系統

給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點：每日帳目與月結對帳耗時且容易出錯。

> **架構**：純前端 PWA，無後端伺服器。IndexedDB 離線儲存 + Google Sheets 雲端同步。
>
> **版本**：`2.5.1`（SemVer）。沿革：`2.1.0` 月結分析對帳報表 → `2.2.0` 移除首頁＋拔除分潤（外送手續費）機制 → `2.2.1` 修客戶端「每存一筆就跳資料升級中」無窮迴圈 stop-gap ＋ 遠端錯誤回報上線 → `2.2.2` 雲端寫入 403 診斷探針＋同步失敗使用者提示 → `2.3.0` 分類軟刪除墓碑＋孤兒類別回收（修「刪分類害舊帳目金額從月結消失」）→ `2.4.0` 同步暫停閘門＋低頻心跳自動恢復＋客戶可見同步狀態／手動重試 → `2.4.1` 修「類別停用／刪除同步後不生效」（`_config` 布林欄被 Sheets 轉型）→ `2.4.2` 資安檢測第一輪：Sheets 金額／日期解析純函式（安全網，尚未接線）＋CI 改 `npm ci`＋隱私政策與實作對齊 → `2.5.0` 資安檢測第二輪：解析純函式接線＋月份寫入 `RAW`／`_config` 讀 `UNFORMATTED_VALUE`＋「讀不懂就不改寫該月」防線 → `2.5.1` 修 warmToken 啟動 popup 被擋＋靜默同步失敗（詳見下方「近期版本」）。版本號單一事實來源＝`frontend/package.json`，設定頁底部顯示。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React PWA (Vite + TypeScript) |
| UI | Inline styles + design tokens (Cash App / Toss 風格) |
| Offline Storage | Dexie.js (IndexedDB) |
| Testing | Vitest |
| Cloud Sync | Google Sheets API v4 + Drive API v3 |
| Auth | Google Identity Services (OAuth2，localStorage token 持久化) |
| Notifications | Service Worker + Web Push Notification API |
| Deployment | GitHub Pages (CI/CD via GitHub Actions) |

## Quick Start

```bash
cd frontend && npm install && npm run dev
```

## Project Structure

```
Ready-mPOS/
├── frontend/
│   ├── public/
│   │   └── sw.js              # Service Worker（打烊提醒推播通知）
│   └── src/
│       ├── pages/             # LedgerPage（落地頁）, DailyEntryPage(舊), MonthlyReportPage
│       │                      # SettingsPage, CategoriesPage, OnboardingPage
│       ├── hooks/             # useDailyRecord, useMonthlyRecords, useTransactions, useSyncService
│       ├── lib/               # sheets, categories（含軟刪除墓碑/孤兒回收）, notification, tokens, fmt, ids,
│       │                      # migrate, txDraft, txSheets, transactions, calendar, aggregate,
│       │                      # closedDays, monthReport, subMemory, syncDiag, errorReport
│       ├── components/        # Icon, TransactionSheet, CategoryEditSheet, MonthCalendar,
│       │                      # MissingDaysCard, CostStructureCard, SyncErrorBanner
│       ├── db/                # Dexie.js schema（v3：transactions 逐筆交易 + 自動遷移）
│       └── types/             # Transaction, DailyRecord, Category（含二級 subs / deleted 墓碑）, SyncStatus
└── docs/                      # ADR 架構決策紀錄 + superpowers specs/plans
```

## Features

| 功能 | 狀態 |
|------|------|
| 每日收入記錄 | ✅ |
| 每日支出記錄 | ✅ |
| 動態類別管理（新增、編輯、刪除、啟用停用） | ✅ |
| 類別／二級軟刪除墓碑（刪除後歷史帳目金額完全保留，可復原） | ✅ 2.3.0 |
| 同步異常時暫停自動同步、狀態與待上傳筆數可查、修好後自動恢復 | ✅ 2.4.0 |
| 類別停用／刪除跨裝置同步正確保留（`_config` 布林欄往返） | ✅ 2.4.1 |
| Sheets 金額／日期儲存格解析純函式（解析失敗回 `null` 不歸零） | ✅ 2.4.2 落地／2.5.0 接線 |
| 讀不懂的資料列 → 不改寫該月 + 橫幅告知（防整表覆蓋吃掉手加的列） | ✅ 2.5.0 |
| 外送平台手續費自動扣除（每類別可設費率） | ❌ 2.2.0 拔除（撥款已是分潤後淨額） |
| 每日淨額 | ✅ |
| 首頁 7 天收入趨勢（漲跌幅百分比） | ❌ 2.2.0 移除首頁 |
| 月結報表 | ✅ |
| 離線優先 IndexedDB 儲存 | ✅ |
| Google Sheets 雙向同步（儲存後即時上傳） | ✅ |
| 類別設定跨裝置同步（_config tab） | ✅ |
| 從雲端還原資料 | ✅ |
| Google 登入持久化（localStorage token，50 分鐘自動刷新） | ✅ |
| 打烊提醒推播通知（自訂時間，Service Worker） | ✅ |
| GitHub Pages 自動部署 | ✅ |
| 逐筆交易模型 + 月曆列表主畫面 + 二級分類（第 2 次優化） | ✅ 完成（Phase 1–7）：資料層／二級分類／記帳 UI／雲端同步／月曆落地頁／Dashboard・月結改用交易重算 |
| 月結分析對帳（未記帳日/成本結構/上月比較） | ✅ |

## Google Sheets 同步

登入 Google 帳號後，自動建立或尋找名為 `Ready-mPOS 記帳` 的試算表：

- **儲存時即時上傳**：每次按「更新帳目」後立即同步
- **類別設定同步**：儲存在 `_config` tab，跨裝置共用
- **從雲端還原** ☁️→📱：以雲端資料完整覆蓋本機
- **進階設定**：自訂試算表 ID、清除本機資料

## 打烊提醒

設定頁面開啟「打烊提醒」後：

1. 瀏覽器請求通知權限
2. 可自訂提醒時間（預設 22:30）
3. 透過 Service Worker 在設定時間顯示通知

**通知觸發範圍：** App 開著或最小化（精確時間）、安裝為 PWA 的 Android Chrome（Periodic Background Sync 背景觸發）

## Development Guidelines

- Read `CLAUDE.md` before working with Claude Code
- Plan first, execute after confirmation
- Commit after each feature: `feat/fix/docs/refactor: description`
- Critical business logic requires 繁體中文 comments

---

## 開發歷程

**開發期間**：2026-05-03 ～ 2026-05-06（4 天）｜**總 commit 數**：50+

### Day 1 — 2026-05-03　架構建立 + 核心功能

**專案初始化**
- 建立專案結構、撰寫 ADR-001 離線優先同步策略

**前端基礎建設**
- React PWA + Vite + TypeScript + Tailwind + Dexie.js 腳手架
- DailyEntryPage（每日記帳，IndexedDB 離線儲存）
- MonthlyReportPage + 底部 Tab 導覽列

**後端嘗試（後來捨棄）**
- Spring Boot 後端 + Docker Compose 開發環境
- 離線→後端同步服務、H2 整合測試

**設計系統重構**
- 全新 Cash App / Toss 風格設計系統（色彩 tokens、卡片樣式）

**Google Sheets 同步（取代後端）**
- 直接從前端呼叫 Google Sheets API v4，完全移除後端伺服器
- 一鍵 Google 登入（GIS OAuth2）
- 雙向同步：Pull Sheets → 本機，Push PENDING → Sheets
- Drive 搜尋同名試算表，確保跨裝置共用同一份
- `useLiveQuery` 讓 UI 即時響應 IndexedDB 寫入

**部署**
- GitHub Actions CI/CD，自動部署到 GitHub Pages
- Privacy Policy / Terms 頁面

**Bug Fixes**
- iOS safe-area inset padding
- 行動裝置日期選擇器（iOS 不支援 label click）
- 偵測並清除已刪除的 Google Spreadsheet
- Cloud restore 先清空本機再寫入

---

### Day 2 — 2026-05-04　架構精簡 + Settings 重設計

**架構決策：移除後端**
- 刪除 Spring Boot + Docker，確立純前端 PWA 架構
- 清理死碼：`api.ts`、`AmountInput`、未使用的 sync states

**SettingsPage 重設計**
- 三區塊佈局：類別管理 / 應用程式 / 資料
- Toggle 開關元件
- 同步狀態即時徽章（同步中 / 已同步 / 待同步）

**Bug Fixes**
- 切換日期時表單不再帶入舊記錄的值

---

### Day 3 — 2026-05-05　動態類別 + 全面功能升級

**動態類別系統**
- `CategoriesPage`：收入/支出類別完整 CRUD（新增、編輯、刪除、啟用停用）
- Dexie.js schema v2 migration
- Google Sheets `_config` tab：類別設定跨裝置同步
- 外送平台手續費自動計算（每個類別可設費率）
- 所有頁面改用動態類別（Dashboard、Daily、Monthly）

**收入計算 Bug 修正（重要）**
- `dayIncome/dayExpense` 只加總已知類別 ID，防止 Sheets 同步帶入陌生欄位虛增金額
- `pullAllFromSheets` 不再把未知欄位存入 `incomes`

**Google Auth 改善**
- Token 存入 sessionStorage（頁面重整不需重登）
- `warmToken()`：啟動時靜默預取，把授權彈窗集中在啟動

**UI 功能**
- 首頁「近 7 天收入」趨勢百分比徽章（取代靜態「本週」）
- 記帳頁「更新帳目」確認 modal（顯示更新日期）
- 記帳頁可直接新增收入/支出類別（共用 CategoryEditSheet 元件）
- 停用類別在 Dashboard/Monthly 若有值仍顯示；記帳頁直接隱藏
- 設定頁 Google Sheets 同步移至「資料」區塊，移除匯出/備份按鈕
- 餐廳名稱 + 老闆姓名可編輯

---

### Day 4 — 2026-05-06　品質修復 + 通知功能

**Bug Fixes**
- EditSheet 儲存按鈕被困在捲動區域內 → 移至固定底部
- Dashboard Hero 顯示扣手續費後淨額（而非扣前）
- 載入時過濾孤立類別 key（已刪除類別的歷史殘值）
- 淨額為負時 Hero 卡顯示紅色漸層
- `fmt.ts` 負值永遠顯示負號
- 平台費 `Math.max(0, ...)` 不顯示負號

**Google Auth 持久化升級**
- Token 改存 `localStorage`（關掉瀏覽器重開不需重登）
- 每 50 分鐘自動靜默刷新，使用中不會過期觸發 popup
- 類別管理返回按鈕只在有修改時才同步，避免觸發不必要的登入

**打烊提醒（新功能）**
- Service Worker + Web Push Notification API
- 自訂提醒時間（原生時間選擇器）
- 30 分鐘視窗機制、每天只通知一次
- 支援 Periodic Background Sync（Android PWA 背景觸發）

**UI 調整**
- 首頁收支明細區塊移至頁面最下方
- 首頁收入/支出列：值為 0 的類別不顯示
- 移除「發票 OCR 辨識」設定項
- 移除記帳頁「拍照記帳」按鈕

---

### 第 2 次優化 — 2026-07-01 起　逐筆交易改造（✅ 全部完成，Phase 1–7）

根據真實餐廳老闆回饋，針對兩個核心痛點做第 2 次優化：**(1)** 記帳項目太多、輸入困難；**(2)** 帳目呈現想更簡潔（月曆 + 逐筆列表）。

**設計 spec**：`docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`
**分支**：`feature/line-item-transactions-redesign`｜**分 7 期實作**

**Phase 1 — 逐筆交易資料層（✅ 完成）**
- `Transaction` 型別：改以逐筆交易為記帳單位（同天同類別可多筆），金額正數 + `type` 決定收支，`subId` 為二級類別
- `Category` 擴充 `subs` / `defaultSubId`（二級分類；UI 於 Phase 2 接上）
- Dexie **v3**：新增 `transactions` store + upgrade 自動遷移（`explodeDailyRecord` 就地拆解舊 `dailyRecords`），舊 table 保留為後備
- `explodeDailyRecord` 純函式（Vitest 覆蓋，4/4）：零金額略過、項目備註帶入、日備註以「｜」併入當天第一筆
- 交易 CRUD（`lib/transactions.ts`）+ 查詢 hook（`hooks/useTransactions.ts`）
- 導入 Vitest 單元測試框架

**Phase 2 — 二級分類（✅ 完成）**
- 二級分類純函式 CRUD（`addSub / renameSub / deleteSub / setDefaultSub`，不 mutate、Vitest 覆蓋）：一級（如「雜項」）下可加二級（如「瓦斯費」），二級**繼承**一級 icon/color/fee
- 可設**預設二級**（`defaultSubId`，含「無」）；`deleteSub` 刪到預設時自動歸零
- 管理 UI 在 `CategoryEditSheet` 內（設定→類別→編輯→「二級分類」區），儲存時 trim + 去空名
- Playwright E2E 覆蓋新增/改名/設預設/刪除/持久化完整流程

**Phase 3 — Sheets `_config` 二級同步 + 隔離（✅ 完成）**
- 二級經 `_config` 的 `subs`/`defaultSub` 兩欄跨裝置同步（`serializeSubs`/`parseSubs`，`id:encodeURIComponent(name)`、`|` 分隔，Vitest 覆蓋）
- 修正 Phase 2 揪出的資料流失：push/pull lockstep 帶二級，push 在清 dirty **前**序列化；舊 7 欄 `_config` pull 容錯
- 🔒 開發安全：feature 分支同步隔離到獨立測試試算表，開發期不碰正式站資料（原為手改常數，2026-07-09 起改由 Vite env 控制，見下方「Git 分支流程」）
- ⚠️ 月份分頁新格式讀寫／舊格式偵測改寫／Drive 備份移至 Phase 5（與 UI 切換同期，才能端到端驗證）

**Phase 4 — 逐筆交易記帳 UI（✅ 完成）**
- 「記帳」tab 改用 `LedgerPage`：單日逐筆交易列表 + 右下浮動「＋」FAB
- `TransactionSheet` 底部 Sheet：收支切換 / 一級類別 / 二級（自動帶入預設，`resolveDefaultSub` 防 dangling）/ 金額 / 備註 / 日期 / 「儲存並繼續」連續記帳 / 編輯可刪
- 寫入本機 `transactions`；Playwright E2E 覆蓋新增/預設二級/儲存並繼續/編輯/刪除/重整持久
- ⚠️ Dashboard・月結・雲端同步當時仍為 `DailyRecord`，已於 Phase 5（雲端同步）與 Phase 6/7（月曆落地頁／Dashboard・月結重算）收斂（開發分支曾暫時分歧，見設計 spec）

**Phase 5 — 逐筆交易雲端同步（✅ 完成）**
- 月份分頁改為新格式：一列一筆交易 `日期|收支|一級類別|二級類別|金額|備註|id`，表頭固定不隨類別增減變動；`lib/txSheets.ts` 純函式（`isNewTxFormat`/`txToRow`/`rowToTx`/`mergeTransactionsById`）Vitest 覆蓋
- `pullAllTransactionsFromSheets` 逐月偵測新舊格式：舊彙總格式用抽出的純函式 `parseOldMonthRows` + `explodeDailyRecord` 就地拆成交易並標記待改寫；`syncMonthTransactionsToSheets` 對新格式月份整表覆蓋寫回
- `backupSpreadsheet`：改寫任何舊格式分頁前，先建立時間戳備份表——**Sheets API 匯出**（逐分頁讀值寫入新建備份表，走既有 `spreadsheets` scope；原 Drive `files.copy`+`drive.file` 方案對既有表 403 已棄用）；🔒 備份失敗則本輪同步跳過所有舊格式改寫，即使該月同時有本機待同步交易也不動
- `useSyncService.ts` 的 `syncAll`/`restoreFromSheets`/`clearLocalData` 全面切換到 `db.transactions`，以 `Transaction.id` 去重對帳（本機 `PENDING` 優先）
- 🐛 刪除/編輯同步修正（2026-07-09，`2.0.0-beta.2`）：刪除改**軟刪除墓碑**（`DELETED`，畫面過濾、寫回 Sheets 時排除該列、成功後才清墓碑）——修掉「刪除永不同步、下次 pull 復活」；記帳 Sheet 儲存/刪除後**自動觸發同步**（修 Phase 4 換頁漏接）；刪除加二次確認小視窗
- ✅ cutover 交易重複已解決（Task 6）：`explodeDailyRecord` 改用決定性 id，本機遷移與雲端 re-explode 出的同批交易 id 相同，`mergeTransactionsById` 可正確去重，cutover 首次同步不再重複
- ⚠️ Dashboard・月結當時仍讀 `DailyRecord`（含手續費後淨額），已於 Phase 7 改用交易重算

**Phase 6 — 帳目頁月曆 + 落地頁（✅ 完成）**
- `lib/calendar.ts` 純函式（`buildMonthMatrix`／`monthDayNets`／`shiftMonth`，Vitest 覆蓋）+ `MonthCalendar` 元件：月曆每格顯示當日淨額（收入−支出、不扣手續費）、今天描邊、選定填色、可切月、點日切換單日列表
- 「帳目」頁 = 月曆 + 單日逐筆列表 + FAB；App **落地頁與導覽首項改為「帳目」**（導覽：帳目／首頁／月結／設定）；Playwright E2E 覆蓋
- ⚠️ 月曆淨額不扣手續費 —— Phase 7 已評估並刻意保留此差異（見下方）

**Phase 7 — Dashboard・月結改用 Transaction 重算（✅ 完成）**
- 新增 `lib/aggregate.ts` 的 `buildDailyRecordsFromTx` 純函式 adapter：把逐筆交易依日期合成 `DailyRecord[]`，讓 `DashboardPage`／`MonthlyReportPage` 既有的 `dayIncome`/`dayExpense`/`calcFees`/`TrendChart`/`CategoryBars` 邏輯零改動重用
- 兩頁改用 `useDayTransactions`/`useMonthTransactions` 取逐筆交易，不再 import `useDailyRecord`/`useMonthlyRecords`
- **刻意保留的定義差異**：月曆（Phase 6）每日淨額為**毛額**（收入−支出，不扣手續費），Dashboard Hero「今日淨額」為**扣手續費後**淨額——用途不同（月曆看全月概況、Hero 看當日實收），評估後不強行統一
- Playwright E2E 覆蓋：帳目用 FAB 新增一筆今日收入 → 首頁今日淨額 Hero 反映該筆 → 月結本月總收入含該筆

第 2 次優化（逐筆交易改造）至此 **Phase 1–7 全部完成**。cutover 已於 2026-07-11 執行（使用者核准）：併回 `main` + tag `v2.0.0`，正式站 production build 自動採用正式表名，真實資料由自動遷移（備份→改寫→阻擋層）處理。

## 近期版本（2.1 → 2.5）

- **2.5.1** — 修正 Google 授權視窗在 App 啟動時被瀏覽器擋下、導致該次開啟完全沒有同步（且客戶看不到任何提示）的問題。
- **2.5.0** — **Sheets 讀寫型別收斂 + 「讀不懂就不改寫該月」**。資安檢測第二輪，把 2.4.2 埋好的安全網接上線。與 2.4.1 是同一個病、不同器官：2.4.1 壞在 `_config` 的布林欄，這輪處理月份分頁的**金額與日期欄**。
  - **測試安全網先行**（`lib/sheets.test.ts` stub `fetch` 覆蓋網路層）——先把 `_config` 往返與月份讀寫的現行行為鎖死，才敢動語意。
  - **`rowToTx` 改回傳辨識聯集** `tx｜skip｜unreadable`。🔴 型別本身就是修正：舊版用 `null` 同時表達「這列是空的」與「這列我讀不懂」，於是**使用者自己在試算表手加的一列（有內容、沒 id）會先被 pull 忽略、再被該月的整表覆蓋刪掉**——本輪順手關掉這條既有的靜默資料流失路徑。
  - **讀不懂的月份不改寫**：該月進 `unreadableMonths`，`planMonthsToRewrite` 在最後一步排除（優先權高於不受備份門檻限制的補欄月份），並用既有的琥珀色橫幅告知「這些月份暫時不會自動更新，你的帳目在本機都完好」。錯誤 `kind` 刻意用 `UNKNOWN`＝**不觸發同步暫停，其他月份照常同步**。
  - **型別收斂**：月份寫入 `USER_ENTERED` → `RAW`；`_config` 讀取 → `UNFORMATTED_VALUE`。⚠️ 備份匯出**刻意**維持 `FORMATTED_VALUE`（給人看的復原檔，日期變成 `46257` 就沒人讀得懂）；死碼的 `USER_ENTERED` 刻意不動。
  - **接線時抓到的回歸**：舊格式月份分頁是 2.0 前用 `USER_ENTERED` 寫的，日期欄是真的日期儲存格，改讀 `UNFORMATTED_VALUE` 會拿到序號 → 遷移的決定性 id 變成 `mpos:46257:...` 對不回本機。客戶端 `oldMonthCount:1` 至今未變＝這條路徑是活的，故舊格式解析也一併改走 `parseSheetDate`。
  - 共 203 測試綠（+22），並對核心防線跑突變測試確認不是空轉。
- **2.4.2** — **資安檢測第一輪（無行為變更）**。全專案資安檢測後，先落地零風險的三項，讓後續高風險改動有測試網可接。
  - **Sheets 儲存格解析純函式**（`lib/txSheets.ts` 的 `parseSheetAmount`／`parseSheetDate`，+20 測試，共 181 綠）。這是 **2.4.1 事故的未爆版本**：所有讀取都沒指定 `valueRenderOption`，吃的是預設 `FORMATTED_VALUE`＝畫面顯示字串。今天沒出事只因寫進去的是無格式整數；一旦使用者在試算表上把「金額」欄套成貨幣或千分位，讀回來就是 `"1,234"`，而 `rowToTx` 的 `Number(...) || 0` 會**吞成 0**，再被整月覆蓋寫回雲端——本機與雲端同時歸零，且**全程沒有任何錯誤訊息**。
  - 🔴 **紅線：解析失敗一律回 `null`，絕不回 0 或猜日期**。0 是合法金額，拿它當失敗哨兵等於授權一次壞讀覆寫真實帳目；`parseSheetDate` 也**刻意拒收** `8/23/2026`／`23/8/2026`（分不出月與日，猜錯會讓交易落到錯誤月份而從月結消失）。
  - ⚠️ **本版刻意不接線**，`rowToTx` 行為完全不變。接線與「寫入改 `RAW`＋讀取改 `UNFORMATTED_VALUE`」是同一次語意變更，排在後續輪次一起驗收；先獨立落地是為了不重演 2.4.1「解析邏輯夾在網路函式裡＝零測試覆蓋」。
  - **CI**：`npm install` → `npm ci`（以 lock 檔為準，避免部署當下悄悄升版）、Node 20 → 22、
    actions 全面升到 node24 執行環境（`checkout`/`setup-node` v5、`configure-pages` v6、
    `upload-pages-artifact` v5、`deploy-pages` v5）——清掉 GitHub 的 node20 淘汰警告。
  - **隱私政策**改寫為繁中並與實作對齊：刪掉根本沒發生的宣稱（IP／瀏覽行為／OS 蒐集、行銷聯絡、第三方分享），補上真的有但沒寫的事實（無後端架構、各儲存位置存什麼、三個 OAuth scope 用途、錯誤回報送／不送什麼＋12h 冷卻＋僅正式站，以及「目前沒有 App 內開關可停用錯誤回報」的誠實說明）。⚠️ `terms.html` 有同類矛盾（仍寫「服務商儲存並處理您提供的個人資料」），本輪未動。

- **2.1.0** — 月結分析對帳報表：未記帳日卡（固定週公休＋臨時逐日標記）、成本結構卡（二級細目／支出佔收入比／vs 上月增減）、Hero vs 上月淨額。
- **2.2.0** — **移除首頁** tab（導覽剩 帳目／月結／設定，`DashboardPage.tsx` 已刪）＋**拔除分潤（外送手續費）機制**：撥款已是分潤後淨額、手續費扣抵不成立，帳目頁小計／月結／類別管理均移除手續費，`Category.fee` 型別欄與 Sheets `_config` fee 欄保留供既有雲端資料相容但不再讀取。
- **2.2.1** — 修正正式站客戶端「每存一筆就跳全螢幕『資料升級中』」無窮迴圈（根因：`backupSpreadsheet` 每次失敗 → 舊格式月份永遠轉不成 → 遷移每次成立、每筆記帳彈阻擋層）。**Part B（stop-gap）**：遷移阻擋層＋備份每次開 App 最多一次，`allowOldRewrite` 僅備份成功才放行（資料保護紅線不變——沒成功備份就不覆蓋舊格式分頁）。**Part A**：新增 `lib/errorReport.ts` 遠端錯誤回報——fire-and-forget 到自建 Google Apps Script Web App（→ email），去識別化（`redact()` 去除試算表 ID／token）＋去重 12h 冷卻＋選用防濫用 token，**只送 message/stack/UA/version/extra/token，絕不送試算表 ID 或帳目金額**；設定步驟見 `docs/error-reporting-apps-script.md`。2026-07-25 已部署上線並端到端驗證（收信成功）。⚠️ 2.2.1 為 stop-gap、**未修根因**。
  🔴 **後續更正**：2.2.1 當時研判「客戶端備份已成功、遷移完成」是**錯的**——2026-07-29／07-30 的錯誤信顯示 `oldMonthCount:1` 依舊、備份仍失敗，遷移從未成功；客戶不再看到阻擋層只是因為 Part B 把它限制成「每次開 App 最多一次」。詳見 2.2.2。
- **2.2.2** — **雲端寫入 403 診斷探針 ＋ 同步失敗使用者提示**。起因：正式站客戶端連兩天寄回四封錯誤信，`sync/backup`（建立備份表）與 `sync`（月份分頁 `batchUpdate`）**全部** 403 `PERMISSION_DENIED`，但同一 token 的**讀取正常** → 帳目根本沒上雲，一直停在本機 `PENDING`，而使用者毫無所覺（靜默失敗）。
  - **診斷探針**（`lib/sheets.ts` 的 `getWriteDiagnostics()` + 純函式 `lib/syncDiag.ts`）：偵測到權限類錯誤（`isPermissionDenied`）時，平行查 Drive 容量／該表 `canEdit`／實際授權 scope，分類成 `QUOTA_FULL` / `NO_EDIT_PERMISSION` / `SCOPE_MISSING` / `UNKNOWN` 附在錯誤回報裡。🔴 **2026-08-05 更正**：原記載「容量爆掉的帳號連自己的檔案都會回報 `canEdit=false`」**與實測不符**——客戶端實際回傳 `canEdit: true`；`canEdit` 反映 ACL、與容量無關，兩者是不同維度。順序（scope → 容量 → 編輯權）保留，理由改為「容量是可量化的硬事實，先判」；本案真正的功臣是**有把容量欄位一起收回來**，只探 `canEdit` 會落到 `UNKNOWN`。只用現有 scope（`drive.metadata.readonly`），客戶**不需重新授權**；探針**只送數字與布林值**，不送 email／試算表 ID／token／金額。
  - **使用者可見提示**（`components/SyncErrorBanner.tsx`）：同步失敗時跨所有 tab 顯示琥珀色橫幅（非紅色——資料安全存在本機，不是遺失），依分類給對應說法（如「Google 雲端硬碟空間已滿…請清理後重開 App，會自動補傳」），下輪同步成功自動消失。
  - ⚠️ 本版**刻意只做觀測、不猜著修**（systematic debugging）：假設是客戶 Google 帳號空間爆滿導致 Drive 轉唯讀，但 Google 只回泛用 `PERMISSION_DENIED`，故先取證再說。
  - ✅ **2026-08-05 取證完成、根因確認**：客戶端寄回兩封帶診斷欄位的信，`kind: QUOTA_FULL`——`quotaLimit` 15.000 GiB、`quotaUsage` 15.003 GiB（**僅超標約 3.32 MB**）、`canEdit: true`、`ownedByMe: true`、`trashed: false`、scopes 含 `spreadsheets`；`oldMonthCount:1` 自 07-29 起未變＝遷移從未完成。**已向客戶本人確認 Google 帳號容量滿載**。因果與原假設**相反**：不是備份機制把硬碟塞滿，而是硬碟本來就滿 → 備份一次都沒成功過（連一張備份表都沒建出來）。🔴 **Part C（單一固定備份表反覆覆蓋）作廢**：覆蓋既有備份表同樣是寫入，容量滿時一樣 403，修不了任何東西。
- **2.3.0** — **分類軟刪除墓碑 ＋ 孤兒類別回收**。起因：客戶回報「刪掉二級分類後，原本記在該二級的舊資料跟著不見」。查下去比回報的更嚴重——
  - **刪一級會讓那些金額整批從月結消失**：月結用「現存類別 ID 集合」加總（`dayIncome`/`dayExpense` 的防污染機制），類別一被移除，總收入／總支出／趨勢圖／淨額／vs 上月全部少掉那筆錢；而帳目頁當日小計是全部 reduce **不過濾** → **兩頁對不起來**。刪二級則讓交易的 `subId` 變 dangling、成本結構歸入「（未分類）」，**重建同名二級也救不回**（新 sub 是新 id）。
  - **修法＝沿用專案既有的墓碑做法**（同交易刪除的 `DELETED`）：`Category`／`Sub` 加 `deleted` 旗標，刪除＝標記不移除。🔴 **關鍵不對稱**——**選單只顯示未刪的**，**顯示與加總一律用含已刪的全集**；這個不對稱就是「使用者看不到已刪類別、但錢照算」的全部機制。
  - **跨裝置**：`_config` 加第 10 欄 `deleted`（舊表沒這欄＝視為未刪，向後相容）；二級旗標搭在既有序列化字串成第三段 `id:name:1`。
  - **孤兒回收**（救回升級前就被硬刪的）：pull 時從雲端交易列抽「類別 ID + 顯示名稱」線索，把 `_config` 已無、卻仍被交易引用的類別以墓碑補回 → **雲端層本來就是安全的**（id 來回不會被抹掉），壞掉的只有解讀層，所以不需要資料救援工程。🔴 回收必須**排在月份改寫之前**，否則改寫會把類別 ID 欄清空、連最後的線索都丟失。
  - **UI**：類別管理頁新增「已刪除」區塊可一鍵復原、類別編輯 Sheet 內列出已刪二級可復原；刪除確認文案改為誠實版本（原本寫「歷史帳目不受影響」是騙人的）。另修 `markAllRecordsPending` 還指著 Phase 5/7 已廢棄的 `db.dailyRecords`（＝「改類別後保護本機金額」其實早就不存在），並排除 `DELETED` 墓碑以免已刪交易復活。

- **2.4.1** — **修「類別的停用與刪除都沒有生效」**。客戶回報關閉或刪除類別後，過一陣子又跳回原狀。
  - **根因是一個缺陷造成兩個症狀**：類別設定寫進 Google Sheets 時用的是「比照使用者手動輸入」的模式，Sheets 於是把 `true`/`false` 這兩個字**轉成試算表的布林值**；讀回來時拿到的是大寫的 `TRUE`/`FALSE`，而程式比對的是小寫 → 停用被判成啟用、刪除記號被抹掉，接著覆蓋掉本機設定。
  - 🔴 **為什麼只有這兩個操作壞**：十個欄位裡只有「啟用」與「已刪除」是布林值，改名、圖示、顏色、二級分類都是純文字，來回不會走樣。症狀的形狀本身就指向布林欄位。
  - **為什麼現在才爆**：客戶帳號容量滿的那段期間（見 2.2.2），設定推不上雲 → 程式為了保護本機編輯而完全不拉取 → 也就沒機會覆蓋。容量清出來、推送恢復正常後，這個潛伏的解析錯誤才浮上檯面。
  - **為什麼 149 個測試沒接住**：這段解析夾在網路函式中間、不是純函式，而本專案的測試紀律是「純函式才寫測試」——夾在 I/O 裡的邏輯就成了盲區。本次把它抽成純函式並補上 12 個測試（161 綠）。
  - **修法**：寫入改為「照字面存」（順帶保護類別名稱不被當成日期或公式），讀取則同時認得大寫、小寫與真布林值。🔴 **兩側都要修**：寫側修好才不會繼續污染，讀側修好才救得回已經寫壞的雲端表。
  - ⚠️ **資料**：帳目完全不受影響。類別設定若在最後一次操作後又編輯過，被翻回來的值可能已覆蓋雲端，該筆設定需重做一次。

- **2.4.0** — **同步暫停閘門 ＋ 客戶可見同步狀態**。起因：2.2.2 已確認 403 的根因是客戶 Google 帳號容量滿載（15.003 GiB／上限 15.000 GiB，僅超標約 3.3 MB）。**帳號滿載不是 App 修得好的事**，App 唯一該做的三件事：別再對著必定失敗的雲端狂打、把實情講給客戶聽、修好後自己恢復。
  - **暫停閘門**：只對「重試一百次也不會好」的持久性成因暫停（容量滿／無編輯權／授權不足）；🔴 **暫時性失敗（`UNKNOWN`，多半是斷網）刻意不暫停**，否則只會害帳目延後上雲。
  - 🔴 **「暫停」刻意不是全停**：仍保留低頻心跳（每次開 App 一次＋長時間開著每 6 小時一次），一次成功就自動解除，**客戶清完空間後不必做任何事**。這正是不重蹈 2.2.1 覆轍之處——當時的修法只把症狀壓成「每次開 App 一次」卻沒有恢復路徑，根因修好了也沒人知道。
  - **講清楚**：橫幅加「我已清理完成，立即重試」按鈕（無視暫停閘門）＋「此問題已自動回報給開發者（僅傳送錯誤訊息，不含帳目內容與金額）」；設定頁新增同步狀態區——正常／⏸ 已暫停：<成因>／上次成功同步／**待上傳筆數**／上次錯誤原文。待上傳筆數是暫停期間客戶唯一能自行確認「帳目還在、只是沒上雲」的憑據。
  - **補靜默路徑**：還原、類別推送、token 取得三處失敗以前只寫 console（客戶與開發者兩邊都無聲），改為使用者可見＋自動回報；同步結尾不再無條件清除錯誤提示（帳目上雲但類別沒上雲時會被誤判為成功）。
  - **順手修的既有 bug**：設定頁「已記帳 N 天」讀的是逐筆交易改造後已廢棄的舊表，自那之後就一直停在舊數字。

## Git 分支流程

輕量 GitHub Flow（個人開發），完整設計見 `docs/superpowers/specs/2026-07-09-git-branch-workflow-design.md`：

- **`main` = 正式**：push 即自動部署 GitHub Pages，每次合併打 tag `vX.Y.Z`（SemVer）
- **`feature/*` / `fix/*`**：短命開發分支，從 main 切出，驗收通過併回 main 後刪除
- **`verify/*`**（可選）：預發驗收快照分支，供真機／跨裝置驗收

**測試 vs 正式試算表由 Vite env 控制**（`VITE_SHEET_NAME`，不再手改常數）：

| env 檔（已提交） | 指令 | 試算表 |
|---|---|---|
| `.env.development` | `npm run dev` | 測試表 `Ready-mPOS 記帳（逐筆交易測試）` |
| `.env.staging` | `npm run build:staging` | 測試表（本機驗收 build 版用） |
| `.env.production` | `npm run build`（CI 亦同） | 正式表 `Ready-mPOS 記帳` |

🔴 防呆：非 production build 的表名必須含「測試」、表名為空一律拒絕同步——開發／驗收環境絕不碰真實帳目；cutover 併 main 後正式站自動採用正式表名，無需改程式碼。
