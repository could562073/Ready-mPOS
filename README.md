# Ready-mPOS — 店家記帳系統

給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點：每日帳目與月結對帳耗時且容易出錯。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React PWA (Vite + TypeScript + Tailwind CSS) |
| Offline Storage | Dexie.js (IndexedDB) |
| Cloud Sync | Google Sheets API v4 + Drive API v3 |
| Auth (Cloud) | Google Identity Services (OAuth2) |
| Backend | Spring Boot 3.x (Java 17, Maven) |
| DB (Backend) | PostgreSQL |
| Dev Env | Docker Compose |

## Quick Start

```bash
# Frontend dev server
cd frontend && npm install && npm run dev

# Backend dev server
cd backend && mvn spring-boot:run -Dspring.profiles.active=dev

# Docker dev environment
docker compose -f docker/docker-compose.yml up -d
```

## Project Structure

```
Ready-mPOS/
├── frontend/          # React PWA (offline-first, main app)
├── backend/           # Spring Boot 3.x (API server, Phase 2)
├── docker/            # Docker Compose (dev environment)
└── docs/              # ADR 架構決策紀錄
```

## Phase 1 MVP — Status

| Feature | Status |
|---------|--------|
| 每日收入記錄（現金、刷卡、Uber Eats、foodpanda） | ✅ 完成 |
| 每日支出記錄（食材、薪資、雜支） | ✅ 完成 |
| 外送平台手續費自動扣除（Uber 30%、panda 35%） | ✅ 完成 |
| 每日淨額 / 實收淨額自動計算 | ✅ 完成 |
| 月結報表（月收入 / 支出 / 每日明細） | ✅ 完成 |
| 離線優先 IndexedDB 本地儲存 | ✅ 完成 |
| Google Sheets 雙向同步（存檔後即時上傳） | ✅ 完成 |
| 從雲端還原資料（覆蓋本機） | ✅ 完成 |
| 跨裝置共用同一試算表 | ✅ 完成 |
| 已刪除 / 回收站試算表自動偵測清除 | ✅ 完成 |
| iOS / Desktop 日期選擇器相容 | ✅ 完成 |
| 即時同步狀態徽章（同步中 / 已同步 / 待同步） | ✅ 完成 |
| JWT 身份驗證（後端） | ⏳ Phase 2 |
| 後端 API 整合 | ⏳ Phase 2 |

## Google Sheets 同步說明

登入 Google 帳號後，App 會自動建立或尋找名為 `Ready-mPOS 帳目` 的試算表：

- **儲存時即時上傳**：每次按「儲存」後立即同步到雲端，徽章顯示「同步中…」→「已同步」
- **從雲端還原** ☁️→📱：以雲端資料完整覆蓋本機（適合換裝置或清除後還原）
- **同步到雲端** 📱→☁️：強制將本機所有 PENDING 資料推送到 Sheets
- **進階設定**：可指定自訂試算表 ID

## Development Guidelines

- Read `CLAUDE.md` before working with Claude Code
- Plan first, execute after confirmation
- Commit after each feature: `feat/fix/docs/refactor: description`
- Critical business logic requires 繁體中文 comments
