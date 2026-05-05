import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  isGoogleConfigured,
  signIn as googleSignIn,
  signOut as googleSignOut,
  getOrCreateSpreadsheet,
  pullAllFromSheets,
  pullConfigFromSheets,
  pushConfigToSheets,
  getSignedInEmail,
  getSpreadsheetId,
  setSpreadsheetId,
  syncMonthToSheets,
  clearIfInvalidSpreadsheet,
} from '../lib/sheets'
import { getCategories } from '../lib/categories'
import type { Category } from '../types'

const AUTO_SHEET_NAME = 'Ready-mPOS 記帳'

export function useSyncService() {
  const [syncing, setSyncing]         = useState(false)
  const [googleEmail, setGoogleEmail] = useState<string | null>(() => getSignedInEmail())
  const [signInError, setSignInError] = useState<string | null>(null)
  const [creating, setCreating]       = useState(false)
  const [restoring, setRestoring]     = useState(false)
  const lockRef = useRef(false)

  // GIS script 非同步載入，輪詢直到 google.accounts 可用
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
      // 取得類別設定：優先從雲端 _config 拉取，fallback 用 localStorage
      const cloudCategories = await pullConfigFromSheets(sheetId)
      const categories = cloudCategories ?? getCategories()

      // ── Phase 1: Pull（Sheets → 本機） ────────────────────
      // SYNCED 記錄以 Sheets 為主；PENDING 保留本機修改
      const sheetsRecords = await pullAllFromSheets(sheetId, categories)
      for (const r of sheetsRecords) {
        const local = await db.dailyRecords.where('date').equals(r.date).first()
        if (!local) {
          await db.dailyRecords.add(r)
        } else if (local.syncStatus === 'SYNCED') {
          await db.dailyRecords.update(local.id!, { ...r, id: local.id })
        }
        // PENDING 本機修改優先，不覆蓋
      }

      // ── Phase 2: Push（本機 PENDING → Sheets） ───────────
      const pending = await db.dailyRecords.where('syncStatus').equals('PENDING').toArray()
      const months  = [...new Set(pending.map(r => r.date.slice(0, 7)))]

      for (const month of months) {
        const allForMonth = await db.dailyRecords
          .filter(r => r.date.startsWith(month))
          .sortBy('date')

        await syncMonthToSheets(sheetId, month, allForMonth, categories)

        await Promise.all(
          allForMonth
            .filter(r => r.id !== undefined)
            .map(r => db.dailyRecords.update(r.id!, { syncStatus: 'SYNCED' }))
        )
      }
    } catch (err) {
      console.error('[sync] failed:', err)
    } finally {
      lockRef.current = false
      setSyncing(false)
    }
  }, [])

  // 強制從雲端還原：清空本機後以雲端資料完整覆蓋
  const restoreFromSheets = useCallback(async () => {
    const sheetId = getSpreadsheetId()
    if (!sheetId || !getSignedInEmail()) return
    if (lockRef.current) return
    lockRef.current = true
    setRestoring(true)
    try {
      const cloudCategories = await pullConfigFromSheets(sheetId)
      const categories = cloudCategories ?? getCategories()

      const records = await pullAllFromSheets(sheetId, categories)
      await db.dailyRecords.clear()
      if (records.length > 0) {
        await db.dailyRecords.bulkAdd(records)
      }
    } catch (err) {
      console.error('[restore] failed:', err)
    } finally {
      lockRef.current = false
      setRestoring(false)
    }
  }, [])

  const clearLocalData = useCallback(async () => {
    await db.dailyRecords.clear()
  }, [])

  // 將本地類別設定上傳至 _config tab（類別頁面儲存後呼叫）
  const syncCategories = useCallback(async (categories: Category[]) => {
    const sheetId = getSpreadsheetId()
    if (!sheetId || !getSignedInEmail() || !navigator.onLine) return
    try {
      await pushConfigToSheets(sheetId, categories)
    } catch (err) {
      console.error('[sync-config] failed:', err)
    }
  }, [])

  const signIn = useCallback(async () => {
    setSignInError(null)
    setCreating(false)
    try {
      const email = await googleSignIn()
      setGoogleEmail(email)

      await clearIfInvalidSpreadsheet()

      if (!getSpreadsheetId()) {
        setCreating(true)
        const currentMonth = new Date().toISOString().slice(0, 7)
        const id = await getOrCreateSpreadsheet(AUTO_SHEET_NAME, currentMonth)
        setSpreadsheetId(id, AUTO_SHEET_NAME)
        setCreating(false)
      }

      // 登入後立即雙向同步（含 _config 拉取）
      syncAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[auth] sign-in failed:', msg)
      setSignInError(msg)
      setCreating(false)
    }
  }, [syncAll])

  const signOut = useCallback(() => {
    googleSignOut()
    setGoogleEmail(null)
  }, [])

  const setCustomSheet = useCallback((id: string, name: string) => {
    setSpreadsheetId(id, name)
    syncAll()
  }, [syncAll])

  useEffect(() => {
    window.addEventListener('online', syncAll)
    syncAll()
    return () => window.removeEventListener('online', syncAll)
  }, [syncAll])

  return {
    syncing,
    syncAll,
    syncCategories,
    googleEmail,
    signIn,
    signOut,
    signInError,
    creating,
    restoring,
    restoreFromSheets,
    clearLocalData,
    isConfigured: isGoogleConfigured(),
    setCustomSheet,
  }
}
