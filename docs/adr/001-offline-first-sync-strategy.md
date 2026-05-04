# ADR-001: Offline-First Sync Strategy

- **Date**: 2026-05-03
- **Updated**: 2026-05-04
- **Status**: Accepted
- **Deciders**: RexC315

---

## Context

目標用戶是餐廳/咖啡廳老闆，使用情境：

- 營業中隨時記帳，不能等待網路回應
- 老闆手機有吃到飽，網路幾乎隨時可用，但需要容忍短暫中斷
- 資料不能因為網路斷線而遺失
- 月底需要匯出報表對帳

因此，App 必須在**無網路環境下完整運作**，並在有網路時自動同步。

---

## Decision

採用 **純前端、無後端伺服器** 的 Offline-First 架構：

### 本地儲存：IndexedDB via Dexie.js
- 所有記帳資料優先寫入瀏覽器 IndexedDB
- 讀取資料時直接從本地讀，不依賴網路
- Dexie.js 提供型別安全的 IndexedDB wrapper，支援 TypeScript

### 雲端同步：Google Sheets API
- 使用 Google Identity Services (GIS) OAuth2 登入
- 試算表作為雲端備份與跨裝置同步媒介
- 每次儲存帳目後立即觸發同步（儲存後即時上傳）

### sync_status 欄位
每筆記錄有 `sync_status` 欄位：

| 狀態 | 說明 |
|------|------|
| `PENDING` | 本地已建立，尚未同步到 Google Sheets |
| `SYNCED` | 已成功同步到 Google Sheets |

### 同步流程
1. 使用者記帳 → 寫入 IndexedDB，`syncStatus = PENDING`
2. 儲存後觸發 `syncAll()`（需要網路 + 已登入 Google）
3. Phase 1：Pull — 從 Sheets 拉取更新，合併到本機（SYNCED 記錄以 Sheets 為主）
4. Phase 2：Push — 將 PENDING 記錄批次寫入 Sheets，更新為 SYNCED

### 跨裝置策略
- 同一 Google 帳號共用同一試算表（搜尋同名試算表，找到沿用）
- 新裝置登入後立即執行雙向同步取得完整資料

---

## Alternatives Considered

### localStorage
- ❌ 儲存上限約 5MB，一年記帳資料可能超過
- ❌ 只支援字串，需要手動序列化/反序列化

### 僅依賴直接 API 呼叫（Online-Only）
- ❌ 網路斷線時完全無法使用

### Firebase / 自建後端
- ❌ 使用場景為單純記帳，不需要中央伺服器
- ❌ 供應商鎖定或額外維護成本

---

## Consequences

### 優點
- ✅ 網路斷線時完整可用
- ✅ 回應速度快（讀寫本地，無網路延遲）
- ✅ 零後端維護成本
- ✅ 資料主權在使用者自己的 Google Drive

### 缺點 / 注意事項
- ⚠️ IndexedDB 資料存在瀏覽器，清除瀏覽器資料會遺失本地記錄（需靠 Google Sheets 還原）
- ⚠️ 類別設定等配置需同步到 Sheets `_config` tab 才能跨裝置一致（Phase 2）

---

## Related Decisions

- ADR-002（待定）：動態類別管理與 Sheets _config tab 同步策略
