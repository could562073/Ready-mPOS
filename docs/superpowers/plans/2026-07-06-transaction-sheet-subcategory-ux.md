# 記帳 Sheet 二級分類 UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓帳目頁記帳 Sheet 的二級分類：選一級後恆顯示、可就地新增（免進設定）、並記住每個一級各自上次用的二級。

**Architecture:** 新增 `lib/subMemory.ts`（localStorage 記「一級→上次二級」）與純函式 `pickInitialSub`（選一級時算二級預設）；`TransactionSheet` 改二級顯示條件、加就地新增、接上記憶讀寫。就地新增沿用既有 `addSub`+`saveCategories`（後者已標記 dirty，下次 `syncAll` 推 `_config`）。

**Tech Stack:** React + inline styles、localStorage、Vitest、Playwright。

## Global Constraints

- 對應 spec：`docs/superpowers/specs/2026-07-06-transaction-sheet-subcategory-ux-design.md`。
- 只碰 `TransactionSheet` + 兩個 lib helper；**不動** 收支切換 / 金額 / 備註 / 日期 / 儲存並繼續 / 編輯刪除 / 版面、設定頁二級管理、同步 / Dashboard / 月結 / 月曆。
- **絕不 checkout/merge/push `main`**；只在 `feature/line-item-transactions-redesign` commit，每 task 完成 `git push origin feature/line-item-transactions-redesign`。
- 記憶模型：記「**每個一級各自上次的二級**」（value 為 subId，`null` = 上次選「無」，`undefined` = 無記憶）；存 localStorage，跨重開記得。
- 二級預設順序：有效記憶（含 null）→ 否則 `resolveDefaultSub`（既有 defaultSubId）→ 否則 `null`。
- 二級區塊顯示條件：`draft.categoryId !== ''`（選了一級即顯示，含「無」+ 既有二級 + 「＋新增二級」）。
- 業務邏輯繁體中文註解；commit 格式 `feat/...`；驗證門檻 `npx tsc --noEmit` / `npm test` / `npm run build`（UI 額外 `npx playwright test`）。

## File Structure

- **Create** `frontend/src/lib/subMemory.ts` — `getLastSub`/`rememberLastSub`（localStorage 薄封裝）。
- **Modify** `frontend/src/lib/txDraft.ts` — 加純函式 `pickInitialSub`（沿用既有 `resolveDefaultSub`）。
- **Create** `frontend/src/lib/txDraft.test.ts`（若不存在）/ **擴充**既有 — `pickInitialSub` 測試。
- **Create** `frontend/src/lib/subMemory.test.ts` — 記憶讀寫 round-trip。
- **Modify** `frontend/src/components/TransactionSheet.tsx` — 顯示條件 + 就地新增 + 記憶讀寫接線。
- **Modify** `frontend/e2e/transactions.spec.ts` — 就地新增 + 記憶 E2E。
- **Modify** `CLAUDE.md` / `AGENTS.md` — KEY NOTES 補這個 UX。

**Interfaces（既有，供參考）：**
- `resolveDefaultSub(cat: Category | undefined): string | null`（`lib/txDraft.ts`）。
- `addSub(cat: Category, name: string, makeId?): Category`（回傳新 Category，新 sub 為 `result.subs` 末元素）、`getCategories(): Category[]`、`saveCategories(categories: Category[]): void`（會設 dirty）——皆 `lib/categories.ts`。

---

### Task 1: `subMemory` + `pickInitialSub` 純函式

**Files:**
- Create: `frontend/src/lib/subMemory.ts`
- Modify: `frontend/src/lib/txDraft.ts`
- Create: `frontend/src/lib/subMemory.test.ts`
- Create: `frontend/src/lib/txDraft.test.ts`

**Interfaces:**
- Produces:
  - `getLastSub(categoryId: string): string | null | undefined`
  - `rememberLastSub(categoryId: string, subId: string | null): void`
  - `pickInitialSub(cat: Category | undefined, remembered: string | null | undefined): string | null`

