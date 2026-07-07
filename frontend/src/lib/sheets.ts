import type { DailyRecord, Category, Transaction } from '../types'
import { applyCloudCategories, isCategoriesDirty, clearCategoriesDirty, serializeSubs, parseSubs } from './categories'
import { TX_MONTH_HEADERS, isNewTxFormat, txToRow, rowToTx, type TxSeed } from './txSheets'
import { explodeDailyRecord } from './migrate'

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

// _config tab 欄位順序
const CONFIG_TAB     = '_config'
const CONFIG_HEADERS = ['id', 'name', 'icon', 'color', 'fee', 'enabled', 'type', 'subs', 'defaultSub']

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

  const values: (string | number)[][] = [
    CONFIG_HEADERS,
    ...categories.map(c => [
      c.id, c.name, c.icon, c.color,
      c.fee ?? 0,
      c.enabled ? 'true' : 'false',
      c.type,
      serializeSubs(c.subs ?? []),
      c.defaultSubId ?? '',
    ]),
  ]

  // 先清空整個 tab — 否則刪除類別後舊列會殘留，下次 pull 會把已刪除類別讀回 localStorage
  await sheetsValuesClear(spreadsheetId, CONFIG_TAB, token)
  await sheetsPut(
    `/${spreadsheetId}/values/${encodeURIComponent(CONFIG_TAB + '!A1')}?valueInputOption=USER_ENTERED`,
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
    const data = await sheetsGet<{ values?: string[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(CONFIG_TAB + '!A1:I')}`,
      token,
    )
    const rows = data.values ?? []
    if (rows.length < 2) return null

    // 以表頭名稱建立 index map，容錯欄位順序變動
    const header = rows[0]
    const idx = (col: string) => header.indexOf(col)

    const categories: Category[] = rows.slice(1)
      .filter(r => r[idx('id')])
      .map(r => {
        const subsRaw = idx('subs') >= 0 ? (r[idx('subs')] ?? '') : ''
        const defRaw  = idx('defaultSub') >= 0 ? (r[idx('defaultSub')] ?? '') : ''
        return {
          id:      r[idx('id')],
          name:    r[idx('name')]  ?? '',
          icon:    r[idx('icon')]  ?? 'tag',
          color:   r[idx('color')] ?? 'mint',
          fee:     parseFloat(r[idx('fee')]) || 0,
          enabled: r[idx('enabled')] !== 'false',
          type:    (r[idx('type')] === 'expense' ? 'expense' : 'income') as 'income' | 'expense',
          subs:        parseSubs(subsRaw),
          defaultSubId: defRaw || null,
        }
      })

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
export function parseOldMonthRows(rows: string[][], categories: Category[]): DailyRecord[] {
  const now = new Date().toISOString()
  const catByName = new Map(categories.map(c => [c.name, c]))
  const out: DailyRecord[] = []
  if (rows.length < 2) return out
  const header = rows[0]
  for (const row of rows.slice(1)) {
    const date = row[header.indexOf(COL_DATE)]
    if (!date) continue
    const incomes: Record<string, number> = {}
    const expenses: Record<string, number> = {}
    header.forEach((colName, i) => {
      if (FIXED_COLS.has(colName)) return
      const val = Number(row[i]) || 0
      if (val === 0) return
      const cat = catByName.get(colName)
      if (cat?.type === 'expense') expenses[cat.id] = val
      else if (cat) incomes[cat.id] = val
    })
    const incomeNotes: Record<string, string> = {}
    const expenseNotes: Record<string, string> = {}
    const rawItemNotes = (row[header.indexOf(COL_ITEM_NOTES)] ?? '').trim()
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
      notes: row[header.indexOf(COL_NOTES)] ?? '',
      syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    })
  }
  return out
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

    records.push(...parseOldMonthRows(rows, categories))
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

// 讀所有月份分頁 → 交易 seeds；同時回報哪些分頁仍是舊格式（需改寫）
export async function pullAllTransactionsFromSheets(
  spreadsheetId: string, categories: Category[],
): Promise<{ seeds: TxSeed[]; oldFormatMonths: string[] }> {
  const token = await acquireToken()
  const titles = await getSheetTitles(spreadsheetId, token)
  const monthTabs = titles.filter(t => /^\d{4}-\d{2}$/.test(t))
  const catByName = new Map(categories.map(c => [c.name, c]))
  const now = new Date().toISOString()
  const seeds: TxSeed[] = []
  const oldFormatMonths: string[] = []

  for (const month of monthTabs) {
    const data = await sheetsGet<{ values?: string[][] }>(
      `/${spreadsheetId}/values/${encodeURIComponent(month + '!A1:ZZ')}`, token,
    ).catch(() => ({ values: undefined }))
    const rows = data.values ?? []
    if (rows.length < 2) continue
    const header = rows[0]

    if (isNewTxFormat(header)) {
      for (const row of rows.slice(1)) {
        const seed = rowToTx(row, header, catByName, now)
        if (seed) seeds.push(seed)
      }
    } else {
      // 舊彙總格式：解析成 DailyRecord 再逐筆拆解為交易，並標記此月需改寫
      oldFormatMonths.push(month)
      for (const rec of parseOldMonthRows(rows, categories)) {
        for (const s of explodeDailyRecord(rec)) seeds.push(s)
      }
    }
  }
  return { seeds, oldFormatMonths }
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
