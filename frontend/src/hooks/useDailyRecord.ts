import { useState, useEffect } from 'react'
import { db } from '../db'
import type { DailyRecord } from '../types'

type RecordFields = Omit<DailyRecord, 'id' | 'date' | 'syncStatus' | 'createdAt' | 'updatedAt'>

export function useDailyRecord(date: string) {
  const [record, setRecord] = useState<DailyRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 依日期從本地 IndexedDB 查詢當日紀錄
    setLoading(true)
    db.dailyRecords
      .where('date')
      .equals(date)
      .first()
      .then((r) => {
        setRecord(r ?? null)
        setLoading(false)
      })
  }, [date])

  const save = async (fields: RecordFields) => {
    const now = new Date().toISOString()
    if (record?.id !== undefined) {
      // 更新既有紀錄，重設同步狀態為 PENDING 等待下次同步
      await db.dailyRecords.update(record.id, {
        ...fields,
        syncStatus: 'PENDING',
        updatedAt: now,
      })
      setRecord((prev) =>
        prev ? { ...prev, ...fields, syncStatus: 'PENDING', updatedAt: now } : prev
      )
    } else {
      // 新增今日紀錄
      const id = await db.dailyRecords.add({
        date,
        ...fields,
        syncStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      })
      setRecord({ id, date, ...fields, syncStatus: 'PENDING', createdAt: now, updatedAt: now })
    }
  }

  return { record, loading, save }
}
