// 同步暫停狀態（2.4.0）
//
// 背景：客戶 Google 帳號容量滿載 → 所有寫入 403（讀取正常）。在此之前每次記帳都會
// 完整跑一輪同步、每次都失敗、每次都跑診斷探針，等於天天對著必定失敗的雲端狂打。
//
// 🔴 這裡的「暫停」刻意**不是全停**：暫停期間仍保留低頻心跳（每次開 App 一次、
//    同一 session 每 HEARTBEAT_MS 一次），一旦成功就立刻解除。客戶清完雲端空間後
//    **不需要做任何事**，下次開 App 就自動恢復同步。
//    （2.2.1 的 migrationTriedRef 只把症狀壓成「每次開 App 一次」卻沒有恢復路徑，
//      根因修好了也沒人知道——這裡不重蹈覆轍。）
import type { WriteFailureKind } from './syncDiag'

const LS_PAUSE = 'mpos_sync_pause'
const LS_LAST_OK = 'mpos_sync_last_ok'

// 暫停期間同一 session 內的心跳間隔（App 長時間開著也要定期重試）
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000

export interface SyncPauseState {
  kind: WriteFailureKind
  since: number        // 首次因此成因暫停的時間
  lastTriedAt: number  // 上次（心跳）嘗試同步的時間
  failCount: number    // 連續失敗次數（診斷用）
}

const PAUSE_KINDS: WriteFailureKind[] = ['QUOTA_FULL', 'NO_EDIT_PERMISSION', 'SCOPE_MISSING']

/**
 * 這個失敗成因值得暫停自動同步嗎？
 * 只有「重試一百次也不會好」的持久性成因才暫停；UNKNOWN（多半是暫時斷網／逾時）
 * 不暫停——那種狀況下一輪往往就恢復了，暫停反而讓客戶的帳目延後上雲。
 */
export function shouldPauseFor(kind: WriteFailureKind): boolean {
  return PAUSE_KINDS.includes(kind)
}

/**
 * 暫停中是否放行這一次自動同步（純函式，方便測試）。
 * @param pause         目前暫停狀態，null = 沒暫停
 * @param sessionTried  本次 App 開啟期間是否已經放行過一次心跳
 * @param now           現在時間
 */
export function allowHeartbeat(pause: SyncPauseState | null, sessionTried: boolean, now: number): boolean {
  if (!pause) return true
  if (!sessionTried) return true
  return now - pause.lastTriedAt >= HEARTBEAT_MS
}

function readPause(): SyncPauseState | null {
  try {
    const raw = localStorage.getItem(LS_PAUSE)
    if (!raw) return null
    const p = JSON.parse(raw)
    // 形狀／成因不合法一律視為未暫停——毀損的 localStorage 絕不能永久卡死同步
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null
    if (!PAUSE_KINDS.includes(p.kind)) return null
    if (typeof p.since !== 'number' || typeof p.lastTriedAt !== 'number') return null
    return { kind: p.kind, since: p.since, lastTriedAt: p.lastTriedAt, failCount: Number(p.failCount) || 1 }
  } catch {
    return null
  }
}

export function getPause(): SyncPauseState | null {
  return readPause()
}

/** 記錄一次持久性寫入失敗（成因不變＝累加次數並保留最初的 since；成因改變＝重新起算） */
export function markPaused(kind: WriteFailureKind, now: number = Date.now()): void {
  const prev = readPause()
  const same = prev && prev.kind === kind
  const next: SyncPauseState = {
    kind,
    since: same ? prev.since : now,
    lastTriedAt: now,
    failCount: same ? prev.failCount + 1 : 1,
  }
  try {
    localStorage.setItem(LS_PAUSE, JSON.stringify(next))
  } catch {
    // localStorage 寫不進去（無痕／配額）→ 退化成「不暫停」，功能仍可用
  }
}

/** 同步成功 → 解除暫停（客戶清完空間後的自動恢復路徑） */
export function clearPause(): void {
  try {
    localStorage.removeItem(LS_PAUSE)
  } catch {
    /* 忽略 */
  }
}

/** 心跳放行時記下嘗試時間（避免同一 session 內連續重打） */
export function markHeartbeatTried(now: number = Date.now()): void {
  const prev = readPause()
  if (!prev) return
  try {
    localStorage.setItem(LS_PAUSE, JSON.stringify({ ...prev, lastTriedAt: now }))
  } catch {
    /* 忽略 */
  }
}

export function getLastSyncOk(): number | null {
  const raw = localStorage.getItem(LS_LAST_OK)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function setLastSyncOk(now: number = Date.now()): void {
  try {
    localStorage.setItem(LS_LAST_OK, String(now))
  } catch {
    /* 忽略 */
  }
}
