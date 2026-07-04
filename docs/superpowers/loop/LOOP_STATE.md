# Autonomous Loop 狀態檔 — 第 2 次優化 Phase 2–6

> **這是 loop 的單一事實來源。** 每次心跳先讀這裡，依「目前狀態」與「下一步」接續執行；每完成一個 task 更新本檔並 commit。
> 建立：2026-07-03 ｜ 模式：整期自動（用戶已授權）｜ 心跳：每小時

## 目標

完成 `docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md` 的 Phase 2–6，
在分支 `feature/line-item-transactions-redesign` 上，全部功能可執行、測試全綠。

## 🔒 Guardrails（硬規則，任何一輪都不可違反）

1. **絕不 checkout / merge / push `main`**（main 一 push 就自動部署到正式站給真實用戶）。
2. 只在 `feature/line-item-transactions-redesign` 分支 commit，每完成一個 task 就 commit + `git push origin feature/line-item-transactions-redesign`。
3. 執行方式 = superpowers:subagent-driven-development（每 task implementer + reviewer；每期結束 whole-phase review）。
4. Phase 3–6 的計畫檔不存在時，先用 superpowers:writing-plans 依 spec 寫計畫、commit，再執行。
5. 業務邏輯一律加繁體中文註解；commit 格式 `feat/fix/docs/refactor: ...`。
5b. **📚 文檔同步（每期 DoD 必要條件，不可略）**：
   - **spec / plan 是事實來源**：每期開工前 plan 檔要存在於 `docs/superpowers/plans/`；設計/決策有任何變動 → 當下就改 spec（`docs/superpowers/specs/...`）並在決策日誌記一筆。
   - **每期落地必同步三份使用者文檔** `CLAUDE.md`、`AGENTS.md`、`README.md`（該期的 docs task 內完成，與程式碼同期），只描述**已落地**的功能、不預先寫未建的。
   - 中途若有非計畫內的行為/介面改動，也要回頭補進上述文檔，別累積文債。
6. 遇到需要用戶決策的事（設計歧義、需要 sudo、需要 Google 帳號操作）→ 寫進下方「Blockers / 待用戶決策」，把該 task 標 BLOCKED，**跳過它繼續做不相依的工作**；全部都被擋住才把整體狀態設 BLOCKED。
7. 不刪任何既有資料/檔案；不改 `.github/workflows`；不動 `.claude/settings*`。
8. 心跳打進來時如果上一輪工作明顯還在進行（狀態 = IN_PROGRESS 且 git log 幾分鐘內有動），簡短回報後結束該輪，不重複做。
9. **🔴 真實用戶資料保護（最高優先級，Phase 3+）**：
   a. feature 分支的 `AUTO_SHEET_NAME`（`hooks/useSyncService.ts:22`）**已改為獨立測試名稱**，開發期同步只碰測試試算表，永不碰正式站的「Ready-mPOS 記帳」。**此改動絕不可保留到 main**——見規則 9c。
   b. Phase 3 任何「舊格式→新格式」改寫**之前**，必須先用 Drive `files.copy` 自動備份整張試算表（時間戳命名），確保可還原。
   c. **正式上線遷移（cutover）= 硬停，需用戶明確批准**：把 sheet 名稱改回「Ready-mPOS 記帳」、對真實用戶試算表跑遷移，這一步**loop 不得自動執行**；到該步時標 BLOCKED 等用戶。併 main 前檢查：sheet 名稱已改回正式名？遷移有備份保護？以 Transaction.id 去重對帳？

## ✅ 驗證門檻（每個 task 完成的定義）

- `cd frontend && npx tsc --noEmit` → exit 0
- `cd frontend && npm test`（Vitest）→ 全綠
- `cd frontend && npm run build` → 成功
- **UI phase（2/4/5/6）額外要求**：Playwright headless E2E 實測該功能流程通過（詳見 bootstrap task）。
- Phase 3（Sheets）：OAuth 無法 headless E2E → 以單元測試覆蓋序列化/格式偵測邏輯 + 在本檔記「需用戶手動驗證清單」。

## 📊 目前狀態

- **整體**：`IN_PROGRESS`
- **目前 phase**：Phase 3 ✅ 完成（含全期 review Important #1 隔離守衛競態修正）→ 即將開 Phase 4
- **下一步**：用 writing-plans 依 spec 寫 Phase 4 計畫（FAB + 新增/編輯交易底部 Sheet，記帳寫入 `transactions`、自動帶入 `defaultSubId`），再 subagent-driven 執行
- **最後更新**：2026-07-04（Phase 3 完成，commit 034a66d）

**環境備註**：Playwright 已可用兩路——(1) `@playwright/test` E2E（`npm run test:e2e`，驗證門檻本體）；(2) Playwright MCP（`mcp__playwright__browser_*`，controller 探索式抽查/除錯 UI 用）。chromium binary 已裝。

## 📋 Phase 進度總表

