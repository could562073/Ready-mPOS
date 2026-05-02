# ADR-001: Offline-First Sync Strategy

- **Date**: 2026-05-03
- **Status**: Accepted
- **Deciders**: RexC315

---

## Context

目標用戶是餐廳/咖啡廳老闆，使用情境：

- 營業中隨時記帳，不能等待網路回應
- 店內 Wi-Fi 可能不穩定，或老闆用手機熱點
- 資料不能因為網路斷線而遺失
- 月底需要匯出報表給會計師或自行用 Excel 分析

因此，App 必須在**無網路環境下完整運作**，並在有網路時自動同步。

---

## Decision

採用 **Offline-First** 架構：

### 本地儲存：IndexedDB via Dexie.js
- 所有記帳資料優先寫入瀏覽器 IndexedDB
- 讀取資料時直接從本地讀，不依賴網路
- Dexie.js 提供型別安全的 IndexedDB wrapper，支援 TypeScript

### sync_status 欄位
每筆記錄（每日收入、支出）皆有 `sync_status` 欄位：

| 狀態 | 說明 |
|------|------|
| `PENDING` | 本地已建立，尚未同步到後端 |
| `SYNCED` | 已成功同步到後端 / Google Sheets |
| `CONFLICT` | 本地與遠端資料衝突，需人工確認 |

### 同步流程
1. 使用者記帳 → 寫入 IndexedDB，`sync_status = PENDING`
2. App 偵測到網路恢復 → 觸發背景同步
3. 將 `PENDING` 資料 POST 到 Spring Boot API
4. API 寫入 PostgreSQL，回傳成功 → 更新 IndexedDB `sync_status = SYNCED`
5. 月結時，後端彙整當月資料並寫入 Google Sheets

### 衝突處理原則（Phase 1）
- **以本地為準（Local Wins）**：Phase 1 單一裝置使用，衝突可能性極低
- 若發生衝突（`CONFLICT`），顯示提示讓使用者手動確認
- Phase 2 再考慮多裝置衝突解決策略

---

## Alternatives Considered

### localStorage
- ❌ 儲存上限約 5MB，一年記帳資料可能超過
- ❌ 只支援字串，需要手動序列化/反序列化

### 僅依賴直接 API 呼叫（Online-Only）
- ❌ 網路斷線時完全無法使用
- ❌ 不符合目標用戶的使用情境

### Firebase Firestore（帶離線支援）
- ❌ 供應商鎖定，未來難以遷移
- ❌ 月費成本隨資料量增加
- ❌ 無法自訂同步邏輯（如 Google Sheets 匯出）

### Service Worker + Cache API
- 可作為補充（PWA installability），但不適合作為主要資料儲存層
- 將在後續 ADR 中決定是否加入 Service Worker

---

## Consequences

### 優點
- ✅ 網路斷線時完整可用
- ✅ 回應速度快（讀寫本地，無網路延遲）
- ✅ 資料不會因網路問題遺失

### 缺點 / 注意事項
- ⚠️ 需維護 `sync_status` 狀態機，增加複雜度
- ⚠️ IndexedDB 資料存在瀏覽器，換裝置或清除瀏覽器資料會遺失本地資料（需依賴後端備份）
- ⚠️ Phase 1 僅支援單一裝置；多裝置同步需 Phase 2 另行設計

---

## Related Decisions

- ADR-002（待定）：Google Sheets API 月報表匯出策略
- ADR-003（待定）：JWT 認證流程與 Refresh Token 策略
