import { describe, it, expect, beforeEach } from 'vitest'
// node 環境無 localStorage → 用 Map 做最小 stub（同 closedDays.test.ts 慣例，本模組另需 removeItem/clear）
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
} as unknown as Storage

import {
  HEARTBEAT_MS,
  shouldPauseFor,
  allowHeartbeat,
  getPause,
  markPaused,
  clearPause,
  markHeartbeatTried,
  getLastSyncOk,
  setLastSyncOk,
} from './syncPause'

describe('shouldPauseFor', () => {
  it('持久性成因才暫停', () => {
    expect(shouldPauseFor('QUOTA_FULL')).toBe(true)
    expect(shouldPauseFor('NO_EDIT_PERMISSION')).toBe(true)
    expect(shouldPauseFor('SCOPE_MISSING')).toBe(true)
  })

  it('UNKNOWN 不暫停（多半是暫時斷網，暫停反而害人）', () => {
    expect(shouldPauseFor('UNKNOWN')).toBe(false)
  })
})

describe('allowHeartbeat', () => {
  const paused = { kind: 'QUOTA_FULL' as const, since: 1_000, lastTriedAt: 1_000, failCount: 1 }

  it('沒暫停就一律放行', () => {
    expect(allowHeartbeat(null, false, 999_999)).toBe(true)
  })

  it('暫停中：本次 session 還沒試過 → 放行一次', () => {
    expect(allowHeartbeat(paused, false, paused.lastTriedAt + 1)).toBe(true)
  })

  it('暫停中：本次 session 已試過且未滿心跳間隔 → 擋下', () => {
    expect(allowHeartbeat(paused, true, paused.lastTriedAt + HEARTBEAT_MS - 1)).toBe(false)
  })

  it('暫停中：長時間開著 App 也要再試（超過心跳間隔）', () => {
    expect(allowHeartbeat(paused, true, paused.lastTriedAt + HEARTBEAT_MS)).toBe(true)
  })

  it('時鐘往回跳（改系統時間）不會永久卡死：視為未滿間隔但 session 尚未試過仍放行', () => {
    expect(allowHeartbeat(paused, false, paused.lastTriedAt - 999_999)).toBe(true)
    expect(allowHeartbeat(paused, true, paused.lastTriedAt - 999_999)).toBe(false)
  })
})

describe('暫停狀態儲存', () => {
  beforeEach(() => localStorage.clear())

  it('markPaused → getPause 取得成因與時間', () => {
    markPaused('QUOTA_FULL', 5_000)
    const p = getPause()
    expect(p?.kind).toBe('QUOTA_FULL')
    expect(p?.since).toBe(5_000)
    expect(p?.lastTriedAt).toBe(5_000)
    expect(p?.failCount).toBe(1)
  })

  it('連續失敗累加 failCount，但保留最初的 since', () => {
    markPaused('QUOTA_FULL', 5_000)
    markPaused('QUOTA_FULL', 9_000)
    const p = getPause()
    expect(p?.failCount).toBe(2)
    expect(p?.since).toBe(5_000)
    expect(p?.lastTriedAt).toBe(9_000)
  })

  it('成因改變時重新起算', () => {
    markPaused('QUOTA_FULL', 5_000)
    markPaused('NO_EDIT_PERMISSION', 9_000)
    const p = getPause()
    expect(p?.kind).toBe('NO_EDIT_PERMISSION')
    expect(p?.since).toBe(9_000)
    expect(p?.failCount).toBe(1)
  })

  it('clearPause 後回 null（客戶清完空間、同步成功即自動恢復）', () => {
    markPaused('QUOTA_FULL', 5_000)
    clearPause()
    expect(getPause()).toBeNull()
  })

  it('markHeartbeatTried 只更新 lastTriedAt，不影響暫停成因', () => {
    markPaused('QUOTA_FULL', 5_000)
    markHeartbeatTried(8_000)
    const p = getPause()
    expect(p?.lastTriedAt).toBe(8_000)
    expect(p?.kind).toBe('QUOTA_FULL')
    expect(p?.failCount).toBe(1)
  })

  it('沒暫停時 markHeartbeatTried 是 no-op', () => {
    markHeartbeatTried(8_000)
    expect(getPause()).toBeNull()
  })

  it('毀損資料視為未暫停（不得讓壞掉的 localStorage 永久卡住同步）', () => {
    localStorage.setItem('mpos_sync_pause', '{{{')
    expect(getPause()).toBeNull()
    localStorage.setItem('mpos_sync_pause', '"QUOTA_FULL"')
    expect(getPause()).toBeNull()
    localStorage.setItem('mpos_sync_pause', '{"kind":"NOT_A_KIND","since":1,"lastTriedAt":1,"failCount":1}')
    expect(getPause()).toBeNull()
  })
})

describe('上次成功同步時間', () => {
  beforeEach(() => localStorage.clear())

  it('未同步過回 null', () => {
    expect(getLastSyncOk()).toBeNull()
  })

  it('寫入後可讀回', () => {
    setLastSyncOk(1_700_000_000_000)
    expect(getLastSyncOk()).toBe(1_700_000_000_000)
  })

  it('毀損值回 null', () => {
    localStorage.setItem('mpos_sync_last_ok', 'abc')
    expect(getLastSyncOk()).toBeNull()
  })
})
