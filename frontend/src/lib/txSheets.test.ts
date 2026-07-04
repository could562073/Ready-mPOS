import { describe, it, expect } from 'vitest'
import { TX_MONTH_HEADERS, isNewTxFormat, txToRow, rowToTx, mergeTransactionsById } from './txSheets'
import type { Category, Transaction } from '../types'
import type { TxSeed } from './txSheets'

const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '雜項', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
  subs: [{ id: 's1', name: '瓦斯費' }], defaultSubId: null, ...over,
})
const catById = new Map<string, Category>([['c1', cat({})]])

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: 's1',
  amount: 300, note: '七月', syncStatus: 'PENDING', createdAt: 'x', updatedAt: 'x', ...over,
})

describe('isNewTxFormat', () => {
  it('新格式表頭（含 收支 + id）為 true', () => {
    expect(isNewTxFormat([...TX_MONTH_HEADERS])).toBe(true)
  })
  it('舊彙總表頭（日期/現金/總收入…）為 false', () => {
    expect(isNewTxFormat(['日期', '現金', '總收入', '總支出', '淨利'])).toBe(false)
  })
})

describe('txToRow', () => {
  it('依固定欄序輸出，收支轉中文、類別/二級轉名稱', () => {
    expect(txToRow(tx({}), catById)).toEqual(['2026-07-04', '支出', '雜項', '瓦斯費', 300, '七月', 't1'])
  })
  it('無二級（subId=null）二級欄為空字串', () => {
    expect(txToRow(tx({ subId: null }), catById)).toEqual(['2026-07-04', '支出', '雜項', '', 300, '七月', 't1'])
  })
  it('收入 type 轉「收入」', () => {
    expect(txToRow(tx({ type: 'income' }), catById)[1]).toBe('收入')
  })
  it('未知 categoryId 時一級欄保留原始 id 字串（不丟資料）', () => {
    expect(txToRow(tx({ categoryId: 'gone' }), catById)[2]).toBe('gone')
  })
  it('備註缺省輸出空字串', () => {
    expect(txToRow(tx({ note: undefined }), catById)[5]).toBe('')
  })
})

describe('rowToTx', () => {
  const catByName = new Map<string, Category>([['雜項', cat({})]])
  const H = ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id']

  it('解析新格式列：名稱對回 id、收支轉 type、二級對回 subId', () => {
    const seed = rowToTx(['2026-07-04', '支出', '雜項', '瓦斯費', '300', '七月', 't1'], H, catByName, 'NOW')
    expect(seed).toEqual({
      id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: 's1',
      amount: 300, note: '七月', syncStatus: 'SYNCED', createdAt: 'NOW', updatedAt: 'NOW',
    })
  })
  it('二級名稱找不到 → subId=null', () => {
    expect(rowToTx(['2026-07-04', '支出', '雜項', '未知子', '300', '', 't2'], H, catByName, 'NOW')!.subId).toBeNull()
  })
  it('未知一級名稱 → categoryId 保留原始名稱字串（不丟資料）', () => {
    expect(rowToTx(['2026-07-04', '收入', '外星收入', '', '50', '', 't3'], H, catByName, 'NOW')!.categoryId).toBe('外星收入')
  })
  it('缺 id 或缺日期 → 回 null（略過該列）', () => {
    expect(rowToTx(['2026-07-04', '支出', '雜項', '', '300', '', ''], H, catByName, 'NOW')).toBeNull()
    expect(rowToTx(['', '支出', '雜項', '', '300', '', 't4'], H, catByName, 'NOW')).toBeNull()
  })
})

describe('mergeTransactionsById', () => {
  const local: Transaction[] = [
    { localId: 1, id: 'a', date: '2026-07-01', type: 'income', categoryId: 'c1', subId: null, amount: 10, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x' },
    { localId: 2, id: 'b', date: '2026-07-01', type: 'income', categoryId: 'c1', subId: null, amount: 20, syncStatus: 'PENDING', createdAt: 'x', updatedAt: 'x' },
  ]
  const seed = (id: string, amount: number): TxSeed => ({ id, date: '2026-07-01', type: 'income', categoryId: 'c1', subId: null, amount, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x' })

  it('雲端有、本機無 → toAdd', () => {
    const plan = mergeTransactionsById(local, [seed('c', 30)])
    expect(plan.toAdd.map(t => t.id)).toEqual(['c'])
    expect(plan.toUpdate).toEqual([])
  })
  it('本機 SYNCED 同 id → toUpdate（以雲端覆蓋）', () => {
    const plan = mergeTransactionsById(local, [seed('a', 99)])
    expect(plan.toAdd).toEqual([])
    expect(plan.toUpdate).toEqual([{ localId: 1, seed: seed('a', 99) }])
  })
  it('本機 PENDING 同 id → 保留本機、不動', () => {
    const plan = mergeTransactionsById(local, [seed('b', 99)])
    expect(plan.toAdd).toEqual([])
    expect(plan.toUpdate).toEqual([])
  })
})
