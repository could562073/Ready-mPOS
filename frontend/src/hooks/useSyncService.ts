import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  warmToken,
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
  clearSpreadsheet,
  getStoredSheetName,
} from '../lib/sheets'
import { getCategories, isCategoriesDirty, clearCategoriesDirty } from '../lib/categories'
import type { Category } from '../types'

// ⚠️ DEV-ONLY（feature/line-item-transactions-redesign 分支隔離）：
//    開發期用獨立測試試算表，確保絕不碰正式站的「Ready-mPOS 記帳」。
//    🔴 併 main 前務必改回 'Ready-mPOS 記帳'（見 LOOP_STATE guardrail 9c / cutover）。
const AUTO_SHEET_NAME = 'Ready-mPOS 記帳（逐筆交易測試）'

export function useSyncService() {
  const [syncing, setSyncing]         = useState(false)
  const [googleEmail, setGoogleEmail] = useState<string | null>(() => getSignedInEmail())
  const [signInError, setSignInError] = useState<string | null>(null)
  const [creating, setCreating]       = useState(false)
  const [restoring, setRestoring]     = useState(false)
  const lockRef = useRef(false)

  // GIS script 非同步載入，輪詢直到 google.accounts 可用
  // 初始化後若已登入則靜默預取 token，把授權彈窗集中在啟動時，不在儲存/同步操作中途出現
  // 每 50 分鐘自動靜默刷新，確保 token 不在使用中過期
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setInterval>

    // 🔴 安全守衛（同步執行於 mount，必須在 init() 之外的 effect 頂層）：
    // 若已儲存的試算表名稱與目前 AUTO_SHEET_NAME 不符（分支切換或 cutover 改名），
    // 清掉舊試算表指標，強制下次登入依新名稱重新解析，避免沿用到別張表（含正式站）。
    // 一次性自我修復：清除後 LS_SHEET_NAME 變空，之後載入不再誤觸；此亦為 cutover 改名的預期行為。
    // ⚠️ 為何放這裡而非 init()：init() 在 GIS 未就緒時會被延到 300ms 輪詢，
    //    而下方 syncAll-on-mount effect 會立即以 localStorage 還原的 token 觸發同步；
    //    若守衛留在 init 內，冷啟動時 syncAll 可能搶先碰到殘留的正式站指標一次（競態）。
    const storedName = getStoredSheetName()
    if (storedName && storedName !== AUTO_SHEET_NAME) {
      clearSpreadsheet()
    }

    const init = () => {
      initGoogleAuth()
      if (getSignedInEmail()) {
        warmToken().catch(() => {})
        // 每 50 分鐘靜默刷新（token 壽命 60 分鐘，提前更新避免過期觸發 popup）
        refreshTimer = setInterval(() => {
          if (getSignedInEmail()) warmToken().catch(() => {})
        }, 50 * 60 * 1000)
      }
    }

    if ((window as any).google?.accounts) {
      init()
    } else {
      const id = setInterval(() => {
        if ((window as any).google?.accounts) {
          clearInterval(id)
          init()
        }
      }, 300)
      return () => { clearInterval(id); clearInterval(refreshTimer) }
    }
    return () => clearInterval(refreshTimer)
  }, [])

  const syncAll = useCallback(async () => {
    const sheetId = getSpreadsheetId()
    if (lockRef.current || !navigator.onLine || !sheetId || !getSignedInEmail()) return
    lockRef.current = true
    setSyncing(true)

    try {
      // 若本機類別有未同步的修改，先推送雲端，再拉取
      // 避免「先拉取舊雲端 → 覆蓋本機編輯」的競態，並確保後續記錄推送使用正確的欄位
      if (isCategoriesDirty()) {
        try {
          await pushConfigToSheets(sheetId, getCategories())
        } catch (err) {
          console.error('[sync-config] push failed:', err)
        }
      }

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
      // 使用者明確選擇「以雲端覆蓋本機」，清除 dirty 旗標讓 pullConfigFromSheets 正常套用
      clearCategoriesDirty()
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
