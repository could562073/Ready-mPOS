import { describe, it, expect } from 'vitest'
import {
  addSub, renameSub, deleteSub, setDefaultSub, serializeSubs, parseSubs,
  restoreSub, liveSubs, deleteCategory, restoreCategory,
  recoverOrphanCategories, ORPHAN_CATEGORY_NAME,
  CONFIG_HEADERS, categoriesToConfigRows, configRowsToCategories, parseSheetBool,
} from './categories'
import type { Category } from '../types'
import type { CategoryHint } from './txSheets'

const base: Category = { id: 'misc', name: '雜項', icon: 'tag', color: 'coral', enabled: true, type: 'expense' }

describe('二級分類 CRUD（純函式）', () => {
  it('addSub 以注入的 makeId 附加一個 {id,name}，且不 mutate 原物件', () => {
    let n = 0
    const next = addSub(base, '瓦斯費', () => `sub${++n}`)
    expect(next.subs).toEqual([{ id: 'sub1', name: '瓦斯費' }])
    expect(base.subs).toBeUndefined() // 原物件未被更動
  })

  it('addSub 會 trim 名稱空白', () => {
    const next = addSub(base, '  水費 ', () => 's1')
    expect(next.subs).toEqual([{ id: 's1', name: '水費' }])
  })

  it('renameSub 只改指定 id 的名稱', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }] }
    expect(renameSub(c, 's2', '水費').subs).toEqual([{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水費' }])
  })

  // 🔴 2.3.0 起 deleteSub 為軟刪除：墓碑必須留在 subs 裡，
  // 否則歷史交易的 subId 找不到名稱，月結二級細目會整段消失（= 舊資料被抹掉）
  it('deleteSub 標記 deleted 而非移除；若為預設則清除 defaultSubId', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }], defaultSubId: 's1' }
    const next = deleteSub(c, 's1')
    expect(next.subs).toEqual([{ id: 's1', name: '瓦斯', deleted: true }, { id: 's2', name: '水電' }])
    expect(next.defaultSubId).toBeNull()
  })

  it('deleteSub 刪非預設二級時保留 defaultSubId', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }], defaultSubId: 's1' }
    expect(deleteSub(c, 's2').defaultSubId).toBe('s1')
  })

  it('restoreSub 還原誤刪的二級', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯', deleted: true }] }
    expect(restoreSub(c, 's1').subs).toEqual([{ id: 's1', name: '瓦斯', deleted: false }])
  })

  it('liveSubs 只回未刪除的二級（記帳選單用）', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯', deleted: true }, { id: 's2', name: '水電' }] }
    expect(liveSubs(c)).toEqual([{ id: 's2', name: '水電' }])
    expect(liveSubs(undefined)).toEqual([])
  })

  it('deleteCategory 標記 deleted 而非移除（金額不從月結消失）', () => {
    const cats: Category[] = [{ ...base, id: 'c1' }, { ...base, id: 'c2' }]
    const next = deleteCategory(cats, 'c1')
    expect(next).toHaveLength(2)
    expect(next[0].deleted).toBe(true)
    expect(next[1].deleted).toBeUndefined()
    expect(restoreCategory(next, 'c1')[0].deleted).toBe(false)
  })

  it('setDefaultSub 設定與清除（null = 無）', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }] }
    expect(setDefaultSub(c, 's1').defaultSubId).toBe('s1')
    expect(setDefaultSub(c, null).defaultSubId).toBeNull()
  })
})

describe('二級序列化 round-trip（_config 儲存）', () => {
  it('serializeSubs 以 id:encodeURIComponent(name)、| 分隔', () => {
    expect(serializeSubs([{ id: 's1', name: '瓦斯費' }, { id: 's2', name: '水費' }]))
      .toBe(`s1:${encodeURIComponent('瓦斯費')}|s2:${encodeURIComponent('水費')}`)
  })
  it('空清單序列化為空字串', () => {
    expect(serializeSubs([])).toBe('')
  })
  it('parseSubs 還原 id 與 name', () => {
    const raw = `s1:${encodeURIComponent('瓦斯費')}|s2:${encodeURIComponent('水費')}`
    expect(parseSubs(raw)).toEqual([{ id: 's1', name: '瓦斯費' }, { id: 's2', name: '水費' }])
  })
  it('空字串 parse 為空陣列', () => {
    expect(parseSubs('')).toEqual([])
  })
  // 軟刪除旗標要能跨裝置同步（2.3.0）：否則另一台裝置 pull 回來會看到已刪的二級復活
  it('round-trip 保住 deleted 旗標（附加第三段 :1）', () => {
    const subs = [{ id: 's1', name: '瓦斯費', deleted: true }, { id: 's2', name: '水費' }]
    const raw = serializeSubs(subs)
    expect(raw).toBe(`s1:${encodeURIComponent('瓦斯費')}:1|s2:${encodeURIComponent('水費')}`)
    expect(parseSubs(raw)).toEqual(subs)
  })
  it('舊格式（無第三段）一律視為未刪除', () => {
    expect(parseSubs(`s1:${encodeURIComponent('瓦斯費')}`)).toEqual([{ id: 's1', name: '瓦斯費' }])
  })
  it('deleted 為 false 時不寫旗標（序列化保持精簡）', () => {
    expect(serializeSubs([{ id: 's1', name: 'x', deleted: false }])).toBe('s1:x')
  })
  it('round-trip 保住含分隔字元的名稱', () => {
    const subs = [{ id: 's1', name: '瓦斯:費|特殊' }]
    expect(parseSubs(serializeSubs(subs))).toEqual(subs)
  })
})

