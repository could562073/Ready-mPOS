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
| Auth | Google Identity Services (OAuth2) |
| Deployment | GitHub Pages (CI/CD via GitHub Actions) |

## Quick Start

```bash
cd frontend && npm install && npm run dev
```

## Project Structure

```
Ready-mPOS/
├── frontend/
│   └── src/
│       ├── pages/      # DailyEntryPage, MonthlyReportPage, DashboardPage, SettingsPage, OnboardingPage
│       ├── hooks/      # useDailyRecord, useSyncService, useMonthlyRecords
│       ├── lib/        # sheets.ts (Google Sheets API), tokens.ts, fmt.ts
│       ├── components/ # Icon, AmountInput
│       ├── db/         # Dexie.js schema
│       └── types/      # DailyRecord, SyncStatus
└── docs/               # ADR 架構決策紀錄
```

## Features

| 功能 | 狀態 |
|------|------|
| 每日收入記錄（現金、刷卡、Uber Eats、foodpanda） | ✅ |
| 每日支出記錄（食材、薪資、雜支） | ✅ |
| 外送平台手續費自動扣除 | ✅ |
| 每日淨額 / 實收淨額自動計算 | ✅ |
| 月結報表 | ✅ |
| 離線優先 IndexedDB 儲存 | ✅ |
| Google Sheets 雙向同步（儲存後即時上傳） | ✅ |
| 從雲端還原資料 | ✅ |
| 跨裝置共用同一試算表 | ✅ |
| iOS / Desktop 日期選擇器相容 | ✅ |
| 即時同步狀態徽章 | ✅ |
| GitHub Pages 自動部署 | ✅ |

## Google Sheets 同步

登入 Google 帳號後，自動建立或尋找名為 `Ready-mPOS 帳目` 的試算表：

- **儲存時即時上傳**：每次按「儲存」後立即同步
- **從雲端還原** ☁️→📱：以雲端資料完整覆蓋本機
- **進階設定**：自訂試算表 ID、清除本機資料

## Development Guidelines

- Read `CLAUDE.md` before working with Claude Code
- Plan first, execute after confirmation
- Commit after each feature: `feat/fix/docs/refactor: description`
- Critical business logic requires 繁體中文 comments
