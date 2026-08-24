import { describe, it, expect, vi, afterEach } from 'vitest'
import { TX_MONTH_HEADERS } from './txSheets'
import type { Category } from '../types'

// ── sheets.ts 網路層測試（L2，2.4.2+）────────────────────────────────────────
// 動機（2.4.1 事故的直接教訓）：_config 布林欄往返 bug 之所以能上正式站，正是因為
// 那段解析夾在網路函式 pullConfigFromSheets 中間，不是純函式，於是落在專案
// 「純函式才有測試」紀律的盲區裡，161 個測試沒有一個碰得到它。
// 這支測試用 stub fetch 把整條「送出什麼 → 收到什麼 → 解析成什麼」鎖起來，
// 補的就是那塊盲區；也是後續切換 RAW / UNFORMATTED_VALUE 的安全網。

interface FetchCall { url: string; method: string; body: any }
// 路由：回 undefined 代表這條請求沒被 mock（測試會看到 404，比靜默成功容易抓）
type Route = (url: string, method: string) => unknown | undefined

let calls: FetchCall[] = []

function makeLocalStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
}

// 🔴 一律動態 import：sheets.ts 在 module load 當下就從 localStorage 還原 token，
//    localStorage 必須先 stub 好、且每個測試都要 resetModules，否則 token 狀態會跨測試殘留。
async function loadSheets(route: Route) {
  calls = []
  const ls = makeLocalStorage()
  ls.setItem('gsheets_tk', 'fake-token')
  ls.setItem('gsheets_tk_exp', String(Date.now() + 3600_000))
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

afterEach(() => { vi.unstubAllGlobals() })

const CONFIG_HEADER = ['id', 'name', 'icon', 'color', 'fee', 'enabled', 'type', 'subs', 'defaultSub', 'deleted']

// 只回應「分頁清單」的路由，其餘交給呼叫端補
const titlesRoute = (titles: string[]) => (url: string, method: string) =>
  method === 'GET' && url.includes('?fields=sheets.properties.title')
    ? { sheets: titles.map(t => ({ properties: { title: t } })) }
    : undefined

const cat = (over: Partial<Category>): Category => ({
  id: 'c1', name: '現金', icon: 'wallet', color: '#000',
  enabled: true, type: 'income', ...over,
})

describe('pullConfigFromSheets — _config 布林欄解析（2.4.1 回歸鎖）', () => {
  it('雲端存成布林儲存格、讀回大寫 TRUE/FALSE 時仍正確解析', async () => {
    const { sheets } = await loadSheets((url, method) =>
      method === 'GET' && url.includes('/values/')
        ? { values: [
            CONFIG_HEADER,
            ['c1', '現金', 'wallet', '#000', 0, 'FALSE', 'income', '', '', 'FALSE'],
            ['c2', '雜支', 'tag', '#111', 0, 'TRUE', 'expense', '', '', 'TRUE'],
          ] }
        : undefined)

    const out = await sheets.pullConfigFromSheets('SS')
    expect(out).not.toBeNull()
    const byId = new Map(out!.map(c => [c.id, c]))
    // 🔴 這四行就是 2.4.1 的 bug 本體：大寫 FALSE 曾被當成「不是 'false'」→ 停用被翻回啟用
    expect(byId.get('c1')!.enabled).toBe(false)
    expect(byId.get('c1')!.deleted).toBe(false)
    expect(byId.get('c2')!.enabled).toBe(true)
    expect(byId.get('c2')!.deleted).toBe(true)
  })

  it('讀回真布林值時同樣正確（UNFORMATTED_VALUE 會給真的 true/false）', async () => {
    const { sheets } = await loadSheets((url, method) =>
      method === 'GET' && url.includes('/values/')
        ? { values: [
            CONFIG_HEADER,
            ['c1', '現金', 'wallet', '#000', 0, false, 'income', '', '', false],
            ['c2', '雜支', 'tag', '#111', 0, true, 'expense', '', '', true],
          ] }
        : undefined)

    const byId = new Map((await sheets.pullConfigFromSheets('SS'))!.map(c => [c.id, c]))
    expect(byId.get('c1')!.enabled).toBe(false)
    expect(byId.get('c2')!.deleted).toBe(true)
  })

  it('本機有未推送修改（dirty）時直接跳過拉取，不打任何網路請求', async () => {
    const { sheets, ls } = await loadSheets(() => ({ values: [] }))
    ls.setItem('mpos_categories_dirty', '1')
    expect(await sheets.pullConfigFromSheets('SS')).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('pushConfigToSheets — 寫入選項與順序', () => {
  it('以 RAW 寫入，且先 clear 再 PUT', async () => {
    const { sheets } = await loadSheets((url, method) =>
      titlesRoute(['_config'])(url, method) ?? (method === 'POST' || method === 'PUT' ? {} : undefined))

    await sheets.pushConfigToSheets('SS', [cat({ enabled: false, deleted: true })])

    const put = calls.find(c => c.method === 'PUT')!
    // 🔴 必須是 RAW：USER_ENTERED 會把 'true'/'false' 轉成布林儲存格（2.4.1 根因）
    expect(put.url).toContain('valueInputOption=RAW')
    expect(put.url).not.toContain('USER_ENTERED')

    const clearIdx = calls.findIndex(c => c.url.includes(':clear'))
    const putIdx = calls.indexOf(put)
    expect(clearIdx).toBeGreaterThanOrEqual(0)
    expect(clearIdx).toBeLessThan(putIdx)   // 沒先清空，刪掉的類別會殘留在雲端

    expect(put.body.values[0]).toEqual(CONFIG_HEADER)
    expect(put.body.values[1][5]).toBe('false')   // enabled
    expect(put.body.values[1][9]).toBe('true')    // deleted
  })

  it('推送成功後清除 dirty 旗標', async () => {
    const { sheets, ls } = await loadSheets((url, method) =>
      titlesRoute(['_config'])(url, method) ?? (method === 'POST' || method === 'PUT' ? {} : undefined))
    ls.setItem('mpos_categories_dirty', '1')
    await sheets.pushConfigToSheets('SS', [cat({})])
    expect(ls.getItem('mpos_categories_dirty')).toBeNull()
  })
})

describe('pullAllTransactionsFromSheets — 月份分頁讀取', () => {
  const monthRoute = (rows: unknown[][]) => (url: string, method: string) =>
    titlesRoute(['_config', '2026-08'])(url, method)
      ?? (method === 'GET' && url.includes('2026-08') ? { values: rows } : undefined)

  it('新格式月份逐列解析成交易 seed', async () => {
    const { sheets } = await loadSheets(monthRoute([
      [...TX_MONTH_HEADERS],
      ['2026-08-23', '收入', '現金', '', 1200, '午餐', 'tx-1', 'c1', ''],
    ]))

    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    expect(r.seeds).toHaveLength(1)
    expect(r.seeds[0]).toMatchObject({
      id: 'tx-1', date: '2026-08-23', type: 'income', categoryId: 'c1', amount: 1200, note: '午餐',
    })
    expect(r.oldFormatMonths).toEqual([])
  })

  it('缺「一級ID」欄的 2.0.0 新格式月份被標記為待補欄', async () => {
    const { sheets } = await loadSheets(monthRoute([
      ['日期', '收支', '一級類別', '二級類別', '金額', '備註', 'id'],
      ['2026-08-23', '收入', '現金', '', 1200, '', 'tx-1'],
    ]))
    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    expect(r.upgradeMonths).toEqual(['2026-08'])
    expect(r.seeds[0].categoryId).toBe('c1')   // 無 ID 欄時靠名稱對照回來
  })

  it('舊彙總格式月份被標記為待改寫，並就地拆解成逐筆交易', async () => {
    const { sheets } = await loadSheets(monthRoute([
      ['日期', '現金', '備註', '總收入', '總支出', '淨利'],
      ['2026-08-23', 900, '', 900, 0, 900],
    ]))
    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    expect(r.oldFormatMonths).toEqual(['2026-08'])
    expect(r.seeds).toHaveLength(1)
    expect(r.seeds[0].amount).toBe(900)
  })
})

describe('syncMonthTransactionsToSheets — 整月覆蓋寫入', () => {
  it('先 clear 再整表 PUT，表頭固定為 TX_MONTH_HEADERS', async () => {
    const { sheets } = await loadSheets((url, method) =>
      titlesRoute(['2026-08'])(url, method) ?? (method === 'POST' || method === 'PUT' ? {} : undefined))

    await sheets.syncMonthTransactionsToSheets('SS', '2026-08', [{
      id: 'tx-1', date: '2026-08-23', type: 'income', categoryId: 'c1', subId: null,
      amount: 1200, syncStatus: 'PENDING', createdAt: 'now', updatedAt: 'now',
    }], [cat({})])

    const clearIdx = calls.findIndex(c => c.url.includes(':clear'))
    const put = calls.find(c => c.method === 'PUT')!
    // 🔴 沒先 clear 就 PUT：交易筆數變少時，舊列會殘留在雲端變成幽靈帳目
    expect(clearIdx).toBeGreaterThanOrEqual(0)
    expect(clearIdx).toBeLessThan(calls.indexOf(put))
    expect(put.body.values[0]).toEqual([...TX_MONTH_HEADERS])
    expect(put.body.values[1][0]).toBe('2026-08-23')
    expect(put.body.values[1][4]).toBe(1200)
  })
})
