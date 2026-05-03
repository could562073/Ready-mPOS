import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  isGoogleConfigured,
  signIn as googleSignIn,
  signOut as googleSignOut,
  getOrCreateSpreadsheet,
  pullAllFromSheets,
  getSignedInEmail,
  getSpreadsheetId,
  getSpreadsheetName,
  getSpreadsheetUrl,
  setSpreadsheetId,
  syncMonthToSheets,
  clearIfInvalidSpreadsheet,
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

  const syncAll = useCallback(async () => {
    const sheetId = getSpreadsheetId()
    if (lockRef.current || !navigator.onLine || !sheetId || !getSignedInEmail()) return
    lockRef.current = true
    setSyncing(true)

    try {
      // ── Phase 1: Pull（Sheets → 本機） ────────────────────
      // Sheets 有但本機無 → 新增；本機已 SYNCED → 以 Sheets 覆蓋更新；PENDING → 保留本機修改
      const sheetsRecords = await pullAllFromSheets(sheetId)
      for (const r of sheetsRecords) {
        const local = await db.dailyRecords.where('date').equals(r.date).first()
        if (!local) {
          await db.dailyRecords.add(r)
        } else if (local.syncStatus === 'SYNCED') {
          await db.dailyRecords.update(local.id!, { ...r, id: local.id })
        }
        // PENDING は本機修改優先、上書きしない
      }

      // ── Phase 2: Push（本機 PENDING → Sheets） ───────────
      const pending = await db.dailyRecords.where('syncStatus').equals('PENDING').toArray()
      const months  = [...new Set(pending.map(r => r.date.slice(0, 7)))]

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
      console.error('[sync] failed:', err)
    } finally {
      lockRef.current = false
      setSyncing(false)
    }
  }, [])

  // 強制從雲端還原：覆蓋所有本機記錄（含 SYNCED），用於資料遺失或手動重置
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
        } else {
          // 強制以雲端資料覆蓋（包含 PENDING 記錄）
          await db.dailyRecords.update(existing.id!, { ...record, id: existing.id })
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

      // 驗證已儲存的試算表 ID 是否仍有效（未被刪除或移至垃圾桶），無效則清除
      await clearIfInvalidSpreadsheet()

      // 尚無本地試算表 ID → 搜尋 Drive 上同名檔案，找不到才新建
      // 確保同一帳號在不同裝置指向同一份試算表
      if (!getSpreadsheetId()) {
        setCreating(true)
        const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
        const id = await getOrCreateSpreadsheet(AUTO_SHEET_NAME, currentMonth)
        setSpreadsheetId(id, AUTO_SHEET_NAME)
        setSheetName(AUTO_SHEET_NAME)
        setSheetUrl(getSpreadsheetUrl())
        setCreating(false)
      }

      // 登入後立即雙向同步：拉取雲端最新資料 + 推送本機 PENDING
      syncAll()
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