- [ ] **Step 1: 先寫失敗測試 `subMemory.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getLastSub, rememberLastSub } from './subMemory'

// node 環境無 localStorage → 裝一個 Map-backed stub（jsdom 環境也相容）
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

describe('subMemory', () => {
  it('無記憶時回 undefined', () => {
    expect(getLastSub('cat1')).toBeUndefined()
  })
  it('記住 subId 後可讀回', () => {
    rememberLastSub('cat1', 'sub9')
    expect(getLastSub('cat1')).toBe('sub9')
  })
  it('記住 null（上次選「無」）與 undefined（無記憶）可區分', () => {
    rememberLastSub('cat1', null)
    expect(getLastSub('cat1')).toBeNull()
    expect(getLastSub('other')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 先寫失敗測試（追加 `txDraft.test.ts`）**

```ts
import { describe, it, expect } from 'vitest'
import { pickInitialSub } from './txDraft'
import type { Category } from '../types'

const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '雜項', icon: 'tag', color: 'coral', enabled: true, type: 'expense',
  subs: [{ id: 's1', name: '瓦斯費' }, { id: 's2', name: '水費' }], defaultSubId: 's2', ...over,
})

describe('pickInitialSub', () => {
  it('記憶為有效 subId → 回該 id（優先於 defaultSubId）', () => {
    expect(pickInitialSub(cat({}), 's1')).toBe('s1')
  })
  it('記憶為 null（上次選「無」）→ 回 null，尊重之', () => {
    expect(pickInitialSub(cat({}), null)).toBeNull()
  })
  it('無記憶（undefined）→ 退回 defaultSubId', () => {
    expect(pickInitialSub(cat({}), undefined)).toBe('s2')
  })
  it('記憶的二級已被刪（dangling）→ 退回 defaultSubId', () => {
    expect(pickInitialSub(cat({}), 'gone')).toBe('s2')
  })
  it('無記憶且無有效 defaultSubId → 回 null', () => {
    expect(pickInitialSub(cat({ defaultSubId: null }), undefined)).toBeNull()
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/subMemory.test.ts src/lib/txDraft.test.ts`
Expected: FAIL（`subMemory`、`pickInitialSub` 未定義）

- [ ] **Step 4: 實作 `subMemory.ts`**

```ts
// frontend/src/lib/subMemory.ts
// 記「每個一級各自上次用的二級」：{ [categoryId]: subId | null }，null 代表上次選「無」。
// 存 localStorage，跨 App 重開仍記得；供記帳選定一級時帶入二級預設。
const LS_KEY = 'mpos_last_sub'

type LastSubMap = Record<string, string | null>

function read(): LastSubMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as LastSubMap
  } catch {
    return {}
  }
}

// 回傳該一級上次用的 subId；null=上次選「無」；undefined=從未記過
export function getLastSub(categoryId: string): string | null | undefined {
  const map = read()
  return Object.prototype.hasOwnProperty.call(map, categoryId) ? map[categoryId] : undefined
}

export function rememberLastSub(categoryId: string, subId: string | null): void {
  const map = read()
  map[categoryId] = subId
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {}
}
```

- [ ] **Step 5: 實作 `pickInitialSub`（追加到 `txDraft.ts`）**

```ts
// 選定一級時計算應帶入的二級：
// 1. remembered===null（上次選「無」）→ 尊重回 null。
// 2. remembered 為仍存在於 subs 的有效 id → 回它（「上次在這個一級用的二級」）。
// 3. 否則（無記憶 undefined / 記憶的二級已被刪）→ 退回 resolveDefaultSub（既有 defaultSubId）。
export function pickInitialSub(
  cat: Category | undefined,
  remembered: string | null | undefined,
): string | null {
  if (remembered === null) return null
  if (remembered !== undefined && cat?.subs?.some(s => s.id === remembered)) return remembered
  return resolveDefaultSub(cat)
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `cd frontend && npx vitest run src/lib/subMemory.test.ts src/lib/txDraft.test.ts`
Expected: PASS（全部）

- [ ] **Step 7: 驗證編譯 + commit**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0

```bash
git add frontend/src/lib/subMemory.ts frontend/src/lib/subMemory.test.ts frontend/src/lib/txDraft.ts frontend/src/lib/txDraft.test.ts
git commit -m "feat: subMemory（一級→上次二級）+ pickInitialSub 純函式"
git push origin feature/line-item-transactions-redesign
```

---

### Task 2: TransactionSheet — 二級恆顯示 + 就地新增 + 記憶接線

**Files:**
- Modify: `frontend/src/components/TransactionSheet.tsx`

**Interfaces:**
- Consumes: `getLastSub`/`rememberLastSub`（Task 1）、`pickInitialSub`（Task 1）、既有 `addSub`/`getCategories`/`saveCategories`。

- [ ] **Step 1: 調整 import**

- 從 `../lib/categories` 增加引入 `addSub, saveCategories`（`getCategories` 已在）。
- 從 `../lib/txDraft` 增加 `pickInitialSub`（`resolveDefaultSub` 可保留）。
- 新增 `import { getLastSub, rememberLastSub } from '../lib/subMemory'`。

- [ ] **Step 2: 就地新增的本地狀態 + pickCategory 改記憶預設**

在 `TransactionSheet` 元件內、`draft` state 之後加：
```tsx
// 就地新增二級：是否展開輸入、輸入值
const [addingSub, setAddingSub] = useState(false)
const [newSubName, setNewSubName] = useState('')
```
把 `pickCategory` 改為用「上次二級」預設：
```tsx
// 選定一級 — 二級帶入「上次在這個一級用的二級」（無記憶則退回 defaultSubId）
const pickCategory = (catId: string) => {
  const cat = categories.find(c => c.id === catId)
  update({ categoryId: catId, subId: pickInitialSub(cat, getLastSub(catId)) })
  setAddingSub(false)
  setNewSubName('')
}
```
`switchType` 也重置就地新增狀態：在其 `update(...)` 後加 `setAddingSub(false); setNewSubName('')`。

- [ ] **Step 3: 新增確認函式（就地寫入類別 + 自動選取）**

在元件內加：
```tsx
// 就地新增二級：寫回類別（localStorage + 標 dirty，下次 syncAll 推 _config）並自動選取
const confirmAddSub = () => {
  const name = newSubName.trim()
  if (!name || !selectedCat) return
  const updated = addSub(selectedCat, name)
  saveCategories(getCategories().map(c => (c.id === updated.id ? updated : c)))
  const created = updated.subs![updated.subs!.length - 1] // addSub 把新 sub 放在末端
  update({ subId: created.id })
  setNewSubName('')
  setAddingSub(false)
}
```

- [ ] **Step 4: 二級區塊改為恆顯示 + 就地新增 UI**

把現有「二級 chips — 僅當 subOptions.length > 0 才顯示」整段（`{subOptions.length > 0 && ( ... )}`）替換為：

```tsx
{/* 二級分類 — 選了一級即顯示（含「無」、既有二級、就地新增） */}
{draft.categoryId !== '' && (
  <div>
    <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>二級分類</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {([{ id: null as string | null, name: '無' }, ...subOptions]).map(opt => {
        const selected = draft.subId === opt.id
        return (
          <button
            key={opt.id ?? '__none__'}
            aria-label={`二級 ${opt.name}`}
            onClick={() => update({ subId: opt.id })}
            style={{
              padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
              background: selected ? T.ink : T.bg, color: selected ? '#fff' : T.muted,
              transition: 'all 150ms',
            }}
          >
            {opt.name}
          </button>
        )
      })}
      {/* ＋新增二級 chip */}
      {!addingSub && (
        <button
          aria-label="新增二級"
          onClick={() => setAddingSub(true)}
          style={{
            padding: '8px 14px', borderRadius: 999, border: `1.5px dashed ${T.hairline}`,
            background: 'transparent', color: T.ink2, cursor: 'pointer',
            fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="plus" size={13} stroke={2.6} /> 新增二級
        </button>
      )}
    </div>

    {/* 就地新增輸入 */}
    {addingSub && (
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={newSubName}
          onChange={e => setNewSubName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirmAddSub() }}
          placeholder="新二級名稱"
          aria-label="新二級名稱"
          autoFocus
          style={{
            flex: 1, padding: '10px 12px', borderRadius: T.r.sm,
            border: `1.5px solid ${T.hairline}`, fontSize: 14, fontWeight: 600,
            color: T.ink, background: T.bg, outline: 'none', fontFamily: T.font.sans,
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={confirmAddSub}
          disabled={!newSubName.trim()}
          aria-label="確認新增二級"
          style={{
            padding: '0 16px', borderRadius: T.r.sm, border: 'none',
            background: newSubName.trim() ? T.ink : '#D8D9E0', color: '#fff',
            fontSize: 13, fontWeight: 800, cursor: newSubName.trim() ? 'pointer' : 'default',
            fontFamily: T.font.sans,
          }}
        >加入</button>
        <button
          onClick={() => { setAddingSub(false); setNewSubName('') }}
          aria-label="取消新增二級"
          style={{
            padding: '0 12px', borderRadius: T.r.sm, border: 'none',
            background: T.bg, color: T.muted, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: T.font.sans,
          }}
        >取消</button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: 儲存成功後記住上次二級**

在 `save` 函式內，`addTransaction`/`updateTransaction` 成功後、`onSaved()`/continue 之前，記住：
```tsx
const save = async (continueAfter: boolean) => {
  if (!canSave) return
  if (isNew) {
    await addTransaction(buildInput())
    rememberLastSub(draft.categoryId, draft.subId) // 記住這個一級這次用的二級
    if (continueAfter) {
      update({ amount: 0, note: '' })
    } else {
      onSaved()
    }
  } else {
    await updateTransaction(editing!.localId!, buildInput())
    rememberLastSub(draft.categoryId, draft.subId)
    onSaved()
  }
}
```

- [ ] **Step 6: 驗證編譯 / 測試 / 建置**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: 皆綠（既有 Vitest 不回歸）。

- [ ] **Step 7: commit**

```bash
git add frontend/src/components/TransactionSheet.tsx
git commit -m "feat: 記帳 Sheet 二級恆顯示 + 就地新增 + 記住每個一級上次二級"
git push origin feature/line-item-transactions-redesign
```

---

### Task 3: E2E + 文檔

**Files:**
- Modify: `frontend/e2e/transactions.spec.ts`
- Modify: `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: E2E（沿用既有輔助手法）**

新增一案例：帳目 FAB → 選一個一級（例如既有支出類別）→ 斷言二級區塊出現（「無」chip 可見、「新增二級」可見）→ 點「新增二級」→ 輸入「瓦斯費」→ 按「加入」→ 斷言「瓦斯費」chip 出現且被選取（`background` 為選取色或用 `aria-pressed`/文字存在斷言）→ 填金額、儲存 → 再開 FAB、重選同一級 → 斷言二級預設已是「瓦斯費」。用穩定 selector（`getByRole('button', { name: '二級 瓦斯費' })`、`getByLabel('新二級名稱')` 等）。

- [ ] **Step 2: 跑 E2E + 三門檻**

Run: `cd frontend && npx tsc --noEmit && npm run build && npx playwright test`
Expected: 皆綠。（chromium libs 缺則記 Blocker、E2E 暫緩、tsc/build 須綠、測試碼仍 commit。）

- [ ] **Step 3: 文檔**

- CLAUDE.md / AGENTS.md：`PROJECT STRUCTURE` 的 `lib/` 加 `subMemory.ts`；`KEY IMPLEMENTATION NOTES` 的「記帳 UI」段補：二級區塊選一級即恆顯示、可就地「＋新增二級」（`addSub`+`saveCategories`，同步經 `_config`）、選一級時二級帶入「該一級上次用的二級」（`subMemory` + `pickInitialSub`，無記憶退回 `defaultSubId`）。

- [ ] **Step 4: commit**

```bash
git add frontend/e2e/transactions.spec.ts CLAUDE.md AGENTS.md
git commit -m "feat+docs: 二級就地新增 + 上次二級記憶 E2E + 文檔"
git push origin feature/line-item-transactions-redesign
```

---

## 完成準則（Definition of Done）
- [ ] Task 1 純函式 Vitest 綠；`tsc`/`build`/`playwright` 綠。
- [ ] 選一級即顯示二級區塊（含「無」+ 既有 + 「＋新增二級」）；就地新增可用且立即選取、持久化並會同步；選一級時二級帶入該一級上次用的二級（無記憶退回 defaultSubId）。
- [ ] 未改動收支切換 / 金額 / 備註 / 日期 / 儲存並繼續 / 編輯刪除 / 版面、設定頁二級管理、同步 / Dashboard / 月結。
- [ ] CLAUDE/AGENTS 文檔同步。
- [ ] 全期 review（subagent-driven）Spec ✅ + Quality Approved。
