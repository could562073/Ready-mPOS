import type { DailyRecord, Transaction } from '../types/index'

// TxSeed：拆解後準備寫入 Dexie 的交易資料，localId 由 DB 層（++localId）自動產生，故不包含在內
export type TxSeed = Omit<Transaction, 'localId'>

// 全形分隔符號，用於把「日備註」附加到當天第一筆交易的 note 後面
const DAY_NOTE_SEPARATOR = '｜'

// 決定性交易 ID：同一 (日期, 收支, 一級類別) 永遠導出同一 id。
// 目的：本機遷移 explode 與雲端對同批舊格式資料 re-explode 產生「相同 id」，
//      讓 mergeTransactionsById 能以 id 去重，避免 cutover 一次性重複與備份失敗路徑的無上限累積。
export function deterministicTxId(
  date: string, type: 'income' | 'expense', categoryId: string,
): string {
  return `mpos:${date}:${type}:${categoryId}`
}

/**
 * 將舊版 DailyRecord（收入/支出為 Record<類別id, 金額>）拆解成逐筆 Transaction。
 * 純函式，不 import Dexie / db，方便單元測試與未來重複使用（例如匯入舊資料）。
 *
 * 規則：
 * 1. incomes / expenses 中金額為 0 的 key 不產生交易。
 * 2. incomeNotes[key] / expenseNotes[key] 對應到該筆交易的 note。
 * 3. 日備註（r.notes）如果有值，且當天至少有一筆交易，附加到「第一筆」交易的 note
 *    （先跑完 incomes 再跑 expenses，所以第一筆優先是收入）。
 * 4. 如果當天沒有任何非零交易，日備註直接捨棄，不會為了塞備註而生出 amount=0 的交易。
 */
export function explodeDailyRecord(
  r: DailyRecord,
  makeId: (date: string, type: 'income' | 'expense', categoryId: string) => string = deterministicTxId,
  now: string = new Date().toISOString(),
): TxSeed[] {
  const result: TxSeed[] = []

  // 先跑收入，確保「當天第一筆交易」在有收入時優先是收入項目
  for (const [categoryId, amount] of Object.entries(r.incomes)) {
    if (!amount) continue // 金額 0（或 falsy）不產生交易
    result.push({
      id: makeId(r.date, 'income', categoryId),
      date: r.date,
      type: 'income',
      categoryId,
      subId: null,
      amount,
      note: r.incomeNotes?.[categoryId],
      syncStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })
  }

  // 再跑支出
  for (const [categoryId, amount] of Object.entries(r.expenses)) {
    if (!amount) continue
    result.push({
      id: makeId(r.date, 'expense', categoryId),
      date: r.date,
      type: 'expense',
      categoryId,
      subId: null,
      amount,
      note: r.expenseNotes?.[categoryId],
      syncStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })
  }

  // 日備註：只有在當天真的有交易時才附加，否則直接捨棄（不生 amount=0 的交易）
  if (r.notes && result.length > 0) {
    const first = result[0]
    first.note = first.note ? `${first.note}${DAY_NOTE_SEPARATOR}${r.notes}` : r.notes
  }

  return result
}