| Phase | 內容 | 計畫檔 | 狀態 |
|-------|------|--------|------|
| 1 | 逐筆交易資料層 + Dexie v3 遷移 | `plans/2026-07-01-phase1-transaction-data-foundation.md` | ✅ 完成（commits 8528dcb→aa7c9c4） |
| 2 | 二級分類 CRUD + CategoryEditSheet UI | `plans/2026-07-02-phase2-subcategories.md` | ✅ 完成（5279bff→0903178）；全期 review With fixes，Important #2 已修，#1 轉 Phase 3 |
| 3 | 試算表隔離 + `_config` subs 序列化 + 🔴 push/pull 資料流失修正（月份格式移 Phase 5，見 D4） | `plans/2026-07-04-phase3-sheets-config-subs.md` | ✅ 完成（9e23d13→034a66d）；全期 review With fixes，Important #1 守衛競態已修 |
| 4 | FAB + 新增/編輯交易底部 Sheet（寫 transactions、帶入 defaultSubId） | （待 loop 撰寫） | ⬜ 下一個 |
| 5 | 帳目頁（月曆+列表）+ 導覽/落地頁 **+ 月份分頁新格式/舊格式偵測/Drive 備份/Transaction.id 對帳（D4 移入）** | （待 loop 撰寫） | ⬜ 未開始 |
| 6 | Dashboard / 月結改用 Transaction 重算 | （待 loop 撰寫） | ⬜ 未開始 |

### Task 0（bootstrap，Phase 2 前做一次）：Playwright E2E 基礎

1. `cd frontend && npm i -D @playwright/test && npx playwright install chromium`（不用 `--with-deps`，sudo 要密碼）。
2. 建 `frontend/playwright.config.ts`（webServer 起 `npm run dev`，headless chromium）+ `frontend/e2e/smoke.spec.ts`（開首頁、四個分頁可切換、IndexedDB 可用）。
3. `npx playwright test` 全綠 → commit。
4. **若 chromium 因缺系統函式庫起不來**：記 Blocker「請用戶執行 `sudo npx playwright install-deps chromium`」，E2E 門檻暫緩（僅該項），先繼續 tsc/vitest/build 門檻推進 task，等函式庫裝好後回頭補跑 E2E。

## ⚠️ 跨期必做事項（來自 Phase 1 final review / spec）

- **Phase 4/5 UI 切換到讀 `transactions` 時，必須加重新遷移/對帳步驟**（以 `Transaction.id` 去重併入），因為 v3 upgrade 只跑一次、Phase 1–3 期間 UI 仍寫舊 `dailyRecords`。詳見 spec「⚠️ 遷移時序注意」。
- **Phase 3 完成前絕不能把分支併入 main**（二級分類在那之前不會被 Sheets 同步保留）。
- 每期落地時同步更新 CLAUDE.md / AGENTS.md / README.md（同一個 commit 或同期 docs commit）——見 guardrail 5b，這是每期 DoD 必要條件。設計有變動時 spec 也要同步改。

## 🚧 Blockers / 待用戶決策

- ✅ **已解除**：分支雲端同步已由 Phase 3 Task 1 隔離到獨立測試試算表「Ready-mPOS 記帳（逐筆交易測試）」，開發期不再碰正式站資料。

## 📝 決策日誌（loop 自行做的判斷，供用戶事後 review）

- **D1（2026-07-03）**：Phase 2 Task 3（docs）純文字更新，controller 自行做未派 subagent/review（fold），因無程式風險。三份文件已一致更新。
- **D2（2026-07-03）**：Phase 2 全期 review 確認資料流失（Important #1）。真正修正需改 `sheets.ts`，但 Phase 2 Global Constraint 明訂「本期不改 sheets.ts」→ 選擇**不在 Phase 2 加臨時 guard**（避免違反本期 scope，且 Phase 3 即為 Sheets 同步、會正式修掉）。改以：①「不併 main」閘門擋正式曝險；②spec `_config` 段加 🔴 硬性需求（push/pull lockstep、序列化在 clearDirty 前）；③上方 Blockers 提醒用戶勿登入 dogfool。
- **D3（2026-07-03，用戶拍板）**：查證 `useSyncService.ts:22` main 與 feature 用同一 `AUTO_SHEET_NAME='Ready-mPOS 記帳'`，`getOrCreateSpreadsheet` 按名搜尋 → 同帳號登入分支會碰到正式站同一張表；`syncAll` 於 App 開啟/連線/登入/記帳自動觸發。**用戶選「改用獨立測試試算表」**：Phase 3 第一個 task 就把分支 `AUTO_SHEET_NAME` 改成獨立測試名，確保開發期碰不到正式資料；+ 改寫前 Drive 備份；+ cutover 硬停等批准（規則 9）。D2 的「登入 dogfool 資料流失」風險因此一併被隔離解掉（分支不再碰正式表）。
- **D4（2026-07-04，Phase 3 範圍調整）**：現況 `syncAll` 同步舊 `DailyRecord`，UI 到 Phase 4/5 才改寫 `transactions`。若 Phase 3 就把月份分頁同步切成 Transaction 新格式，會使 UI 新記的 DailyRecord 不再被同步 → 破壞現有 App。故**月份分頁新格式讀寫 / 舊格式偵測改寫 / Drive 備份移到 Phase 5**（與 UI 切換 + Transaction.id 對帳同期，才能端到端測）。**Phase 3 收斂為三件獨立安全的事**：①試算表隔離、②`_config` 二級序列化 + 資料流失 lockstep 修正、③docs。此為對 spec 原分期的調整，已註記於 spec。
