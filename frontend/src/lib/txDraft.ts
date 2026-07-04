import type { Category } from '../types'

// 記帳選定一級類別時，計算應自動帶入的二級 id。
// 帶入 defaultSubId，但必須驗證它仍存在於該類別的 subs（防 dangling，Phase 3 Minor #3）；否則視為「無」。
export function resolveDefaultSub(cat: Category | undefined): string | null {
  if (!cat || !cat.subs || cat.subs.length === 0) return null
  const def = cat.defaultSubId ?? null
  return def && cat.subs.some(s => s.id === def) ? def : null
}
