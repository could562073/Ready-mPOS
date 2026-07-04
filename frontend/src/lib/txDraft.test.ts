import { describe, it, expect } from 'vitest'
import { resolveDefaultSub } from './txDraft'
import type { Category } from '../types'

const mk = (over: Partial<Category>): Category => ({
  id: 'misc', name: '雜支', icon: 'tag', color: 'coral', enabled: true, type: 'expense', ...over,
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
