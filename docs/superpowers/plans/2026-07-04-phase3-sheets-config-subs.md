# Phase 3 Sheets 同步（隔離 + `_config` 二級序列化 + 資料流失修正）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓二級分類（`subs`/`defaultSubId`）跨裝置經 Google Sheets `_config` 同步，並修掉 Phase 2 全期 review 揪出的「push 無 subs → 清 dirty → pull 覆蓋清空二級」資料流失；同時把 feature 分支的雲端同步隔離到獨立測試試算表，確保開發期完全碰不到正式站資料。

**Architecture:** 序列化/反序列化為 `lib/categories.ts` 的純函式（Vitest 覆蓋，不碰網路/Dexie）；`lib/sheets.ts` 的 `pushConfigToSheets`/`pullConfigFromSheets` 與 `CONFIG_HEADERS` 同步（lockstep）改成含 `subs`/`defaultSub` 兩欄；`hooks/useSyncService.ts` 的 `AUTO_SHEET_NAME` 改成獨立測試名並加「儲存名稱不符即重解析」的安全守衛。

**Tech Stack:** TypeScript + Vitest；Google Sheets API v4（`_config` tab）；localStorage。

## Global Constraints

- 🔴 **真實資料保護（最高優先級，見 LOOP_STATE guardrail 9）**：feature 分支的 `AUTO_SHEET_NAME` 必須是**獨立測試名**，開發期只碰測試試算表。此改動**絕不可保留到 main**——併 main 前必改回 `'Ready-mPOS 記帳'`（cutover 硬停、需用戶批准）。
- 本期**只動 `_config`（類別設定）同步**。**不改月份分頁格式、不改 `pullAllFromSheets`/`syncMonthToSheets`/`buildHeaders`/`recordToRow`**——月份新格式與舊格式偵測改寫移到 Phase 5（見決策日誌 D4：現況 UI 仍寫 `DailyRecord`，提早切月份同步會使新記帳不被同步）。
- `Sub = { id, name }`；`defaultSubId: string | null`（空 = 無）。序列化格式：`subs` 欄 = `id:encodeURIComponent(name)`，多筆以 `|` 分隔；`defaultSub` 欄 = `defaultSubId ?? ''`。
- 純函式不 mutate、round-trip 正確（含名稱帶特殊字元 `:` `|`）。
- 缺欄容錯：舊 `_config`（只有 7 欄、無 subs/defaultSub）pull 時視為無二級，不報錯。
- OAuth 無法 headless E2E → 本期驗證門檻 = Vitest（純函式 round-trip）+ tsc + build；另在計畫末補「需用戶手動驗證清單」。
- 業務邏輯繁體中文註解；每 task commit + push feature 分支（**絕不碰 main**）。

---

### Task 1: 試算表隔離（分支改用獨立測試試算表 + 安全守衛）

**Files:**
- Modify: `frontend/src/hooks/useSyncService.ts`（`AUTO_SHEET_NAME` + init 守衛）
- Modify: `frontend/src/lib/sheets.ts`（新增 `getStoredSheetName` 匯出）
- Modify: `docs/superpowers/loop/LOOP_STATE.md`（撤除時效性 dogfood 提醒）

**Interfaces:**
- Consumes: `clearSpreadsheet`（已匯出，`sheets.ts:169`）、`getSignedInEmail`。
- Produces: `getStoredSheetName(): string`（回傳 `LS_SHEET_NAME` 值，空字串表示無）。

- [ ] **Step 1: `sheets.ts` 新增 `getStoredSheetName` 匯出**

在既有 `getSignedInEmail`/`getSpreadsheetId` 附近（約 `sheets.ts:161-162`）加：

```ts
// 回傳已儲存的試算表名稱（跨裝置解析用）；空字串 = 尚未儲存
export const getStoredSheetName = (): string => localStorage.getItem(LS_SHEET_NAME) ?? ''
```

- [ ] **Step 2: `useSyncService.ts` 改 `AUTO_SHEET_NAME` 並加守衛**

`useSyncService.ts:22` 改為：

```ts
// ⚠️ DEV-ONLY（feature/line-item-transactions-redesign 分支隔離）：
//    開發期用獨立測試試算表，確保絕不碰正式站的「Ready-mPOS 記帳」。
//    🔴 併 main 前務必改回 'Ready-mPOS 記帳'（見 LOOP_STATE guardrail 9c / cutover）。
const AUTO_SHEET_NAME = 'Ready-mPOS 記帳（逐筆交易測試）'
```

import 補上 `clearSpreadsheet, getStoredSheetName`（來自 `../lib/sheets`）。

在既有 init `useEffect`（`:35`）的 `init` 函式**最前面**加一次性守衛（在 `initGoogleAuth()` 之前）：

