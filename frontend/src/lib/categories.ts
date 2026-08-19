import type { Category } from '../types'
import type { CategoryHint } from './txSheets'   // 型別匯入，編譯後抹除，不產生執行期循環相依
import type { DailyRecord } from '../types'
import { newId } from './ids'

const LS_KEY   = 'mpos_categories'
// 本機類別已修改但尚未同步到 Sheets 的旗標
// 用途：避免 syncAll 拉取雲端設定時覆蓋使用者尚未上傳的本機編輯
const LS_DIRTY = 'mpos_categories_dirty'

// 預設收入類別（對應原有固定欄位）
export const DEFAULT_INCOME: Category[] = [
  { id: 'cash',  name: '現金',      icon: 'cash',    color: 'mint',     fee: 0,    enabled: true, type: 'income' },
  { id: 'card',  name: '刷卡',      icon: 'card',    color: 'sky',      fee: 0,    enabled: true, type: 'income' },
  { id: 'uber',  name: 'Uber Eats', icon: 'bike',    color: 'lavender', fee: 0,    enabled: true, type: 'income' },
  { id: 'panda', name: 'foodpanda', icon: 'package', color: 'pink',     fee: 0,    enabled: true, type: 'income' },
]

// 預設支出類別（對應原有固定欄位）
export const DEFAULT_EXPENSE: Category[] = [
  { id: 'food', name: '食材採購', icon: 'package', color: 'peach',   enabled: true, type: 'expense' },
  { id: 'wage', name: '員工薪資', icon: 'users',   color: 'lavender', enabled: true, type: 'expense' },
  { id: 'misc', name: '雜支',     icon: 'tag',     color: 'coral',    enabled: true, type: 'expense' },
]

const DEFAULT_CATEGORIES: Category[] = [...DEFAULT_INCOME, ...DEFAULT_EXPENSE]

// 從 localStorage 讀取，若無則回傳預設值
export function getCategories(): Category[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_CATEGORIES
    const parsed = JSON.parse(raw) as Category[]
    return parsed.length > 0 ? parsed : DEFAULT_CATEGORIES
  } catch {
    return DEFAULT_CATEGORIES
  }
}

// 寫入 localStorage（使用者編輯路徑）
// 標記 dirty，提示下次 syncAll 需先推送、且暫停雲端拉取覆蓋
export function saveCategories(categories: Category[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(categories))
  localStorage.setItem(LS_DIRTY, '1')
}

// 雲端拉取路徑專用：寫入但不標記 dirty，避免把剛拉下來的設定又當成本機修改回推
export function applyCloudCategories(categories: Category[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(categories))
}

export function isCategoriesDirty(): boolean {
  return localStorage.getItem(LS_DIRTY) === '1'
}

export function clearCategoriesDirty(): void {
  localStorage.removeItem(LS_DIRTY)
}

// 只取某種類型「可用來記帳」的類別：啟用中且未被刪除。給選單／chips 用。
export function getEnabledByType(type: 'income' | 'expense'): Category[] {
  return getCategories().filter(c => c.type === type && c.enabled && !c.deleted)
}

// 取所有歷史出現過的類別（含停用、含已刪除），用於報表顯示與金額加總。
// 🔴 這裡**刻意**不濾掉 deleted：舊交易引用的類別若被排除，其金額會從月結消失。
export function getAllByType(type: 'income' | 'expense'): Category[] {
  return getCategories().filter(c => c.type === type)
}

// 計算單筆記錄的平台手續費（所有 fee > 0 的收入類別）
// @deprecated 分潤機制已於 2.2.0 拔除；此函式已無呼叫方，保留僅供未來參考，勿重新接線
export function calcFees(record: DailyRecord, categories: Category[]): number {
  return categories
    .filter(c => c.type === 'income' && c.fee && c.fee > 0)
    .reduce((s, c) => s + (record.incomes[c.id] ?? 0) * c.fee!, 0)
}

// 可選圖示清單
export const ICON_OPTIONS = [
  'cash', 'card', 'bike', 'package', 'users', 'tag',
  'wallet', 'receipt', 'cloud', 'camera',
]

