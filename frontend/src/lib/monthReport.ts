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
  // 先按交易類別過濾
  const filtered = txs.filter(t => t.type === type)

  // 建立 Category 索引與 Sub 索引
  const catById = new Map(categories.map(c => [c.id, c]))

  // 依 categoryId group by，並依 subId 再細分
  // { categoryId -> { subId -> amount } }
  const catSubAmounts: Record<string, Record<string, number>> = {}

  for (const tx of filtered) {
    if (!catSubAmounts[tx.categoryId]) {
      catSubAmounts[tx.categoryId] = {}
    }

    // 決定 subId：若 subId 無效（不在該類別 subs 裡），視為 null
    const category = catById.get(tx.categoryId)
    let resolvedSubId: string | null = null

    if (tx.subId && category?.subs) {
      const subExists = category.subs.some(s => s.id === tx.subId)
      if (subExists) {
        resolvedSubId = tx.subId
      }
    }

    // 用 null 代表「無二級」或「失效 subId」
    const key = resolvedSubId ?? 'null'
    catSubAmounts[tx.categoryId][key] = (catSubAmounts[tx.categoryId][key] ?? 0) + tx.amount
  }

  // 轉換為 CatSubBreakdown[]，並依 total 降冪排序
  const results: CatSubBreakdown[] = []

  for (const [categoryId, subMap] of Object.entries(catSubAmounts)) {
    const subs: { label: string; amount: number }[] = []
    let unclassifiedAmount = 0

    const category = catById.get(categoryId)

    for (const [subIdKey, amount] of Object.entries(subMap)) {
      if (subIdKey === 'null') {
        // 無二級或失效 subId → 併入「（未分類）」
        unclassifiedAmount += amount
      } else {
        // 查詢二級名稱
        const subName = category?.subs?.find(s => s.id === subIdKey)?.name ?? subIdKey
        subs.push({ label: subName, amount })
      }
    }

    // 「（未分類）」放在最後
    if (unclassifiedAmount > 0) {
      subs.push({ label: '（未分類）', amount: unclassifiedAmount })
    } else if (subs.length === 0) {
      // 沒有任何二級細目時，創建「（未分類）」項（金額為 0）
      subs.push({ label: '（未分類）', amount: 0 })
    }

    // 降冪排序（「（未分類）」除外，固定在最後）
    const classified = subs.slice(0, -1).sort((a, b) => b.amount - a.amount)
    const unclassified = subs[subs.length - 1]

    results.push({
      categoryId,
      total: Object.values(subMap).reduce((a, b) => a + b, 0),
      subs: unclassified ? [...classified, unclassified] : classified,
    })
  }

  // 依 total 降冪排序
  results.sort((a, b) => b.total - a.total)

  return results
}
