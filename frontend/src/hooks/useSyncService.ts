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
  getWriteDiagnostics,
} from '../lib/sheets'
import { mergeTransactionsById, planMonthsToRewrite } from '../lib/txSheets'
import { reportError } from '../lib/errorReport'
import {
  classifyWriteFailure,
  isPermissionDenied,
  writeFailureMessage,
  type WriteDiagnostics,
  type WriteFailureKind,
} from '../lib/syncDiag'
import {
  shouldPauseFor, allowHeartbeat, getPause, markPaused, clearPause,
  markHeartbeatTried, getLastSyncOk, setLastSyncOk,
  type SyncPauseState,
} from '../lib/syncPause'
import {
  getCategories, isCategoriesDirty, clearCategoriesDirty,
  saveCategories, recoverOrphanCategories,
} from '../lib/categories'
import type { Category } from '../types'

// 試算表名稱由 Vite build mode 注入，單一事實來源 = frontend/.env.*
// （設計見 docs/superpowers/specs/2026-07-09-git-branch-workflow-design.md）：
//   dev（npm run dev）／staging（npm run build:staging）→「Ready-mPOS 記帳（逐筆交易測試）」
//   production（npm run build，CI on main 亦同）    →「Ready-mPOS 記帳」正式表
// cutover 不再手改常數：併 main 後 production build 自動採用正式名。
const AUTO_SHEET_NAME: string = import.meta.env.VITE_SHEET_NAME ?? ''

// 🔴 防呆紅線：非 production build 只准連含「測試」字樣的表；表名為空（env 檔缺失）一律拒絕。
//    任何環境設定錯誤都 fail-safe 成「不同步」，絕不讓開發／驗收環境碰到真實帳目。
function assertSheetNameSafe(): boolean {
  if (!AUTO_SHEET_NAME) {
    console.error('[sync] VITE_SHEET_NAME 未設定（frontend/.env.development / .env.production 缺失），拒絕同步')
    return false
  }
  if (import.meta.env.MODE !== 'production' && !AUTO_SHEET_NAME.includes('測試')) {
    console.error(`[sync] 非 production build 禁止連正式表「${AUTO_SHEET_NAME}」，拒絕同步`)
    return false
  }
  return true
}

// 確保 localStorage 的試算表指標仍有效（未被移到垃圾桶／刪除）；無效則清除並重新解析。
// 🔴 修正：返回使用者若手動把試算表丟垃圾桶或刪除，舊指標會讓每次同步讀到垃圾桶舊資料
//    或直接 404 卡住（clearIfInvalidSpreadsheet 原本只在登入時跑）。回傳有效試算表 id，取不到則回 ''。
async function ensureValidSpreadsheet(): Promise<string> {
  if (!assertSheetNameSafe()) return ''    // 環境設定錯誤 → 拒絕同步（防呆紅線）
  await clearIfInvalidSpreadsheet()        // 垃圾桶/刪除 → 清指標；暫時性錯誤 → 保留（見 sheets.ts）
  const existing = getSpreadsheetId()
  if (existing) return existing            // 仍有效
  // 指標已被清 → 重新解析（findSpreadsheetByName 只找未刪除的同名表，找不到才新建）
  try {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const id = await getOrCreateSpreadsheet(AUTO_SHEET_NAME, currentMonth)
    setSpreadsheetId(id, AUTO_SHEET_NAME)
    return id
  } catch (err) {
    console.error('[sync] 重新解析試算表失敗：', err)
    return ''
  }
}

