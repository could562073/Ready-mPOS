// localStorage key
const LS_WEEKLY = 'mpos_weekly_closed'
const LS_DATES = 'mpos_closed_dates'

// 讀 localStorage，JSON parse 失敗時回退默認值
function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
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
