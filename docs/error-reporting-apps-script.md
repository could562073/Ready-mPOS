# 遠端錯誤回報（Google Apps Script 寄信）

> 讓正式站在**客戶裝置上**發生的同步／備份失敗，自動把錯誤訊息寄到你的信箱，
> 補足「純前端、無後端、看不到客戶端錯誤」的診斷缺口。

## 這是什麼

Ready-mPOS 無後端伺服器。當某位客戶的裝置備份／同步一直失敗（例如本次「每存一筆就跳資料升級中」），
你在自己這邊看不到任何錯誤。此機制用一支 **Google Apps Script Web App** 當極簡收件端：

```
客戶裝置（正式站 PWA）
  └─ 同步／備份失敗 → reportError()
        └─ fetch(VITE_ERROR_REPORT_URL, no-cors, text/plain)  ← fire-and-forget，失敗不影響記帳
              └─ Apps Script doPost(e) → MailApp.sendEmail(你的信箱, 錯誤內容)
```

前端程式：`frontend/src/lib/errorReport.ts`（`reportError(context, err, extra?)`）。
呼叫點：`useSyncService.ts` 的 `sync/backup`（備份失敗）與 `sync`（同步整體失敗）。

### 隱私與內容
回報**只**包含：`app / version / context / message / stack / userAgent / time` 與呼叫端明確帶入的 `extra`
（目前只有 `oldMonthCount` 舊格式月份數）。**不送**試算表 ID、**不送**任何帳目金額或列內容。

去重／冷卻：同一錯誤在同一次 App 開啟只寄一次，跨 session 12 小時內不重寄（避免洗版你的信箱）。

## 設定步驟（一次性，約 5 分鐘）

### 1. 建立 Apps Script Web App
1. 開 <https://script.google.com> → 新增專案。
2. 貼上下方 `Code.gs`，把 `RECIPIENT` 改成你要收信的 Gmail。
3. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」。
4. 設定：
   - **執行身分（Execute as）**：我（你自己）
   - **具有存取權的使用者（Who has access）**：**任何人（Anyone）**
     （客戶端未登入你的 Google 帳號，必須設 Anyone 才能匿名 POST。）
5. 部署 → 授權（第一次會要你同意 `MailApp` 寄信權限）→ 複製「網頁應用程式 URL」
   （形如 `https://script.google.com/macros/s/AKfy.../exec`）。

### 2. 填入前端 env 並重新部署
把 URL 貼進 `frontend/.env.production` 的 `VITE_ERROR_REPORT_URL=`：

```
VITE_ERROR_REPORT_URL=https://script.google.com/macros/s/AKfy.../exec
```

然後照正常流程 build 部署（`npm run build` / 推 main 觸發 CI）。dev/staging 不填 → 開發／驗收不會送。

> ⚠️ **URL 無法保密**：`VITE_` 變數在 build 時會內嵌進公開的 GitHub Pages bundle，任何人都能從
> 前端原始碼讀到這個 URL 並對它 POST。這是純前端回報的本質限制。若在意濫用（陌生人灌信），
> 用下方「選用：防濫用 token」把門檻提高（但因 token 同樣在公開 bundle 內，只能擋掉隨機爬蟲，
> 擋不了刻意者）。真的被灌爆時，最有效的處置是在 Apps Script 後台**重新部署換一個新 URL**。

### 3. 測試
```bash
curl -L -X POST '你的_exec_URL' \
  -H 'Content-Type: text/plain' \
  --data '{"app":"Ready-mPOS","context":"test","message":"hello from curl"}'
```
幾秒內信箱應收到一封標題含 `[Ready-mPOS]` 的信。

## Code.gs

```javascript
// Ready-mPOS 遠端錯誤回報收件端（Google Apps Script Web App）
// 部署：執行身分＝我、存取權＝任何人。收到 POST 就把內容寄到 RECIPIENT。
var RECIPIENT = 'YOUR_EMAIL@gmail.com'; // ← 改成你的收信信箱

// var REQUIRED_TOKEN = '';  // 選用防濫用：設一段隨機字串，並讓前端在 payload 帶同一個 token（見下方說明）

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '{}';
    var data = {};
    try { data = JSON.parse(raw); } catch (_) { data = { message: raw }; }

    // 選用 token 檢查（預設關閉）：
    // if (typeof REQUIRED_TOKEN === 'string' && REQUIRED_TOKEN && data.token !== REQUIRED_TOKEN) {
    //   return ContentService.createTextOutput('forbidden');
    // }

    var subject = '[' + (data.app || 'Ready-mPOS') + '] '
      + (data.context || 'error') + ' — ' + (data.version || '');

    var body = [
      'App:      ' + (data.app || ''),
      'Version:  ' + (data.version || ''),
      'Context:  ' + (data.context || ''),
      'Time:     ' + (data.time || ''),
      'UA:       ' + (data.ua || ''),
      '',
      'Message:',
      (data.message || ''),
      '',
      'Extra:    ' + JSON.stringify(data.extra || {}),
      '',
      'Stack:',
      (data.stack || '(none)')
    ].join('\n');

    MailApp.sendEmail(RECIPIENT, subject, body);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    // 收件端自身錯誤也別炸——回 200 即可
    return ContentService.createTextOutput('ok');
  }
}
```

## 選用：防濫用 token（提高門檻，非真正保密）
前端**已內建**送出 `token` 欄位（`errorReport.ts` 的 payload 讀 `VITE_ERROR_REPORT_TOKEN`）。
若想擋掉隨機 POST，只需兩邊填上同一組字串：
1. Apps Script：把 `REQUIRED_TOKEN` 設一段隨機字串，並解除 `doPost` 內 token 檢查那幾行的註解。
2. 前端：在 `frontend/.env.production` 設 `VITE_ERROR_REPORT_TOKEN=<同一組字串>`（留空＝不帶 token）。

因 token 一樣被內嵌進公開 bundle，這只擋得掉不解析前端的爬蟲；刻意者仍可讀到。日常個人專案通常不需要。

## 疑難排解
- **沒收到信**：Apps Script 後台「執行紀錄」看 `doPost` 有沒有被呼叫、有無 `MailApp` 配額用罄
  （個人帳號每日約 100 封）。`no-cors` 前端讀不到回應是正常的，不代表沒送達。
- **開發時也想測**：把 URL 暫時填進 `.env.development` 即可（記得別留著提交）。
