// 同步狀態：PENDING = 本地未同步，SYNCED = 已同步，CONFLICT = 衝突需人工確認
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT'

// 每日帳目記錄（對應一張手寫日結單）
export interface DailyRecord {
  id?: number       // Dexie auto-increment primary key
  date: string      // 'YYYY-MM-DD'

  // 每日收入
  cashIncome: number       // 現金收入
  cardIncome: number       // 刷卡收入
  uberEatsIncome: number   // Uber Eats 外送
  pandaIncome: number      // 熊貓外送

  // 每日支出
  foodCost: number         // 食材採購
  staffSalary: number      // 員工薪資
  miscExpense: number      // 雜支

  notes?: string           // 備註

  syncStatus: SyncStatus
  createdAt: string        // ISO 8601 timestamp
  updatedAt: string        // ISO 8601 timestamp
}
