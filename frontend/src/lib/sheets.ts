import type { DailyRecord } from '../types'

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''

// 讓呼叫方可以檢查是否已設定 Client ID
export const isGoogleConfigured = (): boolean => CLIENT_ID.length > 0
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  // Drive metadata 僅用於搜尋同名試算表，確保跨裝置使用同一份檔案
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ')

// LS key for persisting spreadsheet preference
const LS_EMAIL    = 'gsheets_email'
const LS_SHEET_ID = 'gsheets_spreadsheet_id'
const LS_SHEET_NAME = 'gsheets_spreadsheet_name'

interface TokenInfo {
  access_token: string
  expires_at: number // epoch ms
}

let tokenClient: any = null
let tokenInfo: TokenInfo | null = null
let pendingResolve: ((t: string) => void) | null = null
let pendingReject: ((e: Error) => void) | null = null

// GIS script が読み込まれた後に一度だけ呼ぶ
export function initGoogleAuth(): void {
  const g = (window as any).google
  if (!g?.accounts?.oauth2 || !CLIENT_ID) return
  tokenClient = g.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp: any) => {
      if (resp.error || !resp.access_token) {
        pendingReject?.(new Error(resp.error ?? 'auth_failed'))
      } else {
        tokenInfo = {
          access_token: resp.access_token,
          // expires_in 通常 3600 秒，提前 60 秒更新
          expires_at: Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000,
        }
        pendingResolve?.(resp.access_token)
      }
      pendingResolve = pendingReject = null
    },
    error_callback: (err: any) => {
      pendingReject?.(new Error(err?.type ?? 'auth_error'))
      pendingResolve = pendingReject = null
    },
  })
}

// 取得有效 access token（已過期或首次則重新請求）
function acquireToken(prompt: '' | 'consent' | 'select_account' = ''): Promise<string> {
  if (tokenInfo && Date.now() < tokenInfo.expires_at) {
    return Promise.resolve(tokenInfo.access_token)
  }
  if (!tokenClient) return Promise.reject(new Error('GIS not initialised'))
  return new Promise((resolve, reject) => {
    pendingResolve = resolve
    pendingReject = reject
    tokenClient.requestAccessToken({ prompt })
  })
}

// ── 公開 Auth API ──────────────────────────────────────────

// 彈出 Google 帳號選擇視窗，取得 email 後存入 localStorage
export async function signIn(): Promise<string> {
  const token = await acquireToken('select_account')
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch user info')
  const { email } = (await res.json()) as { email: string }
  localStorage.setItem(LS_EMAIL, email)
  return email
}

// 撤銷 token 並清除本地狀態
export function signOut(): void {
  if (tokenInfo) {
    (window as any).google?.accounts.oauth2.revoke(tokenInfo.access_token)
    tokenInfo = null
  }
  localStorage.removeItem(LS_EMAIL)
  // 試算表 ID 保留，下次登入同帳號可直接沿用；切換帳號時再手動重置
}

// 以名稱搜尋現有試算表，回傳第一個符合的 ID（無則回傳 null）
async function findSpreadsheetByName(name: string, token: string): Promise<string | null> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&orderBy=modifiedTime+desc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = (await res.json()) as { files: { id: string }[] }
  return data.files[0]?.id ?? null
}

// 跨裝置統一入口：先搜尋同名試算表，找到即沿用，找不到才新建
// 確保同一 Google 帳號在任何裝置都指向同一份試算表
export async function getOrCreateSpreadsheet(title: string, initialSheetTitle?: string): Promise<string> {
  const token = await acquireToken()

  const existingId = await findSpreadsheetByName(title, token)
  if (existingId) return existingId

  // 不存在 → 建立新試算表
  const body = {
    properties: { title },
    ...(initialSheetTitle && { sheets: [{ properties: { title: initialSheetTitle } }] }),
  }
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`建立試算表失敗：${res.status} ${msg}`)
  }
  const data = (await res.json()) as { spreadsheetId: string }
  return data.spreadsheetId
}

export const getSignedInEmail = (): string | null => localStorage.getItem(LS_EMAIL)
export const getSpreadsheetId = (): string => localStorage.getItem(LS_SHEET_ID) ?? ''

export const setSpreadsheetId = (id: string, name?: string): void => {
  localStorage.setItem(LS_SHEET_ID, id)
  if (name !== undefined) localStorage.setItem(LS_SHEET_NAME, name)
}

export const clearSpreadsheet = (): void => {
  localStorage.removeItem(LS_SHEET_ID)
  localStorage.removeItem(LS_SHEET_NAME)
}

