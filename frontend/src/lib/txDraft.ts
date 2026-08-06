import type { Category } from '../types'

// 記帳選定一級類別時，計算應自動帶入的二級 id。
// 帶入 defaultSubId，但必須驗證它仍存在於該類別的 subs（防 dangling，Phase 3 Minor #3）；否則視為「無」。
// 2.3.0：二級改軟刪除後，墓碑仍留在 subs 裡，故這裡要額外排除 deleted——
// 否則刪掉的二級會被自動帶進新交易（舊資料保留是對的，繼續拿來記新帳則不對）。
export function resolveDefaultSub(cat: Category | undefined): string | null {
  if (!cat || !cat.subs || cat.subs.length === 0) return null
  const def = cat.defaultSubId ?? null
  return def && cat.subs.some(s => s.id === def && !s.deleted) ? def : null
}

// 選定一級時計算應帶入的二級：
// 1. remembered===null（上次選「無」）→ 尊重回 null。
// 2. remembered 為仍存在於 subs 的有效 id → 回它（「上次在這個一級用的二級」）。
// 3. 否則（無記憶 undefined / 記憶的二級已被刪）→ 退回 resolveDefaultSub（既有 defaultSubId）。
// 「已被刪」現在包含軟刪除的墓碑（2.3.0）：記憶指向已刪二級時不帶入，往下退回預設。
export function pickInitialSub(
  cat: Category | undefined,
  remembered: string | null | undefined,
): string | null {
  if (remembered === null) return null
  if (remembered !== undefined && cat?.subs?.some(s => s.id === remembered && !s.deleted)) return remembered
  return resolveDefaultSub(cat)
}
