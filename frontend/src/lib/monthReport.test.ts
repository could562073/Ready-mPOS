import { describe, it, expect } from 'vitest'
import { daysInMonth, missingDays, comparisonRange, limitToDay, delta, sumByCategoryAndSub } from './monthReport'
import type { Transaction, Category } from '../types'

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: null,
  amount: 100, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x', ...over,
})
const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
  subs: [{ id: 's1', name: '瓦斯費' }], ...over,
})

describe('daysInMonth', () => {
  it('大小月與閏年', () => {
    expect(daysInMonth('2026-07')).toBe(31)
    expect(daysInMonth('2026-06')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29) // 閏年
  })
})

describe('missingDays', () => {
  it('進行中月份只檢查到今天；已記帳日排除', () => {
    const txDates = new Set(['2026-07-01', '2026-07-03'])
    expect(missingDays('2026-07', txDates, [], new Set(), '2026-07-04'))
      .toEqual(['2026-07-02', '2026-07-04'])
  })
  it('固定週公休排除（2026-07-05 是週日）', () => {
    expect(missingDays('2026-07', new Set(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']), [0], new Set(), '2026-07-05'))
      .toEqual([]) // 7/5 週日公休 → 不算漏記
  })
  it('臨時公休排除', () => {
    expect(missingDays('2026-07', new Set(['2026-07-01']), [], new Set(['2026-07-02']), '2026-07-02'))
      .toEqual([])
  })
  it('歷史月份檢查整月', () => {
    const all = new Set(Array.from({ length: 29 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`))
    expect(missingDays('2026-06', all, [], new Set(), '2026-07-04')).toEqual(['2026-06-30'])
  })
  it('未來月份回空', () => {
    expect(missingDays('2026-08', new Set(), [], new Set(), '2026-07-04')).toEqual([])
  })
})

describe('comparisonRange', () => {
  it('進行中月份 → 上月同期（1 號到同日）', () => {
    expect(comparisonRange('2026-07', '2026-07-15'))
      .toEqual({ prevMonth: '2026-06', mode: 'same-period', endDay: 15 })
  })
  it('同期天數超過上月天數 → 取上月最後一天（3/30 vs 2月）', () => {
    expect(comparisonRange('2026-03', '2026-03-30'))
      .toEqual({ prevMonth: '2026-02', mode: 'same-period', endDay: 28 })
  })
  it('歷史月份 → 上月全月', () => {
    expect(comparisonRange('2026-06', '2026-07-15'))
      .toEqual({ prevMonth: '2026-05', mode: 'full', endDay: 31 })
  })
  it('1 月跨年比去年 12 月', () => {
    expect(comparisonRange('2026-01', '2026-07-15'))
      .toEqual({ prevMonth: '2025-12', mode: 'full', endDay: 31 })
  })
})

describe('limitToDay', () => {
  it('只留該月 endDay（含）以前的交易', () => {
    const txs = [tx({ id: 'a', date: '2026-06-10' }), tx({ id: 'b', date: '2026-06-20' })]
    expect(limitToDay(txs, '2026-06', 15).map(t => t.id)).toEqual(['a'])
  })
})

describe('delta', () => {
  it('一般情況：金額差 + 百分比（四捨五入）', () => {
    expect(delta(1120, 1000)).toEqual({ diff: 120, pct: 12 })
    expect(delta(900, 1000)).toEqual({ diff: -100, pct: -10 })
  })
  it('上月為 0 → pct 為 null（避免除以零）', () => {
    expect(delta(500, 0)).toEqual({ diff: 500, pct: null })
  })
})

describe('sumByCategoryAndSub', () => {
  const cats = [cat({}), cat({ id: 'c2', name: '食材', subs: [] })]
  it('依一級彙總、二級細目降冪、只取指定 type', () => {
    const txs = [
      tx({ id: 'a', categoryId: 'c1', subId: 's1', amount: 300 }),
      tx({ id: 'b', categoryId: 'c1', subId: null, amount: 100 }),
      tx({ id: 'c', categoryId: 'c2', amount: 900 }),
      tx({ id: 'd', type: 'income', categoryId: 'cash', amount: 9999 }), // income 不計入
    ]
    expect(sumByCategoryAndSub(txs, cats, 'expense')).toEqual([
      { categoryId: 'c2', total: 900, subs: [{ label: '（未分類）', amount: 900 }] },
      { categoryId: 'c1', total: 400, subs: [{ label: '瓦斯費', amount: 300 }, { label: '（未分類）', amount: 100 }] },
    ])
  })
  it('失效 subId（dangling）併入（未分類）', () => {
    const txs = [
      tx({ id: 'a', subId: 'ghost', amount: 50 }),
      tx({ id: 'b', subId: null, amount: 70 }),
    ]
    expect(sumByCategoryAndSub(txs, cats, 'expense')[0].subs)
      .toEqual([{ label: '（未分類）', amount: 120 }])
  })
})