// 孤兒回收：救回 2.3.0 之前被硬刪、導致歷史金額從月結消失的分類
describe('recoverOrphanCategories', () => {
  const cat = (over: Partial<Category>): Category => ({
    id: 'c1', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense', ...over,
  })
  const hint = (over: Partial<CategoryHint>): CategoryHint =>
    ({ kind: 'primary', id: 'x', name: 'X', type: 'expense', ...over })

  it('全部類別都在 → 回 null（呼叫端可跳過寫入與推送）', () => {
    expect(recoverOrphanCategories([cat({})], [hint({ id: 'c1', name: '雜支' })])).toBeNull()
  })

  it('補回缺席的一級類別，標為 deleted 墓碑且不啟用', () => {
    const out = recoverOrphanCategories([cat({})], [hint({ id: 'gone', name: '舊食材', type: 'expense' })])!
    expect(out).toHaveLength(2)
    const rec = out.find(c => c.id === 'gone')!
    expect(rec.name).toBe('舊食材')
    expect(rec.type).toBe('expense')
    expect(rec.deleted).toBe(true)
    expect(rec.enabled).toBe(false)
  })

  it('補回缺席的二級，掛在既有一級底下且不動其他欄位', () => {
    const base = cat({ subs: [{ id: 's1', name: '水費' }], defaultSubId: 's1' })
    const out = recoverOrphanCategories([base], [hint({ kind: 'sub', id: 's9', name: '瓦斯費', parentId: 'c1' })])!
    expect(out[0].subs).toEqual([{ id: 's1', name: '水費' }, { id: 's9', name: '瓦斯費', deleted: true }])
    expect(out[0].defaultSubId).toBe('s1')
  })

  it('一級與其二級同時缺席 → 兩者都補回（二級掛在剛補的一級底下）', () => {
    const out = recoverOrphanCategories([], [
      hint({ id: 'p1', name: '舊類', type: 'income' }),
      hint({ kind: 'sub', id: 's1', name: '舊二級', type: 'income', parentId: 'p1' }),
    ])!
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('p1')
    expect(out[0].subs).toEqual([{ id: 's1', name: '舊二級', deleted: true }])
  })

  it('二級找不到所屬一級 → 跳過，不產生無主二級', () => {
    expect(recoverOrphanCategories([cat({})], [hint({ kind: 'sub', id: 's9', name: 'x', parentId: 'nope' })])).toBeNull()
  })

  it('同一 id 出現多次（多列引用）只補一次', () => {
    const h = hint({ id: 'gone', name: '舊食材' })
    const out = recoverOrphanCategories([], [h, h, h])!
    expect(out).toHaveLength(1)
  })

  it('名稱欄空白 → 用佔位名，至少讓金額回到月結', () => {
    const out = recoverOrphanCategories([], [hint({ id: 'gone', name: '' })])!
    expect(out[0].name).toBe(ORPHAN_CATEGORY_NAME)
  })

  it('id 空字串 → 忽略（不是有效引用）', () => {
    expect(recoverOrphanCategories([], [hint({ id: '' })])).toBeNull()
  })

  it('不 mutate 傳入的陣列與物件', () => {
    const base = cat({ subs: [{ id: 's1', name: '水費' }] })
    const input = [base]
    recoverOrphanCategories(input, [hint({ kind: 'sub', id: 's9', name: 'x', parentId: 'c1' })])
    expect(input).toHaveLength(1)
    expect(base.subs).toEqual([{ id: 's1', name: '水費' }])
  })
})

