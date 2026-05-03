import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  signIn as googleSignIn,
  signOut as googleSignOut,
  getSignedInEmail,
  getSpreadsheetId,
  setSpreadsheetId,
  syncMonthToSheets,
} from '../lib/sheets'

export function useSyncService() {
  const [syncing, setSyncing]           = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [googleEmail, setGoogleEmail]   = useState<string | null>(() => getSignedInEmail())
  const [spreadsheetId, _setSheetId]    = useState<string>(() => getSpreadsheetId())
  const lockRef = useRef(false)

  // GIS script が非同期で読み込まれるため、ロード完了後に初期化
  useEffect(() => {
    const init = () => initGoogleAuth()
    if ((window as any).google?.accounts) {
      init()
    } else {
      // script の onload をポーリングで待機（async defer のため）
      const id = setInterval(() => {
        if ((window as any).google?.accounts) {
          clearInterval(id)
          init()
        }
      }, 300)
      return () => clearInterval(id)
    }
  }, [])

  // spreadsheetId の変更を localStorage と state に同時反映
  const updateSpreadsheetId = useCallback((id: string) => {
    setSpreadsheetId(id)
    _setSheetId(id)
  }, [])

  const signIn = useCallback(async () => {
    try {
      const email = await googleSignIn()
      setGoogleEmail(email)
    } catch (err) {
      console.error('[auth] Google sign-in failed:', err)
    }
  }, [])

  const signOut = useCallback(() => {
    googleSignOut()
    setGoogleEmail(null)
  }, [])

  // 離線時または未設定の場合はスキップ
  const syncAll = useCallback(async () => {
    const sheetId = getSpreadsheetId()
    if (lockRef.current || !navigator.onLine || !sheetId || !getSignedInEmail()) return
    lockRef.current = true
    setSyncing(true)

    try {
      // PENDING 記錄を月ごとにグループ化して同步
      const pending = await db.dailyRecords.where('syncStatus').equals('PENDING').toArray()
      if (pending.length === 0) return

      // 影響を受ける月一覧を取得（重複排除）
      const months = [...new Set(pending.map(r => r.date.slice(0, 7)))]

      for (const month of months) {
        // Sheets に書き込む際は該月の全記録（含む既同步）で上書き
        const allForMonth = await db.dailyRecords
          .filter(r => r.date.startsWith(month))
          .sortBy('date')

        await syncMonthToSheets(sheetId, month, allForMonth)

        // 同步成功 → 該月全記録を SYNCED に更新
        await Promise.all(
          allForMonth
            .filter(r => r.id !== undefined)
            .map(r => db.dailyRecords.update(r.id!, { syncStatus: 'SYNCED' }))
        )
      }

      setLastSyncedAt(new Date())
    } catch (err) {
      console.error('[sync] Google Sheets sync failed:', err)
    } finally {
      lockRef.current = false
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    // 網路恢復時と初回ロード時に同步を試みる
    window.addEventListener('online', syncAll)
    syncAll()
    return () => window.removeEventListener('online', syncAll)
  }, [syncAll])

  return {
    syncing,
    lastSyncedAt,
    syncAll,
    googleEmail,
    signIn,
    signOut,
    spreadsheetId,
    setSpreadsheetId: updateSpreadsheetId,
  }
}
