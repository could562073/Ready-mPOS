# Ready-mPOS — 店家記帳系統

給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點：每日帳目與月結對帳耗時且容易出錯。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React PWA (Vite + TypeScript + Tailwind CSS) |
| Offline Storage | Dexie.js (IndexedDB) |
| Backend | Spring Boot 3.x (Java 17, Maven) |
| Auth | Spring Security + JWT |
| Database | PostgreSQL |
| Cloud Sync | Google Sheets API |
| Dev Env | Docker Compose |

## Quick Start

```bash
# Start dev environment
docker compose -f docker/docker-compose.yml up -d

# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && ./mvnw spring-boot:run
```

## Project Structure

```
Ready-mPOS/
├── frontend/          # React PWA
├── backend/           # Spring Boot 3.x
├── docker/            # Docker Compose
└── docs/              # ADR 架構決策紀錄
```

## Phase 1 MVP Features

- 每日收入記錄（現金、刷卡、外送平台）
- 每日支出記錄（食材、薪資、雜支）
- 自動加總（每日小計 + 月結彙整）
- 離線優先（IndexedDB + Google Sheets 自動同步）

## Development Guidelines

- Read `CLAUDE.md` before working with Claude Code
- Plan first, execute after confirmation
- Commit after each feature: `feat/fix/docs: description`
- Critical business logic requires 繁體中文 comments
