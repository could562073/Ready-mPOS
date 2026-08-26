# warmToken popup 修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拿掉「啟動時靜默預取 token」這條不可能成功的 popup 路徑，改成「token 失效就明白告訴使用者、給一顆按鈕在使用者手勢中重新連線」，同時終結 `auth/warmToken → popup_failed_to_open` 錯誤信與其背後的靜默同步失敗。

**Architecture:** GIS token client 沒有靜默模式（`requestAccessToken` 一定開 popup，`prompt:''` 只影響 popup 內容），因此所有背景路徑（啟動 effect、`setInterval`、任何 `await` 之後）都不得呼叫它。改為：背景只用 `hasValidToken()` 純查詢判斷，失效時經既有 `syncError` / `SyncErrorBanner` 管線顯示提示；重新連線由 `retryNow` 在 click handler 內、**任何 `await` 之前**呼叫 `reconnect()` 完成。

**Tech Stack:** React + Vite + TypeScript、Google Identity Services (GIS)、Vitest、Dexie/IndexedDB

**Spec:** `docs/superpowers/specs/2026-08-26-warm-token-popup-fix-design.md`

## Global Constraints

- 版本 → **2.5.1**（PATCH）。單一事實來源 = `frontend/package.json` 的 `version`，只改這一處。
- 型別檢查一律 `npx tsc -b`，🔴 **不可用 `tsc --noEmit`**（solution-style tsconfig 會檢查零個檔案、永遠 exit 0）。
- 所有給使用者看的同步失敗訊息**必須含「本機」二字**（由 `lib/syncDiag.test.ts` 既有斷言鎖定）。
- 關鍵商業邏輯一律加**繁體中文**註解，說明「為什麼」而不只是「做什麼」。
- `reportError` 的 `extra` **不經** `redact()`：只能放數字／布林／scope 字串，**絕不放** email、試算表 ID、access token、任何金額。
- 每個 Task 結束都 commit，訊息格式 `feat/fix/docs/refactor: 簡述`。
- 🔴 `syncAll` 必須維持**零參數**（它同時是 `window.addEventListener('online', …)` 的 listener 與 React `onClick` handler，加參數會把 Event 物件吃進去）。
- 分支 `fix/warm-token-popup`，由 `main` 切出。

---

### Task 1: `lib/syncDiag.ts` — popup 判斷與重新連線文案（純函式）

**Files:**
- Modify: `frontend/src/lib/syncDiag.ts`（在檔尾 `writeFailureMessage` 之後追加）
- Test: `frontend/src/lib/syncDiag.test.ts`（在檔尾 `describe` 內追加）

**Interfaces:**
- Consumes: 無（本 Task 為最底層）
- Produces:
  - `isPopupBlocked(err: unknown): boolean`
  - `NEEDS_RECONNECT_MESSAGE: string`
  - `RECONNECT_ACTION_LABEL: string`

**為什麼放在 `syncDiag.ts` 而不是寫在 hook 裡：** 2.4.1 事故的根因就是「解析邏輯夾在非純函式模組裡 = 零測試覆蓋」。文案與判斷放進這支純函式模組，既有的 `syncDiag.test.ts` 才蓋得到，「訊息必須含本機」那條紅線才鎖得住。

- [ ] **Step 1: 寫失敗的測試**

在 `frontend/src/lib/syncDiag.test.ts` 檔尾（最外層 `describe` 的結尾 `})` 之前）加入：

```ts
  // ── 2.5.1：popup 被瀏覽器擋下 ────────────────────────────────────────────
  it('認得 GIS 的 popup 被擋錯誤', () => {
    expect(isPopupBlocked(new Error('popup_failed_to_open'))).toBe(true)
    expect(isPopupBlocked(new Error('popup_closed'))).toBe(true)
    expect(isPopupBlocked('popup_failed_to_open')).toBe(true)
  })

  it('其他同步失敗不會被誤判成 popup 問題', () => {
    expect(isPopupBlocked(new Error('Sheets GET /<id> → 403: PERMISSION_DENIED'))).toBe(false)
    expect(isPopupBlocked(new Error('Failed to fetch'))).toBe(false)
    // 只認完整的錯誤型別字串，不因為出現 "popup" 三個字就成立
    expect(isPopupBlocked(new Error('opening popup for consent'))).toBe(false)
  })

  it('非 Error 物件不會爆', () => {
    expect(isPopupBlocked(null)).toBe(false)
    expect(isPopupBlocked(undefined)).toBe(false)
    expect(isPopupBlocked({ type: 'popup_failed_to_open' })).toBe(false)
  })

  it('重新連線訊息同樣必須明講「本機」', () => {
    // 🔴 與 writeFailureMessage 同一條紅線：客戶最怕的是帳目不見了
    expect(NEEDS_RECONNECT_MESSAGE).toContain('本機')
  })
```

