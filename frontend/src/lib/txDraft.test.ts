import { describe, it, expect } from 'vitest'
import { resolveDefaultSub, pickInitialSub } from './txDraft'
import type { Category } from '../types'

const mk = (over: Partial<Category>): Category => ({
  id: 'misc', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense', ...over,
})

const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '雜項', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
  subs: [{ id: 's1', name: '瓦斯費' }, { id: 's2', name: '水費' }], defaultSubId: 's2', ...over,
})

describe('resolveDefaultSub — 記帳時帶入的預設二級', () => {
  it('無二級 → null', () => {
    expect(resolveDefaultSub(mk({ subs: [], defaultSubId: null }))).toBeNull()
  })
  it('有預設且存在於 subs → 回傳該 id', () => {
    expect(resolveDefaultSub(mk({ subs: [{ id: 's1', name: '瓦斯費' }], defaultSubId: 's1' }))).toBe('s1')
  })
  it('預設 id 已不在 subs（dangling）→ null（Phase 3 Minor #3）', () => {
    expect(resolveDefaultSub(mk({ subs: [{ id: 's2', name: '水費' }], defaultSubId: 's1' }))).toBeNull()
  })
  it('有 subs 但無預設 → null', () => {
    expect(resolveDefaultSub(mk({ subs: [{ id: 's1', name: '瓦斯費' }], defaultSubId: null }))).toBeNull()
  })
  it('cat 為 undefined → null', () => {
    expect(resolveDefaultSub(undefined)).toBeNull()
  })
})

describe('pickInitialSub', () => {
  it('記憶為有效 subId → 回該 id（優先於 defaultSubId）', () => {
    expect(pickInitialSub(cat({}), 's1')).toBe('s1')
  })
  it('記憶為 null（上次選「無」）→ 回 null，尊重之', () => {
    expect(pickInitialSub(cat({}), null)).toBeNull()
  })
  it('無記憶（undefined）→ 退回 defaultSubId', () => {
    expect(pickInitialSub(cat({}), undefined)).toBe('s2')
  })
  it('記憶的二級已被刪（dangling）→ 退回 defaultSubId', () => {
    expect(pickInitialSub(cat({}), 'gone')).toBe('s2')
  })
  it('無記憶且無有效 defaultSubId → 回 null', () => {
    expect(pickInitialSub(cat({ defaultSubId: null }), undefined)).toBeNull()
  })
  // 2.3.0 軟刪除：墓碑仍在 subs 裡，但不可被帶進新交易
  it('記憶指向已軟刪除的二級 → 不帶入，退回 defaultSubId', () => {
    const c = cat({ subs: [{ id: 's1', name: '瓦斯費', deleted: true }, { id: 's2', name: '水費' }] })
    expect(pickInitialSub(c, 's1')).toBe('s2')
  })
  it('defaultSubId 本身指向已軟刪除的二級 → 回 null', () => {
    const c = cat({ subs: [{ id: 's2', name: '水費', deleted: true }], defaultSubId: 's2' })
    expect(pickInitialSub(c, undefined)).toBeNull()
    expect(resolveDefaultSub(c)).toBeNull()
  })
})
