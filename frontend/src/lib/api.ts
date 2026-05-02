import type { DailyRecord } from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

// 後端 Request 格式（BigDecimal 欄位以字串傳送避免精度遺失）
interface ApiRequest {
  date: string
  cashIncome: string
  cardIncome: string
  uberEatsIncome: string
  pandaIncome: string
  foodCost: string
  staffSalary: string
  miscExpense: string
  notes?: string
}

// 後端 Response 格式
export interface ApiResponse {
  id: number
  date: string
  cashIncome: string
  cardIncome: string
  uberEatsIncome: string
  pandaIncome: string
  foodCost: string
  staffSalary: string
  miscExpense: string
  notes?: string
  syncStatus: 'PENDING' | 'SYNCED'
  createdAt: string
  updatedAt: string
}

function toRequest(r: DailyRecord): ApiRequest {
  return {
    date: r.date,
    cashIncome: String(r.cashIncome),
    cardIncome: String(r.cardIncome),
    uberEatsIncome: String(r.uberEatsIncome),
    pandaIncome: String(r.pandaIncome),
    foodCost: String(r.foodCost),
    staffSalary: String(r.staffSalary),
    miscExpense: String(r.miscExpense),
    notes: r.notes,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

// 查詢單日帳目（前端載入時使用）
export async function fetchByDate(date: string): Promise<ApiResponse | null> {
  try {
    return await request<ApiResponse>(`/api/records/${date}`)
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('404')) return null
    throw e
  }
}

// 查詢整月帳目（月結報表）
export async function fetchByMonth(month: string): Promise<ApiResponse[]> {
  return request<ApiResponse[]>(`/api/records?month=${month}`)
}

// 新增每日帳目（前端離線資料第一次同步）
export async function createRecord(r: DailyRecord): Promise<ApiResponse> {
  return request<ApiResponse>('/api/records', {
    method: 'POST',
    body: JSON.stringify(toRequest(r)),
  })
}

// 更新既有帳目（重新編輯後再次同步）
export async function updateRecord(backendId: number, r: DailyRecord): Promise<ApiResponse> {
  return request<ApiResponse>(`/api/records/${backendId}`, {
    method: 'PUT',
    body: JSON.stringify(toRequest(r)),
  })
}