// ─────────────────────────────────────────────────────────────
// _config 分頁列 ⇄ Category[]（2.4.1）
//
// 🔴 這組測試就是為了鎖死正式站踩到的 bug：類別「停用」與「刪除」推上雲後，
//    下一次 pull 會把兩個旗標翻回預設值，客戶端看起來像「操作沒有生效」。
//    成因是 Sheets 以 USER_ENTERED 寫入時把 'true'/'false' 轉成布林儲存格，
//    讀回來（FORMATTED_VALUE）變成大寫 'TRUE'/'FALSE'，而解析器只比對小寫。
// ─────────────────────────────────────────────────────────────
describe('_config 列 ⇄ Category[]（純函式）', () => {
  const H = [...CONFIG_HEADERS]

  // 一列完整的 _config 資料（依 CONFIG_HEADERS 欄序）
  const row = (over: Partial<Record<string, unknown>> = {}): unknown[] => {
    const base: Record<string, unknown> = {
      id: 'food', name: '食材採購', icon: 'package', color: 'peach',
      fee: 0, enabled: 'true', type: 'expense', subs: '', defaultSub: '', deleted: 'false',
    }
    return H.map(h => (h in over ? over[h] : base[h]))
  }

  it('🔴 Sheets 轉型後的大寫 FALSE → 停用（修正前會被判成啟用）', () => {
    const [cat] = configRowsToCategories([H, row({ enabled: 'FALSE' })])
    expect(cat.enabled).toBe(false)
  })

  it('🔴 Sheets 轉型後的大寫 TRUE → 已刪除墓碑（修正前墓碑會被抹掉、類別復活）', () => {
    const [cat] = configRowsToCategories([H, row({ deleted: 'TRUE' })])
    expect(cat.deleted).toBe(true)
  })

  it('以 UNFORMATTED_VALUE 讀到的真布林同樣認得', () => {
    const [cat] = configRowsToCategories([H, row({ enabled: false, deleted: true })])
    expect(cat.enabled).toBe(false)
    expect(cat.deleted).toBe(true)
  })

  it('RAW 寫入的小寫字串仍正常解析（本次修正後的正常路徑）', () => {
    const [cat] = configRowsToCategories([H, row({ enabled: 'false', deleted: 'true' })])
    expect(cat.enabled).toBe(false)
    expect(cat.deleted).toBe(true)
  })

  it('舊表沒有 deleted 欄（9 欄）→ 視為未刪除，向後相容', () => {
    const oldH = H.slice(0, 9)
    const oldRow = row().slice(0, 9)
    const [cat] = configRowsToCategories([oldH, oldRow])
    expect(cat.deleted).toBe(false)
    expect(cat.enabled).toBe(true)
  })

  it('enabled 欄空白或缺漏 → 視為啟用（不因欄位遺失讓類別整批消失）', () => {
    expect(configRowsToCategories([H, row({ enabled: '' })])[0].enabled).toBe(true)
    const noEnabled = H.filter(h => h !== 'enabled')
    const r = noEnabled.map(h => (h === 'id' ? 'food' : h === 'type' ? 'expense' : ''))
    expect(configRowsToCategories([noEnabled, r])[0].enabled).toBe(true)
  })

  it('欄序變動仍以表頭名稱定位', () => {
    const shuffled = ['deleted', 'id', 'enabled', 'name', 'type']
    const [cat] = configRowsToCategories([shuffled, ['TRUE', 'food', 'FALSE', '食材採購', 'expense']])
    expect(cat).toMatchObject({ id: 'food', name: '食材採購', enabled: false, deleted: true, type: 'expense' })
  })

  it('id 空白的列略過（表尾殘留空列不該變成類別）', () => {
    expect(configRowsToCategories([H, row({ id: '' }), row()])).toHaveLength(1)
  })

  it('只有表頭或空陣列 → 回空陣列', () => {
    expect(configRowsToCategories([H])).toEqual([])
    expect(configRowsToCategories([])).toEqual([])
  })

  it('往返：停用 + 已刪除 + 二級 + 預設二級都能原樣還原', () => {
    const cats: Category[] = [
      { id: 'cash', name: '現金', icon: 'cash', color: 'mint', fee: 0.3, enabled: false, type: 'income',
        subs: [{ id: 's1', name: '外帶' }, { id: 's2', name: '內用', deleted: true }], defaultSubId: 's1' },
      { id: 'wage', name: '員工薪資', icon: 'users', color: 'lavender', enabled: true, type: 'expense', deleted: true },
    ]
    const back = configRowsToCategories(categoriesToConfigRows(cats))
    expect(back[0]).toMatchObject({
      id: 'cash', name: '現金', fee: 0.3, enabled: false, type: 'income', defaultSubId: 's1', deleted: false,
    })
    expect(back[0].subs).toEqual([{ id: 's1', name: '外帶' }, { id: 's2', name: '內用', deleted: true }])
    expect(back[1]).toMatchObject({ id: 'wage', enabled: true, deleted: true, defaultSubId: null })
  })

  it('categoriesToConfigRows 第一列是表頭，且布林欄寫成小寫字串', () => {
    const rows = categoriesToConfigRows([{ ...base, enabled: false, deleted: true }])
    expect(rows[0]).toEqual(H)
    expect(rows[1][H.indexOf('enabled')]).toBe('false')
    expect(rows[1][H.indexOf('deleted')]).toBe('true')
  })

  it('parseSheetBool：認得大小寫與真布林，其餘一律回 fallback', () => {
    expect(parseSheetBool('TRUE', false)).toBe(true)
    expect(parseSheetBool(' false ', true)).toBe(false)
    expect(parseSheetBool(true, false)).toBe(true)
    expect(parseSheetBool('', true)).toBe(true)
    expect(parseSheetBool(undefined, false)).toBe(false)
    expect(parseSheetBool('是', true)).toBe(true)
  })
})
