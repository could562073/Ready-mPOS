# CLAUDE.md - Ready-mPOS

> **Documentation Version**: 1.4
> **Last Updated**: 2026-07-02
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
- **第 2 次優化（進行中）**: 逐筆交易改造 — **Phase 1 資料層 + Phase 2 二級分類 + Phase 3 `_config` 同步完成**。Phase 1：`Transaction` 型別、Dexie v3 自動遷移、`explodeDailyRecord` 拆解純函式 + Vitest、交易 CRUD/hook。Phase 2：二級分類純函式 CRUD（`addSub/renameSub/deleteSub/setDefaultSub`）+ `CategoryEditSheet` 內管理 UI + Playwright E2E。Phase 3：二級經 Sheets `_config` 的 `subs`/`defaultSub` 兩欄跨裝置同步（`serializeSubs`/`parseSubs`）、修正 Phase 2 揪出的 push/pull 資料流失、feature 分支同步隔離到獨立測試試算表（`AUTO_SHEET_NAME`，🔴 併 main 前須改回正式名）。UI 主畫面仍讀舊 `DailyRecord` 彙總模型，Phase 4–6（FAB 記帳 Sheet / 月曆列表主畫面＋月份分頁新格式 / Dashboard 月結重算）尚未接上。分支 `feature/line-item-transactions-redesign`。設計 spec：`docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`。

---

## 📁 PROJECT STRUCTURE

```
Ready-mPOS/
├── frontend/
│   ├── public/
│   │   └── sw.js              # Service Worker（打烊提醒推播通知）
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage.tsx      # 首頁：今日淨額、收支分解、7天趨勢
│       │   ├── DailyEntryPage.tsx     # 每日記帳（動態類別、確認 modal）
│       │   ├── MonthlyReportPage.tsx  # 月結報表
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
│       │   └── CategoryEditSheet.tsx  # 類別新增/編輯底部 Sheet（共用）
│       ├── lib/
│       │   ├── sheets.ts              # Google Sheets API + GIS OAuth2
│       │   ├── categories.ts          # 類別 localStorage CRUD + calcFees
│       │   ├── notification.ts        # SW 通知工具（權限、sendReminderToSW）
│       │   ├── tokens.ts              # Design tokens（色彩、字體、圓角）
│       │   ├── fmt.ts                 # NT$ 金額格式化
│       │   ├── ids.ts                 # newId() 穩定 ID 產生器
│       │   ├── migrate.ts             # explodeDailyRecord：舊 DailyRecord→Transaction[] 拆解（純函式）
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
- ⚠️ **UI 主畫面仍讀舊 `DailyRecord` 模型**（帳目頁 / FAB 記帳 Sheet / Dashboard / 月結），待 Phase 4–6 切換到 `transactions`（Phase 1–3 已完成資料層 / 二級 / `_config` 同步）。

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
