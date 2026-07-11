// frontend/src/lib/txSheets.ts
import type { Transaction, Category } from '../types'
import type { TxSeed } from './migrate'   // TxSeed 已由 Phase 1 migrate.ts 定義，勿重複宣告

export type { TxSeed }   // re-export 供 Task 3/4（sheets.ts / useSyncService）使用

// 新月份分頁固定表頭（一列一筆交易，不隨類別增減變動）。
// 一級ID/二級ID（2.0.1 新增）為機器用關聯鍵——名稱欄僅供人閱讀，
// 解析一律優先用 ID 欄，類別改名後既有列才不會對不回來（v2.0.0 曾因只存名稱而在改名後全變未知類別）。
export const TX_MONTH_HEADERS = ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id', '一級ID', '二級ID'] as const

// 以表頭判斷是否為新逐筆格式：含「收支」與「id」兩欄即視為新格式，否則為舊彙總格式
export function isNewTxFormat(header: string[]): boolean {
  return header.includes('收支') && header.includes('id')
}

// 單筆交易 → Sheets 列（依 TX_MONTH_HEADERS 欄序）
// 一級/二級以名稱輸出（人類可讀）；找不到類別時保留原始 categoryId 字串，避免丟資料。
// 一級ID 只在 categoryId 可解析為現有類別時寫入——未解析字串（已刪類別的殘留 id、
// 或改名事故留下的舊名稱字串）留白，名稱欄保留原字串，之後類別名恢復時仍可靠名稱重新連回。
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
    cat ? tx.categoryId : '',
    tx.subId ?? '',
  ]
}

// Sheets 列 → 交易 seed。解析優先序：一級ID/二級ID 欄（改名不受影響）→ 名稱對照
// （2.0.0 的 7 欄舊列、或使用者手動在試算表只填名稱的列）→ 都對不到則保留原始字串（不丟資料）。
// 缺 id 或缺日期視為無效列，回 null 讓呼叫端略過
export function rowToTx(
  row: string[], header: string[],
  catByName: Map<string, Category>, catById: Map<string, Category>, now: string,
): TxSeed | null {
  const g = (col: string) => row[header.indexOf(col)]
  const date = (g('日期') ?? '').trim()
  const id   = (g('id') ?? '').trim()
  if (!date || !id) return null

  const type: 'income' | 'expense' = g('收支') === '支出' ? 'expense' : 'income'
  const primaryName = (g('一級類別') ?? '').trim()
  const catIdVal = (g('一級ID') ?? '').trim()
  // 一級ID 有值但指向已刪類別時，cat 退回名稱對照（供二級名稱解析用），categoryId 仍保留該 id
  const cat = (catIdVal ? catById.get(catIdVal) : undefined) ?? catByName.get(primaryName)
  const categoryId = catIdVal || (cat?.id ?? primaryName)
  const subName = (g('二級類別') ?? '').trim()
  const subIdVal = (g('二級ID') ?? '').trim()
  const subId = subIdVal || (subName && cat ? (cat.subs?.find(s => s.name === subName)?.id ?? null) : null)
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