並把檔首第 2 行的 import 補上兩個新符號（現況為
`import { classifyWriteFailure, isPermissionDenied, writeFailureMessage, type WriteDiagnostics } from './syncDiag'`）：

```ts
import {
  classifyWriteFailure,
  isPermissionDenied,
  writeFailureMessage,
  isPopupBlocked,
  NEEDS_RECONNECT_MESSAGE,
  type WriteDiagnostics,
} from './syncDiag'
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/syncDiag.test.ts`
Expected: FAIL —「isPopupBlocked is not a function」／「NEEDS_RECONNECT_MESSAGE is not defined」

- [ ] **Step 3: 實作**

在 `frontend/src/lib/syncDiag.ts` 檔尾追加：

```ts
// ── 需要使用者點一下才能重新連線（2.5.1）──────────────────────────────────
//
// 背景：GIS 的 tokenClient **沒有靜默模式**，requestAccessToken 一定開 popup 視窗；
// prompt:'' 只是叫 Google 別在 popup 裡顯示同意／選帳號畫面，popup 本身照開。
// 瀏覽器只允許使用者手勢觸發的 popup，所以從啟動 effect 或 setInterval 呼叫
// 必定被擋 → popup_failed_to_open。舊的 warmToken() 正是這樣被呼叫的。
//
// 這不是「錯誤」，是 token 的正常生命週期（約 59 分鐘）走到底了，
// 需要使用者點一下。因此它不寄信、也不觸發同步暫停。

/** GIS error_callback 會丟出的 popup 類錯誤型別（lib/sheets.ts 以 err.type 包成 Error） */
const POPUP_BLOCKED_TYPES = ['popup_failed_to_open', 'popup_closed']

/**
 * 這個錯誤是「popup 開不起來／被關掉」嗎？
 * popup_closed（使用者自己關掉授權視窗）與 popup_failed_to_open（被瀏覽器擋）
 * 成因不同但補救方式相同：請使用者再點一次。
 * 非 Error 值一律安全轉字串，不得拋例外。
 */
export function isPopupBlocked(err: unknown): boolean {
  let msg: string
  if (err instanceof Error) msg = err.message
  else if (typeof err === 'string') msg = err
  else return false
  return POPUP_BLOCKED_TYPES.some((t) => msg.includes(t))
}

/**
 * 🔴 與 writeFailureMessage 同一條紅線：必須明講「帳目還在本機」。
 * 也必須明講「瀏覽器不允許自動跳出」——否則客戶會以為是 App 壞了或自己被登出。
 */
export const NEEDS_RECONNECT_MESSAGE =
  '與 Google 的連線已到期，帳目目前只存在本機（沒有遺失）。瀏覽器不允許 App 自動跳出授權視窗，請點下方按鈕重新連線，就會立刻補傳。'

/** 重新連線按鈕文案。用「重新連線」而非「立即重試」——重試會讓人以為再等等就會自己好。 */
export const RECONNECT_ACTION_LABEL = '重新連線'
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/syncDiag.test.ts`
Expected: PASS（原有測試全綠 + 新增 4 個）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/syncDiag.ts frontend/src/lib/syncDiag.test.ts
git commit -m "feat: 新增 isPopupBlocked 與重新連線文案（純函式，2.5.1）"
```

---

### Task 2: `lib/sheets.ts` — `hasValidToken` / `reconnect`，刪除 `warmToken`

**Files:**
- Modify: `frontend/src/lib/sheets.ts:107-111`（`warmToken` 整段替換）
- Test: `frontend/src/lib/sheets.test.ts`（擴充 `loadSheets` harness + 新增 describe）

**Interfaces:**
- Consumes: 無
- Produces:
  - `hasValidToken(): boolean` — 純查詢，不碰網路、不開 popup
  - `reconnect(): Promise<string>` — 只能從使用者手勢同步呼叫
  - **移除** `warmToken(): Promise<void>`

🔴 **本 Task 完成後 `npx tsc -b` 會失敗**（`useSyncService.ts` 仍 import 已刪除的 `warmToken`），這是預期的——Task 3 才會修好。Step 6 的型別檢查刻意只驗 Vitest 綠。

- [ ] **Step 1: 擴充測試 harness 以支援「token 已過期」情境**

`frontend/src/lib/sheets.test.ts` 的 `loadSheets` 目前硬寫一個有效 token。改為可指定：

```ts
// 🔴 一律動態 import：sheets.ts 在 module load 當下就從 localStorage 還原 token，
//    localStorage 必須先 stub 好、且每個測試都要 resetModules，否則 token 狀態會跨測試殘留。
// opts.tokenExpiresInMs：預設 1 小時後過期；傳負值可模擬「token 已失效」（2.5.1）
async function loadSheets(route: Route, opts?: { tokenExpiresInMs?: number }) {
  calls = []
  // 🔴 CLIENT_ID 在 sheets.ts 是 module 載入時從 import.meta.env 讀的，而 .env 有進 .gitignore：
  //    不 stub 的話，換一台機器 clone 下來 CLIENT_ID 就是空字串，initGoogleAuth() 會直接 return，
  //    測試會以「tokenClient 沒建起來」的假原因失敗。測試不該依賴本機才有的檔案。
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
  const ls = makeLocalStorage()
  ls.setItem('gsheets_tk', 'fake-token')
  ls.setItem('gsheets_tk_exp', String(Date.now() + (opts?.tokenExpiresInMs ?? 3600_000)))
  vi.stubGlobal('localStorage', ls)
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url: String(url), method, body })
    const payload = route(String(url), method)
    if (payload === undefined) {
      return { ok: false, status: 404, text: async () => 'unrouted', json: async () => ({}) }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload }
  })
  vi.resetModules()
  return { sheets: await import('./sheets'), ls }
}
```

並把既有的 `afterEach`（`sheets.test.ts:52`）補上 env 清理：

```ts
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
```

- [ ] **Step 2: 寫失敗的測試**

在 `frontend/src/lib/sheets.test.ts` 檔尾追加：

```ts
// ── Auth token 狀態（2.5.1）────────────────────────────────────────────────
// 這組測試鎖的是本次事故的核心規則：**背景路徑絕不可以開 popup**。
describe('hasValidToken / reconnect', () => {
  const noRoute: Route = () => undefined

  it('localStorage 有未過期 token → true', async () => {
    const { sheets } = await loadSheets(noRoute)
    expect(sheets.hasValidToken()).toBe(true)
  })

  it('token 已過期 → false', async () => {
    const { sheets } = await loadSheets(noRoute, { tokenExpiresInMs: -1000 })
    expect(sheets.hasValidToken()).toBe(false)
  })

  it('🔴 hasValidToken 不打網路、不呼叫 requestAccessToken（不得開 popup）', async () => {
    const { sheets } = await loadSheets(noRoute, { tokenExpiresInMs: -1000 })

    // 假的 GIS：只記錄有沒有人要求開授權視窗
    const requested: unknown[] = []
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: () => ({
            requestAccessToken: (cfg: unknown) => { requested.push(cfg) },
          }),
        },
      },
    })
    sheets.initGoogleAuth()

    expect(sheets.hasValidToken()).toBe(false)
    // 這兩行就是整個修正的規格：查詢 token 狀態不得有任何副作用
    expect(requested).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('reconnect 會要求 GIS 開授權視窗，且用 prompt:\'\'（不逼客戶重選帳號）', async () => {
    const { sheets } = await loadSheets(noRoute, { tokenExpiresInMs: -1000 })
    const requested: any[] = []
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: () => ({
            requestAccessToken: (cfg: unknown) => { requested.push(cfg) },
          }),
        },
      },
    })
    sheets.initGoogleAuth()

    void sheets.reconnect()   // 不 await：stub 不會回呼，Promise 永遠 pending
    expect(requested).toEqual([{ prompt: '' }])
  })

  it('GIS 尚未初始化時 reconnect 明確 reject（不靜默失敗）', async () => {
    const { sheets } = await loadSheets(noRoute, { tokenExpiresInMs: -1000 })
    await expect(sheets.reconnect()).rejects.toThrow('GIS not initialised')
  })

  it('🔴 warmToken 已移除（背景預取 token 的路徑不得復活）', async () => {
    const { sheets } = await loadSheets(noRoute)
    expect((sheets as Record<string, unknown>).warmToken).toBeUndefined()
  })
})
```

若檔案上方尚未 import `describe`，依既有 import 行補齊（現有為 `import { describe, it, expect, vi, afterEach } from 'vitest'`，已足夠）。

- [ ] **Step 3: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/sheets.test.ts`
Expected: FAIL —「sheets.hasValidToken is not a function」

