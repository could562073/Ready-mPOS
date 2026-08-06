import { describe, it, expect } from 'vitest'
import {
  addSub, renameSub, deleteSub, setDefaultSub, serializeSubs, parseSubs,
  restoreSub, liveSubs, deleteCategory, restoreCategory,
} from './categories'
import type { Category } from '../types'

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
