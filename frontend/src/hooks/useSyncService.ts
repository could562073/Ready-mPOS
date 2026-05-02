import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import { fetchByDate, createRecord, updateRecord } from '../lib/api'

export function useSyncService() {
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  // 防止重複觸發：同步進行中時忽略後續請求
  const lockRef = useRef(false)

  const syncAll = useCallback(async () => {
    if (lockRef.current || !navigator.onLine) return
    lockRef.current = true
    setSyncing(true)

    try {
      // 撈出所有尚未同步到後端的本地紀錄
      const pending = await db.dailyRecords
        .where('syncStatus')
        .equals('PENDING')
        .toArray()

      for (const record of pending) {
        try {
          // 先查後端是否已有該日期的記錄，決定要 POST 或 PUT
          const existing = await fetchByDate(record.date)

          if (existing) {
            // 後端已有此日期，改用 PUT 更新
            await updateRecord(existing.id, record)
          } else {
            // 後端無此日期，POST 新增
            await createRecord(record)
          }

          // 同步成功 → 更新本地 syncStatus 為 SYNCED
          if (record.id !== undefined) {
            await db.dailyRecords.update(record.id, { syncStatus: 'SYNCED' })
          }
        } catch (err) {
          // 單筆失敗不中斷整批，保留 PENDING 等下次重試
          console.error(`[sync] failed for date ${record.date}:`, err)
        }
      }

      if (pending.length > 0) setLastSyncedAt(new Date())
    } finally {
      lockRef.current = false
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    // 網路恢復時自動觸發同步（餐廳環境網路不穩定的核心場景）
    window.addEventListener('online', syncAll)
    // 初次載入若已在線，嘗試同步殘留的 PENDING 資料
    syncAll()
    return () => window.removeEventListener('online', syncAll)
  }, [syncAll])

  return { syncing, lastSyncedAt, syncAll }
}
