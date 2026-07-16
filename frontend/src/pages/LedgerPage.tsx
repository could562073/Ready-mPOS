import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from '../components/Icon'
import { useDayTransactions } from '../hooks/useTransactions'
import { getCategories } from '../lib/categories'
import { TransactionSheet } from '../components/TransactionSheet'
import { MonthCalendar } from '../components/MonthCalendar'
import { shiftMonth } from '../lib/calendar'
import type { Transaction } from '../types'

interface LedgerPageProps {
  date: string
  onDateChange: (date: string) => void
  onSync?: () => void   // 交易寫入（新增/編輯/刪除）後觸發雲端同步（App 傳入 syncAll）
}

// 本地時區日期字串（比照 App.tsx toLocalDateString，避免 UTC 位移造成跨日錯誤）
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 字串日期前後移動 delta 天：字串→Date→字串，避開月份/年份邊界問題
function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return toLocalDateString(dt)
}

// 今天標「今天」，其餘顯示「M月D日 · 週X」
function formatDateLabel(date: string): string {
  if (date === toLocalDateString(new Date())) return '今天'
  const [y, mo, d] = date.split('-').map(Number)
  const dow = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][new Date(y, mo - 1, d).getDay()]
  return `${mo}月${d}日 · ${dow}`
}

// 找不到色票時的備用色
const FALLBACK_COLOR = { bg: T.lavender, soft: T.lavenderSoft, ink: T.lavenderInk }

// 單日逐筆記帳列表頁 — 取代舊版 DailyEntryPage 的彙總表單，
// 改為顯示 useDayTransactions 查到的逐筆交易，並以右下 FAB 開啟 TransactionSheet 新增/編輯。
export function LedgerPage({ date, onDateChange, onSync }: LedgerPageProps) {
  const { transactions, loading } = useDayTransactions(date)
  const cats = getCategories()
  // null=關閉；{editing:null}=新增；{editing:tx}=編輯該筆
  const [sheet, setSheet] = useState<{ editing: Transaction | null } | null>(null)

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 月曆：顯示每日淨額，可切月、點日切換選定日期 */}
      <MonthCalendar
        month={date.slice(0, 7)}
        selectedDate={date}
        onSelectDate={onDateChange}
        onShiftMonth={delta => onDateChange(`${shiftMonth(date.slice(0, 7), delta)}-01`)}
      />

      {/* 日期標頭：前後一天切換 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
        <button
          aria-label="前一天"
          onClick={() => onDateChange(shiftDate(date, -1))}
          style={{
            border: 'none', background: T.card, boxShadow: T.shadow.card, borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.ink2,
          }}
        >
          <Icon name="chevron-l" size={16} stroke={2.4} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: T.ink }}>
          <Icon name="calendar" size={15} stroke={2.4} color={T.lavenderInk} />
          {formatDateLabel(date)}
        </div>
        <button
          aria-label="後一天"
          onClick={() => onDateChange(shiftDate(date, 1))}
          style={{
            border: 'none', background: T.card, boxShadow: T.shadow.card, borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.ink2,
          }}
        >
          <Icon name="chevron-r" size={16} stroke={2.4} />
        </button>
      </div>

      {/* 當日交易列表 */}
      <div style={{ background: T.card, borderRadius: T.r.xl, boxShadow: T.shadow.card, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted, fontSize: 14 }}>載入中⋯</div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: T.muted, fontSize: 14 }}>
            本日尚無記帳，點右下＋新增
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {transactions.map((tx, i) => {
              const cat = cats.find(c => c.id === tx.categoryId)
              const subName = tx.subId ? cat?.subs?.find(s => s.id === tx.subId)?.name : undefined
              const cc = colorMap[cat?.color ?? ''] ?? FALLBACK_COLOR
              const isIncome = tx.type === 'income'
              return (
                <div
                  key={tx.localId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSheet({ editing: tx })}
                  onKeyDown={e => { if (e.key === 'Enter') setSheet({ editing: tx }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderBottom: i < transactions.length - 1 ? `1px solid ${T.hairline}` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                    background: cc.soft, color: cc.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={cat?.icon ?? 'tag'} size={17} stroke={2.2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{cat?.name ?? '未知類別'}</span>
                      {subName && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: T.muted, background: T.bg,
                          padding: '1px 7px', borderRadius: 999,
                        }}>
                          {subName}
                        </span>
                      )}
                    </div>
                    {tx.note && (
                      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>{tx.note}</div>
                    )}
                  </div>
                  <span style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: tx.syncStatus === 'SYNCED' ? T.mint : '#F59E0B',
                  }} />
                  <span style={{
                    fontSize: 15, fontWeight: 800, fontFamily: T.font.num,
                    color: isIncome ? T.mintInk : T.coralInk, whiteSpace: 'nowrap',
                  }}>
                    {isIncome ? '+' : '-'}{fmt(tx.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 當日小計：收入/支出合計兩張卡 */}
      {!loading && transactions.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: T.mintSoft, borderRadius: T.r.lg, padding: '12px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mintInk }}>收入合計</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.mintInk, fontFamily: T.font.num, marginTop: 2 }}>
              {fmt(totalIncome)}
            </div>
          </div>
          <div style={{ flex: 1, background: T.coralSoft, borderRadius: T.r.lg, padding: '12px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.coralInk }}>支出合計</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.coralInk, fontFamily: T.font.num, marginTop: 2 }}>
              {fmt(totalExpense)}
            </div>
          </div>
        </div>
      )}

      {/* FAB 定位包層：比照 App.tsx 底部導覽列的置中手法（left:50% + maxWidth 430），
          讓 FAB 在任何裝置寬度下都對齊同一個置中欄位的右緣，而非整個視窗右緣 */}
      <div
        style={{
          position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430, height: 0, zIndex: 45, pointerEvents: 'none',
        }}
      >
        <button
          aria-label="新增交易"
          onClick={() => setSheet({ editing: null })}
          style={{
            position: 'absolute', right: 16, bottom: 0, pointerEvents: 'auto',
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: T.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(26,27,37,0.32)', cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={24} stroke={2.6} />
        </button>
      </div>

      {sheet && (
        <TransactionSheet
          date={date}
          editing={sheet.editing}
          onClose={() => setSheet(null)}
          onSaved={() => setSheet(null)}
          onSync={onSync}
        />
      )}
    </div>
  )
}
