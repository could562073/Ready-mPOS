// 公休日兩層規則（月結「未記帳日」檢查用）：
//   weekly = 固定每週公休（0=週日…6=週六，設定頁勾選，永久排除）
//   dates  = 臨時逐日標記（連假/臨時事件，月結漏記卡上點「標為公休」）
// 儲存於 localStorage、本機不跨裝置同步——月結核對通常在單一主力機進行（見設計 spec）。
const LS_WEEKLY = 'mpos_weekly_closed'
const LS_DATES = 'mpos_closed_days'

// 讀 localStorage，JSON parse 失敗時回退默認值
function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '')
    // 非陣列一律回退，防止毀損資料（如合法 JSON 但形狀錯誤：'{}'、'5'）拖垮月結頁
    if (!Array.isArray(parsed)) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

export function getWeeklyClosed(): number[] {
  return readJson<number[]>(LS_WEEKLY, [])
}

export function setWeeklyClosed(days: number[]): void {
  localStorage.setItem(LS_WEEKLY, JSON.stringify([...new Set(days)].sort((a, b) => a - b)))
}

export function getClosedDates(): string[] {
  return readJson<string[]>(LS_DATES, [])
}

export function markClosed(date: string): void {
  const next = new Set(getClosedDates())
  next.add(date)
  localStorage.setItem(LS_DATES, JSON.stringify([...next].sort()))
}

export function unmarkClosed(date: string): void {
  localStorage.setItem(LS_DATES, JSON.stringify(getClosedDates().filter(d => d !== date)))
}
