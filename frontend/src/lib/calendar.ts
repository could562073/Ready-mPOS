import type { Transaction } from '../types'

// 本地時區日期字串（比照 App/LedgerPage，避免 UTC 位移跨日）
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 'YYYY-MM' → 週列陣列，每列 7 格；格為當月某日 'YYYY-MM-DD' 或 null（前後補白）。
// 週日為每週第一天（getDay() 0=日）。
export function buildMonthMatrix(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const startPad = first.getDay()               // 該月 1 號是星期幾（0=日）
  const daysInMonth = new Date(y, m, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)          // 月初補白
  for (let d = 1; d <= daysInMonth; d++) cells.push(toLocalDateString(new Date(y, m - 1, d)))
  while (cells.length % 7 !== 0) cells.push(null)              // 月末補白到整週

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// 每日淨額：Σ收入 − Σ支出（金額皆正、方向由 type 決定）。不扣手續費（Phase 7 再算）。
export function monthDayNets(txs: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const t of txs) {
    const delta = t.type === 'income' ? t.amount : -t.amount
    map[t.date] = (map[t.date] ?? 0) + delta
  }
  return map
}

// 月份字串位移 delta 個月，跨年自動進退位
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, m - 1 + delta, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
