import { db } from '../db'
import type { Transaction } from '../types'
import { newId } from './ids'

// 呼叫端提供的欄位：不含 localId（Dexie 主鍵）、id（本函式產生）、
// syncStatus（本函式管理）、createdAt/updatedAt（本函式蓋時間戳）
export type TxInput = Omit<Transaction, 'localId' | 'id' | 'syncStatus' | 'createdAt' | 'updatedAt'>

// 新增一筆交易 — 補上穩定同步 id、初始同步狀態、建立/更新時間戳
export async function addTransaction(input: TxInput): Promise<number> {
  const now = new Date().toISOString()
  return db.transactions.add({
    ...input,
    id: newId(),
    syncStatus: 'PENDING',
    createdAt: now,
    updatedAt: now,
  })
}

// 更新一筆交易（依 Dexie 主鍵 localId）— 任何欄位變動都標記為待同步、刷新 updatedAt
export async function updateTransaction(localId: number, patch: Partial<TxInput>): Promise<void> {
  const now = new Date().toISOString()
  await db.transactions.update(localId, {
    ...patch,
    syncStatus: 'PENDING',
    updatedAt: now,
  })
}

// 刪除一筆交易（依 Dexie 主鍵 localId）
export async function deleteTransaction(localId: number): Promise<void> {
  await db.transactions.delete(localId)
}
