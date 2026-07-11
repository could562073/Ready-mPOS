import { describe, it, expect, beforeEach } from 'vitest'
import { getLastSub, rememberLastSub } from './subMemory'

// node 環境無 localStorage → 裝一個 Map-backed stub（jsdom 環境也相容）
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

describe('subMemory', () => {
  it('無記憶時回 undefined', () => {
    expect(getLastSub('cat1')).toBeUndefined()
  })
  it('記住 subId 後可讀回', () => {
    rememberLastSub('cat1', 'sub9')
    expect(getLastSub('cat1')).toBe('sub9')
  })
  it('記住 null（上次選「無」）與 undefined（無記憶）可區分', () => {
    rememberLastSub('cat1', null)
    expect(getLastSub('cat1')).toBeNull()
    expect(getLastSub('other')).toBeUndefined()
  })
})
