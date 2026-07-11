# Phase 2 二級分類 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓一級類別（如「雜項」）可擁有二級分類（如「瓦斯費」）並設定預設二級，含純函式 CRUD 與 `CategoryEditSheet` 管理 UI。

**Architecture:** 二級資料存在 `Category.subs`（型別已於 Phase 1 加好）與 `Category.defaultSubId`，透過既有 `saveCategories` 序列化進 localStorage（免額外持久化）。CRUD 為 `categories.ts` 的純函式（Vitest 覆蓋），UI 是掛在既有 `CategoryEditSheet` 底部 Sheet 內的薄層，重用純函式操作 draft。

**Tech Stack:** React + TypeScript + Vitest；inline styles + design tokens；localStorage。

## Global Constraints

- 二級分類**繼承**一級的 icon / color / fee，**不各自擁有**（`Sub` 只有 `{ id, name }`）。
- `defaultSubId: string | null`：`null` / `undefined` = 無預設二級。
- 純函式不 mutate 傳入的 `Category`，一律回傳新物件。
- 停用（`enabled:false`）的一級類別其歷史交易/二級仍保留。
- 不做三級以上分類。
- **範圍界線**：本期二級只存 localStorage。**Sheets `_config` 的 subs/defaultSub 序列化是 Phase 3**；在 Phase 3 落地前，二級為**本機限定**——跨裝置、雲端還原、以及「一次 syncAll pull」都不會帶著二級（甚至可能被雲端設定覆蓋清掉）。因此 **Phase 3 完成前不得把本 redesign 併入 main**（main 一 push 即部署正式環境）。本期不改 `sheets.ts` / `useSyncService.ts`。
- 二級的「記帳時自動帶入 `defaultSubId`」由 **Phase 4**（記帳 Sheet）實作，本期只負責儲存與管理。

---

### Task 1: 二級分類純函式 CRUD（`lib/categories.ts`，TDD）

**Files:**
- Modify: `frontend/src/lib/categories.ts`
- Test: `frontend/src/lib/categories.test.ts`（新建）

**Interfaces:**
- Consumes: `Category`（`types/index.ts`，已含 `subs?` / `defaultSubId?`）；`newId`（`lib/ids.ts`）。
- Produces:
  - `type Sub = { id: string; name: string }`
  - `addSub(cat: Category, name: string, makeId?: () => string): Category`
  - `renameSub(cat: Category, subId: string, name: string): Category`
  - `deleteSub(cat: Category, subId: string): Category`（若刪除的是預設二級，一併把 `defaultSubId` 設為 `null`）
  - `setDefaultSub(cat: Category, subId: string | null): Category`

- [ ] **Step 1: 先寫失敗測試** — `frontend/src/lib/categories.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { addSub, renameSub, deleteSub, setDefaultSub } from './categories'
import type { Category } from '../types'

const base: Category = { id: 'misc', name: '雜項', icon: 'tag', color: 'coral', enabled: true, type: 'expense' }

describe('二級分類 CRUD（純函式）', () => {
  it('addSub 以注入的 makeId 附加一個 {id,name}，且不 mutate 原物件', () => {
    let n = 0
    const next = addSub(base, '瓦斯費', () => `sub${++n}`)
    expect(next.subs).toEqual([{ id: 'sub1', name: '瓦斯費' }])
    expect(base.subs).toBeUndefined() // 原物件未被更動
  })

  it('addSub 會 trim 名稱空白', () => {
    const next = addSub(base, '  水費 ', () => 's1')
    expect(next.subs).toEqual([{ id: 's1', name: '水費' }])
  })

  it('renameSub 只改指定 id 的名稱', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }] }
    expect(renameSub(c, 's2', '水費').subs).toEqual([{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水費' }])
  })

  it('deleteSub 移除該二級；若為預設則清除 defaultSubId', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }], defaultSubId: 's1' }
    const next = deleteSub(c, 's1')
    expect(next.subs).toEqual([{ id: 's2', name: '水電' }])
    expect(next.defaultSubId).toBeNull()
  })

  it('deleteSub 刪非預設二級時保留 defaultSubId', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }, { id: 's2', name: '水電' }], defaultSubId: 's1' }
    expect(deleteSub(c, 's2').defaultSubId).toBe('s1')
  })

  it('setDefaultSub 設定與清除（null = 無）', () => {
    const c: Category = { ...base, subs: [{ id: 's1', name: '瓦斯' }] }
    expect(setDefaultSub(c, 's1').defaultSubId).toBe('s1')
    expect(setDefaultSub(c, null).defaultSubId).toBeNull()
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd frontend && npx vitest run src/lib/categories.test.ts`
Expected: FAIL（`addSub` 等未匯出／未定義）

