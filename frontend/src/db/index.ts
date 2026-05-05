import Dexie, { type EntityTable } from 'dexie'
import type { DailyRecord } from '../types'

// IndexedDB 結構定義 — 離線優先核心儲存層
// version 升級時舊資料自動 migrate，不會遺失
const db = new Dexie('readyMposDb') as Dexie & {
  dailyRecords: EntityTable<DailyRecord, 'id'>
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

export { db }
