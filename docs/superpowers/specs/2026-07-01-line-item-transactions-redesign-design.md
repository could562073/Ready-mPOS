# 第 2 次優化：逐筆交易模型 + 月曆列表主畫面 + 二級分類

> **日期**: 2026-07-01
> **狀態**: 設計已確認，待轉實作計畫
> **範圍**: 全 App 架構改造（資料模型、同步格式、UI 資訊架構）

## 背景與問題

上線後真實用戶（餐廳老闆）回饋兩個核心痛點：

1. **記帳時項目太多、輸入困難**：目前資料模型是「每個類別每天一筆彙總」，導致每個類別在每天都會被列成一列。使用者只要新增一種雜項（例：雜項-瓦斯），該項目之後每天都會出現，即使當天不需要，造成每日輸入雜訊。
2. **帳目呈現想更簡潔直覺**：使用者提供參考圖（`docs/design/S__8114995{6,7,8}.jpg`），是「月曆 + 逐筆交易列表」風格。並希望每日記帳不要在畫面下方直接列出所有類別，而是按「＋」按鈕才叫出輸入。

## 已確認的核心決策

1. **資料模型**：從「每類別每天彙總」改為「逐筆交易」（同一天同一類別可多筆）。
2. **二級分類**：一級類別（雜項）可擁有二級（瓦斯費），並可設定預設二級（可為「無」）。
3. **主畫面**：新增「月曆 + 逐筆交易列表」作為新主畫面與 App 落地頁，貼近參考圖。
4. **記帳輸入**：改為右下角浮動「＋」FAB → 底部 Sheet 表單，取代舊的下方類別列表。
5. **資料遷移**：自動就地遷移既有真實用戶資料（本地 IndexedDB + Google Sheet）。
6. **日備註**：新模型移除獨立「今日備註」，備註一律掛在單筆交易上。
7. **落地頁**：App 開啟預設進「帳目」分頁。

## 資料模型

### Transaction（新，取代 DailyRecord 為主要記帳單位）

```ts
interface Transaction {
  id: string             // 穩定 ID（跨裝置同步比對去重用；建議 crypto.randomUUID 或 時間戳+亂數）
  date: string           // 'YYYY-MM-DD'
  type: 'income' | 'expense'
  categoryId: string     // 一級類別 id
  subId?: string | null  // 二級類別 id（null = 無）
  amount: number         // 金額（正數）
  note?: string          // 該筆備註（取代舊「項目備註」）
  syncStatus: SyncStatus // 'PENDING' | 'SYNCED'
  createdAt: string      // ISO 8601
  updatedAt: string      // ISO 8601
}
```

- 金額一律以正數儲存，收支方向由 `type` 決定。
- 手續費（如 Uber 30%）仍掛在一級類別（`Category.fee`）；逐筆計算時，收入類別若 `fee > 0`，該筆自動扣手續費。

### Category（擴充二級分類）

```ts
interface Category {
  id: string
  name: string
  icon: string
  color: string
  fee?: number
  enabled: boolean
  type: 'income' | 'expense'
  subs?: { id: string; name: string }[]  // 二級分類清單
  defaultSubId?: string | null           // 預設二級 id（null / undefined = 無）
}
```

- 二級分類**繼承**一級的 icon / color / fee，不各自擁有。
- 記帳選定一級類別時，二級自動帶入 `defaultSubId`（可為「無」）。
- 停用（`enabled: false`）的一級類別其歷史交易仍保留、可顯示。

## 資料遷移（自動就地）

### 本地 IndexedDB（Dexie version 3）

- 新增 `transactions` table：`'++localId, id, date, syncStatus, categoryId'`（`localId` 為自增主鍵，`id` 為穩定同步 ID）。
- 保留舊 `dailyRecords` table 直到遷移完成驗證無誤（不在同一版本刪除，降低風險）。
- upgrade 邏輯：逐筆讀舊 `DailyRecord` →
  - 對 `incomes` 每個非零金額產生一筆 `Transaction`（`type='income'`, `categoryId=key`, `subId=null`, `note=incomeNotes[key] ?? ''`）。
  - 對 `expenses` 同理（`type='expense'`, `note=expenseNotes[key] ?? ''`）。
  - 日層級 `notes`（今日備註）若有值：併入當天產生的第一筆交易的 `note`（前綴或換行附加）；若當天無任何交易則產生一筆 amount=0 的備註交易或直接捨棄（**採：附加到第一筆；當天無交易則捨棄該備註**）。
  - 每筆 `Transaction` 產生新的穩定 `id`，`syncStatus='PENDING'`（遷移後需重新推送成新格式）。
- **回滾保護**：遷移在 Dexie upgrade transaction 中執行，失敗自動回滾；舊 `dailyRecords` 保留為後備。

### Google Sheets

**新月份分頁格式**（每筆交易一列）：

| 日期 | 收支 | 一級類別 | 二級類別 | 金額 | 備註 | id |
|------|------|----------|----------|------|------|----|

- 表頭固定，不隨類別增減變動（解決舊格式「類別即欄位」導致刪類別要清欄的複雜度）。
- `id` 欄用於跨裝置同步比對去重（pull 時以 `id` 合併，避免重複匯入）。
- 收支欄以中文「收入 / 支出」存放，人類可讀。
- 一級/二級以**名稱**存放（人類可讀），pull 時以名稱對回 `Category`；找不到對應則歸入未知類別但不污染金額計算（沿用現有「未知欄位略過」精神）。

**舊格式偵測與改寫**：

- pull 時偵測月份分頁表頭：若含固定舊欄位（`總收入/總支出/淨利` 或類別名稱欄）判定為舊格式。
- 舊格式 → 用現有 `pullAllFromSheets` 解析邏輯讀出，就地在記憶體拆成 `Transaction[]`，下次 push 時整表改寫為新格式。
- push 沿用現有「先 `values:clear` 整個分頁再整表覆蓋」策略，天然解決筆數變動殘留問題。

