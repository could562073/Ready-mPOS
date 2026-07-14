// frontend/src/components/MissingDaysCard.tsx
// 月結「未記帳日」提示卡——取代紙本月底逐日核對的漏記檢查。
// 顯示規則：該月完全無交易（txDates 空）不顯示（避免用前史空月洗版）；
// 無漏記且無臨時公休標記也不顯示（零干擾）；無漏記但有臨時標記時顯示瘦身版（可取消誤標）。
import { useState } from 'react'
import { T } from '../lib/tokens'
import { missingDays } from '../lib/monthReport'
import { getWeeklyClosed, getClosedDates, markClosed, unmarkClosed } from '../lib/closedDays'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const dayLabel = (date: string) =>
  `${parseInt(date.slice(5, 7))}/${parseInt(date.slice(8))}（${WEEKDAY[new Date(`${date}T00:00:00`).getDay()]}）`

export function MissingDaysCard({ month, txDates, today, onGoToDate }: {
  month: string
  txDates: Set<string>   // 該月有交易的日期集合
  today: string          // 'YYYY-MM-DD'（本地時區）
  onGoToDate: (date: string) => void // 「去補記」→ 導到帳目頁該日
}) {
  // closedVersion：標記/取消後 bump 觸發重讀 localStorage（公休設定不進 React 樹的其他地方）
  const [closedVersion, setClosedVersion] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  void closedVersion

  const weekly = getWeeklyClosed()
  const closedDates = getClosedDates()
  const monthClosed = closedDates.filter(d => d.startsWith(`${month}-`))
  const missing = missingDays(month, txDates, weekly, new Set(closedDates), today)

  if (txDates.size === 0) return null
  if (missing.length === 0 && monthClosed.length === 0) return null

  const mark = (date: string) => {
    markClosed(date)             // 標為臨時公休 → 立即從漏記清單消失
    setSelected(null)
    setClosedVersion(v => v + 1)
  }
  const unmark = (date: string) => {
    unmarkClosed(date)           // 取消誤標 → 回到漏記清單
    setClosedVersion(v => v + 1)
  }

  return (
    <div style={{ background: T.sunSoft, borderRadius: T.r.lg, padding: 16, boxShadow: T.shadow.card }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.sunInk }}>
        {missing.length > 0
          ? `${parseInt(month.slice(5))} 月未記帳：${missing.length} 天`
          : `${parseInt(month.slice(5))} 月無漏記 ✓`}
        {weekly.length > 0 && (
          <span style={{ fontWeight: 600, marginLeft: 6 }}>
            （每週{weekly.map(d => WEEKDAY[d]).join('、')}公休已排除）
          </span>
        )}
      </div>

      {missing.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {missing.map(date => (
            <button
              key={date}
              onClick={() => setSelected(selected === date ? null : date)}
              style={{
                padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontFamily: T.font.num, fontSize: 12, fontWeight: 800,
                background: selected === date ? T.sunInk : T.card,
                color: selected === date ? '#fff' : T.sunInk,
                boxShadow: T.shadow.card,
              }}
            >{dayLabel(date)}</button>
          ))}
        </div>
      )}

      {/* 點選日期 → 兩個動作：去補記 / 標為公休 */}
      {selected && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.sunInk, fontFamily: T.font.num }}>{dayLabel(selected)}</span>
          <button
            onClick={() => onGoToDate(selected)}
            style={{ padding: '8px 14px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', background: T.ink, color: '#fff', fontSize: 12, fontWeight: 800, fontFamily: T.font.sans }}
          >去補記</button>
          <button
            onClick={() => mark(selected)}
            style={{ padding: '8px 14px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', background: T.card, color: T.ink2, fontSize: 12, fontWeight: 800, fontFamily: T.font.sans }}
          >標為公休</button>
        </div>
      )}

      {/* 臨時公休管理：可展開取消誤標 */}
      {monthClosed.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setManaging(!managing)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, color: T.sunInk, textDecoration: 'underline', fontFamily: T.font.sans }}
          >本月已標公休 {monthClosed.length} 天{managing ? '（收合）' : '（管理）'}</button>
          {managing && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {monthClosed.map(date => (
                <button
                  key={date}
                  onClick={() => unmark(date)}
                  aria-label={`取消 ${date} 公休`}
                  style={{ padding: '6px 12px', borderRadius: 999, border: `1px dashed ${T.sunInk}`, cursor: 'pointer', background: 'transparent', color: T.sunInk, fontSize: 12, fontWeight: 700, fontFamily: T.font.num }}
                >{dayLabel(date)} ✕</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
