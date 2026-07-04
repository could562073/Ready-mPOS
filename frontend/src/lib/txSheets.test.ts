import { describe, it, expect } from 'vitest'
import { TX_MONTH_HEADERS, isNewTxFormat, txToRow } from './txSheets'
import type { Category, Transaction } from '../types'

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