```ts
// 安全守衛：若已儲存的試算表名稱與目前 AUTO_SHEET_NAME 不符（例如分支切換或 cutover 改名），
// 清掉舊的試算表指標，強制下次登入依新名稱重新解析，避免沿用到別張表（含正式站）。
const storedName = getStoredSheetName()
if (storedName && storedName !== AUTO_SHEET_NAME) {
  clearSpreadsheet()
}
```

- [ ] **Step 3: tsc + build**

Run: `cd frontend && npx tsc --noEmit`（Expected: 無錯）
Run: `cd frontend && npm run build`（Expected: 成功）

- [ ] **Step 4: 撤除 LOOP_STATE 時效性提醒**

`docs/superpowers/loop/LOOP_STATE.md` 的 Blockers 段把「⚠️ 提醒（非阻擋，時效性）…請勿在分支上登入 Google」那條移除或改為「✅ 已由 Phase 3 Task 1 隔離解除」。

- [ ] **Step 5: commit**

```bash
git add frontend/src/hooks/useSyncService.ts frontend/src/lib/sheets.ts docs/superpowers/loop/LOOP_STATE.md
git commit -m "feat: 分支雲端同步隔離到獨立測試試算表 + 名稱不符重解析守衛 (Phase 3 Task 1)"
```

---

### Task 2: `_config` 二級序列化 + 資料流失 lockstep 修正（TDD）

**Files:**
- Modify: `frontend/src/lib/categories.ts`（純序列化/反序列化函式）
- Test: `frontend/src/lib/categories.test.ts`（既有檔，追加）
- Modify: `frontend/src/lib/sheets.ts`（`CONFIG_HEADERS`、`pushConfigToSheets`、`pullConfigFromSheets`）

**Interfaces:**
- Consumes: `Sub`、`Category`（Phase 2）。
- Produces:
  - `serializeSubs(subs: Sub[]): string`
  - `parseSubs(raw: string): Sub[]`

- [ ] **Step 1: 先寫失敗測試** — 追加到 `frontend/src/lib/categories.test.ts`

```ts
import { serializeSubs, parseSubs } from './categories'

describe('二級序列化 round-trip（_config 儲存）', () => {
  it('serializeSubs 以 id:encodeURIComponent(name)、| 分隔', () => {
    expect(serializeSubs([{ id: 's1', name: '瓦斯費' }, { id: 's2', name: '水費' }]))
      .toBe(`s1:${encodeURIComponent('瓦斯費')}|s2:${encodeURIComponent('水費')}`)
  })

  it('空清單序列化為空字串', () => {
    expect(serializeSubs([])).toBe('')
  })

  it('parseSubs 還原 id 與 name', () => {
    const raw = `s1:${encodeURIComponent('瓦斯費')}|s2:${encodeURIComponent('水費')}`
    expect(parseSubs(raw)).toEqual([{ id: 's1', name: '瓦斯費' }, { id: 's2', name: '水費' }])
  })

  it('空字串 parse 為空陣列', () => {
    expect(parseSubs('')).toEqual([])
  })

  it('round-trip 保住含分隔字元的名稱', () => {
    const subs = [{ id: 's1', name: '瓦斯:費|特殊' }]
    expect(parseSubs(serializeSubs(subs))).toEqual(subs)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/categories.test.ts`
Expected: FAIL（`serializeSubs`/`parseSubs` 未匯出）

- [ ] **Step 3: 實作純函式** — 加到 `frontend/src/lib/categories.ts` 末端

```ts
// 序列化二級清單為 _config 儲存字串：id:encodeURIComponent(name)，多筆以 | 分隔。
// name 經 encodeURIComponent，容許名稱含 : 或 | 而不破壞格式。
export function serializeSubs(subs: Sub[]): string {
  return subs.map(s => `${s.id}:${encodeURIComponent(s.name)}`).join('|')
}

// 反序列化 _config 的 subs 欄；容錯：空字串→[]，格式不符的片段略過。
export function parseSubs(raw: string): Sub[] {
  if (!raw) return []
  return raw
    .split('|')
    .map(part => {
      const sep = part.indexOf(':')
      if (sep < 1) return null
      return { id: part.slice(0, sep), name: decodeURIComponent(part.slice(sep + 1)) }
    })
    .filter((s): s is Sub => s !== null)
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd frontend && npx vitest run src/lib/categories.test.ts`
Expected: PASS（Phase 2 的 6 + 本 task 5 = 11）

- [ ] **Step 5: `sheets.ts` 接上 subs/defaultSub 兩欄（lockstep）**

匯入補上 `serializeSubs, parseSubs`（來自 `./categories`）。

`CONFIG_HEADERS`（`sheets.ts:31`）改為：

