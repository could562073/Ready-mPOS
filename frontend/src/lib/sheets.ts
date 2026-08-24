import type { DailyRecord, Category, Transaction } from '../types'
import {
  applyCloudCategories, isCategoriesDirty, clearCategoriesDirty,
  categoriesToConfigRows, configRowsToCategories,
} from './categories'
import {
  TX_MONTH_HEADERS, isNewTxFormat, txToRow, rowToTx, categoryHintsFromRow,
  parseSheetAmount, parseSheetDate,
  type TxSeed, type CategoryHint,
} from './txSheets'
import { explodeDailyRecord } from './migrate'
import type { WriteDiagnostics } from './syncDiag'

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''

export const isGoogleConfigured = (): boolean => CLIENT_ID.length > 0

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  // Drive metadata 僅用於搜尋同名試算表，確保跨裝置使用同一份檔案
  // 依名稱搜尋 / 檢查垃圾桶：唯讀 metadata 即足夠（findSpreadsheetByName、clearIfInvalidSpreadsheet）
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ')

const LS_EMAIL      = 'gsheets_email'
const LS_SHEET_ID   = 'gsheets_spreadsheet_id'
const LS_SHEET_NAME = 'gsheets_spreadsheet_name'

// 固定欄位名稱（不受類別增減影響）
const COL_DATE          = '日期'
const COL_NOTES         = '備註'
const COL_ITEM_NOTES    = '項目備註'
const COL_TOTAL_INCOME  = '總收入'
const COL_TOTAL_EXPENSE = '總支出'
const COL_NET           = '淨利'

const FIXED_COLS = new Set([COL_DATE, COL_NOTES, COL_ITEM_NOTES, COL_TOTAL_INCOME, COL_TOTAL_EXPENSE, COL_NET])

// _config tab 名稱；欄位順序與列⇄物件轉換見 categories.ts 的 CONFIG_HEADERS（純函式，有測試覆蓋）
const CONFIG_TAB     = '_config'

interface TokenInfo {
  access_token: string
  expires_at: number // epoch ms
}

// localStorage key — token 跨 session 持久化，關掉瀏覽器重開仍有效，不需重新登入
const LS_TOKEN  = 'gsheets_tk'
const LS_EXPIRY = 'gsheets_tk_exp'

let tokenClient: any = null
// 嘗試從 localStorage 還原上次取得的 token
let tokenInfo: TokenInfo | null = (() => {
  try {
    const t = localStorage.getItem(LS_TOKEN)
    const e = Number(localStorage.getItem(LS_EXPIRY))
    if (t && e && Date.now() < e) return { access_token: t, expires_at: e }
  } catch {}
  return null
})()
let pendingResolve: ((t: string) => void) | null = null
let pendingReject:  ((e: Error)  => void) | null = null

// GIS script 載入後呼叫一次
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
        const expiresAt = Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000
        tokenInfo = { access_token: resp.access_token, expires_at: expiresAt }
        // 持久化到 localStorage，關掉瀏覽器重開仍有效，不需重新登入
        try {
          localStorage.setItem(LS_TOKEN,  resp.access_token)
          localStorage.setItem(LS_EXPIRY, String(expiresAt))
        } catch {}
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

// 取得有效 access token（過期或首次則重新請求）
function acquireToken(prompt: '' | 'consent' | 'select_account' = ''): Promise<string> {
  if (tokenInfo && Date.now() < tokenInfo.expires_at) {
    return Promise.resolve(tokenInfo.access_token)
  }
  if (!tokenClient) return Promise.reject(new Error('GIS not initialised'))
  return new Promise((resolve, reject) => {
    pendingResolve = resolve
    pendingReject  = reject
    tokenClient.requestAccessToken({ prompt })
  })
}

// 啟動時靜默預取 token — 把可能的授權彈窗集中在 app 啟動，而非分散在各操作中
export async function warmToken(): Promise<void> {
  if (tokenInfo && Date.now() < tokenInfo.expires_at) return
  await acquireToken()
}

