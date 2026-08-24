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

// ── Sheets 儲存格值解析（純函式，2.4.2）──────────────────────────────
// 🔴 為什麼需要這兩個函式：sheets.ts 的所有讀取都沒有指定 valueRenderOption，
// 也就是一律吃 Sheets 預設的 FORMATTED_VALUE——拿到的是「畫面上顯示的字串」而非儲存格真值。
// 今天沒出事，只是因為寫入的是無格式整數；但只要使用者在試算表上對「金額」欄
// 套用一次貨幣或千分位格式，讀回來就變成 "1,234"，而現行 rowToTx 的
// `Number(...) || 0` 會把它吞成 0，接著被整月 clear+覆蓋寫回雲端——
// 本機與雲端同時歸零，且全程沒有任何錯誤訊息。
// 這與 2.4.1 的 _config 布林欄事故是同一個根因：把顯示層字串當成資料真值解析，
// 而且解析邏輯埋在網路函式裡、不是純函式，於是完全沒有測試覆蓋。
//
// ✅ 2.5.0 已接線至 rowToTx（回傳型別見下方 RowParse），讀取亦已改
// UNFORMATTED_VALUE、月份寫入改 RAW。🔴 接線的同時必須有「讀不懂就不改寫該月」
// 的防線（unreadableMonths → planMonthsToRewrite），否則「跳過讀不懂的列」
// 加上「整月 clear+覆蓋」等於把那列從雲端刪掉，比原本吞成 0 更糟。

/**
 * 解析 Sheets 金額儲存格 → number；無法可靠解析時回 null。
 * 認得：真數字（UNFORMATTED_VALUE）、"1234"、"1,234"、"NT$1,234"、"1 234"、
 *       "1234元"、會計格式括號負數 "(500)"、正負號。
 * 🔴 絕不回 0：0 本身是合法金額，拿它當「解析失敗」的哨兵值，等於允許一次壞掉的
 *    讀取把使用者真實的金額覆寫成 0。呼叫端拿到 null 應略過該列，讓本機值勝出。
 */
export function parseSheetAmount(v: unknown): number | null {
  // UNFORMATTED_VALUE 會直接給數字；布林/物件一律不是金額
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null

  let s = v.trim()
  if (!s) return null

  // 會計格式的括號負數：(500) / （500）
  let negative = false
  const paren = /^[(（]\s*(.*?)\s*[)）]$/.exec(s)
  if (paren) { negative = true; s = paren[1] }

  // 去掉貨幣符號、千分位與各種空白（含全形空白與不斷行空白）
  s = s.replace(/[\s\u00A0\u3000]|NT\$|NT|[$＄￥¥元,，]/g, '')
  if (s.startsWith('-') || s.startsWith('−')) { negative = !negative; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)

  // 清乾淨後必須是純數字，否則視為無法解析（不猜、不退回 0）
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

// Sheets/Excel 日期序列號起算日：序號 0 = 1899-12-30（UTC）。
// 讀取改用 UNFORMATTED_VALUE 後，日期型儲存格會以這種數字形式回來。
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30)
const MAX_DATE_SERIAL = 2958465 // 9999-12-31，超出視為不是日期

function pad2(n: number): string { return String(n).padStart(2, '0') }

