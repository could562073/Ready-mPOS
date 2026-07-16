import { describe, it, expect } from 'vitest'
import { buildDailyRecordsFromTx, dayFeesFromTx, dayFeeRatio } from './aggregate'
import type { Transaction, Category } from '../types'

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

const cat = (over: Partial<Category>): Category => ({
  id: 'cash', name: '現金', icon: 'cash', color: 'mint', enabled: true, type: 'income', ...over,
})

describe('dayFeesFromTx', () => {
  const cats = [
    cat({ id: 'cash', fee: 0 }),
    cat({ id: 'uber',  name: 'Uber Eats', fee: 0.30 }),
    cat({ id: 'panda', name: 'foodpanda', fee: 0.35 }),
    cat({ id: 'food',  name: '食材採購', type: 'expense' }),
  ]
  it('收入交易金額 × 類別 fee 加總（多 fee 類別）', () => {
    expect(dayFeesFromTx([
      tx({ categoryId: 'uber',  amount: 1000 }),
      tx({ categoryId: 'panda', amount: 200 }),
      tx({ categoryId: 'cash',  amount: 500 }),
    ], cats)).toBeCloseTo(1000 * 0.30 + 200 * 0.35)
  })
  it('支出交易不計費（即使 categoryId 撞名 fee 類別）', () => {
    expect(dayFeesFromTx([tx({ type: 'expense', categoryId: 'uber', amount: 100 })], cats)).toBe(0)
  })
  it('無 fee>0 類別 → 0', () => {
    expect(dayFeesFromTx([tx({ categoryId: 'cash', amount: 999 })], [cat({ id: 'cash', fee: 0 })])).toBe(0)
  })
  it('未知 categoryId 不計費', () => {
    expect(dayFeesFromTx([tx({ categoryId: '外星收入', amount: 1000 })], cats)).toBe(0)
  })
  it('停用的 fee 類別照樣計費（歷史交易的錢已被抽走）', () => {
    expect(dayFeesFromTx([tx({ categoryId: 'uber', amount: 100 })],
      [cat({ id: 'uber', fee: 0.30, enabled: false })])).toBeCloseTo(30)
  })
  it('空交易 → 0', () => {
    expect(dayFeesFromTx([], cats)).toBe(0)
  })
})

describe('dayFeeRatio', () => {
  const cats = [
    cat({ id: 'cash', fee: 0 }),
    cat({ id: 'uber', name: 'Uber Eats', fee: 0.30 }),
  ]
  it('fee 類別收入佔總收入比', () => {
    expect(dayFeeRatio([
      tx({ categoryId: 'uber', amount: 400 }),
      tx({ categoryId: 'cash', amount: 600 }),
    ], cats)).toBeCloseTo(0.4)
  })
  it('總收入為 0（只有支出）→ 0', () => {
    expect(dayFeeRatio([tx({ type: 'expense', categoryId: 'food', amount: 100 })], cats)).toBe(0)
  })
  it('全為 fee 類別收入 → 1', () => {
    expect(dayFeeRatio([tx({ categoryId: 'uber', amount: 100 })], cats)).toBe(1)
  })
  it('未知 categoryId 收入進分母、不進分子', () => {
    expect(dayFeeRatio([
      tx({ categoryId: 'uber', amount: 500 }),
      tx({ categoryId: '外星收入', amount: 500 }),
    ], cats)).toBeCloseTo(0.5)
  })
  it('停用的 fee 類別仍計入分子（與 dayFeesFromTx 的 enabled 政策一致）', () => {
    expect(dayFeeRatio([
      tx({ categoryId: 'uber', amount: 400 }),
      tx({ categoryId: 'cash', amount: 600 }),
    ], [cat({ id: 'cash', fee: 0 }), cat({ id: 'uber', name: 'Uber Eats', fee: 0.30, enabled: false })]))
      .toBeCloseTo(0.4)
  })
  it('空交易 → 0', () => {
    expect(dayFeeRatio([], cats)).toBe(0)
  })
})
