import { describe, it, expect } from 'vitest'
import {
  TX_MONTH_HEADERS, isNewTxFormat, txToRow, rowToTx, mergeTransactionsById, planMonthsToRewrite,
  categoryHintsFromRow, parseSheetAmount, parseSheetDate,
} from './txSheets'
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

describe('planMonthsToRewrite（改寫月份 gating）', () => {
  it('備份失敗（allowOldRewrite=false）時排除舊格式月份，即使該月有本機 PENDING', () => {
    const r = planMonthsToRewrite({
      pendingMonths: ['2026-06', '2026-07'],
      oldFormatMonths: ['2026-06'],
      upgradeMonths: [],
      allowOldRewrite: false,
    })
    expect(r).toContain('2026-07')
    expect(r).not.toContain('2026-06')
  })

  it('允許改寫時，PENDING 月份 ∪ 舊格式月份都改寫', () => {
    const r = planMonthsToRewrite({
      pendingMonths: ['2026-07'],
      oldFormatMonths: ['2026-05', '2026-06'],
      upgradeMonths: [],
      allowOldRewrite: true,
    })
    expect(new Set(r)).toEqual(new Set(['2026-05', '2026-06', '2026-07']))
  })

  it('缺一級ID的升級月份不受備份門檻限制，一律納入', () => {
    const r = planMonthsToRewrite({
      pendingMonths: [],
      oldFormatMonths: [],
      upgradeMonths: ['2026-04'],
      allowOldRewrite: false,
    })
    expect(r).toEqual(['2026-04'])
  })

  it('去重：同月出現在多來源只列一次', () => {
    const r = planMonthsToRewrite({
      pendingMonths: ['2026-07'],
      oldFormatMonths: ['2026-07'],
      upgradeMonths: ['2026-07'],
      allowOldRewrite: true,
    })
    expect(r).toEqual(['2026-07'])
  })
})

describe('categoryHintsFromRow — 孤兒類別線索', () => {
  const header = [...TX_MONTH_HEADERS]
  const seed: TxSeed = {
    id: 't1', date: '2026-07-04', type: 'expense', categoryId: 'c9', subId: 's9',
    amount: 300, syncStatus: 'SYNCED', createdAt: 'x', updatedAt: 'x',
  }

  it('抽出一級與二級線索：id 取自 seed、名稱取自列上的顯示欄', () => {
    const row = ['2026-07-04', '支出', '舊食材', '舊二級', '300', '', 't1', 'c9', 's9']
    expect(categoryHintsFromRow(seed, row, header)).toEqual([
      { kind: 'primary', id: 'c9', name: '舊食材', type: 'expense' },
      { kind: 'sub', id: 's9', name: '舊二級', type: 'expense', parentId: 'c9' },
    ])
  })

  it('無二級的列只回一級線索', () => {
    const row = ['2026-07-04', '支出', '舊食材', '', '300', '', 't1', 'c9', '']
    expect(categoryHintsFromRow({ ...seed, subId: null }, row, header)).toEqual([
      { kind: 'primary', id: 'c9', name: '舊食材', type: 'expense' },
    ])
  })

  it('名稱欄空白或缺欄不炸，回空名稱交由回收端補佔位名', () => {
    expect(categoryHintsFromRow({ ...seed, subId: null }, ['2026-07-04'], header)[0].name).toBe('')
  })
})

// ── Sheets 儲存格值解析（2.4.2）─────────────────────────────────
// 這兩組測試鎖定的是「顯示層字串 ≠ 資料真值」這個 2.4.1 事故的根因在金額/日期欄的版本。
// 🔴 最重要的一條不變式：解析失敗一律回 null，永遠不可以退回 0 或今天的日期——
//    那等於允許一次壞掉的讀取把使用者的真實帳目覆寫掉。

