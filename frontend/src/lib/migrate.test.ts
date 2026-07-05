import { describe, it, expect } from 'vitest'
import { explodeDailyRecord, deterministicTxId } from './migrate'
import type { DailyRecord } from '../types/index'

// 測試用固定時間戳與可預期 id 產生器，確保結果可斷言
const FIXED_NOW = '2026-07-01T00:00:00.000Z'

function makeIdGen() {
  let n = 0
  return () => `id-${++n}`
}

// 建立測試用 DailyRecord，帶入預設值方便覆寫
function buildRecord(overrides: Partial<DailyRecord>): DailyRecord {
  return {
    date: '2026-07-01',
    incomes: {},
    expenses: {},
    syncStatus: 'PENDING',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  }
}

describe('explodeDailyRecord', () => {
  it('只拆非零金額：金額為 0 的 key 不產生交易', () => {
    const record = buildRecord({
      incomes: { cash: 100, card: 0 },
      expenses: { food: 0, wage: 50 },
    })

    const result = explodeDailyRecord(record, makeIdGen(), FIXED_NOW)

    expect(result).toHaveLength(2)
    // 同時驗證固定欄位：id/syncStatus/subId/createdAt/updatedAt
    expect(result[0]).toEqual({
      id: 'id-1',
      date: '2026-07-01',
      type: 'income',
      categoryId: 'cash',
      subId: null,
      amount: 100,
      note: undefined,
      syncStatus: 'PENDING',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    })
    expect(result[1]).toMatchObject({
      id: 'id-2',
      type: 'expense',
      categoryId: 'wage',
      amount: 50,
      subId: null,
      syncStatus: 'PENDING',
    })
  })

  it('項目備註帶入：incomeNotes/expenseNotes 對應到交易 note', () => {
    const record = buildRecord({
      incomes: { cash: 100 },
      incomeNotes: { cash: '早餐現金' },
      expenses: { food: 50 },
      expenseNotes: { food: '瓦斯費' },
    })

    const result = explodeDailyRecord(record, makeIdGen(), FIXED_NOW)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ categoryId: 'cash', note: '早餐現金' })
    expect(result[1]).toMatchObject({ categoryId: 'food', note: '瓦斯費' })
  })

  it('日備註併入第一筆：以全形「｜」附加到當天第一筆交易 note', () => {
    const record = buildRecord({
      incomes: { cash: 100 },
      incomeNotes: { cash: '早餐現金' },
      expenses: { wage: 50 },
      notes: '公休一小時',
    })

    const result = explodeDailyRecord(record, makeIdGen(), FIXED_NOW)

    expect(result).toHaveLength(2)
    // 第一筆（收入 cash）應該把日備註用｜附加在項目備註之後
    expect(result[0].note).toBe('早餐現金｜公休一小時')
    // 其餘交易的 note 不受日備註影響
    expect(result[1].note).toBeUndefined()
  })

  it('當天無任何交易：incomes/expenses 全零時回傳 []，日備註直接捨棄', () => {
    const record = buildRecord({
      incomes: { cash: 0 },
      expenses: { food: 0 },
      notes: '今天沒開店',
    })

    const result = explodeDailyRecord(record, makeIdGen(), FIXED_NOW)

    expect(result).toEqual([])
  })
})

// 全期 review 揪出的重複 bug：explodeDailyRecord 預設用隨機 id 會讓本機遷移與雲端 re-explode
// 對同一批舊資料產生不同 id，mergeTransactionsById 無法去重。改用決定性 id 讓 re-explode 冪等。
describe('deterministicTxId / explode 冪等', () => {
  const rec = {
    date: '2026-07-01',
    incomes: { cash: 100 }, expenses: { food: 50 },
    incomeNotes: {}, expenseNotes: {}, notes: '',
    syncStatus: 'SYNCED' as const, createdAt: 'x', updatedAt: 'x',
  }
  it('同一 (日期,收支,一級) 永遠得到同一 id', () => {
    expect(deterministicTxId('2026-07-01', 'income', 'cash')).toBe('mpos:2026-07-01:income:cash')
    expect(deterministicTxId('2026-07-01', 'income', 'cash'))
      .toBe(deterministicTxId('2026-07-01', 'income', 'cash'))
  })
  it('預設（不注入 makeId）時 explode 兩次 id 完全相同（冪等，可去重）', () => {
    const a = explodeDailyRecord(rec).map(t => t.id)
    const b = explodeDailyRecord(rec).map(t => t.id)
    expect(a).toEqual(b)
    expect(a).toEqual(['mpos:2026-07-01:income:cash', 'mpos:2026-07-01:expense:food'])
  })
})
