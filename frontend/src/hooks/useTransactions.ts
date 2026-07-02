import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Transaction } from '../types'

// 查詢某月份所有交易，依日期排序
// 查詢結果：undefined = 查詢進行中；[] = 查詢完成但無資料；Transaction[] = 找到資料
// 與 useDailyRecord 相同慣例：不可用「空陣列」代表 loading，否則畫面會誤判為「本月無交易」
export function useMonthTransactions(month: string) {
  // month = 'YYYY-MM'；用 startsWith(month + '-') 比對 date 前綴，
  // 確保只匹配該月份的 'YYYY-MM-DD'（避免 '2026-1' 誤匹配到 '2026-10' 等月份）
  const result = useLiveQuery(
    async () =>
      db.transactions
        .where('date')
        .startsWith(`${month}-`)
        .sortBy('date'),
    [month],
  )

  return {
    transactions: (result ?? []) as Transaction[],
    loading: result === undefined,
  }
}

// 查詢單日所有交易
export function useDayTransactions(date: string) {
  const result = useLiveQuery(
    async () => db.transactions.where('date').equals(date).toArray(),
    [date],
  )

  return {
    transactions: (result ?? []) as Transaction[],
    loading: result === undefined,
  }
}
