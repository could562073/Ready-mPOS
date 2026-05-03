import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  isGoogleConfigured,
  signIn as googleSignIn,
  signOut as googleSignOut,
  createSpreadsheet,
  pullAllFromSheets,
  getSignedInEmail,
  getSpreadsheetId,
  getSpreadsheetName,
  getSpreadsheetUrl,
  setSpreadsheetId,
  syncMonthToSheets,
} from '../lib/sheets'

const AUTO_SHEET_NAME = 'Ready-mPOS 記帳'

export function useSyncService() {
  const [syncing, setSyncing]           = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [googleEmail, setGoogleEmail]   = useState<string | null>(() => getSignedInEmail())
  const [sheetName, setSheetName]       = useState<string>(() => getSpreadsheetName())
  const [sheetUrl, setSheetUrl]         = useState<string>(() => getSpreadsheetUrl())
  const [signInError, setSignInError]   = useState<string | null>(null)
  const [creating, setCreating]         = useState(false)
  const [restoring, setRestoring]       = useState(false)
  const lockRef = useRef(false)

  // GIS script が非同期で読み込まれるため、ロード完了後に初期化
  useEffect(() => {
    const init = () => initGoogleAuth()
    if ((window as any).google?.accounts) {
      init()
    } else {
      const id = setInterval(() => {
        if ((window as any).google?.accounts) {
          clearInterval(id)
          init()
        }
      }, 300)
      return () => clearInterval(id)
    }
  }, [])

  // syncAll を signIn より先に定義して参照できるようにする
  const syncAll = useCallback(async () => {
    const sheetId = getSpreadsheetId()
    if (lockRef.current || !navigator.onLine || !sheetId || !getSignedInEmail()) return
    lockRef.current = true
    setSyncing(true)

    try {
      const pending = await db.dailyRecords.where('syncStatus').equals('PENDING').toArray()
      if (pending.length === 0) return

      const months = [...new Set(pending.map(r => r.date.slice(0, 7)))]

      for (const month of months) {
        const allForMonth = await db.dailyRecords
          .filter(r => r.date.startsWith(month))
          .sortBy('date')

        await syncMonthToSheets(sheetId, month, allForMonth)

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

  // 從雲端試算表還原所有資料到本機 IndexedDB（新裝置初次使用）
  const restoreFromSheets = useCallback(async () => {
    const sheetId = getSpreadsheetId()
    if (!sheetId || !getSignedInEmail()) return
    setRestoring(true)
    try {
      const records = await pullAllFromSheets(sheetId)
      for (const record of records) {
        const existing = await db.dailyRecords.where('date').equals(record.date).first()
        if (!existing) {
          await db.dailyRecords.add(record)
        }
      }
    } catch (err) {
      console.error('[restore] failed:', err)
    } finally {
      setRestoring(false)
    }
  }, [])

  const signIn = useCallback(async () => {
    setSignInError(null)
    setCreating(false)
    try {
      const email = await googleSignIn()
      setGoogleEmail(email)

      // 首次登入且尚無試算表 → 自動建立
      if (!getSpreadsheetId()) {
        setCreating(true)
        const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
        const id = await createSpreadsheet(AUTO_SHEET_NAME, currentMonth)
        setSpreadsheetId(id, AUTO_SHEET_NAME)
        setSheetName(AUTO_SHEET_NAME)
        setSheetUrl(getSpreadsheetUrl())
        setCreating(false)
      }

        // 登入後：有 PENDING 資料則上傳；本機無資料則從雲端還原
      const localCount = await db.dailyRecords.count()
      if (localCount === 0) {
        restoreFromSheets()
      } else {
        syncAll()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[auth] sign-in failed:', msg)
      setSignInError(msg)
      setCreating(false)
    }
  }, [syncAll, restoreFromSheets])

  const signOut = useCallback(() => {
    googleSignOut()
    setGoogleEmail(null)
    setSheetName('')
    setSheetUrl('')
  }, [])

  const setCustomSheet = useCallback((id: string, name: string) => {
    setSpreadsheetId(id, name)
    setSheetName(name)
    setSheetUrl(getSpreadsheetUrl())
    syncAll()
  }, [syncAll])

  useEffect(() => {
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
    signInError,
    creating,
    restoring,
    restoreFromSheets,
    isConfigured: isGoogleConfigured(),
    sheetName,
    sheetUrl,
    setCustomSheet,
  }
}
