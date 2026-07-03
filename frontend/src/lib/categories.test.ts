import { describe, it, expect } from 'vitest'
import { addSub, renameSub, deleteSub, setDefaultSub } from './categories'
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

  it('deleteSub 移除該二級；若為預設則清除 defaultSubId', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }], defaultSubId: 's1' }
    const next = deleteSub(c, 's1')
    expect(next.subs).toEqual([{ id: 's2', name: '水電' }])
    expect(next.defaultSubId).toBeNull()
  })

  it('deleteSub 刪非預設二級時保留 defaultSubId', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }], defaultSubId: 's1' }
    expect(deleteSub(c, 's2').defaultSubId).toBe('s1')
  })

  it('setDefaultSub 設定與清除（null = 無）', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }] }
    expect(setDefaultSub(c, 's1').defaultSubId).toBe('s1')
    expect(setDefaultSub(c, null).defaultSubId).toBeNull()
  })
})
