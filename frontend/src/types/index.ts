// 同步狀態：PENDING = 本地未同步，SYNCED = 已同步雲端
// DELETED = 軟刪除墓碑：畫面查詢一律過濾、同步寫回 Sheets 時排除該列（雲端列消失）、
// 寫回成功後才從本機真正清除。墓碑存在期間可防止 pull 把雲端同 id 列「復活」加回來。
export type SyncStatus = 'PENDING' | 'SYNCED' | 'DELETED'

// 類別型別：收入或支出，支援自訂圖示/顏色/手續費
export interface Category {
  id: string            // 唯一識別碼（localStorage + Sheets _config key）
  name: string          // 顯示名稱
  icon: string          // Icon 組件 name
  color: string         // 色票 key（mint / sky / lavender / pink / peach / coral / sun）
  fee?: number          // 平台手續費比例（0–1），收入類別用
  enabled: boolean      // false = 停用但歷史資料仍保留
  type: 'income' | 'expense'
  subs?: { id: string; name: string; deleted?: boolean }[]  // 二級分類清單（選填），deleted 見下方
  defaultSubId?: string | null           // 預設二級分類 id（null = 無）

  // 軟刪除墓碑（2.3.0）：true = 使用者已刪除此類別。
  // 🔴 刪除類別**絕不可**真的把它從清單移除——歷史交易的 categoryId/subId 會變成孤兒，
  // 而月結是用「已知類別 ID 集合」加總的（防雲端陌生欄位污染），類別一消失，
  // 那些金額就會從月結總收入/總支出/趨勢圖無聲蒸發（帳目頁卻仍算得到，兩頁對不起來）。
  // 因此改為標記：記帳選單不顯示已刪類別，但顯示與加總一律含已刪 → 舊帳目完全不受影響。
  // 同一帖藥見 SyncStatus 的 'DELETED' 墓碑。
  deleted?: boolean
}

// 每日記帳記錄 — 收支改為動態 Record，支援自訂類別增減
export interface DailyRecord {
  id?: number           // Dexie auto-increment primary key
  date: string          // 'YYYY-MM-DD'

  // 收入：key = Category.id，value = 金額
  incomes: Record<string, number>
  // 支出：key = Category.id，value = 金額
  expenses: Record<string, number>

  // 各項目備註：key = Category.id，value = 備註文字（例：「優惠券」「瓦斯費」）
  incomeNotes?: Record<string, string>
  expenseNotes?: Record<string, string>

  notes?: string

  syncStatus: SyncStatus
  createdAt: string     // ISO 8601 timestamp
  updatedAt: string     // ISO 8601 timestamp
}

// 逐筆交易記錄 — 取代 DailyRecord 的單筆收入/支出項目（Phase 1 逐筆交易資料層）
export interface Transaction {
  localId?: number       // Dexie 自增主鍵（++localId），DB 層產生
  id: string             // 穩定同步 ID（跨裝置去重）
  date: string           // 'YYYY-MM-DD'
  type: 'income' | 'expense'
  categoryId: string
  subId?: string | null  // 二級類別 id（null = 無）
  amount: number         // 正數；收支方向由 type 決定
  note?: string
  syncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}