// 可選顏色清單（對應 design tokens）
export const COLOR_OPTIONS = [
  'mint', 'sky', 'lavender', 'pink', 'peach', 'coral', 'sun',
]

// 二級分類型別（繼承一級 icon/color/fee，本身只有 id/name）
// deleted = 軟刪除墓碑（2.3.0）：記帳選單不顯示，但顯示／彙總仍查得到名稱，舊帳目不受影響
export type Sub = { id: string; name: string; deleted?: boolean }

// 新增二級分類（回傳新 Category，不 mutate 原物件）
export function addSub(cat: Category, name: string, makeId: () => string = newId): Category {
  const sub: Sub = { id: makeId(), name: name.trim() }
  return { ...cat, subs: [...(cat.subs ?? []), sub] }
}

// 改名指定二級分類（即時輸入不 trim，trim 交給儲存時正規化）
export function renameSub(cat: Category, subId: string, name: string): Category {
  return { ...cat, subs: (cat.subs ?? []).map(s => (s.id === subId ? { ...s, name } : s)) }
}

// 刪除指定二級分類 —— 軟刪除（標 deleted 墓碑，不從陣列移除，2.3.0）。
// 🔴 原本是 `filter(s => s.id !== subId)` 硬刪，正式站踩到：刪掉二級後，
// 歷史交易的 subId 找不到對應 sub，月結成本結構的二級細目直接消失（等於舊資料被抹掉），
// 而且重建一個同名二級也救不回來（id 不同）。改標記後，記帳選單看不到它，
// 但顯示／彙總查得到名稱 → 舊帳目的分類完整保留。
// 若它正是預設二級，一併清除 defaultSubId（否則記帳會帶入一個已刪的二級）。
export function deleteSub(cat: Category, subId: string): Category {
  const subs = (cat.subs ?? []).map(s => (s.id === subId ? { ...s, deleted: true } : s))
  const defaultSubId = cat.defaultSubId === subId ? null : cat.defaultSubId
  return { ...cat, subs, defaultSubId }
}

// 還原被軟刪除的二級分類（誤刪救回用）
export function restoreSub(cat: Category, subId: string): Category {
  const subs = (cat.subs ?? []).map(s => (s.id === subId ? { ...s, deleted: false } : s))
  return { ...cat, subs }
}

// 記帳選單可選的二級（排除已刪墓碑）。顯示／彙總請直接用 cat.subs 全集，不要用這個。
export function liveSubs(cat: Category | undefined): Sub[] {
  return (cat?.subs ?? []).filter(s => !s.deleted)
}

// 刪除一級類別 —— 同樣是軟刪除（純函式，回傳新陣列）。
// 理由同 deleteSub：一級被移除時，月結的 knownIncomeIds/knownExpenseIds 就不再包含它，
// 該類別的所有歷史金額會從月結總數與趨勢圖無聲消失。標記後金額照算，只是記帳選不到。
export function deleteCategory(cats: Category[], id: string): Category[] {
  return cats.map(c => (c.id === id ? { ...c, deleted: true } : c))
}

// 還原被軟刪除的一級類別（誤刪救回用）
export function restoreCategory(cats: Category[], id: string): Category[] {
  return cats.map(c => (c.id === id ? { ...c, deleted: false } : c))
}

// 名稱欄也空白的孤兒才用這個佔位名（至少讓金額回到月結，不至於顯示空字串）
export const ORPHAN_CATEGORY_NAME = '（已刪除類別）'

/**
 * 孤兒類別回收（2.3.0）——救回「升級前就被硬刪掉」的分類。
 *
 * 2.3.0 之前刪除分類是把它從 _config 整筆移除，但雲端月份分頁的列還留著
 * 一級ID/二級ID 與顯示名稱。那些交易於是引用了不存在的類別，而月結是用
 * 「已知類別 ID 集合」加總的 → 金額直接從總收入/總支出/趨勢圖消失。
 * 這裡依雲端列提供的線索，把缺席的類別以 `deleted:true` 墓碑補回來：
 * 記帳選單看不到它（本來就是使用者刪掉的），但顯示與加總重新認得它 → 金額回來。
 *
 * 回傳 null = 沒有任何缺漏（呼叫端可跳過寫入與推送）。
 */
