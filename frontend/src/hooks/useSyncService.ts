import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  isGoogleConfigured,
  signIn as googleSignIn,
  signOut as googleSignOut,
  createSpreadsheet,
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

  const signIn = useCallback(async () => {
    setSignInError(null)
    setCreating(false)
    try {
      const email = await googleSignIn()
      setGoogleEmail(email)

      // 首次登入且尚無試算表 → 自動建立
      if (!getSpreadsheetId()) {
        setCreating(true)
        const id = await createSpreadsheet(AUTO_SHEET_NAME)
        setSpreadsheetId(id, AUTO_SHEET_NAME)
        setSheetName(AUTO_SHEET_NAME)
        setSheetUrl(getSpreadsheetUrl())
        setCreating(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[auth] sign-in failed:', msg)
      setSignInError(msg)
      setCreating(false)
    }
  }, [])

  const signOut = useCallback(() => {
    googleSignOut()  // 同時清除 LS_SHEET_ID / LS_SHEET_NAME
    setGoogleEmail(null)
    setSheetName('')
    setSheetUrl('')
  }, [])

  // 進階：使用者手動指定現有試算表 ID
  const setCustomSheet = useCallback((id: string, name: string) => {
    setSpreadsheetId(id, name)
    setSheetName(name)
    setSheetUrl(getSpreadsheetUrl())
  }, [])

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
    isConfigured: isGoogleConfigured(),
    sheetName,
    sheetUrl,
    setCustomSheet,
  }
}
