# CLAUDE.md - Ready-mPOS

> **Documentation Version**: 1.0
> **Last Updated**: 2026-05-02
> **Project**: Ready-mPOS
> **Description**: 店家記帳系統 — 給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點
> **Features**: Offline-first PWA, Google Sheets sync, JWT auth, Docker Compose dev env

This file provides essential guidance to Claude Code when working with this repository.

## 🚨 CRITICAL RULES - READ FIRST

### ❌ ABSOLUTE PROHIBITIONS
- **NEVER** create new files in root directory → use `frontend/`, `backend/`, `docker/`, or `docs/`
- **NEVER** use `find`, `grep`, `cat`, `head`, `tail`, `ls` commands → use Read, Grep, Glob tools
- **NEVER** create duplicate files (manager_v2.py, enhanced_xyz.ts) → extend existing files
- **NEVER** hardcode values that belong in config/env → use `application.yml`, `.env`, or Vite env vars
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
- Use **TodoWrite** for tasks with 3+ steps
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

### Development Status
- **Phase**: Phase 1 MVP — 核心記帳功能，離線優先，Google Sheets 同步
- **Setup**: In progress
- **Core Features**: Not started
- **Testing**: Not started
- **Documentation**: In progress

---

## 📁 PROJECT STRUCTURE

```
Ready-mPOS/
├── frontend/          # React PWA (Vite + TypeScript + Tailwind + Dexie.js)
├── backend/           # Spring Boot 3.x (Java 17, Maven)
├── docker/            # Docker Compose (dev environment)
└── docs/              # ADR 架構決策紀錄
```

### Frontend (`frontend/`)
- **Framework**: React + Vite + TypeScript
- **Offline storage**: Dexie.js (IndexedDB wrapper)
- **UI**: Tailwind CSS
- **Target**: Android browser-first, desktop-compatible

### Backend (`backend/`)
- **Framework**: Spring Boot 3.x, Java 17, Maven
- **Auth**: Spring Security + JWT
- **ORM**: Spring Data JPA
- **DB**: PostgreSQL (each record has `sync_status` for offline sync)

### Sync (`backend/` → Google Sheets)
- Google Sheets API for monthly report export
- Auto-sync when online

---

## 🎯 CORE FUNCTIONALITY (Phase 1 MVP)

1. **每日收入記錄** — 現金、刷卡、Uber Eats、熊貓（手動輸入）
2. **每日支出記錄** — 食材採購、員工薪資、雜支
3. **自動加總** — 每日小計、月結彙整，消除對帳錯誤
4. **離線優先** — IndexedDB 本地儲存，有網路時自動同步 Google Sheets

---

## 🚀 COMMON COMMANDS

```bash
# Frontend dev server
cd frontend && npm run dev

# Backend dev server
cd backend && ./mvnw spring-boot:run

# Docker dev environment
docker compose -f docker/docker-compose.yml up -d

# Run frontend tests
cd frontend && npm test

# Run backend tests
cd backend && ./mvnw test

# Build frontend
cd frontend && npm run build

# Build backend
cd backend && ./mvnw package -DskipTests
```

---

## 📋 COMMIT CONVENTION

```
feat: add daily income entry form
fix: correct monthly total calculation
docs: update ADR for offline sync strategy
refactor: extract sync logic to dedicated service
test: add unit tests for income aggregation
```

---

## 🚨 TECHNICAL DEBT PREVENTION

### Before creating ANY new file:
1. **Search first** — `Grep(pattern="...", path="frontend/src")` or `Glob`
2. **Read existing** — understand current patterns
3. **Extend existing** — prefer Edit over Write
4. **Single source of truth** — one implementation per concept

### Wrong:
```
Write(file_path="frontend/src/incomeFormV2.tsx", ...)   // ❌ duplicate
```

### Correct:
```
Grep(pattern="IncomeForm", path="frontend/src")          // ✅ search first
Edit(file_path="frontend/src/IncomeForm.tsx", ...)       // ✅ extend existing
```