export function recoverOrphanCategories(cats: Category[], hints: CategoryHint[]): Category[] | null {
  const byId = new Map(cats.map(c => [c.id, c]))
  const added: Category[] = []
  let changed = false

  // 先補一級（二級要掛在一級底下，順序不可顛倒）
  for (const h of hints) {
    if (h.kind !== 'primary' || !h.id || byId.has(h.id)) continue
    const cat: Category = {
      id: h.id,
      name: h.name || ORPHAN_CATEGORY_NAME,
      icon: 'tag',
      color: h.type === 'income' ? 'mint' : 'coral',
      enabled: false,          // 不啟用：這是使用者刪過的類別，只為歷史帳目而存在
      type: h.type,
      subs: [],
      defaultSubId: null,
      deleted: true,
    }
    byId.set(cat.id, cat)
    added.push(cat)
    changed = true
  }

  // 再補二級：掛回所屬一級（找不到一級就跳過，避免產生無主的二級）
  const subsToAdd = new Map<string, Sub[]>()
  for (const h of hints) {
    if (h.kind !== 'sub' || !h.id || !h.parentId) continue
    const parent = byId.get(h.parentId)
    if (!parent) continue
    const already = (parent.subs ?? []).some(s => s.id === h.id)
      || (subsToAdd.get(h.parentId) ?? []).some(s => s.id === h.id)
    if (already) continue
    const list = subsToAdd.get(h.parentId) ?? []
    list.push({ id: h.id, name: h.name || ORPHAN_CATEGORY_NAME, deleted: true })
    subsToAdd.set(h.parentId, list)
    changed = true
  }

  if (!changed) return null

  return [...cats, ...added].map(c => {
    const extra = subsToAdd.get(c.id)
    return extra ? { ...c, subs: [...(c.subs ?? []), ...extra] } : c
  })
}

// 設定預設二級（null = 無）
export function setDefaultSub(cat: Category, subId: string | null): Category {
  return { ...cat, defaultSubId: subId }
}

// 序列化二級清單為 _config 儲存字串：id:encodeURIComponent(name)，多筆以 | 分隔。
// name 經 encodeURIComponent，容許名稱含 : 或 | 而不破壞格式。
// 已軟刪除的二級再附加第三段 `:1`（2.3.0）——encodeURIComponent 會把 ':' 轉成 %3A，
// 故 name 段落內不可能出現裸 ':'，第二個 ':' 之後必定是旗標，解析無歧義。
// 相容性：舊版（<2.3.0）client 解析時會把 ':1' 併進名稱（顯示成「瓦斯費:1」），
// 且若由舊版寫回會固化該名稱——僅影響「已刪除」的二級，且正式站只有單一裝置，可接受。
export function serializeSubs(subs: Sub[]): string {
  return subs.map(s => `${s.id}:${encodeURIComponent(s.name)}${s.deleted ? ':1' : ''}`).join('|')
}

// ─────────────────────────────────────────────────────────────
// _config 分頁列 ⇄ Category[]（2.4.1）
//
// 這段原本 inline 在 sheets.ts 的 pushConfigToSheets/pullConfigFromSheets 裡，
// 夾在網路呼叫中間 → 無法單元測試，「往返」這條路徑於是從來沒有測試覆蓋，
// 讓下面 parseSheetBool 修的那個 bug 一路上了正式站。抽成純函式就是為了鎖住它。
// ─────────────────────────────────────────────────────────────

// _config 分頁的固定表頭（欄序即寫入順序；讀取一律以名稱定位，不靠索引）
// deleted 為 2.3.0 新增（軟刪除墓碑）；舊表沒有這欄，pull 時一律視為未刪除
export const CONFIG_HEADERS = [
  'id', 'name', 'icon', 'color', 'fee', 'enabled', 'type', 'subs', 'defaultSub', 'deleted',
] as const

