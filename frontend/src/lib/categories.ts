import type { Category } from '../types'
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
  { id: 'uber',  name: 'Uber Eats', icon: 'bike',    color: 'lavender', fee: 0.30, enabled: true, type: 'income' },
  { id: 'panda', name: 'foodpanda', icon: 'package', color: 'pink',     fee: 0.35, enabled: true, type: 'income' },
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

// 只取某種類型的啟用類別
export function getEnabledByType(type: 'income' | 'expense'): Category[] {
  return getCategories().filter(c => c.type === type && c.enabled)
}

// 取所有歷史出現過的類別（含停用），用於報表顯示
export function getAllByType(type: 'income' | 'expense'): Category[] {
  return getCategories().filter(c => c.type === type)
}

// 計算單筆記錄的平台手續費（所有 fee > 0 的收入類別）
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
export type Sub = { id: string; name: string }

// 新增二級分類（回傳新 Category，不 mutate 原物件）
export function addSub(cat: Category, name: string, makeId: () => string = newId): Category {
  const sub: Sub = { id: makeId(), name: name.trim() }
  return { ...cat, subs: [...(cat.subs ?? []), sub] }
}

// 改名指定二級分類（即時輸入不 trim，trim 交給儲存時正規化）
export function renameSub(cat: Category, subId: string, name: string): Category {
  return { ...cat, subs: (cat.subs ?? []).map(s => (s.id === subId ? { ...s, name } : s)) }
}

// 刪除指定二級分類；若它正是預設二級，一併清除 defaultSubId
export function deleteSub(cat: Category, subId: string): Category {
  const subs = (cat.subs ?? []).filter(s => s.id !== subId)
  const defaultSubId = cat.defaultSubId === subId ? null : cat.defaultSubId
  return { ...cat, subs, defaultSubId }
}

// 設定預設二級（null = 無）
export function setDefaultSub(cat: Category, subId: string | null): Category {
  return { ...cat, defaultSubId: subId }
}

// 序列化二級清單為 _config 儲存字串：id:encodeURIComponent(name)，多筆以 | 分隔。
// name 經 encodeURIComponent，容許名稱含 : 或 | 而不破壞格式。
export function serializeSubs(subs: Sub[]): string {
  return subs.map(s => `${s.id}:${encodeURIComponent(s.name)}`).join('|')
}

// 反序列化 _config 的 subs 欄；容錯：空字串→[]，格式不符的片段略過。
export function parseSubs(raw: string): Sub[] {
  if (!raw) return []
  return raw
    .split('|')
    .map(part => {
      const sep = part.indexOf(':')
      if (sep < 1) return null
      return { id: part.slice(0, sep), name: decodeURIComponent(part.slice(sep + 1)) }
    })
    .filter((s): s is Sub => s !== null)
}
