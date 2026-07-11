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

// Sheets 列 → 交易 seed；名稱對回 Category id，找不到則保留原始名稱字串（未知類別，不丟資料）
// 缺 id 或缺日期視為無效列，回 null 讓呼叫端略過
export function rowToTx(
  row: string[], header: string[], catByName: Map<string, Category>, now: string,
): TxSeed | null {
  const g = (col: string) => row[header.indexOf(col)]
  const date = (g('日期') ?? '').trim()
  const id   = (g('id') ?? '').trim()
  if (!date || !id) return null

  const type: 'income' | 'expense' = g('收支') === '支出' ? 'expense' : 'income'
  const primaryName = (g('一級類別') ?? '').trim()
  const cat = catByName.get(primaryName)
  const categoryId = cat?.id ?? primaryName            // 未知一級 → 保留原名
  const subName = (g('二級類別') ?? '').trim()
  const subId = subName && cat ? (cat.subs?.find(s => s.name === subName)?.id ?? null) : null
  const note = (g('備註') ?? '').trim()

  return {
    id, date, type, categoryId, subId,
    amount: Number(g('金額')) || 0,
    note: note || undefined,
    syncStatus: 'SYNCED',
    createdAt: now,
    updatedAt: now,
  }
}

export interface TxMergePlan {
  toAdd: TxSeed[]
  toUpdate: { localId: number; seed: TxSeed }[]
}

// 以 Transaction.id 去重對帳：雲端無對應 → 新增；本機 SYNCED 同 id → 以雲端覆蓋；本機 PENDING 同 id → 保留本機修改
export function mergeTransactionsById(local: Transaction[], remote: TxSeed[]): TxMergePlan {
  const byId = new Map(local.map(t => [t.id, t]))
  const toAdd: TxSeed[] = []
  const toUpdate: { localId: number; seed: TxSeed }[] = []
  for (const r of remote) {
    const l = byId.get(r.id)
    if (!l) toAdd.push(r)
    else if (l.syncStatus === 'SYNCED' && l.localId !== undefined) toUpdate.push({ localId: l.localId, seed: r })
  }
  return { toAdd, toUpdate }
}
