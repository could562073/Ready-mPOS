import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { DailyRecord } from '../types'

type RecordFields = Omit<DailyRecord, 'id' | 'date' | 'syncStatus' | 'createdAt' | 'updatedAt'>

export function useDailyRecord(date: string) {
  // useLiveQuery 會在 IndexedDB 資料變動時自動重新渲染（含同步寫入後）
  const record = useLiveQuery(
    () => db.dailyRecords.where('date').equals(date).first(),
    [date],
  )

  const save = async (fields: RecordFields) => {
    const now = new Date().toISOString()
    if (record?.id !== undefined) {
      await db.dailyRecords.update(record.id, {
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
    record:  (record ?? null) as DailyRecord | null,
    loading: record === undefined,
    save,
  }
}
