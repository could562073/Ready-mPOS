import type { Transaction, DailyRecord, Category } from '../types'

// 把逐筆交易依日期 group 成合成的 DailyRecord[]（incomes/expenses 為 categoryId→金額加總），
// 讓既有讀 DailyRecord 的 Dashboard/月結/圖表邏輯（dayIncome/dayExpense/calcFees）零改動重用。
// 未知一級（categoryId 為雲端保留的原始名稱）照樣累加；UI 以「已知類別 id」過濾，不污染加總。
export function buildDailyRecordsFromTx(txs: Transaction[]): DailyRecord[] {
  const byDate = new Map<string, DailyRecord>()
  for (const t of txs) {
    let rec = byDate.get(t.date)
    if (!rec) {
      rec = { date: t.date, incomes: {}, expenses: {}, syncStatus: 'SYNCED', createdAt: '', updatedAt: '' }
      byDate.set(t.date, rec)
    }
    const map = t.type === 'income' ? rec.incomes : rec.expenses
    map[t.categoryId] = (map[t.categoryId] ?? 0) + t.amount
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// 當日平台手續費合計：收入交易金額 × 所屬一級類別 fee（只計 fee>0 的收入類別）。
// 未知 categoryId 不計費；不過濾 enabled——停用類別的歷史交易照樣計費（錢已被平台抽走）。
export function dayFeesFromTx(txs: Transaction[], categories: Category[]): number {
  const feeById = new Map(
    categories.filter(c => c.type === 'income' && (c.fee ?? 0) > 0).map(c => [c.id, c.fee!]),
  )
  const total = txs.reduce(
    (s, t) => t.type === 'income' ? s + t.amount * (feeById.get(t.categoryId) ?? 0) : s, 0)
  return Math.max(0, total)  // 金額不變式為正數，此為防禦
}

// fee>0 類別收入佔當日總收入比例（0–1）：分母為全部收入交易（含未知 categoryId，
// 與 LedgerPage 小計一致）、分子只計已知 fee>0 類別；總收入為 0 回傳 0。
export function dayFeeRatio(txs: Transaction[], categories: Category[]): number {
  const feeIds = new Set(
    categories.filter(c => c.type === 'income' && (c.fee ?? 0) > 0).map(c => c.id),
  )
  let feeIncome = 0
  let totalIncome = 0
  for (const t of txs) {
    if (t.type !== 'income') continue
    totalIncome += t.amount
    if (feeIds.has(t.categoryId)) feeIncome += t.amount
  }
  return totalIncome > 0 ? feeIncome / totalIncome : 0
}
