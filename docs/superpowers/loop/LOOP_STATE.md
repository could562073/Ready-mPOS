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
6. 遇到需要用戶決策的事（設計歧義、需要 sudo、需要 Google 帳號操作）→ 寫進下方「Blockers / 待用戶決策」，把該 task 標 BLOCKED，**跳過它繼續做不相依的工作**；全部都被擋住才把整體狀態設 BLOCKED。
7. 不刪任何既有資料/檔案；不改 `.github/workflows`；不動 `.claude/settings*`。
8. 心跳打進來時如果上一輪工作明顯還在進行（狀態 = IN_PROGRESS 且 git log 幾分鐘內有動），簡短回報後結束該輪，不重複做。

## ✅ 驗證門檻（每個 task 完成的定義）

- `cd frontend && npx tsc --noEmit` → exit 0
- `cd frontend && npm test`（Vitest）→ 全綠
- `cd frontend && npm run build` → 成功
- **UI phase（2/4/5/6）額外要求**：Playwright headless E2E 實測該功能流程通過（詳見 bootstrap task）。
- Phase 3（Sheets）：OAuth 無法 headless E2E → 以單元測試覆蓋序列化/格式偵測邏輯 + 在本檔記「需用戶手動驗證清單」。

## 📊 目前狀態

- **整體**：`IN_PROGRESS`
- **目前 phase**：Phase 2（二級分類）
- **下一步**：Task 0（Playwright bootstrap）→ 然後 Phase 2 Task 1
- **最後更新**：2026-07-03（loop 建立，尚未開始執行）

## 📋 Phase 進度總表

| Phase | 內容 | 計畫檔 | 狀態 |
|-------|------|--------|------|
| 1 | 逐筆交易資料層 + Dexie v3 遷移 | `plans/2026-07-01-phase1-transaction-data-foundation.md` | ✅ 完成（commits 8528dcb→aa7c9c4） |
| 2 | 二級分類 CRUD + CategoryEditSheet UI | `plans/2026-07-02-phase2-subcategories.md` | ⬜ 未開始 |
| 3 | Sheets 新格式 + 舊格式偵測 + `_config` subs 序列化 | （待 loop 撰寫） | ⬜ 未開始 |
| 4 | FAB + 新增/編輯交易底部 Sheet | （待 loop 撰寫） | ⬜ 未開始 |
| 5 | 帳目頁（月曆+列表）+ 導覽/落地頁 | （待 loop 撰寫） | ⬜ 未開始 |
| 6 | Dashboard / 月結改用 Transaction 重算 | （待 loop 撰寫） | ⬜ 未開始 |

### Task 0（bootstrap，Phase 2 前做一次）：Playwright E2E 基礎

1. `cd frontend && npm i -D @playwright/test && npx playwright install chromium`（不用 `--with-deps`，sudo 要密碼）。
2. 建 `frontend/playwright.config.ts`（webServer 起 `npm run dev`，headless chromium）+ `frontend/e2e/smoke.spec.ts`（開首頁、四個分頁可切換、IndexedDB 可用）。
3. `npx playwright test` 全綠 → commit。
4. **若 chromium 因缺系統函式庫起不來**：記 Blocker「請用戶執行 `sudo npx playwright install-deps chromium`」，E2E 門檻暫緩（僅該項），先繼續 tsc/vitest/build 門檻推進 task，等函式庫裝好後回頭補跑 E2E。

## ⚠️ 跨期必做事項（來自 Phase 1 final review / spec）

- **Phase 4/5 UI 切換到讀 `transactions` 時，必須加重新遷移/對帳步驟**（以 `Transaction.id` 去重併入），因為 v3 upgrade 只跑一次、Phase 1–3 期間 UI 仍寫舊 `dailyRecords`。詳見 spec「⚠️ 遷移時序注意」。
- **Phase 3 完成前絕不能把分支併入 main**（二級分類在那之前不會被 Sheets 同步保留）。
- 每期落地時同步更新 CLAUDE.md / AGENTS.md / README.md（同一個 commit 或同期 docs commit）。

## 🚧 Blockers / 待用戶決策

（無）

## 📝 決策日誌（loop 自行做的判斷，供用戶事後 review）

（無）
