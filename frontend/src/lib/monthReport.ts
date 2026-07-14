import { shiftMonth } from './calendar'
import type { Transaction, Category } from '../types'

// 指定月份的天數（考慮閏年）
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// 進行中月份（day ≤ today 日期）或歷史月份（整月）中，
// 應有記帳記錄但實際沒有的日期。
// 排除條件：已有交易紀錄、固定週公休、臨時公休
export function missingDays(
  month: string,
  txDates: Set<string>,
  weeklyClosed: number[],
  closedDates: Set<string>,
  today: string,
): string[] {
  const [toYear, toMonth, toDay] = today.split('-').map(Number)
  const [monthYear, monthNum] = month.split('-').map(Number)

  // 從 today 提取目前月份
  const currentMonth = `${toYear}-${String(toMonth).padStart(2, '0')}`

  // 決定檢查範圍
  let endDay: number
  if (month === currentMonth) {
    // 進行中月份：只檢查到今天
    endDay = toDay
  } else if (month > currentMonth) {
    // 未來月份：不檢查
    return []
  } else {
    // 歷史月份：檢查整月
    endDay = daysInMonth(month)
  }

  const missing: string[] = []

  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`

    // 已有交易 → 不計漏記
    if (txDates.has(dateStr)) continue

    // 檢查是否為固定週公休
    const date = new Date(monthYear, monthNum - 1, day)
    const weekday = date.getDay()
    if (weeklyClosed.includes(weekday)) continue

    // 檢查是否為臨時公休
    if (closedDates.has(dateStr)) continue

    missing.push(dateStr)
  }

  return missing
}

// 比較範圍設定：決定前期月份、比較模式（同期 vs 全月）、截至日
export interface ComparisonRange {
  prevMonth: string
  mode: 'same-period' | 'full'
  endDay: number
}

export function comparisonRange(month: string, today: string): ComparisonRange {
  const [toYear, toMonth, toDay] = today.split('-').map(Number)

  // 從 today 提取目前月份
  const currentMonth = `${toYear}-${String(toMonth).padStart(2, '0')}`

  const prevMonth = shiftMonth(month, -1)
  const prevMonthDays = daysInMonth(prevMonth)

  if (month === currentMonth) {
    // 進行中月份 → 上月同期（1 到同日），但不超過上月天數
    const endDay = Math.min(toDay, prevMonthDays)
    return { prevMonth, mode: 'same-period', endDay }
  } else {
    // 歷史月份 → 上月全月
    return { prevMonth, mode: 'full', endDay: prevMonthDays }
  }
}

// 限制交易至指定月份的 endDay（含）以前
export function limitToDay(txs: Transaction[], month: string, endDay: number): Transaction[] {
  const cutoffDate = `${month}-${String(endDay).padStart(2, '0')}`
  return txs.filter(t => t.date <= cutoffDate)
}

// 月份差異
export interface Delta {
  diff: number
  pct: number | null
}

export function delta(cur: number, prev: number): Delta {
  const diff = cur - prev
  // 上月為 0 時 pct 為 null（避免除以零，且無意義）
  const pct = prev === 0 ? null : Math.round((diff / prev) * 100)
  return { diff, pct }
}

// 依類別與二級彙總交易金額
export interface CatSubBreakdown {
  categoryId: string
  total: number
  // { label, amount } 降冪排序；無二級與失效 subId 合併為「（未分類）」
  subs: { label: string; amount: number }[]
}

export function sumByCategoryAndSub(
  txs: Transaction[],
  categories: Category[],
  type: 'income' | 'expense',
): CatSubBreakdown[] {
  // 建立 Category 索引
  const catById = new Map(categories.map(c => [c.id, c]))

  // 累積至 Map<categoryId, Map<subLabel, amount>>
  // 無 subId 或 dangling subId 的 label 一律歸「（未分類）」
  const acc = new Map<string, Map<string, number>>() // categoryId → subLabel → amount
  for (const t of txs) {
    if (t.type !== type) continue
    const cat = catById.get(t.categoryId)
    // 找不到二級名稱（無 subId 或 dangling）一律歸（未分類），不丟資料
    const label = (t.subId ? cat?.subs?.find(s => s.id === t.subId)?.name : undefined) ?? '（未分類）'
    const bySub = acc.get(t.categoryId) ?? new Map<string, number>()
    bySub.set(label, (bySub.get(label) ?? 0) + t.amount)
    acc.set(t.categoryId, bySub)
  }

  // 轉換為 CatSubBreakdown[]，subs 依金額降冪、categories 依 total 降冪
  return [...acc.entries()]
    .map(([categoryId, bySub]) => ({
      categoryId,
      total: [...bySub.values()].reduce((s, v) => s + v, 0),
      subs: [...bySub.entries()]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.total - a.total)
}