- [ ] **Step 3: 實作純函式** — 加到 `frontend/src/lib/categories.ts`

在檔案頂部 import 補上 `newId`：

```ts
import { newId } from './ids'
```

在檔案末端新增（`Category` 已於檔案頂部 import）：

```ts
// 二級分類型別（繼承一級 icon/color/fee，本身只有 id/name）
export type Sub = { id: string; name: string }

// 新增二級分類（回傳新 Category，不 mutate 原物件）
export function addSub(cat: Category, name: string, makeId: () => string = newId): Category {
  const sub: Sub = { id: makeId(), name: name.trim() }
  return { ...cat, subs: [...(cat.subs ?? []), sub] }
}

// 改名指定二級分類（即時輸入不 trim，trim 交給儲存時正規化）
export function renameSub(cat: Category, subId: string, name: string): Category {
  return { ...cat, subs: (cat.subs ?? []).map(s => (s.id === subId ? { ...s, name } : s)) }
}

// 刪除指定二級分類；若它正是預設二級，一併清除 defaultSubId
export function deleteSub(cat: Category, subId: string): Category {
  const subs = (cat.subs ?? []).filter(s => s.id !== subId)
  const defaultSubId = cat.defaultSubId === subId ? null : cat.defaultSubId
  return { ...cat, subs, defaultSubId }
}

// 設定預設二級（null = 無）
export function setDefaultSub(cat: Category, subId: string | null): Category {
  return { ...cat, defaultSubId: subId }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd frontend && npx vitest run src/lib/categories.test.ts`
Expected: PASS（6/6）

- [ ] **Step 5: 型別檢查 + commit**

Run: `cd frontend && npx tsc --noEmit`（Expected: 無錯）

```bash
git add frontend/src/lib/categories.ts frontend/src/lib/categories.test.ts
git commit -m "feat: 二級分類純函式 CRUD addSub/renameSub/deleteSub/setDefaultSub (Phase 2 Task 1)"
```

---

### Task 2: `CategoryEditSheet` 二級分類管理 UI

**Files:**
- Modify: `frontend/src/components/CategoryEditSheet.tsx`

**Interfaces:**
- Consumes: `addSub` / `renameSub` / `deleteSub` / `setDefaultSub`（Task 1）；`Icon`、tokens、`ICON_OPTIONS`/`COLOR_OPTIONS`（既有）。
- Produces: `DraftCategory` 擴充 `subs?` / `defaultSubId?`；`EditSheet` 儲存時輸出含（已正規化的）`subs`/`defaultSubId` 的 draft，`CategoriesPage.handleSave` 既有的 `{ ...c, ...draft }` 會原樣帶入並經 `saveCategories` 寫入 localStorage。

> 設計：二級管理放在既有的類別編輯底部 Sheet（點類別 → 編輯 → 內含「二級分類」區）。icon/color/fee 維持在一級層級（本 Sheet 上半段既有欄位），二級只編輯名稱 + 選預設。`CategoriesPage` 無需改動（draft 透傳）。