**`_config` 分頁擴充**：

- 維持一列一個一級類別。新增兩欄：
  - `subs`：序列化二級清單，格式 `subId:subName|subId:subName`。
  - `defaultSub`：預設二級 id（空 = 無）。
- push/pull 對這兩欄做序列化/反序列化；缺欄時容錯（視為無二級）。

## UI / 資訊架構

### 導覽結構（4 tab + FAB）

| Tab | 內容 | 變化 |
|-----|------|------|
| **帳目**（落地頁） | 新月曆 + 逐筆交易列表 | 取代舊「記帳」分頁 |
| 首頁 | Dashboard 今日淨額 / 收支分解 / 趨勢 | 保留，改用 Transaction 重算 |
| 月結 | 月結對帳報表 | 保留，改用 Transaction 彙整重算 |
| 設定 | 類別（含二級管理）/ 同步 / 通知 | 類別管理擴充二級 |

- App 開啟預設落在「帳目」。
- 「＋」為右下浮動 FAB（不再佔分頁）。

### 帳目頁（月曆 + 列表）

- 頂部月份選擇器，可切換月份。
- 月曆格：每天顯示當日淨額（+ 綠 / − 紅）、今天高亮；點某天篩選/捲動下方列表到該天。
- 下方逐筆交易列表：每列 = 類別圖示 + 一級/二級名稱 + 收支標籤 + 日期/備註 + 金額 + 同步狀態；點列進入編輯。
- 右下 FAB「＋」新增交易。

### 新增/編輯交易 Sheet（底部 Sheet）

- 收入/支出切換。
- 一級類別選擇（格狀 chips，含快速新增類別入口）。
- 二級類別選擇（chips，預設帶入該一級的 `defaultSubId`，永遠含「無」選項）。
- 金額輸入。
- 備註（選填）。
- 日期（預設當前選定日）。
- 「儲存並繼續新增」以支援連續多筆快速輸入。
- 編輯模式支援刪除該筆交易。

### 類別管理（設定 → 類別）

- 一級類別列可展開管理其二級分類：新增 / 改名 / 刪除。
- 設定預設二級（單選，含「無」）。
- icon / color / fee 維持在一級層級編輯。

## 受影響模組

- `types/index.ts`：新增 `Transaction`；擴充 `Category`；保留 `DailyRecord`（遷移用）。
- `db/index.ts`：version 3、`transactions` table、遷移 upgrade。
- `lib/categories.ts`：二級分類 CRUD、`defaultSubId`；`calcFees` 改吃 `Transaction[]`。
- `lib/sheets.ts`：新月份分頁讀寫、舊格式偵測改寫、`_config` subs/defaultSub 序列化。
- `hooks/`：以交易為單位的資料層（新增 `useTransactions` 或改造 `useDailyRecord`/`useMonthlyRecords`）；`useSyncService` 改用新同步。
- `pages/`：新「帳目」頁（月曆+列表）；`DailyEntryPage` 改為交易輸入 Sheet；`DashboardPage`、`MonthlyReportPage` 改用 Transaction 重算；`CategoriesPage` 擴充二級。
- `App.tsx`：導覽結構、落地頁、FAB。

## 測試策略

- **單元測試**：
  - 遷移：舊 `DailyRecord` → `Transaction[]` 的拆解（含日備註併入、零金額略過、subId=null）。
  - Sheets：舊格式偵測、舊→新改寫、`_config` subs 序列化/反序列化 round-trip。
  - 彙總：`dayIncome/dayExpense/calcFees` 從 `Transaction[]` 計算正確、手續費逐筆扣除。
- **手動驗證**：新增交易 Sheet 流程、月曆列表互動、跨裝置同步不重複、既有帳號登入後舊資料正確遷移顯示。

## 實作分期（供 writing-plans 參考）

1. **資料層 + 遷移**：`Transaction` 型別、Dexie v3 遷移、交易 CRUD hook。
2. **類別二級**：`Category` 擴充、`lib/categories` 二級 CRUD、`CategoriesPage` UI。
3. **Sheets 同步**：新格式讀寫、舊格式偵測改寫、`_config` 擴充。
4. **記帳輸入 Sheet**：FAB + 新增/編輯交易 Sheet。
5. **帳目頁（月曆+列表）+ 導覽/落地頁調整**。
6. **Dashboard / 月結重算**：改用 Transaction。

每階段可獨立跑、可 commit、可驗證。

### ⚠️ 遷移時序注意（Phase 4/5 UI 切換必做）

Dexie v3 upgrade 只在瀏覽器**首次開啟 v3** 時，把 `dailyRecords` 遷移到 `transactions` **一次**。Phase 1–3 期間 UI 仍寫入舊 `dailyRecords`，因此**在 Phase 1 之後、UI 切換到讀 `transactions` 之前新增/修改的資料，只會存在於 `dailyRecords`**。

Phase 4/5 把 UI 切到讀 `transactions` 時，**必須加一個「重新遷移 / 對帳」步驟**（以 `Transaction.id` 去重併入，避免重覆匯入），不可假設一次性 v3 upgrade 已涵蓋全部；否則這段期間新增的資料會從畫面上消失（原始資料仍安全存在 `dailyRecords`，可復原，但使用者看不到）。此點由 Phase 1 最終 code review 提出並記錄。

## YAGNI / 明確排除

- 不做獨立「日備註」欄位。
- 二級分類不各自擁有 icon/color/fee（繼承一級）。
- 不做三級以上分類。
- 不做交易的軟刪除同步（沿用整月覆蓋策略即可去重）。
