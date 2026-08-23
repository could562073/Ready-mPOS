# AGENTS.md - Ready-mPOS

> **Documentation Version**: 2.0
> **Last Updated**: 2026-08-19
> **App Version**: 2.4.2（見下方「版本號規則」）
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
- **Frontend**: ✅ Complete — DailyEntryPage, MonthlyReportPage, SettingsPage, CategoriesPage, OnboardingPage
- **Dynamic Categories**: ✅ Complete — 收入/支出類別可自訂（新增、編輯、刪除、啟用停用）
- **Google Sheets Sync**: ✅ Complete — 雙向同步，token 持久化（localStorage），50 分鐘自動刷新
- **Push Notifications**: ✅ Complete — Service Worker + Web Push，自訂提醒時間
- **Deployment**: ✅ GitHub Pages (自動 CI/CD on push to main)
- **Backend**: ❌ Removed — 無後端伺服器，純前端架構
- **第 2 次優化（Phase 1–7 全部完成）**: 逐筆交易改造 — **全部完成**（Task 6 cutover 重複修正含於 Phase 5）。Phase 1：`Transaction` 型別、Dexie v3 自動遷移、`explodeDailyRecord` 拆解純函式 + Vitest、交易 CRUD/hook。Phase 2：二級分類純函式 CRUD + `CategoryEditSheet` 管理 UI + E2E。Phase 3：二級經 Sheets `_config` 跨裝置同步（`serializeSubs`/`parseSubs`）+ 修 push/pull 資料流失 + feature 分支同步隔離到獨立測試試算表（原為手改常數，2026-07-09 起已 env 化，見「Git 分支流程」）。Phase 4：記帳改逐筆交易 — 「記帳」tab 換成 `LedgerPage`（單日列表 + 右下 FAB → `TransactionSheet` 記帳，選一級自動帶入 `defaultSubId`），寫入 `transactions` + Playwright E2E。Phase 5：逐筆交易雲端同步 — 月份分頁改為新格式（`日期|收支|一級|二級|金額|備註|id`，`lib/txSheets.ts` 純函式：`isNewTxFormat` 偵測、`txToRow`/`rowToTx`、`mergeTransactionsById` 以 id 去重對帳）；舊格式 pull 時就地 `explodeDailyRecord` 拆解並標記待改寫，改寫前必先 `backupSpreadsheet`（Sheets API 逐分頁匯出到新建時間戳備份表；原 Drive `files.copy`+`drive.file` 因 403 已棄用），備份失敗則本輪跳過所有舊格式改寫；`syncAll`/`restoreFromSheets` 已切換讀寫 `db.transactions`。**Task 6（cutover 交易重複修正）**：`explodeDailyRecord` 改用決定性 id（`mpos:<date>:<type>:<categoryId>`），本機遷移與雲端 re-explode 對同一批歷史資料產生相同 id → `mergeTransactionsById` 正確去重，cutover 首次同步不再重複；此修正自動套用於新安裝及 v3 upgrade（只跑一次）。**Phase 6**：「帳目」頁改為**月曆 + 單日逐筆列表**（`lib/calendar.ts` 純函式 + `MonthCalendar` 元件，每格顯示當日淨額 = 收入−支出、不扣手續費），App **落地頁與導覽首項改為「帳目」** + Playwright E2E。**Phase 7**：Dashboard／月結改用 `transactions` 重算 —— 新增 `lib/aggregate.ts` 的 `buildDailyRecordsFromTx` adapter 把逐筆交易合成 `DailyRecord`，讓兩頁既有的 `dayIncome/dayExpense/calcFees/TrendChart/CategoryBars` 邏輯零改動重用；Dashboard/月結不再 import `useDailyRecord`/`useMonthlyRecords` + Playwright E2E 驗證「帳目新增一筆 → 首頁/月結皆反映」。**cutover 已於 2026-07-11 執行**（使用者核准）：併 main + tag `v2.0.0`，正式站 production build 自動採用正式表名（env 化，dev/staging=測試表，見「Git 分支流程」），真實資料由自動遷移（備份→改寫→阻擋層）處理。開發分支為 `feature/line-item-transactions-redesign`（已併入）。設計 spec：`docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`。
- **月結分析對帳報表（2.1.0）**: ✅ 月結頁原地強化——未記帳日卡（設定頁固定週公休 + 臨時逐日標記，`lib/closedDays.ts`）、成本結構卡（二級細目展開/支出佔收入比/vs 上月增減，`CostStructureCard`）、Hero vs 上月淨額（進行中=同期、歷史=全月，`lib/monthReport.ts` 純函式）、移除匯出 stub。spec：`docs/superpowers/specs/2026-07-09-monthly-report-analytics-design.md`。
- **移除首頁（2.2.0）**: ✅ 「首頁」tab 移除，導覽剩 帳目/月結/設定，帳目頁小計維持原本收入/支出兩卡（分潤機制已於同分支拔除，詳見下方新增條目）。`DashboardPage.tsx` 已刪除。spec：`docs/superpowers/specs/2026-07-14-remove-dashboard-design.md`。
- **修遷移無窮迴圈 + 遠端錯誤回報（2.2.1）**: ✅ 修正正式站客戶端「每存一筆就跳全螢幕『資料升級中』」——根因：`backupSpreadsheet` 每次同步都失敗 → `allowOldRewrite=false` → 舊格式月份永遠轉不成 → 遷移偵測每次成立、阻擋層每筆記帳都彈（無窮迴圈）。**Part B**（`useSyncService.ts`）：新增 `migrationTriedRef`，「顯示阻擋層＋跑備份」每次開 App 最多一次（`firstMigration`）；其後同一 session 的儲存只做輕量新格式推拉、不再彈層/不再重跑備份，下次重開才再試。`allowOldRewrite` 預設改為 `false`，僅備份成功才放行；改寫月份 gating 抽為純函式 `planMonthsToRewrite`（`lib/txSheets.ts`，Vitest 鎖定「備份失敗→舊格式月份一律排除、upgradeMonths 不受門檻限制」）。**資料保護紅線不變**（沒成功備份就不 clear+覆蓋舊格式分頁）。**Part A**（遠端錯誤回報，看不到客戶端錯誤的診斷補洞）：新增 `lib/errorReport.ts` 的 `reportError(context, err, extra?)`——fire-and-forget `fetch(VITE_ERROR_REPORT_URL, no-cors/text/plain/keepalive)` 到自建 Google Apps Script Web App（`doPost`→`MailApp.sendEmail`）；**URL 空＝no-op**（dev/staging 不送），去重＋12h 冷卻（純函式 `markAndCheck`，Vitest 覆蓋）＋**去識別化**（純函式 `redact()`：寄出前把 30 字以上 base64url 長字串換成 `<id>`，套用於 message/stack/簽章，避免夾帶試算表 ID／token；Vitest 覆蓋），**只送 message/stack（皆已去識別化）/UA/version/extra/token，絕不送試算表 ID 或帳目金額**；接於 `sync/backup`（備份失敗，帶 `oldMonthCount`）與 `sync`（同步整體失敗）。選用防濫用 `token`：payload 帶 `VITE_ERROR_REPORT_TOKEN`，與 Apps Script `REQUIRED_TOKEN` 比對放行（非機密＝同樣內嵌於公開 bundle，只擋隨機爬蟲）。env：`VITE_ERROR_REPORT_URL` / `VITE_ERROR_REPORT_TOKEN`（`vite-env.d.ts` 型別、`.env.example` 說明；dev/staging 留空故不送）；部署指引 `docs/error-reporting-apps-script.md`（含 `Code.gs`、Web App 部署步驟、URL 無法保密的說明）。✅ **2026-07-25 已部署上線並驗證**：Apps Script Web App 以「執行身分＝我／存取權＝任何人」+ `REQUIRED_TOKEN` 部署，`.env.production` 已填正式 URL＋token，v2.2.1 併 main + tag `v2.2.1` + GitHub Pages 部署綠燈；curl smoke test 端到端收信成功（未進垃圾信）＝回報管線活著。🔴 **此處原本記載「研判備份已成功、遷移完成」，該結論已被 2026-07-29／07-30 兩批錯誤信推翻，見下方 2.2.2**：備份從未成功（兩封信都帶 `oldMonthCount:1`，舊格式月份始終沒轉成），客戶之所以不再看到升級視窗，只是因為 Part B 的 `migrationTriedRef` 把阻擋層限制成每次開 App 一次而已——**症狀被壓住，根因仍在**。⚠️ 2.2.1 為 stop-gap，**未修根因**。
- **寫入 403 診斷 + 同步失敗提示（2.2.2）**: ✅ 正式站客戶端連兩天（2026-07-29／07-30）寄回四封錯誤信——`sync/backup` 與 `sync` 皆 403 `PERMISSION_DENIED`（建立備份表 `spreadsheets.create`、新增月份分頁 `batchUpdate/addSheet` 雙雙被擋），但**同一 token 的所有 GET 都成功**（分頁清單、儲存格值），且 `oldMonthCount:1` 證明 2.2.1 的遷移從未完成。**已排除**：scope 不足（三個 scope 中只有 `spreadsheets` 能讀儲存格值，讀得到就代表有它，而它本身即含建立/編輯權；granular consent 若少給會是 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` 且連讀都失敗）、鎖到別人分享的唯讀表（已向使用者確認為客戶自己帳號 + App 自建表）。**主假設＝Google 帳號容量已滿 → Drive 轉唯讀**（讀 OK、建立/編輯全擋），但 Google 只回泛用字串無法斷定，故本版**先加儀器、不猜著修**。**Part 1（診斷）**：`lib/syncDiag.ts` 純函式 `classifyWriteFailure(diag)` → `QUOTA_FULL｜NO_EDIT_PERMISSION｜SCOPE_MISSING｜UNKNOWN`＋`writeFailureMessage(kind)`＋`isPermissionDenied(err)`（Vitest 16 例）。🔴 **判斷順序理由已於 2026-08-05 更正**：原記載「`QUOTA_FULL` 必須排在 `canEdit` 之前——空間滿時連自己擁有的檔案都會被降成唯讀（`canEdit=false`）」**與實測不符**——客戶端實際回傳 `canEdit: true`（Drive 仍宣稱可編輯，但任何寫入都 403）；`canEdit` 反映的是 ACL 權限、與容量無關，「容量滿→轉唯讀」是獨立於 ACL 的另一道封鎖，兩者是不同維度，不存在「誤判」關係。順序在本案其實不影響結果（兩種排法都得 `QUOTA_FULL`），現行順序（scope→quota→canEdit）保留，理由改為「容量是可量化的硬事實，先判」。真正讓本案定案的是**有把 quota 欄位一起收回來**——若當初只探 `canEdit` 會落到 `UNKNOWN`，成因永遠查不出來（教訓：診斷的價值在事實收得齊不齊，不在分類邏輯多聰明）。查不到的欄位一律 `null` 且**不臆測**。`lib/sheets.ts` 的 `getWriteDiagnostics()` 網路探針並行查 Drive `about.get?fields=storageQuota`（容量）、`files/<id>?fields=capabilities(canEdit),ownedByMe,trashed`（該表可否編輯）、`tokeninfo`（**實際被授予**的 scopes）；三原則：絕不 throw（只跑在錯誤路徑，不得蓋掉原始錯誤）、只收集非敏感事實、**只用現有 scope**（`drive.metadata.readonly` 已足夠呼叫 `about.get`／`files.get`）故**客戶不需重新授權**。**Part 2（使用者可見）**：`useSyncService` 新增 `syncError` 狀態 + `dismissSyncError`，兩處失敗（`sync/backup`／`sync`）改走共用的 `handleSyncFailure`（跑探針→分類→設狀態→帶診斷回報）；`components/SyncErrorBanner.tsx` 跨所有 tab 顯示琥珀色橫幅（**刻意非紅色**——資料其實安全存在本機，紅色會讓老闆誤以為帳目不見了），每則訊息都必須含「本機」二字（Vitest 鎖定）。修掉的是比 403 更危險的**靜默失敗**：在此之前同步失敗只寫 console + 寄信給開發者，客戶端毫無感覺，帳目一直停在本機 PENDING 卻以為早已上雲。🔴 **隱私**：`extra` **不經** `redact()`（該函式只套用於 message/stack/簽章），故診斷欄位只放數字／布林／scope 字串——`quotaLimit`/`quotaUsage`/`canEdit`/`ownedByMe`/`trashed`/`scopes`/`kind`，**不送 email、試算表 ID、access token 或任何金額**。⚠️ 探針只在 `isPermissionDenied(err)` 為真時才跑（離線／逾時跑了也只是再失敗一次）；且 `reportError` 以 `context|message[:200]` 去重 + **12h 冷卻**，故部署後要等下一次冷卻已過的失敗才會收到含診斷的信（依觀察到的約每日一次頻率，大致是隔天）。**Part C（改用單一固定備份表反覆覆蓋、不每次新建）依使用者指示暫緩**，待該封信釘死根因再決定。 ✅ **2026-08-05 根因確認、Part C 作廢**：客戶端寄回兩封帶診斷欄位的信（`sync/backup` 建備份表 403、`sync` 的 `batchUpdate/addSheet` 403），`kind: QUOTA_FULL`——`quotaLimit` 16,106,127,360（15.000 GiB）、`quotaUsage` 16,109,607,848（15.003 GiB，**僅超標 3,480,488 bytes ≒ 3.32 MB**）、`canEdit: true`、`ownedByMe: true`、`trashed: false`、scopes 含 `spreadsheets`；`oldMonthCount:1` 自 07-29 起未變＝遷移從未完成。**2026-08-05 已向客戶本人確認 Google 帳號容量滿載**。因果與 2.2.1 的猜測**相反**：不是「備份機制把硬碟塞滿」，而是「硬碟本來就滿 → 備份一次都沒成功過」（`spreadsheets.create` 從未成功，連一張備份表都沒建出來；就算建過，一張數月帳目的試算表也是 KB 等級）。🔴 **Part C 作廢**：覆蓋既有備份表同樣是寫入，容量滿時一樣 403，修不了任何東西，還會為此動到唯一那道資料保護機制。
- **分類軟刪除 + 孤兒回收（2.3.0）**: ✅ 客戶回報「刪掉二級分類後，原本記在該二級的舊資料跟著不見」。查下去比回報的更嚴重——**刪一級會讓那些金額整批從月結消失**：`MonthlyReportPage` 的 `knownIncomeIds/knownExpenseIds` 只從**現存**類別建集合，`dayIncome/dayExpense` 只加總集合內的 id，類別一被移除，總收入／總支出／趨勢圖／淨額／vs 上月全部少掉那筆錢；而 `LedgerPage` 當日小計是全部 reduce **不過濾** → **帳目頁有、月結沒有，兩頁對不起來**。刪二級則讓交易的 `subId` 變 dangling，月結成本結構的二級細目歸入「（未分類）」，**重建同名二級也救不回**（新 sub 是新 id）。附帶抓到兩個既有缺陷：`CategoriesPage` 的確認文案寫「歷史帳目不受影響」是**騙人的**，以及 `markAllRecordsPending` 還在改 `db.dailyRecords`（Phase 5/7 已廢棄的死表）→ 「改類別後保護本機金額不被雲端覆蓋」其實**早就等於不存在**。**修法＝沿用專案既有的墓碑做法**（同 `deleteTransaction` 的 `SyncStatus='DELETED'`）：`Category`/`Sub` 加 `deleted?: boolean`，刪除＝標記不移除（`deleteCategory`/`deleteSub` 純函式，附 `restoreCategory`/`restoreSub`）。🔴 **關鍵不對稱**：**選單只顯示未刪的**（`getEnabledByType`／`liveSubs`／`TransactionSheet`／`CategoryEditSheet`／`txDraft` 的預設與記憶帶入都濾掉 `deleted`），**顯示與加總一律用含已刪的全集**（`getAllByType` **刻意**不濾；`getCategories()` 回傳原始清單，故月結的 known ids 與各處名稱查詢**零改動**就自動含墓碑）——這個不對稱就是「使用者看不到已刪類別、但錢照算」的全部機制。跨裝置：`_config` 加第 10 欄 `deleted`（範圍 `A1:J`，舊表沒這欄 → `idx=-1` → 視為未刪，向後相容）；二級的旗標搭在既有序列化字串後面成第三段 `id:name:1`（`encodeURIComponent` 會把 `:` 轉 `%3A`，name 段內不可能有裸冒號 → 解析無歧義；舊版 client 會把 `:1` 併進名稱顯示，僅影響已刪二級且正式站單一裝置，可接受）。**孤兒回收**（救回升級前就被硬刪的）：pull 時用 `categoryHintsFromRow`（`lib/txSheets.ts` 純函式）從雲端列抽「一級ID/二級ID + 顯示名稱」線索，`recoverOrphanCategories`（`lib/categories.ts` 純函式）把 `_config` 已無、但仍被交易引用的類別以 `deleted:true` 墓碑補回（名稱取自雲端列，空白則用 `ORPHAN_CATEGORY_NAME`；先補一級再把二級掛回去，找不到一級的二級跳過；無缺漏回 `null` 讓呼叫端跳過寫入）→ **雲端層本來就是安全的**（`txToRow` 原樣寫 id、`rowToTx` 優先讀 ID 欄，dangling id 來回不會被抹掉），壞掉的只有解讀層，所以不需要資料救援工程。🔴 回收**必須排在月份改寫之前**：`txToRow` 只在類別可解析時才寫「一級ID」欄，帶著孤兒去改寫會把該欄清空、連最後的線索都丟失。UI：類別管理頁新增「已刪除」區塊可一鍵復原，類別編輯 Sheet 內列出已刪二級可復原；確認文案改為誠實版本。另修 `markAllRecordsPending` 指向 `db.transactions` 並**排除 `syncStatus='DELETED'` 墓碑**（把墓碑改成 PENDING 會讓已刪交易被當待同步資料寫回雲端而「復活」）。刪類別不再觸發整月改寫（固定 9 欄格式下刪類別不改變任何列內容，只需推 `_config`；改名路徑仍走全量改寫），順帶避免對容量已滿的客戶帳號狂打失敗寫入。Vitest 132 綠（+20）。spec：見本條。
- **同步暫停 + 客戶可見狀態（2.4.0）**: ✅ 承 2.2.2 的根因確認（客戶 Google 帳號容量滿 → 所有寫入 403）——**帳號滿載不是 App 修得好的事**，App 唯一該做的是：別再對著必定失敗的雲端狂打、把實情講給客戶聽、修好後自己恢復。**B1 暫停狀態層**（`lib/syncPause.ts` + 17 個 Vitest）：`mpos_sync_pause` 持久化 `{kind, since, lastTriedAt, failCount}`，`shouldPauseFor(kind)` **只對持久性成因暫停**（`QUOTA_FULL｜NO_EDIT_PERMISSION｜SCOPE_MISSING`）——🔴 **`UNKNOWN` 刻意不暫停**：那多半是暫時斷網，暫停只會讓帳目延後上雲。🔴 **「暫停」刻意不是全停**：`allowHeartbeat()` 仍放行「每次開 App 一次 + 同一 session 每 `HEARTBEAT_MS`（6h）一次」的低頻心跳，成功即 `clearPause()` **自動恢復，客戶不必做任何事**——這正是不重蹈 2.2.1 覆轍的地方（`migrationTriedRef` 只把症狀壓成「每次開 App 一次」卻沒有恢復路徑，根因修好了也沒人知道）。毀損的 localStorage 一律視為未暫停（絕不能永久卡死同步）。**hook 整合**：`syncAll` 拆為 `runSync(manual)`，對外 `syncAll`（自動、吃閘門）與 `retryNow`（手動、無視閘門並先清暫停）；🔴 **分兩支而非加參數**——`syncAll` 同時當 `window.addEventListener('online', syncAll)` 與 React `onClick` 的 handler，加參數會把 Event 物件吃進去。整輪成功走 `markSyncOk()`（清暫停 + 記 `mpos_sync_last_ok`）；`syncError` 初始值改由持久化暫停狀態還原 → **橫幅常駐**（重開 App 仍在），X 只是本 session 隱藏。🔴 **`restoreFromSheets` 成功刻意不呼叫 `markSyncOk()`**：還原是唯讀 pull，證明不了寫入已恢復。**B2/B3 橫幅**：加「我已清理完成，立即重試」（`QUOTA_FULL` 專屬文案，其他成因為「立即重試」）接 `retryNow`；加「自動同步已暫停…重開 App 會自動恢復」；加「此問題已自動回報給開發者（僅傳送錯誤訊息，不含帳目內容與金額）」，該行以新增的 `isErrorReportEnabled()` gating——**dev/staging 端點留空＝根本沒送，就不能對使用者說已回報**。（工作項目 C 的「要不要送出」詢問視窗依使用者指示暫緩，回報維持全自動。）**B4 設定頁狀態區**（沿用既有 Google Sheets 卡片，未開新檔）：自動同步正常／⏸ 已暫停：<成因>／上次成功同步（相對時間）／**待上傳筆數**（`PENDING` 交易 + 未寫回的 `DELETED` 墓碑）／上次錯誤原文；設定頁「同步」鈕改接 `retryNow`（走 `syncAll` 的話暫停期間按了毫無反應，客戶只會覺得按鈕壞了）。**B5 靜默路徑補洞**（以前只寫 console，客戶與開發者兩邊都無聲）：`restoreFromSheets`／`syncCategories` 的 catch 改走 `handleSyncFailure`；`warmToken` 兩處 `.catch(() => {})` 改為 `reportError`（token 一失敗＝整個同步從頭到尾沒跑過，最該回報）；🔴 `syncAll` 內兩處 `pushConfigToSheets` 失敗改記 `configErr`，結尾**不再無條件 `setSyncError(null)`**——帳目上雲但類別沒上雲時改跑一次 `handleSyncFailure`（診斷探針一輪仍只跑一次）；手動重試遇離線／未登入也給訊息，不再無聲 return。**順手修的既有 bug**：設定頁「已記帳 N 天」讀的是 `db.dailyRecords.count()`（Phase 5/7 起已廢棄的死表，只剩 cutover 前殘留列）→ 自逐筆交易改造後就一直停在舊數字，改由 `db.transactions` 算不重複日期。Vitest 149 綠（+17）。
- **修類別停用／刪除同步不生效（2.4.1）**: ✅ 客戶回報「類別管理的關閉與刪除都沒有生效」——操作完看似成功，過一陣子又跳回原狀。**單一缺陷、兩個症狀**：`pushConfigToSheets` 以 `valueInputOption=USER_ENTERED` 寫 `_config`，該選項的語意等同「使用者手打」，Sheets 於是把字串 `'true'`/`'false'` 解析成**布林儲存格**；`pullConfigFromSheets` 用預設的 `FORMATTED_VALUE` 讀回來拿到的是顯示字串**大寫** `'TRUE'`/`'FALSE'`，而解析器比對的是小寫字面值 → `enabled: r[...] !== 'false'` 對 `'FALSE'` 永遠成立（停用被翻回啟用）、`deleted: r[...] === 'true'` 對 `'TRUE'` 永遠不成立（2.3.0 的墓碑被抹掉、類別復活），接著 `applyCloudCategories` 覆蓋 localStorage，使用者的操作就這樣被還原。🔴 **為什麼只有這兩個操作壞**：十欄裡只有 `enabled`／`deleted` 是布林，改名／圖示／顏色／二級都是純文字，往返無損；二級的刪除旗標藏在序列化字串 `id:name:1` 裡（也是純文字）所以同樣倖存——症狀的形狀本身就指向布林欄。**為什麼現在才爆**：客戶帳號容量滿（見 2.2.2）期間 push 一路 403 → dirty 旗標清不掉 → `pullConfigFromSheets` 開頭 `isCategoriesDirty()` 就 return null → **從來沒拉取過，也就沒機會覆蓋**；容量清出來後 push 成功、dirty 清掉、pull 開始跑，潛伏的解析 bug 才浮上檯面（2.3.0 於 2026-08-09 上線，2026-08-18 回報）。**為什麼 149 個測試沒接住**：這段解析 inline 在網路函式 `pullConfigFromSheets` 中間、不是純函式，`_config` 往返路徑零覆蓋——專案的測試紀律是「純函式才有測試」，於是夾在 I/O 裡的邏輯就成了盲區。**修法（讀寫兩側都修）**：🔴 只修一側不夠——**寫側改好才不會繼續污染，讀側改好才救得回已經壞掉的雲端表**（客戶表裡現存的已經是布林儲存格）。`lib/categories.ts` 抽出純函式 `CONFIG_HEADERS`（從 `sheets.ts` 移來，與轉換函式放一起）／`categoriesToConfigRows`／`configRowsToCategories`／`parseSheetBool`；`parseSheetBool` 同時認得 `'TRUE'`/`'true'`/真布林（`UNFORMATTED_VALUE` 會給真的 boolean），無法辨識時回 fallback——`enabled` 預設 `true`、`deleted` 預設 `false`，**寧可多顯示一個類別，也不要因欄位遺失讓整批帳目的類別無聲消失**（沿用 2.3.0 的紅線思路）。寫入改 `valueInputOption=RAW`（`backupSpreadsheet` 早有先例），順帶保護類別名稱不被當成日期或公式解析。`push`/`pull` 改呼叫純函式，其餘行為不變、**未新增任何 API 呼叫**。Vitest 161 綠（+12：大寫 TRUE/FALSE、真布林、小寫、舊表缺 `deleted` 欄、`enabled` 欄缺漏、欄序變動、空列略過、完整往返）。⚠️ **資料可復原性**：客戶最後一次停用／刪除若有推上雲，雲端 `_config` 仍是布林 TRUE，修好的讀取端下次 pull 就會還原；但若之後又編輯過任何類別（dirty → push 把翻回來的 `false` 寫回雲端），那筆設定就真的沒了，需請客戶重做一次。**帳目資料不受影響**（月份分頁完全沒動）。⚠️ 月份分頁的寫入仍是 `USER_ENTERED`（金額要存成數字、`rowToTx` 以 ID 欄關聯且 id 為 UUID 不會被轉型）——本次刻意不動，留為後續觀察項。
- **資安檢測 + 測試安全網 第一輪（2.4.2）**: ✅ 全專案資安檢測後的第一批落地。刻意**只挑零行為變更的項目先走**，讓後續高風險改動（token 儲存位置、`RAW`/`UNFORMATTED_VALUE` 切換、CSP）落地時已經有測試網可接。**L1 解析純函式**：`lib/txSheets.ts` 新增 `parseSheetAmount` / `parseSheetDate`（+20 Vitest，181 綠）。動機＝**2.4.1 事故的未爆版本**——`sheets.ts` 所有讀取都沒指定 `valueRenderOption`，一律吃預設的 `FORMATTED_VALUE`，拿到的是「畫面上顯示的字串」而非儲存格真值。今天沒出事只是因為寫進去的是無格式整數；但只要使用者在試算表上對「金額」欄套用一次貨幣或千分位格式，讀回來就變成 `"1,234"`，而現行 `rowToTx` 的 `Number(...) || 0` 會把它**吞成 0**，接著被整月 clear+覆蓋寫回雲端——**本機與雲端同時歸零，且全程沒有任何錯誤訊息**。🔴 兩個函式的共同紅線：**解析失敗一律回 `null`，絕不回 0、也絕不猜一個日期**——0 本身是合法金額，拿它當「解析失敗」的哨兵值等於授權一次壞掉的讀取覆寫使用者的真實帳目；同理 `parseSheetDate` **刻意拒收** `8/23/2026`（美式）與 `23/8/2026`（歐式），字串本身分不出月與日，猜錯會讓整筆交易落到錯誤月份而在月結中消失，寧可回 `null` 讓呼叫端略過該列、本機值勝出。⚠️ **此版刻意不接線**：`rowToTx` 仍為舊寫法、行為完全不變——接線與「寫入改 `RAW` + 讀取改 `UNFORMATTED_VALUE`」屬同一次語意變更，排在後續輪次一起做、一起驗收；先獨立落地並用測試把行為鎖死，是為了不重演 2.4.1「解析邏輯夾在網路函式裡＝零測試覆蓋」。**CI**（`.github/workflows/deploy.yml`）：`npm install` → **`npm ci`**（以 lock 檔為準，避免部署當下悄悄升版而正式站與本機驗收跑的不是同一份相依；已用 `npm ci --dry-run` 確認 lock 與 `package.json` 同步）、Node 20 → 22、`checkout`/`setup-node` v4 → v5（清掉 node20 runtime 淘汰警告）。**隱私政策**（`frontend/public/privacy.html`）改寫為繁體中文並與實作對齊：移除**根本沒發生**的宣稱（IP／瀏覽行為／OS 蒐集、行銷聯絡、第三方分享、Opt-Out 說明），補上**真的有但沒寫**的事實（無後端架構＝帳目只在使用者裝置與其自己的 Google 帳號之間、IndexedDB 與 localStorage 各存什麼、三個 OAuth scope 各自用途、錯誤回報「送什麼／絕不送什麼」＋`redact()` 去識別化＋12h 冷卻＋僅正式站啟用，以及「目前沒有 App 內開關可停用錯誤回報」的誠實說明）。⚠️ `terms.html` 有同類問題（最嚴重：仍寫「服務商儲存並處理您提供的個人資料」，與新隱私政策直接矛盾），本輪**未動**，留待後續。
- **分潤機制拔除（2.2.0 同分支）**: ✅ 外送平台手續費扣抵在真實記帳流程中不成立（撥款已是分潤後淨額）——帳目頁小計卡、月結 Hero／上月比較／逐日列均移除手續費扣除，類別管理移除手續費設定 UI，預設 Uber Eats/foodpanda fee 歸零。`Category.fee` 型別欄位與 Sheets `_config` 的 fee 欄位保留不動（供既有雲端資料相容），`calcFees()` 函式保留但目前**沒有任何呼叫方**（`DailyEntryPage.tsx` 的手續費計算是自己 inline filter/reduce，並未呼叫 `calcFees()`）——僅為未來可能用途保留，非因仍有頁面使用。

---

## 🔖 版本號規則 (Versioning)

採 **SemVer**（`MAJOR.MINOR.PATCH`）。單一事實來源 = `frontend/package.json` 的 `version`，
經 `vite.config.ts` 的 `define` 注入為全域常數 `__APP_VERSION__`（宣告於 `src/vite-env.d.ts`），
設定頁底部顯示 `Ready-mPOS v{__APP_VERSION__}`。**改版本只改 `package.json` 一處**。

- **MAJOR**：資料模型 / 架構破壞性變更（例：本次逐筆交易改造、Dexie schema 升版、Sheets 分頁格式改版）。
- **MINOR**：向後相容的新功能（例：二級分類、月曆帳目頁、記帳 Sheet UX）。
- **PATCH**：修正與小調整（bug fix、文案、樣式）。
- **預發布**：尚未上正式資料的大改在合併前掛 `-beta.N` 尾碼（本次逐筆交易改造 cutover 前即為 `2.0.0-beta.1/2`）。

**目前 = `2.4.2`**（資安檢測第一輪：解析純函式 + CI `npm ci` + 隱私政策 → PATCH：無行為變更）。
`2.4.1` = 修 `_config` 布林欄往返，類別停用／刪除同步不生效（PATCH）。
`2.4.0` = 同步暫停閘門 + 低頻心跳自動恢復 + 客戶可見同步狀態／手動重試（MINOR）。
2026-07-11 cutover 併 main、tag `v2.0.0`：逐筆交易是資料模型大改 → MAJOR 進位到 2。
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
│       │   ├── MissingDaysCard.tsx    # 月結未記帳日提示卡（固定週公休+臨時標記，2.1.0）
│       │   ├── SyncErrorBanner.tsx    # 同步失敗提示橫幅（跨所有 tab，琥珀色，2.2.2；2.4.0 加手動重試＋回報告知）
│       │   ├── CostStructureCard.tsx  # 月結成本結構卡（二級細目/佔收入比/vs 上月，2.1.0）
│       │   └── CategoryEditSheet.tsx  # 類別新增/編輯底部 Sheet（共用）
│       ├── lib/
│       │   ├── sheets.ts              # Google Sheets API + GIS OAuth2
│       │   ├── categories.ts          # 類別 localStorage CRUD + 軟刪除墓碑/孤兒回收（2.3.0）+ _config 列⇄物件純函式（2.4.1）+ calcFees
│       │   ├── notification.ts        # SW 通知工具（權限、sendReminderToSW）
│       │   ├── tokens.ts              # Design tokens（色彩、字體、圓角）
│       │   ├── fmt.ts                 # NT$ 金額格式化
│       │   ├── ids.ts                 # newId() 穩定 ID 產生器
│       │   ├── migrate.ts             # explodeDailyRecord：舊 DailyRecord→Transaction[] 拆解（純函式）
│       │   ├── txDraft.ts             # resolveDefaultSub：記帳帶入預設二級（純函式，防 dangling）
│       │   ├── txSheets.ts            # 逐筆交易⇄Sheets 列轉換、新舊格式偵測、id 對帳（純函式，Phase 5）+ 金額/日期儲存格解析（2.4.2，尚未接線）
│       │   ├── calendar.ts            # 月曆：月份日期矩陣 / 每日淨額 / 切月（純函式，Phase 6）
│       │   ├── aggregate.ts           # buildDailyRecordsFromTx：交易→合成 DailyRecord（純函式，Phase 7）
│       │   ├── closedDays.ts          # 公休日儲存層：固定週公休 + 臨時逐日標記（localStorage，2.1.0）
│       │   ├── syncDiag.ts            # 寫入失敗分類純函式：classifyWriteFailure/writeFailureMessage/isPermissionDenied（2.2.2）
│       │   ├── syncPause.ts           # 同步暫停狀態 + 低頻心跳判斷（持久性成因才暫停，成功自動解除，2.4.0）
│       │   ├── monthReport.ts         # 月結分析純函式：漏記日/上月比較區間/類別二級彙總（2.1.0）
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
3. **自動加總** — 每日小計、月結彙整，消除對帳錯誤
4. **離線優先** — IndexedDB 本地儲存，儲存後即時同步 Google Sheets
5. **跨裝置** — 同一 Google 帳號共用同一試算表，類別設定也同步
6. **打烊提醒** — Service Worker 推播，自訂時間，即使 App 最小化也能收到

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
- `lib/txSheets.ts`（純函式，Vitest 覆蓋）：`TX_MONTH_HEADERS` 固定 9 欄表頭 `日期|收支|一級類別|二級類別|金額|備註|id|一級ID|二級ID`（不隨類別增減變動）；`isNewTxFormat` 偵測月份分頁是否已是新格式；`txToRow`/`rowToTx` 單筆轉換；`mergeTransactionsById` 以 `Transaction.id` 去重合併（本機 `PENDING` 優先於雲端版本）。
- **儲存格值解析（2.4.2，已落地但尚未接線）**：`parseSheetAmount`／`parseSheetDate` 純函式，處理 `FORMATTED_VALUE` 的顯示字串（`"1,234"`、`"NT$1,234"`、`"(500)"`、`"2026/8/23"`）與 `UNFORMATTED_VALUE` 的真值（數字、日期序列號）。🔴 **解析失敗一律回 `null`，絕不回 0 或猜日期**；`parseSheetDate` 刻意拒收月日順序不明的 `8/23/2026`／`23/8/2026`。接線時機見 2.4.2 條目。
- **類別關聯鍵 = ID 欄（2.0.1 hotfix）**：2.0.0 的 7 欄格式只存類別**名稱**，類別改名後雲端列對不回 → pull 退化成未知類別字串並覆蓋本機 SYNCED 交易（正式站踩到）。修正：加 `一級ID|二級ID` 欄為機器關聯鍵（名稱欄降級為純顯示），`rowToTx` 優先用 ID 欄、空 ID 退回名稱對照（相容 7 欄舊列與手動補列）；`txToRow` 只在 categoryId 可解析時寫一級ID（未解析字串留白，名稱恢復時可靠名稱重連）；pull 偵測缺 `一級ID` 欄的月份回報 `upgradeMonths`，併入待改寫月份就地補欄（加欄改寫不走舊格式備份門檻）。
- `lib/sheets.ts`：`pullAllTransactionsFromSheets` 逐月偵測格式——新格式直接讀；舊彙總格式用抽出的純函式 `parseOldMonthRows` + `explodeDailyRecord` 就地拆成交易，並標記該月待改寫。`syncMonthTransactionsToSheets` 對新格式月份 `values:clear` + 整表覆蓋寫回。`backupSpreadsheet` 在改寫任何舊格式分頁前建立時間戳備份：**Sheets API 匯出**（逐分頁讀值寫入新建備份表，走既有 `spreadsheets` scope）——原 Drive `files.copy` 方案因 `drive.file` scope 只授權 app 自建檔案、對既有表 403 `appNotAuthorizedToFile` 而棄用，`drive.file` 已自 `SCOPES` 移除。
- **資料保護紅線**：舊格式分頁改寫前必先 `backupSpreadsheet` 成功；備份失敗則該輪同步**跳過所有舊格式分頁改寫**（即使該月同時有本機 `PENDING` 待寫也不改寫，等下次同步重試）。
- `hooks/useSyncService.ts`：`syncAll`/`restoreFromSheets`/`clearLocalData` 已改讀寫 `db.transactions`（以 id 去重對帳，本機 `PENDING` 優先）。
- **刪除同步 = 軟刪除墓碑（2026-07-09 修正）**：`deleteTransaction` 改標 `syncStatus='DELETED'`（不硬刪）——硬刪會讓雲端列永不移除、且下次 pull 對帳把該列當新資料「復活」加回。機制：畫面查詢（`useDay/useMonthTransactions`）過濾墓碑；`syncAll` 待改寫月份含 `DELETED`，寫回時排除墓碑列（整月 clear+覆蓋 → 雲端該列消失），**寫回成功後才真正清除墓碑**（失敗保留、下次重試）；墓碑存在期間 merge 不 toAdd 也不覆蓋（Vitest 鎖定）。**儲存/刪除後自動同步**：`App → LedgerPage → TransactionSheet` 的 `onSync`（=`syncAll`）在每次成功寫入後觸發（修 Phase 4 換頁漏接「儲存後即時同步」）；刪除有二次確認小視窗。
- ✅ **cutover 交易重複已解決（Task 6）**：`explodeDailyRecord` 現採決定性 id `mpos:<date>:<type>:<categoryId>`，本機 v3 upgrade 時產生的 id 與雲端 pull 時 re-explode 同一批舊資料產生的 id 完全相同，`mergeTransactionsById` 可正確辨識並去重，cutover 首次同步不再發生重複。此修正自動套用於新安裝及 v3 upgrade 過程（upgrade 僅執行一次）；在此修正前已於 dev 分支跑過舊版遷移的裝置，其本機交易仍為舊隨機 id，可使用 `restoreFromSheets`（覆蓋本機）或 `clearLocalData`（重置）重新同步。cutover 已於 2026-07-11 執行（併 main + tag `v2.0.0`）；表名 env 化，dev/staging 自動連測試表、production build 自動連正式表（見「Git 分支流程」）。

### 帳目頁月曆 + 落地頁（第 2 次優化 Phase 6）
- `lib/calendar.ts`（純函式，Vitest 覆蓋）：`buildMonthMatrix('YYYY-MM')` 產生週列陣列（每列 7 格、`'YYYY-MM-DD'` 或 `null` 補白、週日為每週第一天）；`monthDayNets(txs)` 算 date→當日淨額（`Σ收入 − Σ支出`）；`shiftMonth(month, delta)` 跨年切月。
- `components/MonthCalendar.tsx`：用 `useMonthTransactions(month)` 取當月交易算每日淨額；每格顯示日期 + 淨額（+綠/−紅、0 或無資料不顯示）、今天描邊、選定填 `T.ink`、點格切換選定日、上方切月列。元件不自持 month 狀態（由父層 `date.slice(0,7)` 導出，單一事實來源）。
- `LedgerPage`（第 2 次優化「帳目」頁）= `MonthCalendar` 月曆 + 既有單日逐筆列表 + 小計 + FAB；切月時把選定日設為新月 1 號。
- `App.tsx`：**落地頁與導覽首項改為「帳目」**（`daily` tab、icon `calendar`、`useState<Tab>('daily')`）；導覽順序 帳目 / 首頁 / 月結 / 設定（2.2.0 起移除首頁，剩 帳目/月結/設定）。月結點日仍導到「帳目」並落在該月。
- Playwright E2E 覆蓋：落地即帳目、FAB 新增交易後可見、點日切換單日列表。

### Dashboard/月結改用交易重算（第 2 次優化 Phase 7）
- `lib/aggregate.ts` 的 `buildDailyRecordsFromTx(txs)`（純函式）把逐筆交易依 `date` group 成合成的 `DailyRecord[]`（`incomes`/`expenses` 為 categoryId→金額加總），讓月結（`MonthlyReportPage`）既有的 `dayIncome`/`dayExpense`/`TrendChart`/`CostStructureCard` 等彙總與圖表邏輯**零改動**重用——該頁改用 `useMonthTransactions` 取交易後餵給這個 adapter，不再 import `useMonthlyRecords`（Phase 7 當時亦覆蓋 `DashboardPage`，但該頁已於 2.2.0 移除；`calcFees` 亦隨分潤機制拔除不再被此頁使用，見上方「分潤機制拔除」條目）。
- Playwright E2E（`e2e/transactions.spec.ts`）覆蓋：在「帳目」用 FAB 新增一筆今日收入後，斷言帳目頁小計「收入合計」即時反映該筆、切到「月結」斷言本月「總收入」含該筆——驗證兩頁確實從 `transactions` 重算而非讀舊快照（Dashboard 已於 2.2.0 移除，`buildDailyRecordsFromTx` 仍為月結所用）。

### 類別系統（`lib/categories.ts`）
- 類別儲存在 `localStorage`（key: `mpos_categories`）
- `Category` 型別：`{ id, name, icon, color, fee?, enabled, type, subs?, defaultSubId?, deleted? }`
- 🔴 **軟刪除墓碑（2.3.0）**：`deleted` 為一級／二級共用的墓碑旗標，刪除＝標記不移除。**選單濾掉、加總不濾**——`getEnabledByType()`／`liveSubs()` 給記帳選單用（排除 `deleted`）；`getAllByType()` 與直接 `getCategories()` 給顯示／加總用（**含** `deleted`）。改動任何一處前先確認自己在哪一側：把墓碑從加總側濾掉，等於讓舊帳目的金額從月結消失（這正是 2.3.0 修的 bug）。純函式 `deleteCategory`/`restoreCategory`/`deleteSub`/`restoreSub`/`liveSubs`/`recoverOrphanCategories`，Vitest 覆蓋。
- **二級分類（Phase 2 CRUD/UI + Phase 3 同步完成）**：`subs: { id, name }[]`（二級**繼承**一級 icon/color/fee，本身只有 id/name）、`defaultSubId: string|null`（記帳時預設帶入，`null` = 無）。純函式 CRUD `addSub / renameSub / deleteSub / setDefaultSub`（不 mutate、回傳新 `Category`；`deleteSub` 刪到預設二級時自動清 `defaultSubId`），Vitest 覆蓋。管理 UI 在 `CategoryEditSheet` 內（點類別→編輯→「二級分類」區），儲存時 trim + 去空名 + 修正失效的 `defaultSubId`。**跨裝置同步（Phase 3）**：`serializeSubs`/`parseSubs`（`id:encodeURIComponent(name)`，`|` 分隔）序列化進 `_config` 的 `subs`/`defaultSub` 兩欄（2.3.0 起 `subs` 的每段可再帶第三段 `:1` 表示已軟刪除，並另有獨立的 `deleted` 欄記一級的墓碑）；`pushConfigToSheets`/`pullConfigFromSheets` lockstep 帶上這兩欄（push 在清 dirty **前**序列化，修掉 Phase 2 的資料流失），舊 7 欄 `_config` pull 容錯視為無二級。「記帳時自動帶入預設二級」待 Phase 4。
- `fee` 為小數（0.3 = 30%）型別欄位（含 Sheets `_config` 同步欄）**保留但未使用**——分潤機制已於 2.2.0 拔除，帳目頁/月結計算與類別管理 UI 皆不再讀取此值，僅為既有雲端資料相容保留。
- `calcFees(record, categories)` — 計算單日總手續費的純函式仍存在，但**目前無任何呼叫方**（`frontend/src` 內僅剩此函式自身的定義）；`DailyEntryPage.tsx` 的手續費計算為 inline filter/reduce，並未呼叫它。保留僅供未來參考，勿誤以為仍有頁面依賴此函式而重新接線。
- 類別變更後透過 `syncCategories` 同步到 Sheets `_config` tab

### 已知類別 ID 加總防污染（原「Dashboard 計算邏輯」，Dashboard 已於 2.2.0 移除）
- `dayIncome(r, ids)` / `dayExpense(r, ids)` — 只加總已知類別 ID，防止 Sheets 同步帶入的陌生欄位污染金額；原 Dashboard 頁曾有同款邏輯，隨頁面刪除已不再由該頁使用，現僅由 `MonthlyReportPage.tsx` 本地定義沿用。
- 原 Dashboard Hero「今日淨額（扣手續費後，`todayNetAfterFees`，負值紅色漸層）」與「收入/支出列表（value = 0 類別不顯示）」已隨 `DashboardPage.tsx` 於 2.2.0 一併移除；「扣手續費後淨額」這個概念本身也隨分潤機制一併拔除，並未搬遷到其他頁面（見上方「分潤機制拔除（2.2.0 同分支）」）。

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

# Type check（🔴 必須是 tsc -b，不能用 --noEmit）
# tsconfig.json 是 solution-style（files: [] + 只有 references），
# `tsc --noEmit` 檢查了零個檔案、永遠 exit 0，等於空轉（2.4.1 實測踩到）。
cd frontend && npx tsc -b

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