// 驗證是真實存在的日期（擋掉 2026-02-30 這種），並輸出 'YYYY-MM-DD'
function buildIsoDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad2(mo)}-${pad2(d)}`
}

/**
 * 解析 Sheets 日期儲存格 → 'YYYY-MM-DD'；無法可靠解析時回 null。
 * 認得：日期序列號（45000 這種數字）、"2026-08-23"、"2026/8/23"、"2026.8.23"、"2026年8月23日"。
 * 🔴 刻意只接受「年在前」的格式：'8/23/2026'（美式）與 '23/8/2026'（歐式）無法從字串本身
 *    分辨月與日，猜錯會讓整筆交易落到錯誤月份而在月結中消失——寧可回 null 略過該列。
 */
export function parseSheetDate(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    const days = Math.floor(v) // 帶時間的日期序列號取整數日
    if (days < 1 || days > MAX_DATE_SERIAL) return null
    const dt = new Date(SHEETS_EPOCH_UTC + days * 86400000)
    return buildIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/.exec(s)
  if (!m) return null
  return buildIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))
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
// 單列解析結果（2.5.0）：🔴 刻意把「本來就不是交易」與「是交易但讀不懂」分成兩種，
// 不能共用一個 null。兩者都會被略過不寫進本機，但後果天差地遠——
//   skip       ＝ 空白列／沒有 id 的裝飾列，本來就沒有資料，略過無損。
//   unreadable ＝ 這列有內容，但金額或日期解析不出來。若當成 skip 略過，
//                 該月又剛好被整月 clear+覆蓋改寫，這列就從雲端永久消失。
//                 因此必須往上冒泡成 unreadableMonths，讓該月本輪一律不改寫。
export type RowParse =
  | { kind: 'tx'; seed: TxSeed }
  | { kind: 'skip' }
  | { kind: 'unreadable' }

// 這列是否含有任何實質內容（用來區分「空白列」與「讀不懂的列」）
function rowHasContent(row: unknown[]): boolean {
  return row.some(v => v !== undefined && v !== null && String(v).trim() !== '')
}

export function rowToTx(
  row: unknown[], header: string[],
  catByName: Map<string, Category>, catById: Map<string, Category>, now: string,
): RowParse {
  const g = (col: string) => row[header.indexOf(col)]
  const str = (col: string) => String(g(col) ?? '').trim()

  const rawDate = g('日期')
  const id = str('id')
  // 沒有 id 就不是本 app 寫出的交易列。有內容代表可能是使用者手動加的列，
  // 略過它本身無害，但不能連帶把整月改寫掉 → 標為 unreadable 擋下改寫。
  if (!id) return rowHasContent(row) ? { kind: 'unreadable' } : { kind: 'skip' }

  // 🔴 日期解析失敗一律不猜：猜錯會讓整筆交易落到錯的月份，在月結中憑空消失
  const date = parseSheetDate(rawDate)
  if (!date) return { kind: 'unreadable' }

  // 金額：空儲存格視為 0（沿用既有行為，本 app 寫出的列不會是空的）；
  // 🔴 但「有值卻解析不出來」絕不能當成 0——0 是合法金額，
  //    拿它當解析失敗的哨兵值等於授權一次壞掉的讀取覆寫使用者的真實帳目。
  const rawAmount = g('金額')
  const amountEmpty = rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === ''
  const amount = amountEmpty ? 0 : parseSheetAmount(rawAmount)
  if (amount === null) return { kind: 'unreadable' }

  const type: 'income' | 'expense' = str('收支') === '支出' ? 'expense' : 'income'
  const primaryName = str('一級類別')
  const catIdVal = str('一級ID')
  // 一級ID 有值但指向已刪類別時，cat 退回名稱對照（供二級名稱解析用），categoryId 仍保留該 id
  const cat = (catIdVal ? catById.get(catIdVal) : undefined) ?? catByName.get(primaryName)
  const categoryId = catIdVal || (cat?.id ?? primaryName)
  const subName = str('二級類別')
  const subIdVal = str('二級ID')
  const subId = subIdVal || (subName && cat ? (cat.subs?.find(s => s.name === subName)?.id ?? null) : null)
  const note = str('備註')

  return {
    kind: 'tx',
    seed: {
      id, date, type, categoryId, subId, amount,
      note: note || undefined,
      syncStatus: 'SYNCED',
      createdAt: now,
      updatedAt: now,
    },
  }
}

// ── 孤兒類別回收（2.3.0）──────────────────────────────────
// 2.3.0 之前刪除類別是硬刪，_config 裡整筆消失，但月份分頁的列還留著它的
// 一級ID/二級ID 與名稱。那些交易於是引用了不存在的類別 → 金額從月結蒸發。
// 這裡把「列上的 id + 名稱」抽成線索，讓 recoverOrphanCategories 能補回墓碑類別，
// 救回客戶在升級前已經刪掉的分類（名稱直接沿用雲端列上的顯示名稱）。
export interface CategoryHint {
  kind: 'primary' | 'sub'
  id: string
  name: string
  type: 'income' | 'expense'
  parentId?: string        // kind='sub' 時為所屬一級的 id
}

// 從「已解析的交易 seed + 原始列」抽出類別線索。
// id 一律取自 seed（= 交易實際引用的值，與 rowToTx 的解析結果一致，不會自己再推一次），
// 名稱取自列上的顯示欄位。
export function categoryHintsFromRow(seed: TxSeed, row: unknown[], header: string[]): CategoryHint[] {
  const g = (col: string) => String(row[header.indexOf(col)] ?? '').trim()
  const hints: CategoryHint[] = [
    { kind: 'primary', id: seed.categoryId, name: g('一級類別'), type: seed.type },
  ]
  if (seed.subId) {
    hints.push({ kind: 'sub', id: seed.subId, name: g('二級類別'), type: seed.type, parentId: seed.categoryId })
  }
  return hints
}

export interface TxMergePlan {
  toAdd: TxSeed[]
  toUpdate: { localId: number; seed: TxSeed }[]
}

// 決定本輪要「整月 clear+覆蓋改寫」的月份集合（純函式，鎖定資料保護 gating）：
//  - 有本機待同步變更（PENDING/DELETED）的月份要寫回；但若該月是雲端「舊彙總格式」且本輪不允許改寫舊格式
//    （allowOldRewrite=false，通常因備份失敗）→ 排除，🔴 絕不在沒有成功備份的情況下 clear+覆蓋舊資料。
//  - allowOldRewrite=true 時，所有舊格式月份都一併改寫（cutover 轉新格式）。
//  - upgradeMonths（缺「一級ID」欄的 2.0.0 新格式月份）一律就地補欄——屬加欄改寫、不動舊彙總資料，
//    不受舊格式備份門檻限制。
//  - 🔴 unreadableMonths（該月有列的金額/日期解析不出來）一律排除，優先於以上所有規則（2.5.0）。
export function planMonthsToRewrite(input: {
  pendingMonths: Iterable<string>
  oldFormatMonths: Iterable<string>
  upgradeMonths: Iterable<string>
  allowOldRewrite: boolean
  unreadableMonths?: Iterable<string>
}): string[] {
  const oldSet = new Set(input.oldFormatMonths)
  const out = new Set<string>()
  for (const m of input.pendingMonths) if (input.allowOldRewrite || !oldSet.has(m)) out.add(m)
  if (input.allowOldRewrite) for (const m of oldSet) out.add(m)
  for (const m of input.upgradeMonths) out.add(m)
  // 🔴 最後一道、優先於以上所有規則：該月有讀不懂的列 → 本輪絕不 clear+覆蓋。
  //    整月覆蓋是「以本機內容重建整個分頁」，讀不懂的列不在本機內容裡，
  //    照寫就等於把它從雲端刪除。寧可該月這輪不上雲（本機資料完好，下次再試），
  //    也不能拿使用者的雲端帳目去賭我們的解析器。同 upgradeMonths 也一併擋下。
  for (const m of input.unreadableMonths ?? []) out.delete(m)
  return [...out]
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
