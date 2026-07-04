// frontend/src/lib/txSheets.ts
import type { Transaction, Category } from '../types'
import type { TxSeed } from './migrate'   // TxSeed 已由 Phase 1 migrate.ts 定義，勿重複宣告

export type { TxSeed }   // re-export 供 Task 3/4（sheets.ts / useSyncService）使用

// 新月份分頁固定表頭（一列一筆交易，不隨類別增減變動）
export const TX_MONTH_HEADERS = ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id'] as const

// 以表頭判斷是否為新逐筆格式：含「收支」與「id」兩欄即視為新格式，否則為舊彙總格式
export function isNewTxFormat(header: string[]): boolean {
  return header.includes('收支') && header.includes('id')
}

// 單筆交易 → Sheets 列（依 TX_MONTH_HEADERS 欄序）
// 一級/二級以名稱輸出（人類可讀）；找不到類別時保留原始 categoryId 字串，避免丟資料
export function txToRow(tx: Transaction | TxSeed, catById: Map<string, Category>): (string | number)[] {
  const cat = catById.get(tx.categoryId)
  const primaryName = cat?.name ?? tx.categoryId
  const subName = tx.subId ? (cat?.subs?.find(s => s.id === tx.subId)?.name ?? '') : ''
  return [
    tx.date,
    tx.type === 'income' ? '收入' : '支出',
    primaryName,
    subName,
    tx.amount,
    tx.note ?? '',
    tx.id,
  ]
}
