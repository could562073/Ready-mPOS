// frontend/src/lib/errorReport.ts
// 遠端錯誤回報：把同步／備份失敗的錯誤 fire-and-forget 送到開發者自建的 Google Apps Script
// Web App（doPost → MailApp.sendEmail 寄到開發者信箱），讓「看不到客戶裝置錯誤」的問題可被診斷。
// 端點 URL 來自 import.meta.env.VITE_ERROR_REPORT_URL（僅 .env.production 設定；空值＝不回報，
// 故 dev/staging 不會送）。🔴 鐵則：回報流程本身的任何失敗都不得影響或中斷主記帳流程。

// 編譯期由 vite define 注入的版本號（見 vite.config.ts / vite-env.d.ts）
declare const __APP_VERSION__: string

// 同一錯誤跨 session 的最短重送間隔（12 小時）——避免使用者每次開 App 都重複寄信
export const COOLDOWN_MS = 12 * 60 * 60 * 1000
const LS_PREFIX = 'mpos_errreport_'

// 純函式測試以注入方式提供的最小 KV 介面（node 測試環境無 localStorage）
interface KVStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

// 純函式：去識別化。Sheets 錯誤訊息會夾帶 `/<spreadsheetId>/...` 路徑（見 sheets.ts 的
// sheetsGet/sheetsPut 丟錯格式），若原封不動回報就等於把試算表 ID 寄出去，違反隱私鐵則。
// 作法：把任何 30 字以上的 base64url 樣式長字串（試算表 ID 44 字、OAuth token 更長）換成 <id>，
// 同時保留狀態碼（如 403）與 Google 錯誤原因（如 storageQuotaExceeded）等診斷所需的短字。
export function redact(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{30,}/g, '<id>')
}

// 簽章：情境 + 訊息前綴（截斷避免 key 過長）。相同簽章視為同一錯誤，用於去重。
export function buildSignature(context: string, message: string): string {
  return `${context}|${message.slice(0, 200)}`
}

// 純函式：判斷此簽章「現在」是否該送出，並在該送時記錄狀態。
//  ① 同一 session 同簽章只送一次（用傳入的 seen Set 記憶）
//  ② 跨 session 在 cooldownMs 內不重送（用傳入的 store 以時間戳記憶）
// fail-open：store 存取異常時仍回 true（寧可多送，也不可漏掉唯一一次診斷資訊）。
export function markAndCheck(
  sig: string,
  now: number,
  seen: Set<string>,
  store: KVStore,
  cooldownMs: number = COOLDOWN_MS,
): boolean {
  if (seen.has(sig)) return false
  seen.add(sig)
  try {
    const key = LS_PREFIX + sig
    const last = Number(store.getItem(key)) || 0
    if (last && now - last < cooldownMs) return false
    store.setItem(key, String(now))
  } catch {
    return true // 儲存不可用 → 不因此漏報
  }
  return true
}

// ── 以下為含環境相依（localStorage/navigator/fetch/import.meta.env）的薄封裝，不進單元測試 ──

// 回報端點是否已設定（dev/staging 留空＝不回報）。
// 2.4.0：UI 用它決定要不要對使用者說「此問題已自動回報給開發者」——沒有回報管線的環境
// 就不該講這句話，寧可少說也不能說謊。
export function isErrorReportEnabled(): boolean {
  try {
    return !!import.meta.env.VITE_ERROR_REPORT_URL
  } catch {
    return false
  }
}

const sessionSeen = new Set<string>()

function appVersion(): string {
  try {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
  } catch {
    return 'dev'
  }
}

function safeStore(): KVStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function toStack(err: unknown): string {
  return err instanceof Error && err.stack ? err.stack : ''
}

// 對外主入口：情境標籤 + 錯誤 + 選填的非敏感附加資訊（例如舊格式月份數）。
// 🔴 隱私：只送錯誤訊息／堆疊／UA／版本與呼叫端明確帶入的 extra；
//    絕不送試算表 ID、不送任何帳目金額或列內容。
export function reportError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  try {
    const url = import.meta.env.VITE_ERROR_REPORT_URL
    if (!url) return // 未設定端點（dev/staging，或正式站尚未部署 Apps Script）→ 不回報

    // 🔴 先去識別化再做任何事：Sheets 錯誤訊息夾帶 `/<spreadsheetId>/...`，絕不能寄出。
    // 對簽章也用去識別化後的訊息，避免僅 ID 不同（如每次新建的備份表 ID）被當成不同錯誤而重複寄。
    const message = redact(toMessage(err))
    const sig = buildSignature(context, message)
    const store = safeStore()
    // store 存在才做去重；store 不可用時直接送出（極少數環境）
    if (store && !markAndCheck(sig, Date.now(), sessionSeen, store)) return

    const payload = {
      app: 'Ready-mPOS',
      version: appVersion(),
      context,
      message,
      stack: redact(toStack(err)),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      time: new Date().toISOString(),
      extra: extra ?? {},
      // 選用防濫用 token：與 Apps Script 端 REQUIRED_TOKEN 比對放行。非機密（同樣內嵌於公開
      // bundle，只擋隨機爬蟲，非帳目資料）；未設定時為空字串，Apps Script 未啟用檢查時會忽略。
      token: import.meta.env.VITE_ERROR_REPORT_TOKEN || '',
    }

    // no-cors fire-and-forget：Apps Script 不回 CORS 標頭，用 no-cors 送出即可（讀不到回應無妨）；
    // text/plain 避免觸發 CORS preflight；keepalive 讓頁面關閉時仍能送出。
    void fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  } catch {
    // 回報本身的任何錯誤都吞掉，絕不影響主流程
  }
}
