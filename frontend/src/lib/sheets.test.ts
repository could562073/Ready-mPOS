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

  it('以 UNFORMATTED_VALUE 讀取（2.5.0：拿真值，不受顯示格式影響）', async () => {
    const { sheets } = await loadSheets((url, method) =>
      method === 'GET' && url.includes('/values/') ? { values: [CONFIG_HEADER] } : undefined)
    await sheets.pullConfigFromSheets('SS')
    expect(calls[0].url).toContain('valueRenderOption=UNFORMATTED_VALUE')
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

  it('以 UNFORMATTED_VALUE 讀取，金額數字與日期序號都能正確還原（2.5.0）', async () => {
    const { sheets } = await loadSheets(monthRoute([
      [...TX_MONTH_HEADERS],
      // UNFORMATTED_VALUE 下：金額是真數字、日期儲存格是序號（46257 = 2026-08-23）
      [46257, '收入', '現金', '', 1200.5, '', 'tx-1', 'c1', ''],
    ]))
    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    const monthCall = calls.find(c => c.url.includes('2026-08'))!
    expect(monthCall.url).toContain('valueRenderOption=UNFORMATTED_VALUE')
    expect(r.seeds[0].date).toBe('2026-08-23')
    expect(r.seeds[0].amount).toBe(1200.5)
    expect(r.unreadableMonths).toEqual([])
  })

  // 🔴 本輪的核心防線：讀不懂的列必須冒泡成 unreadableMonths，
  //    否則「略過該列」＋「整月 clear+覆蓋」＝把它從雲端永久刪除
  it('月份含讀不懂的列 → 標記 unreadableMonths，可讀的列照常帶回', async () => {
    const { sheets } = await loadSheets(monthRoute([
      [...TX_MONTH_HEADERS],
      ['2026-08-23', '收入', '現金', '', 1200, '', 'tx-1', 'c1', ''],
      ['2026-08-24', '收入', '現金', '', '一千二', '', 'tx-2', 'c1', ''],
    ]))
    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    expect(r.unreadableMonths).toEqual(['2026-08'])
    expect(r.seeds.map(x => x.id)).toEqual(['tx-1'])
  })

  it('使用者手動加的列（有內容、沒有 id）也擋下該月改寫', async () => {
    const { sheets } = await loadSheets(monthRoute([
      [...TX_MONTH_HEADERS],
      ['2026-08-23', '收入', '現金', '', 1200, '手寫備忘', '', '', ''],
    ]))
    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    expect(r.unreadableMonths).toEqual(['2026-08'])
  })

  it('純空白列不算讀不懂（不該無謂擋下整月改寫）', async () => {
    const { sheets } = await loadSheets(monthRoute([
      [...TX_MONTH_HEADERS],
      ['2026-08-23', '收入', '現金', '', 1200, '', 'tx-1', 'c1', ''],
      ['', '', '', '', '', '', '', '', ''],
    ]))
    const r = await sheets.pullAllTransactionsFromSheets('SS', [cat({})])
    expect(r.unreadableMonths).toEqual([])
    expect(r.seeds).toHaveLength(1)
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
    // 🔴 RAW（2.5.0）：USER_ENTERED 會讓 Sheets 替我們決定型別——日期被轉成日期儲存格、
    //    備註若長得像公式會被當公式解析。同 2.4.1 _config 的教訓。
    expect(put.url).toContain('valueInputOption=RAW')
    expect(put.url).not.toContain('USER_ENTERED')
    expect(put.body.values[0]).toEqual([...TX_MONTH_HEADERS])
    expect(put.body.values[1][0]).toBe('2026-08-23')
    expect(put.body.values[1][4]).toBe(1200)
  })
})

