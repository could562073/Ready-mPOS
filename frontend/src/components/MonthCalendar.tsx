import { T } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from './Icon'
import { buildMonthMatrix, monthDayNets } from '../lib/calendar'
import { useMonthTransactions } from '../hooks/useTransactions'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function toLocalDateString(d: Date): string {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface MonthCalendarProps {
  month: string
  selectedDate: string
  onSelectDate: (date: string) => void
  onShiftMonth: (delta: number) => void
}

// 月曆：每格顯示日期與當日淨額（+綠/−紅），今天描邊、選定填色，點日切換
export function MonthCalendar({ month, selectedDate, onSelectDate, onShiftMonth }: MonthCalendarProps) {
  const { transactions } = useMonthTransactions(month)
  const nets = monthDayNets(transactions)
  const weeks = buildMonthMatrix(month)
  const today = toLocalDateString(new Date())
  const [y, mo] = month.split('-').map(Number)

  return (
    <div style={{ background: T.card, borderRadius: T.r.xl, boxShadow: T.shadow.card, padding: '12px 10px' }}>
      {/* 月份切換列 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 10px' }}>
        <button aria-label="上個月" onClick={() => onShiftMonth(-1)} style={navBtn}>
          <Icon name="chevron-l" size={16} stroke={2.4} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{y} 年 {mo} 月</div>
        <button aria-label="下個月" onClick={() => onShiftMonth(1)} style={navBtn}>
          <Icon name="chevron-r" size={16} stroke={2.4} />
        </button>
      </div>
      {/* 星期列 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: T.muted, padding: '2px 0' }}>{w}</div>
        ))}
      </div>
      {/* 日期格 */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {week.map((cell, ci) => {
            if (!cell) return <div key={ci} />
            const day = Number(cell.split('-')[2])
            const net = nets[cell]
            const isToday = cell === today
            const isSelected = cell === selectedDate
            return (
              <button
                key={ci}
                onClick={() => onSelectDate(cell)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  border: isToday && !isSelected ? `1.5px solid ${T.lavenderInk}` : '1.5px solid transparent',
                  background: isSelected ? T.ink : 'transparent',
                  borderRadius: 10, padding: '5px 0 3px', cursor: 'pointer', minHeight: 40,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#fff' : T.ink }}>{day}</span>
                {net !== undefined && net !== 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: T.font.num,
                    color: isSelected ? '#fff' : (net > 0 ? T.mintInk : T.coralInk),
                  }}>
                    {net > 0 ? '+' : '-'}{fmt(Math.abs(net))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const navBtn = {
  border: 'none', background: T.bg, borderRadius: 9, width: 30, height: 30,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.ink2,
} as const