export function useSyncService() {
  const [syncing, setSyncing]         = useState(false)
  const [googleEmail, setGoogleEmail] = useState<string | null>(() => getSignedInEmail())
  const [signInError, setSignInError] = useState<string | null>(null)
  const [creating, setCreating]       = useState(false)
  const [restoring, setRestoring]     = useState(false)
  // 新舊資料轉換（cutover 遷移）專用：偵測到雲端舊格式月份時 true，用來全螢幕阻擋 UI，
  // 避免使用者在備份／改寫舊帳目期間操作而污染同步中的資料（一般同步不設此旗標）。
  const [migrating, setMigrating]     = useState(false)
  const [migrateMsg, setMigrateMsg]   = useState('')
  // 同步失敗的「使用者可見」狀態（2.2.2）：在此之前同步失敗只寫 console + 寄診斷信，
  // 客戶端完全無感——帳目一直停在本機 PENDING 卻以為已經上雲。null = 目前正常。
  // 2.4.0：初始值改由持久化的暫停狀態還原 —— 容量滿這種問題不會自己好，橫幅必須「常駐」
  // （重開 App 仍在），否則客戶關掉一次就再也不知道帳目其實沒上雲。
  const [syncError, setSyncError]     = useState<{ kind: WriteFailureKind; message: string } | null>(() => {
    const p = getPause()
    return p ? { kind: p.kind, message: writeFailureMessage(p.kind) } : null
  })
  // 2.4.0：自動同步暫停狀態（設定頁狀態區 + 橫幅文案用）與上次成功同步時間
  const [syncPaused, setSyncPaused]   = useState<SyncPauseState | null>(() => getPause())
  const [lastSyncOk, setLastSyncOkState] = useState<number | null>(() => getLastSyncOk())
  const lockRef = useRef(false)
  // 暫停期間「本次 App 開啟已放行過一次心跳」的旗標（session 級，重開 App 自動重置）
  const pausedSessionTriedRef = useRef(false)
  // 🔴 遷移只嘗試一次／每次開 App（2.2.1）：cutover 備份＋改寫本應一次完成，但若備份持續失敗，
  // 舊格式月份永遠轉不成、遷移偵測每次儲存都成立 → 全螢幕「資料升級中」阻擋層每筆記帳都跳出。
  // 用此旗標讓「顯示阻擋層＋跑備份」在單次 App 開啟中最多一次；之後的同步只做輕量新格式推拉。
  const migrationTriedRef = useRef(false)

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
        // 🔴 初次同步必須等 token 就緒後才觸發（見下方 syncAll-on-mount 已移除即時呼叫）：
        //    冷啟動時若持久化 token 已過期，tokenInfo=null 且 GIS(tokenClient) 尚未初始化，
        //    acquireToken 會直接 reject → pull 拋錯 → 遷移被 try/catch 靜默吞掉且不重試。
        //    改為 warmToken()（確保拿到有效 token，必要時靜默刷新）成功後才 syncAll，
        //    讓「本來就登入」的返回使用者也能可靠偵測並執行新舊資料轉換。
        // 2.4.0：token 取得失敗以前是 .catch(() => {}) 全吞——而它一失敗，整個同步就
        //        從頭到尾沒跑過，客戶與開發者兩邊都無聲無息。改為回報（去重＋12h 冷卻，不會洗版）。
        warmToken().then(() => syncAll()).catch(err => reportError('auth/warmToken', err))
        // 每 50 分鐘靜默刷新（token 壽命 60 分鐘，提前更新避免過期觸發 popup）
        refreshTimer = setInterval(() => {
          if (getSignedInEmail()) warmToken().catch(err => reportError('auth/warmTokenRefresh', err))
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

  // 同步失敗的共用處理（2.2.2）：跑診斷探針 → 分類 → 設定使用者可見狀態 → 帶著診斷回報。
  // 🔴 隱私：extra 只放數字／布林／scope 字串（errorReport 的 redact 不套用到 extra，
  //    所以這裡絕不能放試算表 ID、email、access token 或任何金額）。
  // 🔴 這支只跑在錯誤路徑上，本身不得拋例外而蓋掉原始錯誤。
  const handleSyncFailure = useCallback(
    async (context: string, err: unknown, extra?: Record<string, unknown>) => {
      let kind: WriteFailureKind = 'UNKNOWN'
      let diag: WriteDiagnostics | null = null
      try {
        // 只有「像是權限／配額被擋」才值得多打 3 個 API；離線／逾時跑探針也只是再失敗一次
        if (isPermissionDenied(err)) {
          diag = await getWriteDiagnostics()
          kind = classifyWriteFailure(diag)
        }
      } catch {
        /* 探針失敗就維持 UNKNOWN，不影響回報 */
      }
      setSyncError({ kind, message: writeFailureMessage(kind) })
      // 2.4.0：持久性成因（容量滿／無編輯權／scope 不足）→ 登記暫停，之後自動同步只剩低頻心跳。
      //        UNKNOWN 不暫停：那多半是暫時斷網，下一輪就好了，暫停只會害帳目延後上雲。
      if (shouldPauseFor(kind)) {
        markPaused(kind)
        setSyncPaused(getPause())
      }
      reportError(context, err, {
        ...extra,
        kind,
        ...(diag
          ? {
              quotaLimit: diag.quota?.limit ?? null,
              quotaUsage: diag.quota?.usage ?? null,
              canEdit: diag.canEdit,
              ownedByMe: diag.ownedByMe,
              trashed: diag.trashed,
              scopes: diag.scopes,
            }
          : {}),
      })
    },
    [],
  )

  // 使用者手動關閉提示（下次同步再失敗會重新出現）
  const dismissSyncError = useCallback(() => setSyncError(null), [])

  // 同步成功後的收尾：解除暫停、記錄成功時間。
  // 客戶清完雲端空間 → 下一次心跳成功 → 這裡自動把暫停狀態拆掉，客戶不必做任何事。
  const markSyncOk = useCallback(() => {
    clearPause()
    setSyncPaused(null)
    pausedSessionTriedRef.current = false
    const now = Date.now()
    setLastSyncOk(now)
    setLastSyncOkState(now)
  }, [])

  /**
   * 同步主流程。
   * @param manual true = 使用者按下「立即重試」——無視暫停閘門，並先清掉暫停狀態重新來過
   */
  const runSync = useCallback(async (manual: boolean) => {
    // sheetId 有效性延到取得 token 後、於 ensureValidSpreadsheet 檢查（垃圾桶/刪除自我修復），此處不擋
    if (lockRef.current || !navigator.onLine || !getSignedInEmail()) {
      // 🔴 手動重試不能無聲無息：客戶按了「立即重試」卻什麼都沒發生，只會以為按鈕壞了。
      //    離線／未登入是使用者自己能處理的狀況，直接講白。（自動同步照舊安靜略過。）
      if (manual && !lockRef.current) {
        if (!navigator.onLine) {
          setSyncError({ kind: 'UNKNOWN', message: '目前沒有網路連線，帳目已安全存在本機，連上網路後會自動補傳。' })
        } else if (!getSignedInEmail()) {
          setSyncError({ kind: 'UNKNOWN', message: '尚未登入 Google，帳目只存在本機。請在下方登入後再同步。' })
        }
      }
      return
    }

    // 🔴 暫停閘門（2.4.0）：容量滿時，每筆記帳都完整跑一輪必定失敗的同步（含 3 個診斷探針）
    //    毫無意義。但**刻意不是全停**——每次開 App 仍放行一次心跳，同一 session 每 6h 再一次，
    //    成功即 markSyncOk 自動恢復。手動重試一律放行。
    const pause = getPause()
    if (manual) {
      clearPause()
      setSyncPaused(null)
      pausedSessionTriedRef.current = false
    } else if (!allowHeartbeat(pause, pausedSessionTriedRef.current, Date.now())) {
      return
    } else if (pause) {
      pausedSessionTriedRef.current = true
      markHeartbeatTried()
    }

    lockRef.current = true
    setSyncing(true)

    // 類別設定推送失敗（多半就是同一個 403）先記下來，走到結尾再一併處理：
    // 不能無聲吞掉，否則客戶會以為類別改動已經上雲了。
    let configErr: unknown = null

    try {
      // 🔴 自我修復：確認試算表指標仍有效（未被移到垃圾桶／刪除），無效則清除並重新解析（可能得到新 id）
      const sheetId = await ensureValidSpreadsheet()
      if (!sheetId) return

      // 若本機類別有未同步的修改，先推送雲端，再拉取
      // 避免「先拉取舊雲端 → 覆蓋本機編輯」的競態，並確保後續記錄推送使用正確的欄位
      if (isCategoriesDirty()) {
        try {
          await pushConfigToSheets(sheetId, getCategories())
        } catch (err) {
          console.error('[sync-config] push failed:', err)
          configErr ??= err   // 2.4.0：不再無聲吞掉（見結尾的 configErr 處理）
        }
      }

      // 取得類別設定：優先從雲端 _config 拉取，fallback 用 localStorage
      const cloudCategories = await pullConfigFromSheets(sheetId)
      let categories = cloudCategories ?? getCategories()

      // ── Pull：Sheets → 本機 transactions（以 Transaction.id 去重對帳） ──
      // SYNCED 交易以雲端為主；PENDING 本機修改優先，不覆蓋（mergeTransactionsById 已處理判斷）
      const { seeds, oldFormatMonths, upgradeMonths, categoryHints, unreadableMonths } =
        await pullAllTransactionsFromSheets(sheetId, categories)

      // 🔴 孤兒類別回收（2.3.0）：雲端交易列引用到 _config 已經沒有的類別 id
      //（2.3.0 之前刪類別是硬刪造成的），就依列上的名稱把它以 deleted 墓碑補回來。
      // 不補的話，月結用「已知類別 ID 集合」加總時會把那些金額整批濾掉 → 舊帳目看起來憑空消失。
      // 補回後才做下面的月份改寫：txToRow 只在類別可解析時才寫「一級ID」欄，
      // 若帶著孤兒去改寫，會把該欄清空、連最後的線索都弄丟。
      const recovered = recoverOrphanCategories(categories, categoryHints)
      if (recovered) {
        categories = recovered
        saveCategories(recovered)   // 標 dirty：即使下面推送失敗，回收結果仍留在本機，下次同步再推
        try {
          await pushConfigToSheets(sheetId, recovered)
        } catch (err) {
          console.error('[sync-config] recover push failed:', err)
          configErr ??= err   // 2.4.0：同上
        }
      }
      const localTx = await db.transactions.toArray()
      const plan = mergeTransactionsById(localTx, seeds)
      if (plan.toAdd.length) await db.transactions.bulkAdd(plan.toAdd)
      for (const u of plan.toUpdate) await db.transactions.update(u.localId, u.seed)

      // ── Push：本機 PENDING（新增/編輯）與 DELETED（軟刪墓碑）交易 → Sheets（整月重寫） ──
      const pendingTx = await db.transactions.where('syncStatus').anyOf('PENDING', 'DELETED').toArray()

      // 需要改寫的月份 = 舊格式月份 ∪ 有本機待同步變更（PENDING/DELETED）的月份
      const oldSet = new Set(oldFormatMonths)
      const pendingMonths = new Set(pendingTx.map(t => t.date.slice(0, 7)))

      // 🔴 每次開 App 最多嘗試一次遷移（migrationTriedRef）：只有「本輪存在舊格式月份 且 本次開 App 尚未試過遷移」
      //    才顯示全螢幕阻擋 UI 並跑備份。備份若持續失敗，之後同一 session 的儲存不再重跑備份、不再彈阻擋層
      //    （改走輕量新格式推拉），避免「每存一筆就出現資料升級中」的無窮迴圈；下次重開 App 才再試一次。
      const firstMigration = oldSet.size > 0 && !migrationTriedRef.current
      if (firstMigration) {
        migrationTriedRef.current = true
        setMigrating(true)
        setMigrateMsg('備份舊資料中…')
      }

      // 🔴 改寫舊格式分頁前必須先成功備份（真實資料保護，guardrail 9b）：預設不允許改寫舊格式，
      //    僅在本輪遷移備份成功時才放行。備份失敗（或本輪非首次遷移、未跑備份）→ 舊格式分頁本輪不改寫。
      let allowOldRewrite = false
      if (firstMigration) {
        try {
          await backupSpreadsheet(sheetId)
          allowOldRewrite = true
        } catch (err) {
          // 備份失敗 → 本輪不改寫舊格式分頁，並把錯誤回報到開發者信箱（診斷客戶裝置上看不到的真正失敗原因）
          console.error('[sync] 備份失敗，本輪不改寫舊格式分頁：', err)
          await handleSyncFailure('sync/backup', err, { oldMonthCount: oldSet.size })
          allowOldRewrite = false
        }
      }

      // 🔴 改寫月份 gating 抽為純函式 planMonthsToRewrite（Vitest 鎖定資料保護）：
      //    備份失敗時舊格式月份一律排除（即使有本機 PENDING），upgradeMonths（補 ID 欄）不受備份門檻限制。
      //    v3 遷移把所有歷史交易標為 PENDING，故 cutover 時 pendingMonths ⊇ 全部歷史舊格式月份，此保護為主場景。
      //    🔴 unreadableMonths（該月有列的金額/日期讀不出來）優先於以上所有規則一律排除：
      //    整月改寫是「以本機內容重建整個分頁」，讀不進來的列不在本機內容裡，照寫等於把它刪掉。
      const monthsToRewrite = planMonthsToRewrite({
        pendingMonths, oldFormatMonths: oldSet, upgradeMonths, allowOldRewrite, unreadableMonths,
      })

      let rewriteIdx = 0
      for (const month of monthsToRewrite) {
        // 轉換進度回饋（僅首次遷移時顯示於阻擋層）：轉換第 N/總 個月
        if (firstMigration) setMigrateMsg(`轉換新格式中…（${++rewriteIdx}/${monthsToRewrite.length}）`)
        // 寫回內容排除 DELETED 墓碑 → 被刪的列從雲端分頁消失（整月 clear+覆蓋機制天然支援刪除）
        const monthTx = await db.transactions
          .filter(t => t.date.startsWith(month) && t.syncStatus !== 'DELETED')
          .sortBy('date')
        await syncMonthTransactionsToSheets(sheetId, month, monthTx, categories)
        await Promise.all(
          monthTx
            .filter(t => t.localId !== undefined)
            .map(t => db.transactions.update(t.localId!, { syncStatus: 'SYNCED' })),
        )
        // 雲端已無這些列 → 該月墓碑功成身退，從本機真正清除
        // （順序在寫回成功之後：若寫回失敗丟例外，墓碑保留，下次同步重試刪除）
        await db.transactions
          .filter(t => t.date.startsWith(month) && t.syncStatus === 'DELETED')
          .delete()
      }
      // 走到這裡＝整輪同步（含所有月份寫回）沒有丟例外。
      if (configErr) {
        // 帳目寫回成功、但類別設定推不上去（2.4.0 補洞）。以前這裡會無條件清掉提示，
        // 客戶完全不會知道類別改動沒上雲——正是我們在修的那類靜默失敗。
        // 共用失敗處理只在這裡跑一次，診斷探針不會重複打。
        await handleSyncFailure('sync/config', configErr)
      } else if (unreadableMonths.length > 0) {
        // 有月份因為含讀不懂的列而被跳過改寫（2.5.0）。寫入本身是正常的，
        // 所以照樣 markSyncOk（清暫停、記錄成功時間）——這不是權限或容量問題，
        // 用 UNKNOWN 才不會觸發 shouldPauseFor 把其他月份的同步一起停掉。
        // 但必須讓老闆看得見：這些月份的新帳目暫時不會上雲，且原因在雲端那張表上。
        setSyncError({
          kind: 'UNKNOWN',
          message: `雲端試算表的 ${unreadableMonths.join('、')} 分頁有讀不懂的資料列（日期或金額格式異常），`
            + `為了不覆蓋掉那些資料，這些月份暫時不會自動更新。你的帳目在本機都完好，`
            + `請檢查該分頁是否被手動改過格式。`,
        })
        markSyncOk()
      } else {
        // 清除失敗提示。刻意也清掉「本輪備份失敗」設下的提示：備份失敗只代表舊格式
        // 月份延後轉換，帳目本身已成功上雲，此時再顯示「只存在本機」是錯的。
        setSyncError(null)
        markSyncOk()
      }
    } catch (err) {
      console.error('[sync] failed:', err)
      // 同步整體失敗也回報（去重／冷卻在 errorReport 內處理，不會洗版；URL 未設定時 no-op）
      // 2.2.2 起同時跑診斷探針並設定使用者可見的失敗提示
      await handleSyncFailure('sync', err)
    } finally {
      lockRef.current = false
      setSyncing(false)
      // 無論成功或中斷都解除阻擋層（遷移失敗會於下次同步重試，資料不動）
      setMigrating(false)
      setMigrateMsg('')
    }
  }, [handleSyncFailure, markSyncOk])

  // 自動同步（記帳後／恢復連線／開 App）——吃暫停閘門。
  // 🔴 刻意寫成無參數：它同時被當成 window 'online' 事件與 React onClick 的 handler，
  //    若接受參數就會把 Event 物件當成選項吃進去。
  const syncAll = useCallback(() => { void runSync(false) }, [runSync])

  // 手動重試（橫幅「我已清理完成，立即重試」／設定頁「同步」）——無視暫停閘門
  const retryNow = useCallback(() => { void runSync(true) }, [runSync])

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

      const { seeds, unreadableMonths } = await pullAllTransactionsFromSheets(sheetId, categories)
      await db.transactions.clear()
      if (seeds.length > 0) {
        await db.transactions.bulkAdd(seeds)
      }
      // 還原＝以雲端覆蓋本機。若雲端有讀不懂的列，它們不會進到本機，
      // 使用者會看到帳目「少了幾筆」卻沒有任何說明——必須講出來。
      // （雲端資料本身沒動，還原是唯讀 pull，修好格式後可再還原一次）
      if (unreadableMonths.length > 0) {
        setSyncError({
          kind: 'UNKNOWN',
          message: `還原完成，但雲端試算表的 ${unreadableMonths.join('、')} 分頁有讀不懂的資料列`
            + `（日期或金額格式異常），這些列沒有還原到本機。雲端上的原始資料仍在，`
            + `修正該分頁格式後可再還原一次。`,
        })
      }
    } catch (err) {
      console.error('[restore] failed:', err)
      // 2.4.0：還原失敗以前完全無聲——使用者按了「還原」、什麼都沒發生，開發者也收不到。
      await handleSyncFailure('restore', err)
    } finally {
      lockRef.current = false
      setRestoring(false)
    }
  }, [handleSyncFailure])

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
      // 2.4.0：類別頁儲存後的推送以前完全無聲——客戶改完類別以為已同步，其實停在本機
      await handleSyncFailure('sync/config', err)
    }
  }, [handleSyncFailure])

  const signIn = useCallback(async () => {
    setSignInError(null)
    setCreating(false)
    try {
      const email = await googleSignIn()
      setGoogleEmail(email)

      await clearIfInvalidSpreadsheet()

      if (!getSpreadsheetId()) {
        // 防呆紅線：環境設定錯誤時不建表、不同步，並把錯誤顯示在登入區
        if (!assertSheetNameSafe()) {
          throw new Error('試算表環境設定錯誤（VITE_SHEET_NAME），已拒絕同步以保護資料')
        }
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
    // 初次同步改由上方 init() 的 warmToken().then(syncAll) 觸發（token 就緒後才同步，避免冷啟動靜默失敗）；
    // 這裡只保留「恢復連線」時重新同步（此時 GIS 已初始化、token 多半有效）。
    window.addEventListener('online', syncAll)
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
    migrating,
    migrateMsg,
    syncError,
    dismissSyncError,
    // 2.4.0：暫停狀態（null = 正常）、上次成功同步時間、手動重試
    syncPaused,
    lastSyncOk,
    retryNow,
    restoreFromSheets,
    clearLocalData,
    isConfigured: isGoogleConfigured(),
    setCustomSheet,
  }
}