// ── 公開 Auth API ──────────────────────────────────────────

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

export function signOut(): void {
  if (tokenInfo) {
    (window as any).google?.accounts.oauth2.revoke(tokenInfo.access_token)
    tokenInfo = null
  }
  try {
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_EXPIRY)
  } catch {}
  localStorage.removeItem(LS_EMAIL)
  // 試算表 ID 保留，下次登入同帳號可直接沿用
}

async function findSpreadsheetByName(name: string, token: string): Promise<string | null> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&orderBy=modifiedTime+desc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = (await res.json()) as { files: { id: string }[] }
  return data.files[0]?.id ?? null
}

// 跨裝置統一入口：先搜尋同名試算表，找到即沿用，找不到才新建
export async function getOrCreateSpreadsheet(title: string, initialSheetTitle?: string): Promise<string> {
  const token = await acquireToken()
  const existingId = await findSpreadsheetByName(title, token)
  if (existingId) return existingId

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

export const getSignedInEmail  = (): string | null => localStorage.getItem(LS_EMAIL)
export const getSpreadsheetId  = (): string => localStorage.getItem(LS_SHEET_ID) ?? ''
// 回傳已儲存的試算表名稱（跨裝置解析用）；空字串 = 尚未儲存
export const getStoredSheetName = (): string => localStorage.getItem(LS_SHEET_NAME) ?? ''

export const setSpreadsheetId = (id: string, name?: string): void => {
  localStorage.setItem(LS_SHEET_ID, id)
  if (name !== undefined) localStorage.setItem(LS_SHEET_NAME, name)
}

export const clearSpreadsheet = (): void => {
  localStorage.removeItem(LS_SHEET_ID)
  localStorage.removeItem(LS_SHEET_NAME)
}

// 寫入失敗診斷探針（2.2.2）
// 正式站客戶端出現「讀得到、所有寫入 403」，而 Google 只回泛用的
// 「The caller does not have permission」，光看錯誤本身無法區分成因。
// 這支探針收集足以區分成因的事實，交給 classifyWriteFailure 判讀。
// 🔴 三個原則：
//   1. 絕不 throw —— 它只跑在錯誤處理路徑上，不能把原本要回報的錯誤蓋掉。
//   2. 只收集非敏感事實（數字／布林／scope 字串）；不回傳 email、試算表 ID、access token。
//   3. 只用現有 scope（drive.metadata.readonly 已足夠呼叫 about.get 與 files.get），不需客戶重新授權。
export async function getWriteDiagnostics(): Promise<WriteDiagnostics> {
  const diag: WriteDiagnostics = { quota: null, canEdit: null, ownedByMe: null, trashed: null, scopes: null }

  let token: string
  try {
    token = await acquireToken()
  } catch {
    return diag // 連 token 都拿不到就沒得測，全部留 null
  }
  const headers = { Authorization: `Bearer ${token}` }

  // Drive API 的 int64 欄位（limit/usage）是「字串」，要轉數字；缺漏一律 null
  const num = (v: unknown): number | null => {
    if (v === undefined || v === null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const id = getSpreadsheetId()

  await Promise.all([
    // 容量：limit 在「無容量上限」的帳號會缺漏，此時 classifyWriteFailure 不會判 QUOTA_FULL
    (async () => {
      try {
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', { headers })
        if (!res.ok) return
        const d = (await res.json()) as { storageQuota?: { limit?: string; usage?: string } }
        diag.quota = { limit: num(d.storageQuota?.limit), usage: num(d.storageQuota?.usage) }
      } catch { /* 探針失敗留 null */ }
    })(),

    // 目前鎖定的試算表：能不能編輯、是不是自己的、是否在垃圾桶
    (async () => {
      if (!id) return
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${id}?fields=capabilities(canEdit),ownedByMe,trashed`,
          { headers },
        )
        if (!res.ok) return
        const d = (await res.json()) as {
          capabilities?: { canEdit?: boolean }
          ownedByMe?: boolean
          trashed?: boolean
        }
        diag.canEdit = d.capabilities?.canEdit ?? null
        diag.ownedByMe = d.ownedByMe ?? null
        diag.trashed = d.trashed ?? null
      } catch { /* 探針失敗留 null */ }
    })(),

    // token「實際被授予」的 scopes（可能少於我們請求的，例如使用者在同意畫面取消勾選）
    // ⚠️ 只取 scope 字串，access_token 本身絕不外流到回報 payload
    (async () => {
      try {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
        if (!res.ok) return
        const d = (await res.json()) as { scope?: string }
        if (typeof d.scope === 'string') diag.scopes = d.scope.split(' ').filter(Boolean)
      } catch { /* 探針失敗留 null */ }
    })(),
  ])

  return diag
}

// 檢查已儲存的試算表 ID 是否仍有效，「確定失效」才清除指標。
// 🔴 只在「確定不存在」時清除：404（已永久刪除）或 trashed=true（在垃圾桶）。
//    其他情況（5xx／429／網路／401／403 權限）視為暫時性，保留指標稍後重試，
//    避免因一時錯誤誤清指標後被重新解析成另一張（甚至新建的空）試算表 → 資料看似消失。
export async function clearIfInvalidSpreadsheet(): Promise<void> {
  const id = getSpreadsheetId()
  if (!id) return
  try {
    const token = await acquireToken()
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.status === 404) { clearSpreadsheet(); return } // 確定已刪除
    if (!res.ok) return                                    // 暫時性/權限錯誤 → 保留指標
    const data = (await res.json()) as { id: string; trashed: boolean }
    if (data.trashed) clearSpreadsheet()                   // 在垃圾桶 → 視為無效
  } catch {
    // token 取得或網路失敗 → 保留 ID，讓後續流程繼續決定
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

// 清空指定範圍 — PUT 只覆寫指定儲存格，刪除類別/減少行數時舊資料會殘留
// 因此整表覆蓋前需先 clear，避免 pull 把殘留資料當成有效類別讀回來
async function sheetsValuesClear(spreadsheetId: string, range: string, token: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Sheets values:clear ${range} → ${res.status}: ${msg}`)
  }
}

async function getSheetTitles(spreadsheetId: string, token: string): Promise<string[]> {
  const data = await sheetsGet<{ sheets: { properties: { title: string } }[] }>(
    `/${spreadsheetId}?fields=sheets.properties.title`,
    token,
  )
  return data.sheets.map(s => s.properties.title)
}

async function ensureSheet(spreadsheetId: string, title: string, token: string): Promise<void> {
  const titles = await getSheetTitles(spreadsheetId, token)
  if (titles.includes(title)) return
  await sheetsPost(`/${spreadsheetId}:batchUpdate`, {
    requests: [{ addSheet: { properties: { title } } }],
  }, token)
}

// ── _config tab：跨裝置類別設定同步 ────────────────────────

// 將本地類別設定寫入 _config tab（完整覆蓋）
export async function pushConfigToSheets(spreadsheetId: string, categories: Category[]): Promise<void> {
  const token = await acquireToken()
  await ensureSheet(spreadsheetId, CONFIG_TAB, token)

  const values = categoriesToConfigRows(categories)

  // 先清空整個 tab — 否則刪除類別後舊列會殘留，下次 pull 會把已刪除類別讀回 localStorage
  await sheetsValuesClear(spreadsheetId, CONFIG_TAB, token)
  // 🔴 必須是 RAW，不能用 USER_ENTERED（2.4.1 修正的正式站 bug）：
  // USER_ENTERED 等同「使用者手打」，Sheets 會把 'true'/'false' 轉成布林儲存格，
  // 讀回來變成大寫 TRUE/FALSE → enabled/deleted 兩欄每次 pull 都被翻回預設值，
  // 客戶端的「停用類別」與「刪除類別」看起來完全沒有生效。
  // RAW 一律照字面存字串，也順帶保護類別名稱不被當成日期或公式解析。
  await sheetsPut(
    `/${spreadsheetId}/values/${encodeURIComponent(CONFIG_TAB + '!A1')}?valueInputOption=RAW`,
    { range: `${CONFIG_TAB}!A1`, majorDimension: 'ROWS', values },
    token,
  )
  // 推送成功後清除 dirty 旗標
  clearCategoriesDirty()
}

// 從 _config tab 讀取類別設定並存入 localStorage
// 回傳 null 表示雲端無設定 或 本機有未同步修改（保留本機資料）
export async function pullConfigFromSheets(spreadsheetId: string): Promise<Category[] | null> {
  // 開頭快速檢查：若本機有未推送的修改，直接跳過拉取避免覆蓋使用者編輯
  if (isCategoriesDirty()) return null

  const token = await acquireToken()
  try {
    const data = await sheetsGet<{ values?: unknown[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(CONFIG_TAB + '!A1:J')}`,   // J = deleted（2.3.0）
      token,
    )
    // 解析與欄位容錯全在純函式裡（categories.ts，Vitest 覆蓋）
    const categories = configRowsToCategories(data.values ?? [])
    if (categories.length > 0) {
      // 套用前再次檢查：拉取期間使用者可能剛好做了編輯
      if (isCategoriesDirty()) return null
      applyCloudCategories(categories)
      return categories
    }
    return null
  } catch {
    return null
  }
}

// ── 月份資料欄位（依類別動態產生） ─────────────────────────

// 表頭：日期 | 收入類別... | 支出類別... | 備註 | 總收入 | 總支出 | 淨利
function buildHeaders(categories: Category[]): string[] {
  const incomeNames  = categories.filter(c => c.type === 'income').map(c => c.name)
  const expenseNames = categories.filter(c => c.type === 'expense').map(c => c.name)
  return [COL_DATE, ...incomeNames, ...expenseNames, COL_NOTES, COL_ITEM_NOTES, COL_TOTAL_INCOME, COL_TOTAL_EXPENSE, COL_NET]
}

// 將記錄轉為列（依 categories 順序排列金額）
function recordToRow(r: DailyRecord, categories: Category[]): (string | number)[] {
  const incomes  = categories.filter(c => c.type === 'income')
  const expenses = categories.filter(c => c.type === 'expense')

  const incomeVals  = incomes.map(c => r.incomes[c.id]  ?? 0)
  const expenseVals = expenses.map(c => r.expenses[c.id] ?? 0)

  const totalIncome  = incomeVals.reduce((a, b) => a + b, 0)
  const totalExpense = expenseVals.reduce((a, b) => a + b, 0)

  // 序列化項目備註：「類別名:備註;類別名:備註」，方便人讀也可反向解析
  const itemNotesParts: string[] = []
  for (const c of incomes) {
    const n = (r.incomeNotes?.[c.id] ?? '').trim()
    if (n) itemNotesParts.push(`${c.name}:${n}`)
  }
  for (const c of expenses) {
    const n = (r.expenseNotes?.[c.id] ?? '').trim()
    if (n) itemNotesParts.push(`${c.name}:${n}`)
  }

  return [
    r.date,
    ...incomeVals,
    ...expenseVals,
    r.notes ?? '',
    itemNotesParts.join(';'),
    totalIncome,
    totalExpense,
    totalIncome - totalExpense,
  ]
}

// ── 核心同步函式 ───────────────────────────────────────────

// 舊彙總格式：單一月份分頁 rows → DailyRecord[]（沿用既有解析：未知欄位略過、項目備註反解析）
// 🔴 2.5.0：日期與金額改走 parseSheetDate / parseSheetAmount。舊格式分頁是 2.0.0 以前用
//    USER_ENTERED 寫出的，日期多半已是真的日期儲存格 → UNFORMATTED_VALUE 會讀回序號（46257），
//    直接當字串用會讓 explodeDailyRecord 的決定性 id 變成 `mpos:46257:...`、整月落到錯的地方。
//    unreadable 一併回報：舊格式月份改寫（clear+覆蓋）前若有讀不懂的列，該月本輪一律不改寫。
export function parseOldMonthRows(
  rows: unknown[][], categories: Category[],
): { records: DailyRecord[]; unreadable: boolean } {
  const now = new Date().toISOString()
  const catByName = new Map(categories.map(c => [c.name, c]))
  const out: DailyRecord[] = []
  let unreadable = false
  if (rows.length < 2) return { records: out, unreadable }
  const header = rows[0].map(v => String(v ?? ''))
  const cell = (row: unknown[], col: string) => row[header.indexOf(col)]
  for (const row of rows.slice(1)) {
    const rawDate = cell(row, COL_DATE)
    if (rawDate === undefined || rawDate === null || String(rawDate).trim() === '') continue
    // 🔴 日期解析不出來不猜：猜錯會讓整天的帳目落到錯誤月份
    const date = parseSheetDate(rawDate)
    if (!date) { unreadable = true; continue }
    const incomes: Record<string, number> = {}
    const expenses: Record<string, number> = {}
    header.forEach((colName, i) => {
      if (FIXED_COLS.has(colName)) return
      const raw = row[i]
      if (raw === undefined || raw === null || String(raw).trim() === '') return
      // 🔴 有值卻解析不出來 ≠ 0：0 是合法金額，當成 0 等於用壞掉的讀取覆寫真實帳目
      const val = parseSheetAmount(raw)
      if (val === null) { unreadable = true; return }
      if (val === 0) return
      const cat = catByName.get(colName)
      if (cat?.type === 'expense') expenses[cat.id] = val
      else if (cat) incomes[cat.id] = val
    })
    const incomeNotes: Record<string, string> = {}
    const expenseNotes: Record<string, string> = {}
    const rawItemNotes = String(cell(row, COL_ITEM_NOTES) ?? '').trim()
    if (rawItemNotes) {
      for (const part of rawItemNotes.split(';')) {
        const sep = part.indexOf(':')
        if (sep < 1) continue
        const catName = part.slice(0, sep).trim()
        const noteVal = part.slice(sep + 1).trim()
        if (!noteVal) continue
        const cat = catByName.get(catName)
        if (cat?.type === 'expense') expenseNotes[cat.id] = noteVal
        else if (cat) incomeNotes[cat.id] = noteVal
      }
    }
    out.push({
      date, incomes, expenses, incomeNotes, expenseNotes,
      notes: String(cell(row, COL_NOTES) ?? ''),
      syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    })
  }
  return { records: out, unreadable }
}

// 從雲端試算表還原所有月份資料
// 需傳入 categories（先呼叫 pullConfigFromSheets 取得），以正確分類 income / expense
export async function pullAllFromSheets(spreadsheetId: string, categories: Category[]): Promise<DailyRecord[]> {
  const token = await acquireToken()
  const titles = await getSheetTitles(spreadsheetId, token)
  const monthTabs = titles.filter(t => /^\d{4}-\d{2}$/.test(t))
  const records: DailyRecord[] = []

  for (const month of monthTabs) {
    const data = await sheetsGet<{ values?: string[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1:ZZ')}`,
      token,
    ).catch(() => ({ values: undefined }))

    const rows = data.values ?? []
    if (rows.length < 2) continue

    records.push(...parseOldMonthRows(rows, categories).records)
  }

  return records
}

// 舊→新格式改寫前的安全備份：把整份試算表的資料複製到一張「新建、由本 app 建立」的備份表。
// 🔴 為何不用 Drive files.copy（曾用 drive.file scope，已移除）：drive.file 只能操作「本 app 建立」的檔案，
//    對使用者手動建立/複製、或在 app 取得 drive.file 之前就已存在的試算表（含正式站舊表），
//    files.copy 會回 403 appNotAuthorizedToFile。改用 spreadsheets scope（可讀寫使用者所有試算表）
//    逐分頁讀值 → 寫進一張新建備份表：不依賴逐檔 Drive 授權，彩排（複製表）與真實 cutover（舊正式表）皆可用。
//    僅備份「數值」（本 app 資料無格式需求），回傳備份表 id。
export async function backupSpreadsheet(spreadsheetId: string): Promise<string> {
  const token = await acquireToken()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  // 1. 讀來源所有分頁的值（逐分頁 values 讀，避免 includeGridData 過重；空分頁容錯為 []）
  const titles = await getSheetTitles(spreadsheetId, token)
  const tabs: { title: string; values: unknown[][] }[] = []
  for (const title of titles) {
    const data = await sheetsGet<{ values?: unknown[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(title + '!A1:ZZ')}`,
      token,
    )
    tabs.push({ title, values: data.values ?? [] })
  }

  // 2. 建立新的備份試算表（Sheets API 建表由 spreadsheets scope 涵蓋）；一次帶齊所有來源分頁名
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: `Ready-mPOS 備份 ${stamp}` },
      sheets: titles.map(t => ({ properties: { title: t } })),
    }),
  })
  if (!createRes.ok) {
    const msg = await createRes.text().catch(() => '')
    throw new Error(`建立備份試算表失敗：${createRes.status} ${msg}`)
  }
  const { spreadsheetId: backupId } = (await createRes.json()) as { spreadsheetId: string }

  // 3. 把每個分頁的值寫進備份表（RAW 保留原字串，例如交易 id / 前導零，不被自動解析）
  for (const tab of tabs) {
    if (tab.values.length === 0) continue
    await sheetsPut(
      `/${backupId}/values/${encodeURIComponent(tab.title + '!A1')}?valueInputOption=RAW`,
      { values: tab.values },
      token,
    )
  }

  return backupId
}

// 讀所有月份分頁 → 交易 seeds；同時回報哪些分頁仍是舊彙總格式（需備份後改寫），
// 以及哪些是缺「一級ID」欄的 2.0.0 新格式（需就地升級改寫補 ID 欄——改名防護，無需備份）
export async function pullAllTransactionsFromSheets(
  spreadsheetId: string, categories: Category[],
): Promise<{
  seeds: TxSeed[]; oldFormatMonths: string[]; upgradeMonths: string[]
  categoryHints: CategoryHint[]; unreadableMonths: string[]
}> {
  const token = await acquireToken()
  const titles = await getSheetTitles(spreadsheetId, token)
  const monthTabs = titles.filter(t => /^\d{4}-\d{2}$/.test(t))
  const catByName = new Map(categories.map(c => [c.name, c]))
  const catById = new Map(categories.map(c => [c.id, c]))
  const now = new Date().toISOString()
  const seeds: TxSeed[] = []
  const oldFormatMonths: string[] = []
  const upgradeMonths: string[] = []
  // 🔴 該月有列讀不懂（金額/日期解析不出來，或有內容卻沒有 id）→ 本輪不得改寫該月。
  //    否則「略過讀不懂的列」＋「整月 clear+覆蓋」＝把那列從雲端永久刪除。
  const unreadableMonths: string[] = []
  // 孤兒類別線索（2.3.0）：雲端列引用到本機 _config 已無的類別 id 時，
  // 靠這些線索把類別以墓碑補回來，否則那些金額會被月結的「已知類別 ID」過濾掉而消失
  const categoryHints: CategoryHint[] = []

  for (const month of monthTabs) {
    const data = await sheetsGet<{ values?: unknown[][] }>(
      // 🔴 UNFORMATTED_VALUE（2.5.0）：預設的 FORMATTED_VALUE 回的是「畫面上顯示的字串」，
      //    使用者只要對金額欄套一次千分位或貨幣格式，讀回來就變 "1,234"。
      //    這裡要的是儲存格真值，格式化與否都不該影響帳目。
      `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1:ZZ')}` +
      `?valueRenderOption=UNFORMATTED_VALUE`, token,
    ).catch(() => ({ values: undefined }))
    const rows = data.values ?? []
    if (rows.length < 2) continue
    const header = rows[0].map(v => String(v ?? ''))

    if (isNewTxFormat(header)) {
      if (!header.includes('一級ID')) upgradeMonths.push(month)
      let monthUnreadable = false
      for (const row of rows.slice(1)) {
        const parsed = rowToTx(row, header, catByName, catById, now)
        if (parsed.kind === 'skip') continue
        if (parsed.kind === 'unreadable') { monthUnreadable = true; continue }
        const seed = parsed.seed
        seeds.push(seed)
        // 只有新格式列帶得出 id ↔ 名稱的對應；舊彙總格式本來就只有名稱、
        // 其 categoryId 是靠名稱查回來的，查不到就不是孤兒而是未知欄位，不需回收
        for (const h of categoryHintsFromRow(seed, row, header)) categoryHints.push(h)
      }
      if (monthUnreadable) unreadableMonths.push(month)
    } else {
      // 舊彙總格式：解析成 DailyRecord 再逐筆拆解為交易，並標記此月需改寫
      oldFormatMonths.push(month)
      const old = parseOldMonthRows(rows, categories)
      for (const rec of old.records) {
        for (const s of explodeDailyRecord(rec)) seeds.push(s)
      }
      // 讀不懂的舊格式列同樣擋下該月改寫——舊格式改寫是「拆解後整月重建」，
      // 沒讀進來的列不會出現在重建結果裡，照寫就等於刪掉它
      if (old.unreadable) unreadableMonths.push(month)
    }
  }
  return { seeds, oldFormatMonths, upgradeMonths, categoryHints, unreadableMonths }
}

// 將某月所有交易以新格式整批覆蓋寫入（先 clear 再 put，天然去除筆數變動殘留）
export async function syncMonthTransactionsToSheets(
  spreadsheetId: string, month: string, txs: (Transaction | TxSeed)[], categories: Category[],
): Promise<void> {
  const token = await acquireToken()
  await ensureSheet(spreadsheetId, month, token)
  const catById = new Map(categories.map(c => [c.id, c]))
  const values: (string | number)[][] = [
    [...TX_MONTH_HEADERS],
    ...txs.map(t => txToRow(t, catById)),
  ]
  await sheetsValuesClear(spreadsheetId, month, token)
  await sheetsPut(
    `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1')}?valueInputOption=USER_ENTERED`,
    { range: `${month}!A1`, majorDimension: 'ROWS', values },
    token,
  )
}

// 將某月所有記錄整批寫入 Google Sheets（覆蓋式）
export async function syncMonthToSheets(
  spreadsheetId: string,
  month: string,
  records: DailyRecord[],
  categories: Category[],
): Promise<void> {
  const token = await acquireToken()
  await ensureSheet(spreadsheetId, month, token)

  const headers = buildHeaders(categories)
  const values: (string | number)[][] = [headers, ...records.map(r => recordToRow(r, categories))]

  // 先清空整個月份分頁 — 否則刪除類別後舊欄位殘留，或記錄筆數變少時舊列殘留
  await sheetsValuesClear(spreadsheetId, month, token)
  await sheetsPut(
    `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1')}?valueInputOption=USER_ENTERED`,
    { range: `${month}!A1`, majorDimension: 'ROWS', values },
    token,
  )
}
