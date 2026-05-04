# CLAUDE.md - Ready-mPOS

> **Documentation Version**: 1.2
> **Last Updated**: 2026-05-04
> **Project**: Ready-mPOS
> **Description**: 店家記帳系統 — 給餐廳/咖啡廳老闆用的記帳 App，解決手寫記帳本的核心痛點
> **Features**: Offline-first PWA, Google Sheets sync, GitHub Pages deployment

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
- **Phase**: Phase 1 MVP — 核心記帳功能，離線優先，Google Sheets 同步
- **Frontend**: ✅ Complete — DailyEntryPage, MonthlyReportPage, DashboardPage, SettingsPage, OnboardingPage
- **Google Sheets Sync**: ✅ Complete — 雙向同步，儲存後即時上傳
- **Deployment**: ✅ GitHub Pages (自動 CI/CD on push to main)
- **Backend**: ❌ Removed — 無後端伺服器，純前端架構

---

## 📁 PROJECT STRUCTURE

```
Ready-mPOS/
├── frontend/          # React PWA (Vite + TypeScript + Tailwind + Dexie.js)
│   ├── src/
│   │   ├── pages/     # DailyEntryPage, MonthlyReportPage, DashboardPage, SettingsPage, OnboardingPage
│   │   ├── hooks/     # useDailyRecord, useSyncService, useMonthlyRecords
│   │   ├── lib/       # sheets.ts (Google Sheets API), tokens.ts, fmt.ts, api.ts
│   │   ├── components/# Icon, AmountInput
│   │   ├── db/        # Dexie.js IndexedDB schema
│   │   └── types/     # DailyRecord, SyncStatus
└── docs/              # ADR 架構決策紀錄
```

### Frontend (`frontend/`)
- **Framework**: React + Vite + TypeScript
- **Offline storage**: Dexie.js (IndexedDB wrapper)
- **UI**: Tailwind CSS + inline styles (design tokens in `tokens.ts`)
- **Cloud sync**: Google Sheets API v4 + Drive API v3 (OAuth2 via GIS)
- **Target**: Android browser-first, desktop-compatible
- **Deploy**: GitHub Pages via GitHub Actions

---

## 🎯 CORE FUNCTIONALITY

1. **每日收入記錄** — 現金、刷卡、Uber Eats、foodpanda（手動輸入）
2. **每日支出記錄** — 食材採購、員工薪資、雜支
3. **自動加總** — 每日小計、月結彙整，消除對帳錯誤
4. **離線優先** — IndexedDB 本地儲存，儲存後即時同步 Google Sheets
5. **跨裝置** — 同一 Google 帳號共用同一試算表

---

## 🚀 COMMON COMMANDS

```bash
# Frontend dev server
cd frontend && npm run dev

# Run frontend tests
cd frontend && npm test

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
