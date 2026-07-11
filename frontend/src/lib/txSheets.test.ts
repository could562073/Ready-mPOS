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
  it('依固定欄序輸出，收支轉中文、類別/二級轉名稱，並附一級ID/二級ID（改名防護的關聯鍵）', () => {
    expect(txToRow(tx({}), catById)).toEqual(['2026-07-04', '支出', '雜項', '瓦斯費', 300, '七月', 't1', 'c1', 's1'])
  })
  it('無二級（subId=null）二級名稱與二級ID欄皆為空字串', () => {
    expect(txToRow(tx({ subId: null }), catById)).toEqual(['2026-07-04', '支出', '雜項', '', 300, '七月', 't1', 'c1', ''])
  })
  it('收入 type 轉「收入」', () => {
    expect(txToRow(tx({ type: 'income' }), catById)[1]).toBe('收入')
  })
  it('未知 categoryId 時一級名稱欄保留原始字串（不丟資料），一級ID欄留白（不把未解析字串凍進 ID 欄）', () => {
    const row = txToRow(tx({ categoryId: 'gone' }), catById)
    expect(row[2]).toBe('gone')
    expect(row[7]).toBe('')
  })
  it('備註缺省輸出空字串', () => {
    expect(txToRow(tx({ note: undefined }), catById)[5]).toBe('')
  })
})

describe('rowToTx', () => {
  const catByName = new Map<string, Category>([['雜項', cat({})]])
  // 舊新格式（v2.0.0 的 7 欄，無 ID 欄）— 退回名稱對照的相容路徑
  const H = ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id']

  it('解析新格式列：名稱對回 id、收支轉 type、二級對回 subId', () => {
    const seed = rowToTx(['2026-07-04', '支出', '雜項', '瓦斯費', '300', '七月', 't1'], H, catByName, catById, 'NOW')
    expect(seed).toEqual({
      id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c1', subId: 's1',
      amount: 300, note: '七月', syncStatus: 'SYNCED', createdAt: 'NOW', updatedAt: 'NOW',
    })
  })
  it('二級名稱找不到 → subId=null', () => {
    expect(rowToTx(['2026-07-04', '支出', '雜項', '未知子', '300', '', 't2'], H, catByName, catById, 'NOW')!.subId).toBeNull()
  })
  it('未知一級名稱 → categoryId 保留原始名稱字串（不丟資料）', () => {
    expect(rowToTx(['2026-07-04', '收入', '外星收入', '', '50', '', 't3'], H, catByName, catById, 'NOW')!.categoryId).toBe('外星收入')
  })
  it('缺 id 或缺日期 → 回 null（略過該列）', () => {
    expect(rowToTx(['2026-07-04', '支出', '雜項', '', '300', '', ''], H, catByName, catById, 'NOW')).toBeNull()
    expect(rowToTx(['', '支出', '雜項', '', '300', '', 't4'], H, catByName, catById, 'NOW')).toBeNull()
  })
})

describe('rowToTx（一級ID/二級ID 欄，改名防護）', () => {
  const catByName = new Map<string, Category>([['雜項', cat({})]])
  const H9 = [...TX_MONTH_HEADERS]

  it('🔴 改名情境：名稱欄是改名前的舊名，但一級ID/二級ID 欄可解析 → 不退化成未知類別', () => {
    const seed = rowToTx(['2026-07-04', '支出', '舊雜項', '舊瓦斯費', '300', '', 't1', 'c1', 's1'], H9, catByName, catById, 'NOW')
    expect(seed!.categoryId).toBe('c1')
    expect(seed!.subId).toBe('s1')
  })
  it('一級ID 欄為空 → 退回名稱對照（手動在試算表補的列只填名稱也能解析）', () => {
    const seed = rowToTx(['2026-07-04', '支出', '雜項', '瓦斯費', '300', '', 't1', '', ''], H9, catByName, catById, 'NOW')
    expect(seed!.categoryId).toBe('c1')
    expect(seed!.subId).toBe('s1')
  })
  it('一級ID 指向已刪除的類別 → 保留該 id（不丟資料）', () => {
    const seed = rowToTx(['2026-07-04', '支出', '早就刪了', '', '300', '', 't1', 'deadCat', ''], H9, catByName, catById, 'NOW')
    expect(seed!.categoryId).toBe('deadCat')
  })
  it('二級ID 欄為空且二級名稱也空 → subId=null', () => {
    const seed = rowToTx(['2026-07-04', '支出', '雜項', '', '300', '', 't1', 'c1', ''], H9, catByName, catById, 'NOW')
    expect(seed!.subId).toBeNull()
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
  it('本機 DELETED 墓碑同 id → 不 toAdd 也不 toUpdate（防止雲端列復活）', () => {
    const withTombstone: Transaction[] = [
      ...local,
      { localId: 3, id: 'd', date: '2026-07-02', type: 'expense', categoryId: 'c1', subId: null, amount: 40, syncStatus: 'DELETED', createdAt: 'x', updatedAt: 'x' },
    ]
    const plan = mergeTransactionsById(withTombstone, [seed('d', 40)])
    expect(plan.toAdd).toEqual([])
    expect(plan.toUpdate).toEqual([])
  })
})
