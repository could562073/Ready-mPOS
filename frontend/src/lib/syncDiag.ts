// 雲端寫入失敗診斷（2.2.2）
//
// 背景：正式站客戶端出現「讀得到、所有寫入都 403 PERMISSION_DENIED」——
// 建立備份表（spreadsheets.create）與新增月份分頁（batchUpdate/addSheet）雙雙失敗，
// 但同一個 token 的 GET（分頁清單、儲存格值）全部成功。錯誤訊息是 Google 的
// 泛用字串「The caller does not have permission」，本身無法區分成因。
//
// 本模組只負責「把探針收集到的事實 → 分類 → 給人看得懂的話」，
// 純函式、不碰網路（網路探針在 lib/sheets.ts 的 getWriteDiagnostics）。

/** 探針收集到的非敏感事實；查不到的欄位一律為 null（不臆測） */
export interface WriteDiagnostics {
  /** Drive 容量（bytes）。limit 為 null = 該帳號無容量上限或查不到 */
  quota: { limit: number | null; usage: number | null } | null
  /** 目前鎖定的試算表能否編輯 */
  canEdit: boolean | null
  /** 目前鎖定的試算表是否為本人擁有 */
  ownedByMe: boolean | null
  /** 目前鎖定的試算表是否在垃圾桶 */
  trashed: boolean | null
  /** token 實際被授予的 scopes（非請求的 scopes） */
  scopes: string[] | null
}

export type WriteFailureKind = 'QUOTA_FULL' | 'NO_EDIT_PERMISSION' | 'SCOPE_MISSING' | 'UNKNOWN'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

/**
 * 依診斷事實判斷寫入失敗的成因。
 *
 * 判斷順序：
 * 1. SCOPE_MISSING — 沒有 spreadsheets scope 時，其餘判斷都失去意義。
 * 2. QUOTA_FULL   — 容量是可量化的硬事實（usage >= limit 沒有解讀空間），先判。
 * 3. NO_EDIT_PERMISSION — 容量正常卻仍不能編輯 = 真的是權限問題（例如鎖到別人分享的唯讀表）。
 *
 * 🔴 2026-08-05 實測更正（本註解原本的理由是錯的，保留此段以免有人再推一次）：
 * 原本寫「Google 帳號空間用滿時連『自己擁有的檔案』都會被降成唯讀（canEdit=false），
 * 所以 QUOTA_FULL 必須排在 canEdit 之前」。**實測不成立**——正式站客戶容量滿載
 * （15.003 GiB / 上限 15.000 GiB，僅超標 3.32 MB，2026-08-05 已向客戶本人確認）時，
 * 探針回傳的是 canEdit: true：Drive 仍宣稱該檔案可編輯，但任何寫入都 403。
 * 即 canEdit 反映的是 ACL 權限，與容量無關；「容量滿 → 帳號轉唯讀」是獨立於 ACL
 * 的另一道封鎖，兩者本來就是不同維度，不存在「誤判成沒有編輯權」這回事。
 *
 * 因此順序在這次其實**不是**關鍵（canEdit=true 不匹配第 3 條，兩種排法都會得到
 * QUOTA_FULL）。真正讓這次定案的是「有把 quota 欄位一起收回來」——若當初只探
 * canEdit 而沒探容量，結果會落到 UNKNOWN，客戶只看到「稍後自動重試」，成因永遠查不出來。
 * 教訓：診斷的價值在事實收得夠不夠齊，不在分類邏輯寫得多聰明；寧可多收一個
 * 非敏感欄位，也不要少收（但 extra 不經 redact()，故只放數字／布林／scope 字串）。
 */
export function classifyWriteFailure(d: WriteDiagnostics): WriteFailureKind {
  // 只有在「確實查到 scopes」時才判定缺 scope；查不到（null）不做臆測
  if (d.scopes !== null && !d.scopes.includes(SHEETS_SCOPE)) return 'SCOPE_MISSING'

  // limit/usage 任一缺漏（無上限帳號或查詢失敗）就不判定容量問題
  const q = d.quota
  if (q && q.limit !== null && q.usage !== null && q.usage >= q.limit) return 'QUOTA_FULL'

  if (d.canEdit === false) return 'NO_EDIT_PERMISSION'

  return 'UNKNOWN'
}

// 「權限類失敗」的特徵字串。刻意不用寬鬆的 `包含 403`——試算表 ID 本身就可能含 "403"
// 這三個數字，會誤把 500/404 當成權限問題而白跑探針。只認：
//   ① 明確的分隔符後接 403（sheets.ts 丟錯格式為 `… → 403: …` 與 `…失敗：403 …`）
//   ② Google 錯誤 JSON 的 "code": 403
//   ③ PERMISSION_DENIED 字樣
const PERMISSION_PATTERNS = [/(?:→|：|:)\s*403\b/, /"code"\s*:\s*403/, /PERMISSION_DENIED/]

/**
 * 這個錯誤值不值得跑診斷探針？
 * 探針要多打 3 個 Google API request，離線／逾時等一般失敗跑了也只是再失敗一次，
 * 因此只在「看起來是權限／配額被擋」時才跑。非 Error 值一律安全轉字串，不得拋例外。
 */
export function isPermissionDenied(err: unknown): boolean {
  let msg: string
  if (err instanceof Error) msg = err.message
  else if (typeof err === 'string') msg = err
  else return false
  return PERMISSION_PATTERNS.some((re) => re.test(msg))
}

/**
 * 給使用者看的說明。
 * 🔴 每一種都必須明講「資料還在本機」——寫入失敗時客戶最怕的是帳目不見了，
 * 而事實上交易都還安全存在 IndexedDB，只是還沒上雲。
 */
export function writeFailureMessage(kind: WriteFailureKind): string {
  switch (kind) {
    case 'QUOTA_FULL':
      return 'Google 雲端硬碟空間已滿，帳目無法上傳，目前只存在本機。請清理雲端硬碟／Gmail／相簿空間後重開 App，會自動補傳。'
    case 'NO_EDIT_PERMISSION':
      return '沒有這份試算表的編輯權限，帳目無法上傳，目前只存在本機。請到設定頁重新登入或改指定自己的試算表。'
    case 'SCOPE_MISSING':
      return 'Google 授權不足，帳目無法上傳，目前只存在本機。請到設定頁重新登入並允許試算表存取權限。'
    case 'UNKNOWN':
      return '雲端同步失敗，帳目已安全存在本機，稍後會自動重試。'
  }
}
