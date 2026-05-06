# Ready-mPOS — 店家記帳系統

給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點：每日帳目與月結對帳耗時且容易出錯。

> **架構**：純前端 PWA，無後端伺服器。IndexedDB 離線儲存 + Google Sheets 雲端同步。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React PWA (Vite + TypeScript) |
| UI | Inline styles + design tokens (Cash App / Toss 風格) |
| Offline Storage | Dexie.js (IndexedDB) |
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
│       ├── pages/             # DashboardPage, DailyEntryPage, MonthlyReportPage
│       │                      # SettingsPage, CategoriesPage, OnboardingPage
│       ├── hooks/             # useDailyRecord, useSyncService, useMonthlyRecords
│       ├── lib/               # sheets.ts, categories.ts, notification.ts, tokens.ts, fmt.ts
│       ├── components/        # Icon, CategoryEditSheet
│       ├── db/                # Dexie.js schema
│       └── types/             # DailyRecord, Category, SyncStatus
└── docs/                      # ADR 架構決策紀錄
```

## Features

| 功能 | 狀態 |
|------|------|
| 每日收入記錄 | ✅ |
| 每日支出記錄 | ✅ |
| 動態類別管理（新增、編輯、刪除、啟用停用） | ✅ |
| 外送平台手續費自動扣除（每類別可設費率） | ✅ |
| 每日淨額 / 扣手續費後實收淨額 | ✅ |
| 首頁 7 天收入趨勢（漲跌幅百分比） | ✅ |
| 月結報表 | ✅ |
| 離線優先 IndexedDB 儲存 | ✅ |
| Google Sheets 雙向同步（儲存後即時上傳） | ✅ |
| 類別設定跨裝置同步（_config tab） | ✅ |
| 從雲端還原資料 | ✅ |
| Google 登入持久化（localStorage token，50 分鐘自動刷新） | ✅ |
| 打烊提醒推播通知（自訂時間，Service Worker） | ✅ |
| GitHub Pages 自動部署 | ✅ |

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
