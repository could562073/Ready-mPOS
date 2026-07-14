import { describe, it, expect, beforeEach } from 'vitest'
import { getWeeklyClosed, setWeeklyClosed, getClosedDates, markClosed, unmarkClosed } from './closedDays'

// node 環境無 localStorage → 用 Map 做最小 stub（只實作本模組用到的 getItem/setItem）
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
  } as unknown as Storage
})

describe('每週公休（weekly）', () => {
  it('預設為空陣列', () => {
    expect(getWeeklyClosed()).toEqual([])
  })
  it('set 後可讀回，且去重 + 排序', () => {
    setWeeklyClosed([2, 0, 2])
    expect(getWeeklyClosed()).toEqual([0, 2])
  })
  it('localStorage 內容毀損時回退為空陣列（不拋錯）', () => {
    store.set('mpos_weekly_closed', '{oops')
    expect(getWeeklyClosed()).toEqual([])
  })
  it('合法 JSON 但形狀錯誤（非陣列）時回退為空陣列', () => {
    store.set('mpos_weekly_closed', '{}')
    expect(getWeeklyClosed()).toEqual([])
  })
})

describe('臨時公休（dates）', () => {
  it('mark 後可讀回且排序；重複 mark 不重複', () => {
    markClosed('2026-07-18')
    markClosed('2026-07-02')
    markClosed('2026-07-18')
    expect(getClosedDates()).toEqual(['2026-07-02', '2026-07-18'])
  })
  it('unmark 移除指定日期，其餘保留', () => {
    markClosed('2026-07-02')
    markClosed('2026-07-18')
    unmarkClosed('2026-07-02')
    expect(getClosedDates()).toEqual(['2026-07-18'])
  })
  it('合法 JSON 但形狀錯誤（非陣列）時回退為空陣列', () => {
    store.set('mpos_closed_days', '"oops"')
    expect(getClosedDates()).toEqual([])
  })
})
