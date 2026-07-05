import { describe, it, expect } from 'vitest'
import { buildMonthMatrix, monthDayNets, shiftMonth } from './calendar'
import type { Transaction } from '../types'

describe('buildMonthMatrix', () => {
  const m = buildMonthMatrix('2026-07')
  it('每列 7 格', () => { for (const row of m) expect(row).toHaveLength(7) })
  it('非空格恰為當月 1..31 日、依序', () => {
    const flat = m.flat().filter((x): x is string => x !== null)
    expect(flat[0]).toBe('2026-07-01')
    expect(flat[flat.length - 1]).toBe('2026-07-31')
    expect(flat).toHaveLength(31)
  })
  it('補白只在頭尾（中間無 null）', () => {
    const flat = m.flat()
    const firstIdx = flat.findIndex(x => x !== null)
    const lastIdx = flat.length - 1 - [...flat].reverse().findIndex(x => x !== null)
    for (let i = firstIdx; i <= lastIdx; i++) expect(flat[i]).not.toBeNull()
  })
})

describe('monthDayNets', () => {
  const tx = (over: Partial<Transaction>): Transaction => ({
    localId: 1, id: 'x', date: '2026-07-01', type: 'income', categoryId: 'c',
    subId: null, amount: 100, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x', ...over,
  })
  it('同日收入減支出得淨額；跨日分別加總', () => {
    const nets = monthDayNets([
      tx({ date: '2026-07-01', type: 'income', amount: 100 }),
      tx({ date: '2026-07-01', type: 'expense', amount: 30 }),
      tx({ date: '2026-07-02', type: 'expense', amount: 50 }),
    ])
    expect(nets['2026-07-01']).toBe(70)
    expect(nets['2026-07-02']).toBe(-50)
  })
})

describe('shiftMonth', () => {
  it('跨年進位/退位', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-07', 0)).toBe('2026-07')
  })
})