- [ ] **Step 4: 實作**

把 `frontend/src/lib/sheets.ts` 中這段：

```ts
// 啟動時靜默預取 token — 把可能的授權彈窗集中在 app 啟動，而非分散在各操作中
export async function warmToken(): Promise<void> {
  if (tokenInfo && Date.now() < tokenInfo.expires_at) return
  await acquireToken()
}
```

整段替換為：

```ts
/**
 * 目前是否持有未過期的 access token。
 * 🔴 純查詢：不碰網路、不呼叫 GIS、不開 popup——背景路徑（啟動、自動同步）
 *    只能用這支判斷該不該往下走。
 */
export function hasValidToken(): boolean {
  return !!tokenInfo && Date.now() < tokenInfo.expires_at
}

/**
 * 重新取得 access token。
 * 🔴 **只能從使用者手勢（click handler）中、在任何 await 之前同步呼叫。**
 *
 * 為什麼需要這支、以及為什麼舊的 warmToken() 被拿掉（2.5.1）：
 * GIS 的 tokenClient 沒有靜默模式，requestAccessToken 一定開 popup 視窗；
 * prompt:'' 只是叫 Google 別在 popup 裡顯示同意／選帳號畫面（已授權就秒開秒關），
 * popup 本身照開。而瀏覽器只允許使用者手勢觸發的 popup，
 * 從啟動 useEffect 或 setInterval 呼叫必定被擋 → popup_failed_to_open。
 * 舊的 warmToken() 正是這樣被呼叫的：它的 popup 路徑從來沒成功過，
 * 只在每次 token 過期後的冷啟動丟錯，並讓那一輪 syncAll 整個不跑（靜默同步失敗）。
 *
 * 用 prompt:'' 而不是 signIn() 的 'select_account'：客戶只是 token 到期，
 * 不該被逼著重選一次 Google 帳號。
 */
export function reconnect(): Promise<string> {
  return acquireToken('')
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/sheets.test.ts`
Expected: PASS