// 檢查已儲存的試算表 ID 是否仍有效（未被刪除或移至垃圾桶）
// 若無效則自動清除，讓登入流程重新搜尋或建立
export async function clearIfInvalidSpreadsheet(): Promise<void> {
  const id = getSpreadsheetId()
  if (!id) return
  try {
    const token = await acquireToken()
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      clearSpreadsheet()
      return
    }
    const data = (await res.json()) as { id: string; trashed: boolean }
    if (data.trashed) clearSpreadsheet()
  } catch {
    // token 取得失敗時保留 ID，讓後續流程繼續決定
  }
}

// ── Sheets API helpers ─────────────────────────────────────

async function sheetsGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Sheets GET ${path} → ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

async function sheetsPost(path: string, body: unknown, token: string): Promise<void> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Sheets POST ${path} → ${res.status}: ${msg}`)
  }
}

async function sheetsPut(path: string, body: unknown, token: string): Promise<void> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Sheets PUT ${path} → ${res.status}: ${msg}`)
  }
}

// 取得試算表內所有 sheet tab 名稱
async function getSheetTitles(spreadsheetId: string, token: string): Promise<string[]> {
  const data = await sheetsGet<{ sheets: { properties: { title: string } }[] }>(
    `/${spreadsheetId}?fields=sheets.properties.title`,
    token,
  )
  return data.sheets.map(s => s.properties.title)
}

// 若指定月份的 tab 不存在則新增
async function ensureMonthSheet(spreadsheetId: string, month: string, token: string): Promise<void> {
  const titles = await getSheetTitles(spreadsheetId, token)
  if (titles.includes(month)) return
  await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
    requests: [{ addSheet: { properties: { title: month } } }],
  }, token)
}

// 試算表欄位定義
const HEADERS = [
  '日期', '現金', '刷卡', 'Uber Eats', '熊貓外送',
  '食材成本', '員工薪資', '雜支', '備註', '總收入', '總支出', '淨利',
]

function recordToRow(r: DailyRecord): (string | number)[] {
  const income  = r.cashIncome + r.cardIncome + r.uberEatsIncome + r.pandaIncome
  const expense = r.foodCost + r.staffSalary + r.miscExpense
  return [
    r.date,
    r.cashIncome, r.cardIncome, r.uberEatsIncome, r.pandaIncome,
    r.foodCost, r.staffSalary, r.miscExpense,
    r.notes ?? '',
    income, expense, income - expense,
  ]
}

// 從試算表讀取某月資料列（跳過第一列表頭）
async function readSheetRows(spreadsheetId: string, month: string, token: string): Promise<string[][]> {
  try {
    const data = await sheetsGet<{ values?: string[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(month + '!A2:I')}`,
      token,
    )
    return data.values ?? []
  } catch {
    return []
  }
}

// 從雲端試算表還原所有月份資料（新裝置初次使用）
export async function pullAllFromSheets(spreadsheetId: string): Promise<DailyRecord[]> {
  const token = await acquireToken()
  const titles = await getSheetTitles(spreadsheetId, token)

  // 只處理格式為 YYYY-MM 的 tab
  const monthTabs = titles.filter(t => /^\d{4}-\d{2}$/.test(t))
  const records: DailyRecord[] = []
  const now = new Date().toISOString()

  for (const month of monthTabs) {
    const rows = await readSheetRows(spreadsheetId, month, token)
    for (const row of rows) {
      if (!row[0]) continue
      records.push({
        date:           row[0],
        cashIncome:     Number(row[1]) || 0,
        cardIncome:     Number(row[2]) || 0,
        uberEatsIncome: Number(row[3]) || 0,
        pandaIncome:    Number(row[4]) || 0,
        foodCost:       Number(row[5]) || 0,
        staffSalary:    Number(row[6]) || 0,
        miscExpense:    Number(row[7]) || 0,
        notes:          row[8] ?? '',
        syncStatus:     'SYNCED',
        createdAt:      now,
        updatedAt:      now,
      })
    }
  }

  return records
}

// ── 核心同步函式 ───────────────────────────────────────────

// 將某月所有記錄整批寫入 Google Sheets（覆蓋式，確保試算表與本地一致）
export async function syncMonthToSheets(
  spreadsheetId: string,
  month: string,           // 'YYYY-MM'
  records: DailyRecord[],  // 該月所有記錄，依日期排序
): Promise<void> {
  const token = await acquireToken()

  // 確保該月 tab 存在
  await ensureMonthSheet(spreadsheetId, month, token)

  // 第一列表頭 + 後續資料列
  const values: (string | number)[][] = [HEADERS, ...records.map(recordToRow)]

  await sheetsPut(
    `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1')}?valueInputOption=USER_ENTERED`,
    { range: `${month}!A1`, majorDimension: 'ROWS', values },
    token,
  )
}
