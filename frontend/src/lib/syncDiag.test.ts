import { describe, it, expect } from 'vitest'
import { classifyWriteFailure, isPermissionDenied, writeFailureMessage, type WriteDiagnostics } from './syncDiag'

// 全部查不到的空白診斷（探針自身失敗時的樣子）
const blank: WriteDiagnostics = {
  quota: null,
  canEdit: null,
  ownedByMe: null,
  trashed: null,
  scopes: null,
}

const GB = 1024 * 1024 * 1024

describe('classifyWriteFailure', () => {
  it('查不到任何診斷資料時回 UNKNOWN（不亂猜）', () => {
    expect(classifyWriteFailure(blank)).toBe('UNKNOWN')
  })

  it('用量已達上限 → QUOTA_FULL', () => {
    expect(classifyWriteFailure({ ...blank, quota: { limit: 15 * GB, usage: 15 * GB } })).toBe('QUOTA_FULL')
    expect(classifyWriteFailure({ ...blank, quota: { limit: 15 * GB, usage: 16 * GB } })).toBe('QUOTA_FULL')
  })

  it('空間還夠 → 不判 QUOTA_FULL', () => {
    expect(classifyWriteFailure({ ...blank, quota: { limit: 15 * GB, usage: 3 * GB } })).toBe('UNKNOWN')
  })

  it('limit 缺漏（無容量上限的帳號）→ 不判 QUOTA_FULL', () => {
    expect(classifyWriteFailure({ ...blank, quota: { limit: null, usage: 900 * GB } })).toBe('UNKNOWN')
  })

  // 🔴 關鍵順序：Google 帳號空間滿時，連「自己擁有的檔案」都會被降成唯讀（canEdit=false）。
  // 若先看 canEdit 就會把「空間滿」誤判成「沒有編輯權」，給客戶完全錯誤的指示。
  it('空間滿且 canEdit=false → 仍判 QUOTA_FULL（配額優先於權限）', () => {
    expect(
      classifyWriteFailure({ ...blank, quota: { limit: 15 * GB, usage: 15 * GB }, canEdit: false, ownedByMe: true }),
    ).toBe('QUOTA_FULL')
  })

  it('空間充足但 canEdit=false → NO_EDIT_PERMISSION', () => {
    expect(
      classifyWriteFailure({ ...blank, quota: { limit: 15 * GB, usage: 1 * GB }, canEdit: false, ownedByMe: false }),
    ).toBe('NO_EDIT_PERMISSION')
  })

  it('granted scopes 不含 spreadsheets → SCOPE_MISSING（優先於其他判斷）', () => {
    const d: WriteDiagnostics = {
      ...blank,
      quota: { limit: 15 * GB, usage: 15 * GB },
      canEdit: false,
      scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
    }
    expect(classifyWriteFailure(d)).toBe('SCOPE_MISSING')
  })

  it('granted scopes 含 spreadsheets → 不因 scope 誤判', () => {
    const d: WriteDiagnostics = {
      ...blank,
      canEdit: false,
      quota: { limit: 15 * GB, usage: 1 * GB },
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/userinfo.email'],
    }
    expect(classifyWriteFailure(d)).toBe('NO_EDIT_PERMISSION')
  })

  it('scopes 查不到（null）時不判 SCOPE_MISSING', () => {
    expect(classifyWriteFailure({ ...blank, scopes: null, canEdit: false, quota: { limit: GB, usage: 0 } })).toBe(
      'NO_EDIT_PERMISSION',
    )
  })
})

describe('writeFailureMessage', () => {
  it('每種分類都有非空的繁中提示', () => {
    for (const kind of ['QUOTA_FULL', 'NO_EDIT_PERMISSION', 'SCOPE_MISSING', 'UNKNOWN'] as const) {
      expect(writeFailureMessage(kind).length).toBeGreaterThan(0)
    }
  })

  it('所有訊息都要讓使用者知道「資料還在這台手機」，避免以為帳目不見了', () => {
    for (const kind of ['QUOTA_FULL', 'NO_EDIT_PERMISSION', 'SCOPE_MISSING', 'UNKNOWN'] as const) {
      expect(writeFailureMessage(kind)).toContain('本機')
    }
  })

  it('空間滿的訊息要給出可行動指示（清理空間）', () => {
    expect(writeFailureMessage('QUOTA_FULL')).toContain('空間')
  })
})

describe('isPermissionDenied', () => {
  // 探針要多打 3 個 Google API request，只在「權限類」失敗時才值得跑；
  // 離線／逾時等一般失敗跑探針也一定失敗，只是白費流量。
  it('認得 sheets.ts 丟出的 403 錯誤字串（實際客戶端回報的兩種）', () => {
    expect(isPermissionDenied(new Error('建立備份試算表失敗：403 {"error":{"code":403}}'))).toBe(true)
    expect(isPermissionDenied(new Error('Sheets POST /<id>:batchUpdate → 403: {"status":"PERMISSION_DENIED"}'))).toBe(
      true,
    )
  })

  it('認得沒帶狀態碼但有 PERMISSION_DENIED 的訊息', () => {
    expect(isPermissionDenied(new Error('The caller does not have permission (PERMISSION_DENIED)'))).toBe(true)
  })

  it('離線／逾時／其他狀態碼不觸發探針', () => {
    expect(isPermissionDenied(new Error('Failed to fetch'))).toBe(false)
    expect(isPermissionDenied(new Error('Sheets GET /<id> → 500: internal error'))).toBe(false)
    expect(isPermissionDenied(new Error('Sheets GET /<id> → 404: not found'))).toBe(false)
  })

  it('非 Error 物件也不會爆（字串／null／undefined）', () => {
    expect(isPermissionDenied('403 PERMISSION_DENIED')).toBe(true)
    expect(isPermissionDenied(null)).toBe(false)
    expect(isPermissionDenied(undefined)).toBe(false)
    expect(isPermissionDenied({ weird: true })).toBe(false)
  })
})