- [ ] **Step 6: 跑全部單元測試**

Run: `cd frontend && npm test -- --run`
Expected: PASS（`npx tsc -b` 此時仍會因 `useSyncService.ts` 的舊 import 而失敗，Task 3 修）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/sheets.ts frontend/src/lib/sheets.test.ts
git commit -m "feat: sheets 新增 hasValidToken/reconnect，移除做不到靜默的 warmToken（2.5.1）"
```

---

### Task 3: `hooks/useSyncService.ts` — 啟動不開 popup、失效有提示、重試帶手勢

**Files:**
- Modify: `frontend/src/hooks/useSyncService.ts`（import 區、`syncError` state:98、init effect:117-160、`handleSyncFailure`、`runSync` 前置守衛、`retryNow`:411）

**Interfaces:**
- Consumes: `hasValidToken()`、`reconnect()`（Task 2）；`isPopupBlocked`、`NEEDS_RECONNECT_MESSAGE`、`RECONNECT_ACTION_LABEL`（Task 1）
- Produces: `syncError` 的形狀變為 `{ kind: WriteFailureKind; message: string; retryLabel?: string } | null`（Task 4 的 `App.tsx` 會讀 `retryLabel`）

- [ ] **Step 1: 換掉 import**

把 `from '../lib/sheets'` 的 import 清單中的 `warmToken,` 改為 `hasValidToken,` 與 `reconnect,`：

```ts
import {
  initGoogleAuth,
  hasValidToken,
  reconnect,
  isGoogleConfigured,
  // …其餘維持原樣
} from '../lib/sheets'
```

把 `from '../lib/syncDiag'` 的 import 補上三個新符號：

```ts
import {
  classifyWriteFailure,
  isPermissionDenied,
  writeFailureMessage,
  isPopupBlocked,
  NEEDS_RECONNECT_MESSAGE,
  RECONNECT_ACTION_LABEL,
  type WriteDiagnostics,
  type WriteFailureKind,
} from '../lib/syncDiag'
```

- [ ] **Step 2: `syncError` 狀態加上 `retryLabel`**

`useSyncService.ts:98` 的型別參數改為：

```ts
  const [syncError, setSyncError]     = useState<{ kind: WriteFailureKind; message: string; retryLabel?: string } | null>(() => {
```

（初始值 lambda 內容不動——從持久化暫停狀態還原的那段。）

- [ ] **Step 3: 加入 `showReconnectNeeded` helper**

在 `handleSyncFailure` 定義之前插入：

```ts
  // 需要使用者點一下才能重新連線（2.5.1）。
  // 🔴 kind 刻意用 'UNKNOWN'：它不在 shouldPauseFor 的持久性成因清單內，
  //    所以**不會觸發同步暫停**。這不是「壞掉」，只是 token 到期要點一下；
  //    把整個同步暫停掉反而害帳目更晚上雲。
  const showReconnectNeeded = useCallback(() => {
    setSyncError({
      kind: 'UNKNOWN',
      message: NEEDS_RECONNECT_MESSAGE,
      retryLabel: RECONNECT_ACTION_LABEL,
    })
  }, [])
```

- [ ] **Step 4: `handleSyncFailure` 開頭加防禦縱深**

在 `handleSyncFailure` 函式主體最前面（跑診斷探針之前）插入：

```ts
    // 防禦縱深（2.5.1）：popup 被擋不是「同步失敗」，是「需要點一下」。
    // 正常路徑已被 runSync 的 token 守衛擋住；這裡負責接住尚未做 gesture-first
    // 處理的路徑（restoreFromSheets / syncCategories）。
    // 不寄信：token 到期是正常生命週期，不是程式錯誤，寄了只會洗版。
    // 也不能落到 UNKNOWN 的預設訊息「稍後會自動重試」——它不會自己好，那是騙人的。
    if (isPopupBlocked(err)) { showReconnectNeeded(); return }
```

- [ ] **Step 5: 改寫啟動 effect（移除 popup 預取與 50 分鐘定時器）**

把 `useSyncService.ts:117-160` 的整段 effect 替換為：

```ts
  useEffect(() => {
    const init = () => {
      initGoogleAuth()
      if (!getSignedInEmail()) return

      // 2.5.1：啟動時**不再**嘗試取 token。
      // 舊寫法 warmToken().then(() => syncAll()) 在 token 過期時會呼叫 GIS
      // requestAccessToken，但啟動 effect 沒有 user activation → popup 必被擋
      // → 整輪 syncAll 不跑，而 .catch 只寄信給開發者、客戶完全無感。
      // 帳目就這樣一直停在本機 PENDING，老闆卻以為早就上雲了。
      //
      // 也移除了原本每 50 分鐘的「靜默刷新」定時器：GIS 瀏覽器端是 implicit flow，
      // 沒有 refresh token，不存在任何靜默刷新途徑；定時器唯一的效果是每 50 分鐘
      // 產生一個被擋的 popup 與一封錯誤信。
      if (hasValidToken()) syncAll()
      else showReconnectNeeded()
    }

    if ((window as any).google?.accounts) { init(); return }

    // GIS script 尚未載入完成 → 輪詢等它
    const id = setInterval(() => {
      if ((window as any).google?.accounts) { clearInterval(id); init() }
    }, 300)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

🔴 依存陣列維持 `[]`（掛載時跑一次）——與既有行為一致，不要改成含 `syncAll` 的陣列，否則每次 `syncAll` 重建都會重跑初始化。

- [ ] **Step 6: `runSync` 前置守衛加 token 檢查**

在 `runSync` 內既有的 `lockRef / navigator.onLine / getSignedInEmail()` 守衛**之後**、暫停閘門之前插入：

```ts
    // 🔴 token 失效就不要往下打 API（2.5.1）：底下的 acquireToken 會呼叫 GIS
    //    requestAccessToken，而此處必定已離開 user gesture（都在 await 之後），
    //    popup 一定被擋。與其讓整輪同步在深處炸掉再回報一個客戶看不懂的錯誤，
    //    不如直接請他點一下。手動重試（retryNow）已在點擊當下先 reconnect()，
    //    走到這裡時 hasValidToken() 為 true，不受影響。
    if (!hasValidToken()) { showReconnectNeeded(); return }
```

- [ ] **Step 7: `retryNow` 改為 gesture-first**

把 `useSyncService.ts:411` 的 `retryNow` 替換為：

```ts
  // 🔴 手動重試：token 到期時必須**在任何 await 之前**同步呼叫 reconnect()，
  //    否則 transient user activation 就沒了、popup 會被瀏覽器擋下。
  //    這是整個修正的關鍵——GIS 只有在使用者手勢中才開得起授權視窗。
  const retryNow = useCallback(() => {
    if (getSignedInEmail() && !hasValidToken()) {
      reconnect()
        .then(() => { void runSync(true) })
        .catch(err => {
          showReconnectNeeded()
          // popup 被擋／使用者自己關掉授權視窗 → 不寄信（不是程式錯誤，寄了只會洗版）
          if (!isPopupBlocked(err)) reportError('auth/reconnect', err)
        })
      return
    }
    void runSync(true)
  }, [runSync, showReconnectNeeded])
```

- [ ] **Step 8: 型別檢查 + 全部測試**

Run: `cd frontend && npx tsc -b && npm test -- --run`
Expected: tsc 無輸出（通過）、Vitest 全綠

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks/useSyncService.ts
git commit -m "fix: 啟動不再嘗試開授權 popup，token 失效改顯示重新連線提示（2.5.1）"
```

---

### Task 4: 橫幅按鈕文案 — `SyncErrorBanner` + `App.tsx`

**Files:**
- Modify: `frontend/src/components/SyncErrorBanner.tsx:15-29`
- Modify: `frontend/src/App.tsx:92-99`

**Interfaces:**
- Consumes: `syncError.retryLabel`（Task 3）
- Produces: `SyncErrorBanner` 新增選用 prop `retryLabel?: string`

**為什麼要這個 prop：** 現行按鈕文案由 `kind` 推導，`UNKNOWN` 會顯示「立即重試」——但這個情境不是「重試」（重試不會成功），是「重新連線」。文案講錯，客戶會一直按同一顆按鈕等它自己好。

- [ ] **Step 1: 加入選用 prop**

`SyncErrorBanner.tsx` 的簽章與 `retryLabel` 計算改為：

```tsx
export function SyncErrorBanner({ kind, message, paused, retrying, retryLabel, onRetry, onDismiss }: {
  kind: WriteFailureKind
  message: string
  /** 自動同步是否已因此成因暫停（2.4.0） */
  paused: boolean
  /** 同步進行中（重試按鈕改顯示「重試中…」並停用） */
  retrying: boolean
  /** 覆寫按鈕文案（2.5.1：需要重新連線時是「重新連線」，不是誤導的「立即重試」） */
  retryLabel?: string
  onRetry: () => void
  onDismiss: () => void
}) {
  // UNKNOWN = 成因不明（多半是暫時性網路問題），下次同步會自動重試 → 用較低調的說法
  const title = kind === 'UNKNOWN' ? '雲端同步暫時失敗' : '帳目尚未上傳到雲端'
  // 容量滿是「客戶自己動手清完才會好」的成因，按鈕文案直接對上那個動作；
  // 其他成因（權限／授權／未知）客戶不一定做了什麼，就只說「立即重試」。
  // 呼叫端給了 retryLabel 就以它為準（2.5.1 的「重新連線」）。
  const label = retryLabel ?? (kind === 'QUOTA_FULL' ? '我已清理完成，立即重試' : '立即重試')
```

並把按鈕內容 `{retrying ? '重試中…' : retryLabel}` 改為 `{retrying ? '重試中…' : label}`。

- [ ] **Step 2: `App.tsx` 傳遞**

在 `App.tsx` 的 `<SyncErrorBanner …>` 加一行（放在 `retrying` 之後）：

```tsx
        retryLabel={syncError.retryLabel}
```

- [ ] **Step 3: 型別檢查 + 測試**

Run: `cd frontend && npx tsc -b && npm test -- --run`
Expected: 皆通過

- [ ] **Step 4: 手動驗收（`npm run dev`，自動連測試表）**

Run: `cd frontend && npm run dev`

驗收腳本（🔴 這是本次唯一能證明修好的一步——單元測試蓋不到瀏覽器的 popup 政策）：
1. 登入 Google，確認同步正常、無橫幅。
2. DevTools Console 執行 `localStorage.setItem('gsheets_tk_exp', '1')` 模擬 token 過期。
3. **重新整理頁面** → 應看到琥珀色橫幅「與 Google 的連線已到期…」、按鈕寫「重新連線」；
   Console **不應**出現 `popup_failed_to_open`。
4. 記一筆帳 → 橫幅仍在、Console 仍無 popup 錯誤（守衛生效，沒有背景 popup）。
5. 點「重新連線」→ Google 授權視窗**正常開啟**（有手勢）→ 授權後橫幅消失、帳目上傳。
6. 到設定頁按「同步」→ 同樣走 `retryNow`，行為一致。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SyncErrorBanner.tsx frontend/src/App.tsx
git commit -m "feat: 同步橫幅支援自訂按鈕文案，重新連線不再顯示為「立即重試」（2.5.1）"
```

---

### Task 5: 版本號 + 文件同步 + 合併

**Files:**
- Modify: `frontend/package.json`（`version`）
- Modify: `CLAUDE.md`、`AGENTS.md`、`README.md`

**Interfaces:**
- Consumes: Task 1–4 的成果
- Produces: 可部署的 `v2.5.1`

- [ ] **Step 1: bump 版本**

`frontend/package.json` 的 `"version": "2.5.0"` → `"2.5.1"`。
（🔴 單一事實來源，只改這一處；設定頁的 `__APP_VERSION__` 由 `vite.config.ts` 注入。）

- [ ] **Step 2: 更新 `CLAUDE.md`**

- 檔頭 `> **App Version**: 2.5.0` → `2.5.1`，`Last Updated` → `2026-08-26`。
- 「版本號規則」段落補一行：
  `` `2.5.1` = 修 warmToken 啟動 popup 被擋 + 靜默同步失敗（PATCH）。 ``
- 「Development Status」清單追加條目（緊接 2.5.0 之後）：

```markdown
- **修 warmToken 啟動 popup 被擋 + 靜默同步失敗（2.5.1）**: ✅ 正式站持續寄回 `auth/warmToken` → `popup_failed_to_open`。根因：**GIS 的 tokenClient 沒有靜默模式**——`requestAccessToken` 一定開 popup 視窗，`prompt:''` 只是叫 Google 別在 popup 內顯示同意／選帳號畫面，popup 本身照開；而瀏覽器只允許使用者手勢觸發的 popup，`warmToken()` 卻是從啟動 `useEffect`（`useSyncService.ts:141`）與每 50 分鐘的 `setInterval` 呼叫的 → 必定被擋。`sheets.ts` 那句「啟動時靜默預取 token」的註解**建立在錯誤前提上、從未成立**，只在「快取 token 仍有效、提早 return」時看起來正常（那時它根本沒做事）。token 壽命 `expires_in - 60` ≈ 59 分鐘 → **距上次取得超過約 59 分鐘的每一次冷啟動**都中，也就是「早上打開 App」。🔴 **真正的傷不是那封信，是又一次靜默同步失敗**：`warmToken().then(() => syncAll())` 一 reject，`syncAll()` **整輪不跑**，而 `.catch` 只有 `reportError`、**沒有 `setSyncError`** → 客戶完全無感；且**不會自己好**（之後每個 `syncAll` 觸發點走到 `acquireToken` 都在 `await` 之後，手勢早沒了），要到使用者主動點「登入」才恢復——同 2.2.2／2.4.0 那條「帳目停在本機 PENDING、老闆以為早就上雲」的老病。**為什麼現在才收到信**：`3a5efc0`（v2.4.0）把該處的 `.catch(() => {})` 改成 `reportError`，在那之前這個失敗被完全吞掉。**修法**：`sheets.ts` 刪除 `warmToken()`（唯一呼叫端是 `useSyncService`），改為 `hasValidToken()`（純查詢，不碰網路不開 popup）與 `reconnect()`（=`acquireToken('')`，🔴 **只能從 click handler、在任何 `await` 之前同步呼叫**；用 `prompt:''` 而非 `signIn()` 的 `select_account`，免得逼客戶重選帳號）；**移除 50 分鐘刷新定時器**——GIS 瀏覽器端是 implicit flow、**沒有 refresh token**，不存在靜默刷新途徑，該定時器唯一效果是每 50 分鐘產生一個被擋的 popup。啟動改 `hasValidToken() ? syncAll() : showReconnectNeeded()`；`runSync` 加 token 守衛（不往下打 API）；`retryNow` 改 **gesture-first**（先 `reconnect()` 再 `runSync(true)`）。使用者可見：沿用既有 `syncError`／`SyncErrorBanner` 管線（零新管線），`kind` **刻意用 `UNKNOWN`**——不在 `shouldPauseFor` 清單內故**不觸發同步暫停**（只是要點一下，停掉同步反而害帳目更晚上雲）；`SyncErrorBanner` 新增選用 `retryLabel` prop，文案從誤導的「立即重試」改為「重新連線」。防禦縱深：`syncDiag.ts` 新增純函式 `isPopupBlocked`（認 `popup_failed_to_open`／`popup_closed`），`handleSyncFailure` 開頭攔截 → 顯示重新連線提示並 return、**不寄信**（token 到期是正常生命週期，不是程式錯誤），覆蓋 `restoreFromSheets`／`syncCategories` 等未做 gesture-first 的路徑。訊息 `NEEDS_RECONNECT_MESSAGE` 放進 `syncDiag.ts` 而非 hook 內——2.4.1 的教訓是「邏輯夾在非純函式模組＝零測試覆蓋」，放這裡既有的「訊息必須含『本機』」紅線才鎖得住。⚠️ **非目標**：`restoreFromSheets`／`syncCategories` 等按鈕**未**逐一改成 gesture-first（由防禦縱深覆蓋成正確提示），留為後續。spec：`docs/superpowers/specs/2026-08-26-warm-token-popup-fix-design.md`。
```

- 檔案樹的 `lib/sheets.ts` 說明補「+ `hasValidToken`／`reconnect`（2.5.1，🔴 `reconnect` 只能從使用者手勢呼叫）」；`lib/syncDiag.ts` 說明補「+ `isPopupBlocked`／`NEEDS_RECONNECT_MESSAGE`（2.5.1）」；`components/SyncErrorBanner.tsx` 說明補「2.5.1 加 `retryLabel`」。
- 「Google Auth」段落把「`warmToken()` — 啟動時靜默預取，每 50 分鐘自動刷新」整條**刪除**，改為：

```markdown
- 🔴 **沒有靜默取 token 這回事（2.5.1）**：GIS `requestAccessToken` 一定開 popup，`prompt:''` 只影響 popup 內容。背景路徑（啟動 effect、定時器、任何 `await` 之後）只能用 `hasValidToken()` 純查詢；要取新 token 一律經 `reconnect()`，且**必須在 click handler 內、任何 `await` 之前**呼叫，否則 popup 會被瀏覽器擋下（`popup_failed_to_open`）。瀏覽器 implicit flow **沒有 refresh token**，不要再嘗試寫任何「自動刷新」。
```

- [ ] **Step 3: 同步 `AGENTS.md` 與 `README.md`**

`AGENTS.md` 為 `CLAUDE.md` 的鏡像 → 套用相同修改。
`README.md` 更新版本標頭為 `v2.5.1`，並在「Recent Versions」加一行摘要：
`- **v2.5.1** — 修正 Google 授權視窗在 App 啟動時被瀏覽器擋下、導致該次開啟完全沒有同步（且客戶看不到任何提示）的問題。`

- [ ] **Step 4: 最終驗證**

Run: `cd frontend && npx tsc -b && npm test -- --run && npm run build`
Expected: 三者皆通過

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json CLAUDE.md AGENTS.md README.md
git commit -m "docs: bump 2.5.1 + 同步 CLAUDE.md / AGENTS.md / README.md"
```

- [ ] **Step 6: 合併與部署（🔴 需使用者確認後才執行）**

```bash
git checkout main
git merge --no-ff fix/warm-token-popup -m "Merge branch 'fix/warm-token-popup' — 修 warmToken 啟動 popup 被擋 + 靜默同步失敗（2.5.1）"
git tag v2.5.1
git push origin main --tags
git branch -d fix/warm-token-popup
```

- [ ] **Step 7: 上線後觀察**

`auth/warmToken` 的信應完全停止（該 context 已不存在）。
若改為收到 `auth/reconnect`，代表 `reconnect()` 在**有手勢**的情況下仍失敗——那是新成因（非 popup 類，`isPopupBlocked` 已濾掉 popup 類不寄信），需另行診斷。

---

## Self-Review

**1. Spec 覆蓋**
- §2.2 A（拔掉背景 popup）→ Task 2（`hasValidToken`／`reconnect`／刪 `warmToken`）+ Task 3 Step 5/6（啟動路徑、移除定時器、`runSync` 守衛）✅
- §2.3 B（使用者可見 + gesture-first）→ Task 1（文案）+ Task 3 Step 3/7 + Task 4（橫幅按鈕）✅
- §2.4 C（防禦縱深）→ Task 1（`isPopupBlocked`）+ Task 3 Step 4 ✅
- §3 非目標 → Task 5 的 CLAUDE.md 條目已明載 ✅
- §4 待確認（UA 為 Windows 桌面）→ 不影響修法，保留在 spec，不需任務 ✅

**2. Placeholder 掃描**：無 TBD／「適當處理錯誤」／「類似 Task N」；每個程式步驟都有可直接套用的完整程式碼。✅

**3. 型別一致性**
- `hasValidToken(): boolean`、`reconnect(): Promise<string>` — Task 2 定義，Task 3 Step 1/5/6/7 使用，簽章一致 ✅
- `isPopupBlocked(err: unknown): boolean` — Task 1 定義，Task 3 Step 4/7 使用 ✅
- `NEEDS_RECONNECT_MESSAGE` / `RECONNECT_ACTION_LABEL` — Task 1 定義，Task 3 Step 3 使用 ✅
- `syncError` 加 `retryLabel?: string` — Task 3 Step 2 定義，Task 4 Step 1/2 消費 ✅
- Task 4 Step 1 內部變數改名為 `label`，避免與新 prop `retryLabel` 撞名 ✅
- `syncAll` 維持零參數，未被本計畫改動 ✅
