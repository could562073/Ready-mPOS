import Dexie, { type EntityTable } from 'dexie'
import type { DailyRecord } from '../types'

// 本地 IndexedDB 資料庫（離線優先核心）
// 所有記帳資料先寫入此處，有網路時再同步到後端
const db = new Dexie('readyMposDb') as Dexie & {
  dailyRecords: EntityTable<DailyRecord, 'id'>
}

db.version(1).stores({
  // ++id = auto-increment PK；date, syncStatus 建立索引以支援查詢
  dailyRecords: '++id, date, syncStatus',
})

export { db }
