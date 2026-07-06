import type { Category } from '../types'

// 記帳選定一級類別時，計算應自動帶入的二級 id。
// 帶入 defaultSubId，但必須驗證它仍存在於該類別的 subs（防 dangling，Phase 3 Minor #3）；否則視為「無」。
export function resolveDefaultSub(cat: Category | undefined): string | null {
  if (!cat || !cat.subs || cat.subs.length === 0) return null
  const def = cat.defaultSubId ?? null
  return def && cat.subs.some(s => s.id === def) ? def : null
}

// 選定一級時計算應帶入的二級：
// 1. remembered===null（上次選「無」）→ 尊重回 null。
// 2. remembered 為仍存在於 subs 的有效 id → 回它（「上次在這個一級用的二級」）。
// 3. 否則（無記憶 undefined / 記憶的二級已被刪）→ 退回 resolveDefaultSub（既有 defaultSubId）。
export function pickInitialSub(
  cat: Category | undefined,
  remembered: string | null | undefined,
): string | null {
  if (remembered === null) return null
  if (remembered !== undefined && cat?.subs?.some(s => s.id === remembered)) return remembered
  return resolveDefaultSub(cat)
}