/**
 * 解析 _config 的布林欄位。
 *
 * 🔴 為什麼要容錯大小寫與真布林（2.4.1 修正的正式站 bug）：
 * 寫入若用 valueInputOption=USER_ENTERED，Sheets 會把 'true'/'false' 當成使用者手打的內容
 * 解析成**布林儲存格**；再讀回來時，預設的 FORMATTED_VALUE 給的是顯示字串大寫 'TRUE'/'FALSE'，
 * UNFORMATTED_VALUE 給的則是真的 boolean。原本只比對小寫字串 → 一律不成立 →
 * 每次 pull 都把 enabled 翻回 true、deleted 翻回 false，客戶端看起來就是
 * 「類別停用與刪除完全沒有生效」。寫入端已改用 RAW（見 sheets.ts），
 * 但既有雲端表裡已經是布林儲存格，讀取端必須照樣認得，否則救不回已經壞掉的表。
 *
 * @param fallback 欄位缺漏或內容無法辨識時的預設值（enabled=true、deleted=false，向後相容舊表）
 */
export function parseSheetBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'true')  return true
  if (s === 'false') return false
  return fallback
}

// Category[] → _config 列（第一列為表頭）。
// 🔴 寫入端必須搭配 valueInputOption=RAW，否則這裡的 'true'/'false' 會被 Sheets 轉成布林儲存格。
export function categoriesToConfigRows(categories: Category[]): (string | number)[][] {
  return [
    [...CONFIG_HEADERS],
    ...categories.map(c => [
      c.id, c.name, c.icon, c.color,
      c.fee ?? 0,
      c.enabled ? 'true' : 'false',
      c.type,
      serializeSubs(c.subs ?? []),
      c.defaultSubId ?? '',
      c.deleted ? 'true' : 'false',   // 軟刪除墓碑（2.3.0）
    ]),
  ]
}

// _config 列（含表頭）→ Category[]。
// 以表頭名稱定位欄位（不靠固定索引）→ 欄序調整、舊表缺欄都不會錯位；id 空白的殘留列略過。
export function configRowsToCategories(rows: unknown[][]): Category[] {
  if (rows.length < 2) return []
  const header = (rows[0] ?? []).map(h => String(h ?? ''))
  const cell = (r: unknown[], col: string): unknown => {
    const i = header.indexOf(col)
    return i >= 0 ? r[i] : undefined
  }
  const str = (r: unknown[], col: string): string => {
    const v = cell(r, col)
    return v === undefined || v === null ? '' : String(v)
  }
  return rows.slice(1)
    .filter(r => str(r, 'id'))
    .map(r => ({
      id:    str(r, 'id'),
      name:  str(r, 'name'),
      icon:  str(r, 'icon')  || 'tag',
      color: str(r, 'color') || 'mint',
      fee:   parseFloat(str(r, 'fee')) || 0,
      // 欄位缺漏／空白一律視為啟用：寧可多顯示一個類別，也不要讓整批帳目的類別無聲消失
      enabled: parseSheetBool(cell(r, 'enabled'), true),
      type: (str(r, 'type') === 'expense' ? 'expense' : 'income') as 'income' | 'expense',
      subs: parseSubs(str(r, 'subs')),
      defaultSubId: str(r, 'defaultSub') || null,
      // 舊表（<2.3.0）沒有這欄 → 視為未刪除
      deleted: parseSheetBool(cell(r, 'deleted'), false),
    }))
}

// 反序列化 _config 的 subs 欄；容錯：空字串→[]，格式不符的片段略過。
// 沒有第三段旗標的舊資料一律視為未刪除（向後相容）。
export function parseSubs(raw: string): Sub[] {
  if (!raw) return []
  return raw
    .split('|')
    .map(part => {
      const sep = part.indexOf(':')
      if (sep < 1) return null
      const rest = part.slice(sep + 1)
      const sep2 = rest.indexOf(':')
      const nameRaw = sep2 >= 0 ? rest.slice(0, sep2) : rest
      const deleted = sep2 >= 0 && rest.slice(sep2 + 1) === '1'
      const sub: Sub = { id: part.slice(0, sep), name: decodeURIComponent(nameRaw) }
      return deleted ? { ...sub, deleted: true } : sub
    })
    .filter((s): s is Sub => s !== null)
}