- [ ] **Step 1: 擴充 `DraftCategory` 與空 draft** — `frontend/src/components/CategoryEditSheet.tsx`

把介面改為：

```ts
export interface DraftCategory {
  id: string
  name: string
  icon: string
  color: string
  fee?: number
  enabled: boolean
  type: 'income' | 'expense'
  subs?: { id: string; name: string }[]
  defaultSubId?: string | null
}
```

兩個空 draft 補上初值：

```ts
export const EMPTY_INCOME_DRAFT: DraftCategory = {
  id: '', name: '', icon: 'tag', color: 'mint', fee: 0, enabled: true, type: 'income', subs: [], defaultSubId: null,
}
export const EMPTY_EXPENSE_DRAFT: DraftCategory = {
  id: '', name: '', icon: 'tag', color: 'coral', fee: 0, enabled: true, type: 'expense', subs: [], defaultSubId: null,
}
```

- [ ] **Step 2: import 二級純函式**

把既有 import 改成：

```ts
import { ICON_OPTIONS, COLOR_OPTIONS, addSub, renameSub, deleteSub, setDefaultSub } from '../lib/categories'
```

> `DraftCategory` 與 `Category` 結構相同（同欄位），因此 `addSub(local, ...)` 等回傳的 `Category` 可直接 `setLocal`，`local` 也可當作 `Category` 傳入；如遇 TS 抱怨，於呼叫處加 `as DraftCategory` / `as Category`。

- [ ] **Step 3: 在可捲動內容區加入「二級分類」區塊**

在 `EditSheet` 內、fee 區塊（`{local.type === 'income' && (...)}`）**之後**、可捲動 `div` 收尾 `</div>` **之前**，插入：

