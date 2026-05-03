import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { DailyRecord } from '../types'

export function useMonthlyRecords(month: string) {
  // useLiveQuery 會在 IndexedDB 資料變動時自動重新渲染（含同步寫入後）
  const records = useLiveQuery(
    () => db.dailyRecords.where('date').startsWith(month).sortBy('date'),
    [month],
  )

  return {
    records: (records ?? []) as DailyRecord[],
    loading: records === undefined,
  }
}
