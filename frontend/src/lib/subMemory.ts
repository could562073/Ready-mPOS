// 記「每個一級各自上次用的二級」：{ [categoryId]: subId | null }，null 代表上次選「無」。
// 存 localStorage，跨 App 重開仍記得；供記帳選定一級時帶入二級預設。
const LS_KEY = 'mpos_last_sub'

type LastSubMap = Record<string, string | null>

function read(): LastSubMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as LastSubMap
  } catch {
    return {}
  }
}

// 回傳該一級上次用的 subId；null=上次選「無」；undefined=從未記過
export function getLastSub(categoryId: string): string | null | undefined {
  const map = read()
  return Object.prototype.hasOwnProperty.call(map, categoryId) ? map[categoryId] : undefined
}

export function rememberLastSub(categoryId: string, subId: string | null): void {
  const map = read()
  map[categoryId] = subId
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {}
}
