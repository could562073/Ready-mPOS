# warmToken 啟動 popup 被擋 + 靜默同步失敗 — 設計文件

- **日期**：2026-08-26
- **版本**：2.5.1（PATCH — 修正，含行為變更；比照 2.4.1 前例）
- **分支**：`fix/warm-token-popup`
- **觸發**：正式站持續寄回錯誤信 `auth/warmToken` → `popup_failed_to_open`

---

## 1. 問題

錯誤信內容（2026-08-26 05:11 UTC，Windows Chrome 151）：

```
Context: auth/warmToken
Message: popup_failed_to_open
Stack:  vv.error_callback → vv.requestAccessToken (gsi/client)
        → new Promise → Wn(acquireToken) → Gn(warmToken) → n(init)
```

### 1.1 根因

`hooks/useSyncService.ts:141`（App 啟動 effect）：

```ts
warmToken().then(() => syncAll()).catch(err => reportError('auth/warmToken', err))
```

`warmToken()` → `acquireToken('')` → `tokenClient.requestAccessToken({ prompt: '' })`。

🔴 **GIS 的 token client 沒有靜默模式。** `requestAccessToken` **一定**開 popup 視窗；
`prompt: ''` 只是叫 Google 別在 popup 內顯示同意／選帳號畫面（已授權就秒開秒關），
**popup 本身照開**。瀏覽器只允許使用者手勢（user activation）觸發的 popup，
而啟動 effect 與 `setInterval` 都沒有手勢 → 必定被擋 → `popup_failed_to_open`。

`sheets.ts:108` 的註解「啟動時靜默預取 token」**建立在錯誤前提上，從未成立**。
這條路徑只在「快取 token 仍有效、提早 return」時看起來正常——那時它根本沒做事。

### 1.2 觸發條件 = 最常見情境

`warmToken()` 開頭 `if (tokenInfo && Date.now() < tokenInfo.expires_at) return`，
token 壽命 `expires_in - 60` ≈ 59 分鐘。
→ **距上次取得 token 超過約 59 分鐘的每一次冷啟動**都會走進 popup、都會被擋。
也就是「早上打開 App」。

### 1.3 為什麼現在才收到信

`3a5efc0`（2026-08-14 23:15，v2.4.0 step 2）把此處的 `.catch(() => {})`
改為 `reportError`。在那之前這個失敗被完全吞掉。
信的頻率符合 `reportError` 的去重 + 12h 冷卻（同一裝置最多一天兩封）。

### 1.4 真正的傷害：又一次靜默同步失敗

- `warmToken()` reject → **`syncAll()` 整輪不跑**，那次開 App 從頭到尾沒同步。
- `.catch` 只有 `reportError`、**沒有 `setSyncError`** → 橫幅不出現、設定頁狀態不變
  → 客戶毫無感覺。
- **不會自己好**：之後 `syncAll` 的每個觸發點（存檔後、`online` 事件、設定頁「同步」鈕）
  走到 `acquireToken` 時都在 `await` 之後，一樣沒有 user activation、一樣被擋。
  要到使用者主動點「登入」（`signIn()` 直接在 click handler 內）才會恢復。

這是 2.2.2 / 2.4.0 一路在追的同一種病：**帳目安穩停在本機 PENDING，客戶以為早就上雲了。**

### 1.5 50 分鐘刷新定時器同樣無效

`useSyncService.ts:144` 的 `setInterval(warmToken, 50min)` 受相同限制：
瀏覽器的 transient user activation 只有數秒，定時器觸發時必定已無手勢。
GIS 瀏覽器端是 implicit flow、**沒有 refresh token**，不存在任何靜默刷新途徑。
此定時器唯一效果是每 50 分鐘產生一個被擋的 popup 與一封 `auth/warmTokenRefresh` 信。

---

## 2. 設計

### 2.1 原則

1. **背景路徑一律不開 popup。** 開不起來的東西就不要試。
2. **重新連線是使用者的一次點擊**，且必須在 click handler 內、任何 `await` **之前**呼叫。
3. **講給客戶聽**，沿用既有 `syncError` / `SyncErrorBanner` 管線（零新管線，
   同 2.5.0 處理 unreadable 的做法）。
4. **不因此寄信**：token 過期是正常生命週期，不是程式錯誤。

### 2.2 A — 拔掉背景 popup（治根）

`lib/sheets.ts`：

- **刪除 `warmToken()`**（唯一呼叫端是 `useSyncService.ts`，已確認）。
  名字說「warm」但它做不到，留著只會誤導。
- 新增 `hasValidToken(): boolean` — 純查詢，不碰網路、不開 popup。
- 新增 `reconnect(): Promise<string>` = `acquireToken('')`，
  文件明載「只能從使用者手勢同步呼叫」。

`hooks/useSyncService.ts`：

- 啟動 effect：`hasValidToken() ? syncAll() : showReconnectNeeded()`。
- **移除 50 分鐘刷新定時器**（見 1.5，它不可能成功）。
- `runSync` 加 token 守衛：`!hasValidToken()` → 顯示提示並 return，不往下打 API。

### 2.3 B — 讓使用者看得見、點得到（治真正的傷）