```ts
const CONFIG_HEADERS = ['id', 'name', 'icon', 'color', 'fee', 'enabled', 'type', 'subs', 'defaultSub']
```

`pushConfigToSheets` 的每列（`sheets.ts:270-275`）尾端加兩欄（**subs 在 `clearCategoriesDirty()` 之前就序列化寫入，這正是資料流失修正的關鍵**）：

```ts
    ...categories.map(c => [
      c.id, c.name, c.icon, c.color,
      c.fee ?? 0,
      c.enabled ? 'true' : 'false',
      c.type,
      serializeSubs(c.subs ?? []),
      c.defaultSubId ?? '',
    ]),
```

`pullConfigFromSheets` 的讀取範圍（`sheets.ts:298`）`A1:G` → `A1:I`；map（`sheets.ts:310-318`）加兩欄反序列化（缺欄容錯：`idx` 回 -1 時 `r[-1]` 為 undefined）：

```ts
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
```

- [ ] **Step 6: tsc + 全測 + build**

Run: `cd frontend && npx tsc --noEmit`（Expected: 無錯）
Run: `cd frontend && npm test`（Expected: 11 categories + 4 migrate = 15 全綠）
Run: `cd frontend && npm run build`（Expected: 成功）

- [ ] **Step 7: commit**

```bash
git add frontend/src/lib/categories.ts frontend/src/lib/categories.test.ts frontend/src/lib/sheets.ts
git commit -m "feat: _config 二級序列化 subs/defaultSub 同步 + 修 push/pull 資料流失 (Phase 3 Task 2)"
```

---

### Task 3: 文件更新（docs 同步，guardrail 5b）

**Files:**
- Modify: `CLAUDE.md`、`AGENTS.md`（類別系統段 + Development Status）
- Modify: `README.md`（開發歷程 Phase 3）
- Modify: `docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md`（標註 D4 範圍調整：月份格式移 Phase 5）

- [ ] **Step 1: CLAUDE.md / AGENTS.md**

類別系統段補：二級現經 `_config` 的 `subs`/`defaultSub` 兩欄跨裝置同步（`serializeSubs`/`parseSubs`），已修正 Phase 2 的資料流失。Development Status 把 Phase 3 標為「`_config` 同步完成；月份分頁新格式移至 Phase 5（與 UI 切換同期）」。

- [ ] **Step 2: README.md**

開發歷程加「Phase 3 — Sheets `_config` 二級同步 + 隔離（✅）」，一行摘要 + 註明月份格式改寫在 Phase 5。

- [ ] **Step 3: spec 註記**

在 spec 「實作分期」段標註：Phase 3 實際只做 `_config` 同步 + 隔離；月份新格式/舊格式偵測改寫/Drive 備份移至 Phase 5（原因見 LOOP_STATE 決策日誌 D4）。

- [ ] **Step 4: commit**

```bash
git add CLAUDE.md AGENTS.md README.md docs/superpowers/specs/2026-07-01-line-item-transactions-redesign-design.md
git commit -m "docs: Phase 3 _config 二級同步落地 — 更新 CLAUDE/AGENTS/README + spec 分期註記"
```

---

## 完成準則（Definition of Done）
- [ ] `npm test` 全綠（15）、`npx tsc --noEmit` 無錯、`npm run build` 成功。
- [ ] 分支 `AUTO_SHEET_NAME` 為獨立測試名；名稱守衛可在不符時清指標重解析。
- [ ] `_config` push/pull 帶 `subs`/`defaultSub`；push 在清 dirty 前已序列化 subs（資料流失修正）。
- [ ] 舊 `_config`（7 欄）pull 不報錯、視為無二級。
- [ ] 文件三份 + spec 更新。

## 🧪 需用戶手動驗證清單（OAuth 無法 headless，Phase 3 完成後請用戶跑）
1. 分支 `npm run dev`，登入 Google → 確認建立的是**「Ready-mPOS 記帳（逐筆交易測試）」**新表，正式表未被碰。
2. 建二級（雜支→瓦斯費、設預設）→ 記一筆帳觸發同步 → 重新整理/換裝置登入 → 二級與預設仍在（不再被清空＝資料流失已修）。
3. `_config` tab 檢查有 `subs`/`defaultSub` 兩欄且值正確。

## 下一步（非本期）
- **Phase 4**：FAB + 新增/編輯交易底部 Sheet（記帳時自動帶入 `defaultSubId`）。
- **Phase 5**：帳目頁（月曆+列表）+ 導覽/落地頁 + **月份分頁 Transaction 新格式讀寫 + 舊格式偵測 + Drive 備份 + Transaction.id 對帳**（D4 移入）。
- **Cutover（Phase 6 後，硬停等用戶）**：`AUTO_SHEET_NAME` 改回正式名、真實用戶資料遷移。
