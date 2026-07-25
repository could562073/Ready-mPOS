import { describe, it, expect } from 'vitest'
import { buildSignature, markAndCheck, redact, COOLDOWN_MS } from './errorReport'

// 假 KV 儲存（vitest 為 node 環境、無 localStorage）——純函式測試以注入方式提供儲存
function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v) },
  }
}

describe('buildSignature', () => {
  it('以 context + 訊息組成簽章', () => {
    expect(buildSignature('sync/backup', 'boom')).toBe('sync/backup|boom')
  })
  it('過長訊息截斷，避免 key 爆長', () => {
    const long = 'x'.repeat(500)
    const sig = buildSignature('c', long)
    expect(sig.length).toBeLessThanOrEqual('c|'.length + 200)
  })
})

describe('redact（去識別化：剝除試算表 ID/長 token，保留狀態碼與錯誤原因）', () => {
  const REAL_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aBcDe' // 43 字，仿真實 spreadsheetId

  it('剝除 Sheets GET 訊息內的試算表 ID，但保留 → 狀態碼與 Google 錯誤原因', () => {
    const msg = `Sheets GET /${REAL_ID}/values/2026-07%21A1%3AZZ → 403: storageQuotaExceeded`
    const out = redact(msg)
    expect(out).not.toContain(REAL_ID)      // ID 已被遮蔽
    expect(out).toContain('<id>')
    expect(out).toContain('403')             // 診斷所需的狀態碼保留
    expect(out).toContain('storageQuotaExceeded')
    expect(out).toContain('2026-07')         // 月份分頁名非敏感，保留
  })

  it('遮蔽同一訊息中的多個 ID', () => {
    const other = '1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'
    const out = redact(`copy /${REAL_ID}/ to /${other}/`)
    expect(out).not.toContain(REAL_ID)
    expect(out).not.toContain(other)
  })

  it('短字串（狀態碼、單字）不受影響', () => {
    expect(redact('建立備份試算表失敗：403 PERMISSION_DENIED')).toBe(
      '建立備份試算表失敗：403 PERMISSION_DENIED',
    )
  })

  it('空字串安全', () => {
    expect(redact('')).toBe('')
  })
})

describe('markAndCheck（去重 + 冷卻）', () => {
  it('同一 session 同簽章只回 true 一次', () => {
    const seen = new Set<string>()
    const store = fakeStore()
    expect(markAndCheck('sig', 1000, seen, store)).toBe(true)
    expect(markAndCheck('sig', 1000, seen, store)).toBe(false)
  })

  it('不同簽章互不影響', () => {
    const seen = new Set<string>()
    const store = fakeStore()
    expect(markAndCheck('a', 1000, seen, store)).toBe(true)
    expect(markAndCheck('b', 1000, seen, store)).toBe(true)
  })

  it('跨 session（新 Set）在冷卻時間內仍不重送', () => {
    const store = fakeStore()
    expect(markAndCheck('sig', 1000, new Set(), store)).toBe(true)
    // 11 小時後、模擬新 session（全新 Set）→ 仍在 12h 冷卻內
    expect(markAndCheck('sig', 1000 + 11 * 3600_000, new Set(), store)).toBe(false)
  })

  it('冷卻時間過後可再送', () => {
    const store = fakeStore()
    expect(markAndCheck('sig', 1000, new Set(), store)).toBe(true)
    expect(markAndCheck('sig', 1000 + COOLDOWN_MS + 1, new Set(), store)).toBe(true)
  })

  it('store 存取異常時 fail-open（仍回 true，寧可多送不可漏唯一診斷）', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(markAndCheck('sig', 1000, new Set(), throwing)).toBe(true)
  })
})
