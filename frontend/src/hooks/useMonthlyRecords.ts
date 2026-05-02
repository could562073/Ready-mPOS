import { useState, useEffect } from 'react'
import { db } from '../db'
import type { DailyRecord } from '../types'

export function useMonthlyRecords(month: string) {
  // month: 'YYYY-MM'
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 查詢當月所有紀錄：利用 date 欄位的前綴索引（YYYY-MM）篩選
    setLoading(true)
    db.dailyRecords
      .where('date')
      .startsWith(month)
      .sortBy('date')
      .then((r) => {
        setRecords(r)
        setLoading(false)
      })
  }, [month])

  return { records, loading }
}
