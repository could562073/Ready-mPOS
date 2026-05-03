import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { DailyRecord } from '../types'

type RecordFields = Omit<DailyRecord, 'id' | 'date' | 'syncStatus' | 'createdAt' | 'updatedAt'>

export function useDailyRecord(date: string) {
  // useLiveQuery 會在 IndexedDB 資料變動時自動重新渲染（含同步寫入後）
  // 查詢結果：undefined = 查詢進行中；null = 查詢完成但無記錄；DailyRecord = 找到資料
  // 若直接用 .first()，找不到時也回傳 undefined，與「進行中」無法區分 → 頁面永遠 loading
  const result = useLiveQuery(
    async () => (await db.dailyRecords.where('date').equals(date).first()) ?? null,
    [date],
  )

  const save = async (fields: RecordFields) => {
    const now = new Date().toISOString()
    if (result?.id !== undefined) {
      await db.dailyRecords.update(result.id, {
        ...fields,
        syncStatus: 'PENDING',
        updatedAt: now,
      })
    } else {
      await db.dailyRecords.add({
        date,
        ...fields,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  return {
    record:  (result ?? null) as DailyRecord | null,
    loading: result === undefined,
    save,
  }
}
