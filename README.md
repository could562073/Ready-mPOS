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