// ── parseOldMonthRows（舊彙總格式解析）────────────────────────────────────────
// 🔴 這條路徑對正式站客戶是「活的」：其診斷回報的 oldMonthCount 自 2026-07-29
// 起一直是 1，代表雲端始終有一個尚未轉檔的舊格式月份。2.5.0 把月份讀取改成
// UNFORMATTED_VALUE 時，這裡差點出事——舊格式分頁是 2.0 之前用 USER_ENTERED
// 寫的，日期欄在雲端是**真的日期儲存格**，改讀之後拿到的是序號而不是字串，
// 若沿用舊的字串解析，explodeDailyRecord 的決定性 id 會變成 mpos:46257:...
// 而與本機 id 對不起來，整批歷史帳目會被當成新資料重複匯入。
describe('parseOldMonthRows — 舊彙總格式', () => {
  const OLD_HEADER = ['日期', '現金', '食材採購', '項目備註', '備註']
  const oldCats = [
    cat({ id: 'c1', name: '現金', type: 'income' }),
    cat({ id: 'c2', name: '食材採購', type: 'expense' }),
  ]

  it('🔴 日期為序號（UNFORMATTED_VALUE）→ 正確還原成 YYYY-MM-DD', async () => {
    const { sheets } = await loadSheets(() => undefined)
    const r = sheets.parseOldMonthRows([OLD_HEADER, [46257, 1200, 300, '', '']], oldCats)

    expect(r.unreadable).toBe(false)
    expect(r.records).toHaveLength(1)
    expect(r.records[0].date).toBe('2026-08-23')
    expect(r.records[0].incomes).toEqual({ c1: 1200 })
    expect(r.records[0].expenses).toEqual({ c2: 300 })
  })

  it('日期為字串（FORMATTED_VALUE 殘留）仍然讀得懂', async () => {
    const { sheets } = await loadSheets(() => undefined)
    const r = sheets.parseOldMonthRows([OLD_HEADER, ['2026-08-23', 1200, 0, '', '']], oldCats)

    expect(r.unreadable).toBe(false)
    expect(r.records[0].date).toBe('2026-08-23')
  })

  it('🔴 日期讀不出來 → 標記 unreadable 並跳過該列，絕不猜一個日期', async () => {
    const { sheets } = await loadSheets(() => undefined)
    const r = sheets.parseOldMonthRows(
      [OLD_HEADER, ['第三季', 1200, 0, '', ''], ['2026-08-24', 500, 0, '', '']], oldCats)

    // 猜錯日期會讓整天的帳目落到錯誤月份、在月結中憑空消失
    expect(r.unreadable).toBe(true)
    expect(r.records).toHaveLength(1)
    expect(r.records[0].date).toBe('2026-08-24')
  })

  it('🔴 金額有值卻解析不出來 → unreadable，絕不當成 0', async () => {
    const { sheets } = await loadSheets(() => undefined)
    const r = sheets.parseOldMonthRows([OLD_HEADER, ['2026-08-23', '待確認', 300, '', '']], oldCats)

    // 0 是合法金額，拿它當解析失敗的哨兵值＝授權一次壞掉的讀取覆寫真實帳目
    expect(r.unreadable).toBe(true)
    expect(r.records[0].incomes).toEqual({})
    expect(r.records[0].expenses).toEqual({ c2: 300 })
  })

  it('金額為千分位字串 → 正確解析，不歸零', async () => {
    const { sheets } = await loadSheets(() => undefined)
    const r = sheets.parseOldMonthRows([OLD_HEADER, ['2026-08-23', '1,234', 0, '', '']], oldCats)

    expect(r.unreadable).toBe(false)
    expect(r.records[0].incomes).toEqual({ c1: 1234 })
  })

  it('日期欄空白的列 → 單純略過，不算 unreadable（不觸發誤報橫幅）', async () => {
    const { sheets } = await loadSheets(() => undefined)
    const r = sheets.parseOldMonthRows([OLD_HEADER, ['', '', '', '', ''], ['2026-08-23', 100, 0, '', '']], oldCats)

    expect(r.unreadable).toBe(false)
    expect(r.records).toHaveLength(1)
  })
})
