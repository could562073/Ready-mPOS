import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../db'
import {
  initGoogleAuth,
  warmToken,
  isGoogleConfigured,
  signIn as googleSignIn,
  signOut as googleSignOut,
  getOrCreateSpreadsheet,
  pullAllTransactionsFromSheets,
  pullConfigFromSheets,
  pushConfigToSheets,
  getSignedInEmail,
  getSpreadsheetId,
  setSpreadsheetId,
  syncMonthTransactionsToSheets,
  backupSpreadsheet,
  clearIfInvalidSpreadsheet,
  clearSpreadsheet,
  getStoredSheetName,
} from '../lib/sheets'
import { mergeTransactionsById } from '../lib/txSheets'
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

    // ⚠️ 暫時同步診斷 log（verify 分支彩排用，併 main 前整段移除）——前綴 [sync-diag] 方便 Console 過濾
    console.log(`[sync-diag] syncAll 開始，sheetId=${sheetId}`)

    try {
      // 若本機類別有未同步的修改，先推送雲端，再拉取
      // 避免「先拉取舊雲端 → 覆蓋本機編輯」的競態，並確保後續記錄推送使用正確的欄位
      if (isCategoriesDirty()) {
        console.log('[sync-diag] 本機類別 dirty → 推送 _config')
        try {
          await pushConfigToSheets(sheetId, getCategories())
        } catch (err) {
          console.error('[sync-config] push failed:', err)
        }
      }

      // 取得類別設定：優先從雲端 _config 拉取，fallback 用 localStorage
      const cloudCategories = await pullConfigFromSheets(sheetId)
      const categories = cloudCategories ?? getCategories()
      console.log(`[sync-diag] _config 拉取=${cloudCategories ? '成功（用雲端）' : '(無/dirty 略過，用本機)'}，類別數=${categories.length}`)

      // ── Pull：Sheets → 本機 transactions（以 Transaction.id 去重對帳） ──
      // SYNCED 交易以雲端為主；PENDING 本機修改優先，不覆蓋（mergeTransactionsById 已處理判斷）
      const { seeds, oldFormatMonths } = await pullAllTransactionsFromSheets(sheetId, categories)
      const localTx = await db.transactions.toArray()
      const plan = mergeTransactionsById(localTx, seeds)
      console.log(`[sync-diag] pull：雲端 seeds=${seeds.length} 筆，舊格式月份=[${oldFormatMonths.join(', ') || '無'}]｜本機原有=${localTx.length} 筆 → 對帳 新增=${plan.toAdd.length}、更新=${plan.toUpdate.length}`)
      if (plan.toAdd.length) await db.transactions.bulkAdd(plan.toAdd)
      for (const u of plan.toUpdate) await db.transactions.update(u.localId, u.seed)

      // ── Push：本機 PENDING 交易 → Sheets（連同需改寫的舊格式月份一起重寫） ──
      const pendingTx = await db.transactions.where('syncStatus').equals('PENDING').toArray()

      // 需要改寫的月份 = 舊格式月份 ∪ 有本機 PENDING 的月份
      const oldSet = new Set(oldFormatMonths)
      const pendingMonths = new Set(pendingTx.map(t => t.date.slice(0, 7)))

      // 🔴 改寫舊格式分頁前必須先成功備份（真實資料保護，guardrail 9b）；
      //    備份失敗則本輪不改寫舊格式分頁，但仍推送本機 PENDING 所在（新格式或不存在）的月份
      let allowOldRewrite = true
      if (oldSet.size > 0) {
        console.log(`[sync-diag] 偵測到舊格式月份 [${[...oldSet].join(', ')}] → 改寫前先 Drive 備份…`)
        try {
          const backupId = await backupSpreadsheet(sheetId)
          console.log(`[sync-diag] 備份完成，備份檔 id=${backupId}（Drive 應多一張「Ready-mPOS 備份 …」）`)
        } catch (err) {
          console.error('[sync] 備份失敗，本輪不改寫舊格式分頁：', err)
          console.log('[sync-diag] ⚠️ 備份失敗 → 本輪跳過所有舊格式分頁改寫（原資料不動）')
          allowOldRewrite = false
        }
      }

      // 🔴 備份失敗（allowOldRewrite=false）時，凡屬舊格式的月份一律排除——即使該月有本機 PENDING，
      //    也不得在無成功備份下 clear+覆蓋舊格式分頁（否則毀掉使用者原始彙總資料）。
      //    v3 遷移把所有歷史交易標為 PENDING，故 cutover 時 pendingMonths ⊇ 全部歷史舊格式月份，此保護為主場景。
      const monthsToRewrite = new Set<string>()
      for (const m of pendingMonths) if (allowOldRewrite || !oldSet.has(m)) monthsToRewrite.add(m)
      if (allowOldRewrite) for (const m of oldSet) monthsToRewrite.add(m)
      console.log(`[sync-diag] 本機 PENDING=${pendingTx.length} 筆，需改寫月份=[${[...monthsToRewrite].join(', ') || '無'}]`)

      for (const month of monthsToRewrite) {
        const monthTx = await db.transactions.filter(t => t.date.startsWith(month)).sortBy('date')
        console.log(`[sync-diag] 改寫 ${month}：${monthTx.length} 筆 → 新格式寫回 Sheets`)
        await syncMonthTransactionsToSheets(sheetId, month, monthTx, categories)
        await Promise.all(
          monthTx
            .filter(t => t.localId !== undefined)
            .map(t => db.transactions.update(t.localId!, { syncStatus: 'SYNCED' })),
        )
      }
      console.log('[sync-diag] syncAll 完成 ✓')
    } catch (err) {
      console.error('[sync] failed:', err)
      console.error('[sync-diag] syncAll 中斷（見上方錯誤）')
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

      const { seeds } = await pullAllTransactionsFromSheets(sheetId, categories)
      await db.transactions.clear()
      if (seeds.length > 0) {
        await db.transactions.bulkAdd(seeds)
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
    await db.transactions.clear()
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
