import type { Transaction, DailyRecord } from '../types'

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