describe('parseSheetAmount', () => {
  it('UNFORMATTED_VALUE 的真數字直接回傳', () => {
    expect(parseSheetAmount(1234)).toBe(1234)
    expect(parseSheetAmount(1234.5)).toBe(1234.5)
    expect(parseSheetAmount(-500)).toBe(-500)
  })

  it('0 是合法金額，必須回 0 而非 null', () => {
    expect(parseSheetAmount(0)).toBe(0)
    expect(parseSheetAmount('0')).toBe(0)
  })

  it('非有限數字視為無法解析', () => {
    expect(parseSheetAmount(NaN)).toBeNull()
    expect(parseSheetAmount(Infinity)).toBeNull()
  })

  it('純數字字串', () => {
    expect(parseSheetAmount('1234')).toBe(1234)
    expect(parseSheetAmount('  1234  ')).toBe(1234)
  })

  it('🔴 千分位格式——這正是現行 `Number(x) || 0` 會靜默歸零的輸入', () => {
    expect(parseSheetAmount('1,234')).toBe(1234)
    expect(parseSheetAmount('1,234.50')).toBe(1234.5)
    expect(parseSheetAmount('1,234,567')).toBe(1234567)
  })

  it('貨幣符號（NT$／$／全形）', () => {
    expect(parseSheetAmount('NT$1,234')).toBe(1234)
    expect(parseSheetAmount('$1,234')).toBe(1234)
    expect(parseSheetAmount('＄1234')).toBe(1234)
    expect(parseSheetAmount('1234元')).toBe(1234)
  })

  it('各種空白與全形逗號', () => {
    expect(parseSheetAmount('1 234')).toBe(1234)
    expect(parseSheetAmount('1\u00A0234')).toBe(1234)   // 不斷行空白
    expect(parseSheetAmount('1\u3000234')).toBe(1234)   // 全形空白
    expect(parseSheetAmount('1，234')).toBe(1234)        // 全形逗號
  })

  it('會計格式括號負數與正負號', () => {
    expect(parseSheetAmount('(500)')).toBe(-500)
    expect(parseSheetAmount('（500）')).toBe(-500)
    expect(parseSheetAmount('(NT$1,234)')).toBe(-1234)
    expect(parseSheetAmount('-500')).toBe(-500)
    expect(parseSheetAmount('+500')).toBe(500)
  })

  it('空值與非字串型別回 null', () => {
    expect(parseSheetAmount('')).toBeNull()
    expect(parseSheetAmount('   ')).toBeNull()
    expect(parseSheetAmount(null)).toBeNull()
    expect(parseSheetAmount(undefined)).toBeNull()
    expect(parseSheetAmount({})).toBeNull()
  })

  it('🔴 布林儲存格不是金額（2.4.1 同款的型別誤判）', () => {
    expect(parseSheetAmount(true)).toBeNull()
    expect(parseSheetAmount(false)).toBeNull()
    expect(parseSheetAmount('TRUE')).toBeNull()
  })

  it('🔴 無法解析時一律 null，絕不退回 0', () => {
    for (const bad of ['abc', '12.34.56', '#REF!', '#VALUE!', '一千二', '1e5x', '--5']) {
      expect(parseSheetAmount(bad)).toBeNull()
    }
  })
})

describe('parseSheetDate', () => {
  it('ISO 格式原樣通過', () => {
    expect(parseSheetDate('2026-08-23')).toBe('2026-08-23')
    expect(parseSheetDate('  2026-08-23  ')).toBe('2026-08-23')
  })

  it('🔴 地區化顯示字串——FORMATTED_VALUE 讀日期型儲存格會拿到這種', () => {
    expect(parseSheetDate('2026/8/23')).toBe('2026-08-23')
    expect(parseSheetDate('2026/08/23')).toBe('2026-08-23')
    expect(parseSheetDate('2026.8.23')).toBe('2026-08-23')
    expect(parseSheetDate('2026年8月23日')).toBe('2026-08-23')
  })

  it('🔴 日期序列號——UNFORMATTED_VALUE 讀日期型儲存格會拿到這種數字', () => {
    expect(parseSheetDate(44927)).toBe('2023-01-01')  // 業界公認錨點
    expect(parseSheetDate(46257)).toBe('2026-08-23')
    expect(parseSheetDate(46257.75)).toBe('2026-08-23') // 帶時間的序列號取整數日
  })

  it('超出合理範圍的序列號視為不是日期', () => {
    expect(parseSheetDate(0)).toBeNull()
    expect(parseSheetDate(-1)).toBeNull()
    expect(parseSheetDate(99999999)).toBeNull()
    expect(parseSheetDate(NaN)).toBeNull()
  })

  it('🔴 月日順序不明確的格式一律拒絕，不猜', () => {
    expect(parseSheetDate('8/23/2026')).toBeNull()   // 美式
    expect(parseSheetDate('23/08/2026')).toBeNull()  // 歐式
    expect(parseSheetDate('08-23-26')).toBeNull()
  })

  it('不存在的日期回 null', () => {
    expect(parseSheetDate('2026-02-30')).toBeNull()
    expect(parseSheetDate('2026-13-01')).toBeNull()
    expect(parseSheetDate('2026-00-10')).toBeNull()
    expect(parseSheetDate('2025-02-29')).toBeNull() // 非閏年
  })

  it('閏日正確通過', () => {
    expect(parseSheetDate('2024-02-29')).toBe('2024-02-29')
  })

  it('空值與非字串型別回 null', () => {
    expect(parseSheetDate('')).toBeNull()
    expect(parseSheetDate('   ')).toBeNull()
    expect(parseSheetDate(null)).toBeNull()
    expect(parseSheetDate(undefined)).toBeNull()
    expect(parseSheetDate(true)).toBeNull()
    expect(parseSheetDate('hello')).toBeNull()
  })
})

describe('txToRow → parse 往返', () => {
  it('寫出去的日期與金額都能原值解析回來', () => {
    const row = txToRow(tx({ date: '2026-08-23', amount: 1234.5 }), catById)
    const header = [...TX_MONTH_HEADERS]
    expect(parseSheetDate(row[header.indexOf('日期')])).toBe('2026-08-23')
    expect(parseSheetAmount(row[header.indexOf('金額')])).toBe(1234.5)
  })
})
