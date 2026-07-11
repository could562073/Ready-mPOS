import Dexie, { type EntityTable, type Table } from 'dexie'
import type { DailyRecord, Transaction } from '../types'
import { explodeDailyRecord } from '../lib/migrate'

// IndexedDB 結構定義 — 離線優先核心儲存層
// version 升級時舊資料自動 migrate，不會遺失
const db = new Dexie('readyMposDb') as Dexie & {
  dailyRecords: EntityTable<DailyRecord, 'id'>
  transactions: Table<Transaction, number>
}

// version 1：固定欄位（cashIncome / cardIncome / uberEatsIncome / pandaIncome / foodCost / staffSalary / miscExpense）
db.version(1).stores({
  dailyRecords: '++id, date, syncStatus',
})

// version 2：改為動態 Record — incomes / expenses
// 舊記錄的固定欄位對應到預設類別 id（cash / card / uber / panda / food / wage / misc）
db.version(2).stores({
  dailyRecords: '++id, date, syncStatus',
}).upgrade(tx =>
  tx.table('dailyRecords').toCollection().modify((r: any) => {
    if (!r.incomes) {
      r.incomes = {
        cash:  r.cashIncome      ?? 0,
        card:  r.cardIncome      ?? 0,
        uber:  r.uberEatsIncome  ?? 0,
        panda: r.pandaIncome     ?? 0,
      }
    }
    if (!r.expenses) {
      r.expenses = {
        food: r.foodCost     ?? 0,
        wage: r.staffSalary  ?? 0,
        misc: r.miscExpense  ?? 0,
      }
    }
    // 清除舊欄位
    delete r.cashIncome
    delete r.cardIncome
    delete r.uberEatsIncome
    delete r.pandaIncome
    delete r.foodCost
    delete r.staffSalary
    delete r.miscExpense
  })
)

// version 3：新增逐筆交易 transactions store（取代 dailyRecords 作為主要記帳資料）
// dailyRecords 保留（不刪除、不清空）：作為遷移來源與後備資料，
// 若日後 transactions 邏輯有誤，仍可從 dailyRecords 重新產生
db.version(3).stores({
  dailyRecords: '++id, date, syncStatus',
  transactions: '++localId, id, date, syncStatus, categoryId',
}).upgrade(async tx => {
  // 讀出所有舊版逐日記錄
  const oldRecords = await tx.table('dailyRecords').toArray()

  // 逐筆拆解成 Transaction（用真正的 newId + 目前時間，非測試用假值）
  const seeds = oldRecords.flatMap((r: DailyRecord) => explodeDailyRecord(r))

  if (seeds.length > 0) {
    // localId 由 ++localId 自動產生；此 upgrade 在 Dexie 版本升級的 transaction 內執行，
    // 若中途失敗會自動整體回滾，不需手動處理
    await tx.table('transactions').bulkAdd(seeds)
  }
})

export { db }