```tsx
{/* 二級分類（繼承一級 icon/color/fee，只編輯名稱與預設） */}
<div>
  <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>二級分類</div>
  {(local.subs ?? []).length === 0 && (
    <div style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginBottom: 8 }}>
      可選。例如「雜項」下加「瓦斯費」「水費」，記帳時就能選到。
    </div>
  )}

  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {(local.subs ?? []).map(s => (
      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={s.name}
          onChange={e => setLocal(renameSub(local, s.id, e.target.value))}
          placeholder="二級名稱"
          style={{
            flex: 1, padding: '10px 12px', borderRadius: T.r.sm,
            border: `1.5px solid ${T.hairline}`, fontSize: 14, fontWeight: 600,
            color: T.ink, background: T.bg, outline: 'none', fontFamily: T.font.sans, boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => setLocal(deleteSub(local, s.id))}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
            background: T.coralSoft, color: T.coralInk, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={14} stroke={2.4} />
        </button>
      </div>
    ))}
  </div>

  <button
    onClick={() => setLocal(addSub(local, ''))}
    style={{
      marginTop: 8, width: '100%', padding: '10px 12px', borderRadius: T.r.sm,
      border: `1.5px dashed ${T.hairline}`, background: 'transparent', cursor: 'pointer',
      fontFamily: T.font.sans, display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 6, color: T.muted, fontSize: 13, fontWeight: 700,
    }}
  >
    <Icon name="plus" size={14} stroke={2.6} /> 新增二級分類
  </button>

  {/* 預設二級（單選，含「無」） */}
  {(local.subs ?? []).length > 0 && (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>記帳時預設帶入</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {([{ id: null as string | null, name: '無' }, ...(local.subs ?? [])]).map(opt => {
          const selected = (local.defaultSubId ?? null) === opt.id
          return (
            <button
              key={opt.id ?? '__none__'}
              onClick={() => setLocal(setDefaultSub(local, opt.id))}
              style={{
                padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
                background: selected ? T.ink : T.bg, color: selected ? '#fff' : T.muted,
                transition: 'all 150ms',
              }}
            >
              {opt.name || '（未命名）'}
            </button>
          )
        })}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: 儲存時正規化 subs（trim + 去空 + 修正 defaultSubId）**

把底部「儲存」按鈕的 `onClick` 從：

```tsx
onClick={() => { if (local.name.trim()) onSave(local) }}
```

改為：

```tsx
onClick={() => {
  if (!local.name.trim()) return
  // 儲存時把二級名稱 trim、丟掉空白項；若預設二級已被刪/清空則歸零
  const subs = (local.subs ?? []).map(s => ({ ...s, name: s.name.trim() })).filter(s => s.name)
  const defaultSubId = subs.some(s => s.id === local.defaultSubId) ? local.defaultSubId! : null
  onSave({ ...local, subs, defaultSubId })
}}
```

- [ ] **Step 5: 型別檢查 + build**

Run: `cd frontend && npx tsc --noEmit`（Expected: 無錯）
Run: `cd frontend && npm run build`（Expected: built 成功）

- [ ] **Step 6: 手動驗證（dev）**

Run: `cd frontend && npm run dev`，於「設定 → 類別管理」：
1. 點某類別（如「雜支」）→ 編輯 Sheet 出現「二級分類」區。
2. 新增二級「瓦斯費」「水費」，把「瓦斯費」設為預設，儲存。
3. 重新開啟該類別 → 二級與預設仍在（已存 localStorage）。
4. 刪除「瓦斯費」→ 預設回到「無」。刷新頁面後仍正確。

- [ ] **Step 7: commit**

```bash
git add frontend/src/components/CategoryEditSheet.tsx
git commit -m "feat: 類別編輯 Sheet 內管理二級分類 + 預設二級 (Phase 2 Task 2)"
```

---

### Task 3: 文件更新

**Files:**
- Modify: `CLAUDE.md`、`AGENTS.md`（類別系統段 + Development Status）
- Modify: `README.md`（開發歷程「第 2 次優化」段 Phase 2 標記完成）

- [ ] **Step 1: 更新 CLAUDE.md / AGENTS.md**

在兩檔「### 類別系統」段補一行說明二級 CRUD 已可用（`addSub/renameSub/deleteSub/setDefaultSub`，二級繼承一級 icon/color/fee，`CategoryEditSheet` 內管理），並在 Development Status 的「第 2 次優化」項把 Phase 2 標為完成、註明「二級仍本機限定，Sheets 同步待 Phase 3」。

- [ ] **Step 2: 更新 README.md**

在「第 2 次優化」段的 Phase 列表把 **Phase 2** 標為 ✅ 完成，一行摘要（二級分類 CRUD + `CategoryEditSheet` 管理 UI；本機限定，Sheets 同步 Phase 3）。

- [ ] **Step 3: commit**

```bash
git add CLAUDE.md AGENTS.md README.md
git commit -m "docs: Phase 2 二級分類落地 — 更新 CLAUDE/AGENTS/README"
```

---

## 完成準則（Definition of Done）
- [ ] `npm test` 全綠（含新的 6 個 categories 測試 + Phase 1 的 4 個）、`npx tsc --noEmit` 無錯、`npm run build` 成功。
- [ ] 類別編輯 Sheet 可新增/改名/刪除二級、設定/清除預設二級，重開與刷新後持久（localStorage）。
- [ ] 既有類別功能（新增/編輯/刪除一級、啟用停用、手續費）不回歸。
- [ ] 文件三份更新完成。
- [ ] ⚠️ 已知界線：二級尚未同步到 Sheets `_config`（Phase 3）；Phase 3 完成前不併 main。

## 下一步（Phase 3 預告，非本期）
Sheets 新月份分頁格式 + 舊格式偵測改寫 + `_config` 新增 `subs`（`subId:subName|...`）/`defaultSub` 欄位序列化，讓二級與逐筆交易跨裝置同步；並補上 spec 記載的「Phase 4/5 UI 切換須重新遷移/對帳」前置。