- `lib/syncDiag.ts` 新增 `NEEDS_RECONNECT_MESSAGE`（🔴 沿用既有紅線：**必須含「本機」**，
  由既有 Vitest 鎖定）與 `RECONNECT_ACTION_LABEL`。
- `syncError` 狀態加選用 `retryLabel`，`SyncErrorBanner` 加選用 `retryLabel` prop
  → 按鈕顯示「重新連線」而非誤導的「立即重試」。
- `retryNow` 改為 **gesture-first**：token 失效時先 `reconnect()`（同步呼叫，
  尚未 `await`，手勢仍在），成功後才 `runSync(true)`。

**kind 刻意用 `UNKNOWN`**：它不在 `shouldPauseFor` 的持久性成因清單內 →
不觸發同步暫停。這不是「壞掉」，只是需要一次點擊，暫停整個同步反而害帳目更晚上雲。

### 2.4 C — 防禦縱深

- `lib/syncDiag.ts` 新增 `isPopupBlocked(err)`（認 `popup_failed_to_open` 與
  `popup_closed`）。
- `handleSyncFailure` 開頭攔截：popup 被擋 → 顯示重新連線提示並 return，
  **不寄信**、不顯示「稍後會自動重試」（它不會自己好）。
  這道防線覆蓋 `restoreFromSheets` / `syncCategories` 等未做 gesture-first 處理的路徑。

---

## 3. 非目標（本次不做）

- **不**把 `restoreFromSheets` / `syncCategories` / 設定頁其他按鈕逐一改成 gesture-first。
  它們由 2.4 的防禦縱深覆蓋成正確提示，逐一改造屬於另一輪。
- **不**改動月份分頁或 `_config` 的讀寫語意（與 2.5.0 無關）。
- **不**處理多分頁共用 token 時 `tokenInfo` 模組狀態過時的既有問題。

---

## 4. 待確認

錯誤信 UA 為 **Windows 桌面 Chrome**，客戶主要使用 Android。
需向使用者確認來源裝置——若為客戶端，代表其冷啟動同步確實整段未執行；
若為開發／驗收機器，則客戶端影響待觀察。**此答案不影響修法**，兩者的修正相同。

---

## 5. 驗收時確認的事實（2026-08-27）

以下三點原為未知，由 2.5.1 的手動驗收實測答出，記在這裡免得下一輪重新猜。

### 5.1 `window.confirm()` **不會**吃掉 transient user activation

設定頁「從雲端還原」在呼叫 `onRestore()` 前有一個 `window.confirm()`
（`SettingsPage.tsx:204`）。實測：token 過期後點該鈕，Google 授權視窗**照常開啟**。

→ 所以 §3 非目標裡「不把 `restoreFromSheets` 逐一改成 gesture-first」是安全的：
那條路徑本來就還握著手勢。審查報告中建議抽 `withReconnect` helper 的 R-3
同樣不必做——沒有要修的東西。

### 5.2 GIS 的 COOP 警告是 Google 自己的，與本專案無關

點重新連線時 console 會出現
`client:138 Cross-Origin-Opener-Policy policy would block the window.closed call`。
已查證：本專案**沒有在任何地方設定 COOP 標頭**，且 `sheets.ts` 對
`initTokenClient` / `requestAccessToken` 的呼叫與 main 逐字相同——警告來自
`gsi/client` 自己輪詢 `popup.closed` 以偵測「使用者把授權視窗關掉」，main 上也有。

它真正的後果是：使用者手動關掉授權視窗時，GIS 可能偵測不到、
`popup_closed` 不觸發 → `reconnect()` 的 promise 永遠不 settle。

### 5.3 promise 不 settle **不會**卡住 UI（而修 M-3 反而會弄壞這件事）

🔴 `retryNow` 刻意**沒有**在 `reconnect()` 之前 `setSyncing(true)`——`setSyncing(true)`
在 `runSync` 裡面，而 `runSync` 只在 `.then()` 內才跑得到。所以 5.2 那種 promise
懸著的情況下 `syncing` 仍是 `false`：橫幅還在、按鈕維持可按的「重新連線」，
使用者再按一次就重開授權視窗。降級是溫和的。

⚠️ 這推翻了審查報告 M-3 的直覺修法。若日後真要加 `reconnecting` 狀態把按鈕
停用，**必須同時加逾時**，否則就是親手把上面這條溫和降級變成「按鈕永遠卡在
重試中…、使用者無路可走」。

---

## 6. 後續追蹤（非本輪）

- **橫幅在長頁面捲動後看不到**：`SyncErrorBanner` 位於捲動內容頂端
  （`App.tsx:92`，在所有 tab 條件式之外，確實跨頁顯示），但設定頁長 649 行、
  「從雲端還原」在 `:543`，使用者按下去時橫幅早已捲出畫面外，要切回較短的
  帳目頁才看得到。`git diff main..HEAD -- App.tsx` 證實版面配置與 main 逐字相同
  → **自 2.2.2 起就存在，非本輪造成**。修法會是 `position: sticky; top: 0`。
  客戶真實路徑是「開 App → 落在帳目頁（短）→ 橫幅立刻可見」，故不阻擋本輪。
