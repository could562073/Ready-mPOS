# 記帳 Sheet 二級分類即時新增 + 每個一級記憶上次二級

> **日期**: 2026-07-06
> **狀態**: 設計已確認，待轉實作計畫
> **範圍**: `TransactionSheet` 記帳底部 Sheet 的二級分類互動（小範圍功能增修）
> **分支**: `feature/line-item-transactions-redesign`（第 2 次優化 Phase 1–7 已完成之後的加值功能）

## 背景與問題

真實使用回饋：帳目頁記帳（右下 FAB → `TransactionSheet`）在二級分類上不夠順手：

1. 二級區塊只在「選到的一級剛好已有子分類」時才出現，感覺二級「藏起來」。
2. 想加一個新的二級（例：雜項→瓦斯費）必須先離開記帳、去「設定→類別」新增，再回來記帳，中斷心流。
3. 連續記同一類時，二級每次都回到固定預設，沒有「記住我上次在這個一級用的二級」。

## 已確認的核心決策

- **記憶模型**：記「**每個一級各自上次用的二級**」（一級仍每次自己選；選定某一級時，二級自動帶入「上次在這個一級用過的二級」，取代原本固定的 `defaultSubId` 起始行為）。
- **記憶持久度**：存 `localStorage`，跨 App 重開仍記得。
- **二級顯示時機**：維持「選了一級才顯示二級區塊」（二級依附一級），但**只要選了一級就一定顯示**（含「無」、既有二級、與「＋新增二級」），不再因為沒有子分類而整區隱藏。

## 功能設計

### 行為 1：選一級後，二級區塊恆顯示

- 條件由 `subOptions.length > 0` 改為 `draft.categoryId !== ''`（已選一級即顯示）。
- 區塊內容：`無` chip + 既有二級 chips + **`＋ 新增二級`** chip。
- 未選一級前不顯示（二級無所依附）。

### 行為 2：就地新增二級（免進設定）

- 二級區塊的 `＋ 新增二級` chip → 就地展開一個小輸入框（輸入名稱 → 確認 / 取消）。
- 確認（名稱 trim 後非空）時：
  1. `addSub(該一級, 名稱)`（`lib/categories.ts` 既有純函式）得到新的 `Category`。
  2. 以新類別取代 `getCategories()` 中該筆，`saveCategories(...)` 持久化到 `localStorage` 並標記 dirty，下次 `syncAll` 推送到 Sheets `_config`（沿用既有類別同步機制）。
  3. 立即把 `draft.subId` 設為新二級的 id（自動選取）。
- 每個一級都有這顆 `＋`；二級繼承一級的 icon/color/fee（沿用既有二級模型，不各自擁有）。
- 重複名稱：交由 `addSub` 現有行為（若既有已處理去重則沿用；本 spec 不新增去重規則）。

### 行為 3：記住每個一級各自上次的二級

- **儲存位置**：`localStorage` 一個 JSON 對照表 `{ [categoryId]: string | null }`（value 為上次用的 subId，`null` 代表上次選「無」）。
- **寫入時機**：每次**成功儲存一筆交易**（新增或編輯皆可，以新增連續記帳為主場景）後，記 `map[draft.categoryId] = draft.subId`。
- **讀取時機（選定一級）**：二級預設 = `pickInitialSub(cat, remembered)`：
  1. 若 `remembered === null` → 回 `null`（上次選「無」，尊重之）。
  2. 若 `remembered` 是有效 subId（仍存在於 `cat.subs`）→ 回該 id。
  3. 否則（無記憶 / 記憶的二級已被刪）→ 退回 `resolveDefaultSub(cat)`（既有 `defaultSubId` 行為）→ 再退回 `null`。

## 技術設計

### 受影響 / 新增檔案

- **新增** `frontend/src/lib/subMemory.ts`：`localStorage` 薄封裝
  - `getLastSub(categoryId): string | null | undefined`（`undefined` = 無記憶）
  - `rememberLastSub(categoryId, subId: string | null): void`
- **新增/擴充** `frontend/src/lib/txDraft.ts`：加**純函式** `pickInitialSub(cat: Category | undefined, remembered: string | null | undefined): string | null`（上述讀取邏輯；Vitest 覆蓋，含 dangling / null / 無記憶三路徑）。既有 `resolveDefaultSub` 保留供 fallback。
- **修改** `frontend/src/components/TransactionSheet.tsx`：
  - 二級區塊顯示條件改 `draft.categoryId !== ''`；加「＋新增二級」就地輸入。
  - `pickCategory` 改用 `pickInitialSub(cat, getLastSub(catId))`。
  - `save` 成功後呼叫 `rememberLastSub(draft.categoryId, draft.subId)`。
  - 新增二級：呼叫 `addSub` + `saveCategories` + 自動選取。

### 不改動

- 收支切換、一級 chips、金額 / 備註 / 日期輸入、「儲存並繼續」、編輯 / 刪除、底部按鈕、Sheet 版面與設計風格。
- 設定頁的二級管理（`CategoryEditSheet`）維持（就地新增與它並存，資料同一份）。
- 同步、Dashboard、月結、月曆。

## 測試策略

- **單元（Vitest）**：`pickInitialSub` 三路徑（有效記憶 / 記憶為 null / 無記憶或 dangling → fallback default → null）。`subMemory` 讀寫 round-trip（可用 jsdom localStorage 或注入）。
- **E2E（Playwright）**：帳目 FAB → 選一級 → 二級區塊顯示 → 點「＋新增二級」輸入名稱 → 新二級出現且被選取 → 儲存 → 再開 FAB 選同一級 → 二級預設為剛才用的那個。

## YAGNI / 明確排除

- 不做二級的就地改名 / 刪除（仍在設定頁）。
- 不做「一開 Sheet 就自動選一個一級」（一級仍每次自己選——已確認）。
- 不做跨一級的全域「上次選項」；只做每個一級各自的記憶。
- 不改二級繼承一級 icon/color/fee 的既有模型。
