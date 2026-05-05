import type { Category } from '../types'

const LS_KEY = 'mpos_categories'

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

// 寫入 localStorage
export function saveCategories(categories: Category[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(categories))
}

// 只取某種類型的啟用類別
export function getEnabledByType(type: 'income' | 'expense'): Category[] {
  return getCategories().filter(c => c.type === type && c.enabled)
}

// 取所有歷史出現過的類別（含停用），用於報表顯示
export function getAllByType(type: 'income' | 'expense'): Category[] {
  return getCategories().filter(c => c.type === type)
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
