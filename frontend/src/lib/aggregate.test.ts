import { describe, it, expect } from 'vitest'
import { buildDailyRecordsFromTx } from './aggregate'
import type { Transaction } from '../types'

const tx = (over: Partial<Transaction>): Transaction => ({
  localId: 1, id: 'x', date: '2026-07-01', type: 'income', categoryId: 'cash',
  subId: null, amount: 100, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x', ...over,
})

describe('buildDailyRecordsFromTx', () => {
  it('依日期 group、收入/支出分流、同類別加總', () => {
    const recs = buildDailyRecordsFromTx([
      tx({ date: '2026-07-01', type: 'income', categoryId: 'cash', amount: 100 }),
      tx({ date: '2026-07-01', type: 'income', categoryId: 'cash', amount: 50 }),
      tx({ date: '2026-07-01', type: 'expense', categoryId: 'food', amount: 30 }),
    ])
    expect(recs).toHaveLength(1)
    expect(recs[0].date).toBe('2026-07-01')
    expect(recs[0].incomes).toEqual({ cash: 150 })
    expect(recs[0].expenses).toEqual({ food: 30 })
  })
  it('多日期依日期升冪排序', () => {
    const recs = buildDailyRecordsFromTx([
      tx({ date: '2026-07-03' }), tx({ date: '2026-07-01' }), tx({ date: '2026-07-02' }),
    ])
    expect(recs.map(r => r.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })
  it('未知一級（categoryId 為原始名稱）照樣進 map（由 UI 以已知 id 過濾）', () => {
    const recs = buildDailyRecordsFromTx([tx({ categoryId: '外星收入', amount: 9 })])
    expect(recs[0].incomes).toEqual({ 外星收入: 9 })
  })
  it('空陣列回空', () => {
    expect(buildDailyRecordsFromTx([])).toEqual([])
  })
})
