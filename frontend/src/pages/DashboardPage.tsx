import { T, PLATFORM_FEES, incomeColors } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from '../components/Icon'
import { useDailyRecord } from '../hooks/useDailyRecord'
import { useMonthlyRecords } from '../hooks/useMonthlyRecords'
import type { DailyRecord } from '../types'

type Tab = 'dashboard' | 'daily' | 'monthly' | 'settings'

function toLocalDateString(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toMonthString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dayIncome(r: DailyRecord) {
  return r.cashIncome + r.cardIncome + r.uberEatsIncome + r.pandaIncome
}
function dayExpense(r: DailyRecord) {
  return r.foodCost + r.staffSalary + r.miscExpense
}
function dayNetAfterFees(r: DailyRecord) {
  const uberNet = r.uberEatsIncome * (1 - PLATFORM_FEES.uber)
  const pandaNet = r.pandaIncome * (1 - PLATFORM_FEES.panda)
  const inc = r.cashIncome + r.cardIncome + uberNet + pandaNet
  return inc - r.foodCost - r.staffSalary - r.miscExpense
}

// 每日收入來源的色彩與標籤設定
const INCOME_SOURCES = [
  { key: 'cashIncome',     label: '現金',      icon: 'cash',    color: incomeColors.cash  },
  { key: 'cardIncome',     label: '刷卡',      icon: 'card',    color: incomeColors.card  },
  { key: 'uberEatsIncome', label: 'Uber Eats', icon: 'bike',    color: incomeColors.uber  },
  { key: 'pandaIncome',    label: 'foodpanda', icon: 'package', color: incomeColors.panda },
] as const

// 7 天小柱狀圖
function MiniBarChart({ bars }: { bars: { value: number; isToday: boolean }[] }) {
  const max = Math.max(...bars.map(b => b.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 56 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: '100%',
              height: `${Math.max((b.value / max) * 100, 6)}%`,
              minHeight: 4,
              borderRadius: 4,
              background: b.isToday ? T.mint : T.mintSoft,
              transition: 'height 400ms ease',
            }}
          />
        </div>
      ))}
    </div>
  )
}

interface Props {
  onNavigate: (tab: Tab) => void
  syncing: boolean
}

export function DashboardPage({ onNavigate, syncing }: Props) {
  const today = new Date()
  const todayStr = toLocalDateString(today)
  const monthStr = toMonthString(today)

  const { record: todayRecord } = useDailyRecord(todayStr)
  const { records: monthRecords } = useMonthlyRecords(monthStr)

  // 今日加總
  const todayIncome  = todayRecord ? dayIncome(todayRecord)  : 0
  const todayExpense = todayRecord ? dayExpense(todayRecord) : 0
  const todayNet     = todayIncome - todayExpense
  const todayNetAfterFees = todayRecord ? dayNetAfterFees(todayRecord) : 0

  // 本月加總
  const mtdIncome  = monthRecords.reduce((s, r) => s + dayIncome(r),  0)
  const mtdExpense = monthRecords.reduce((s, r) => s + dayExpense(r), 0)
  const mtdNet     = mtdIncome - mtdExpense

  // 食材成本率
  const foodPct = todayIncome > 0 && todayRecord
    ? Math.round((todayRecord.foodCost / todayIncome) * 100)
    : 0

  // 近 7 天收入 bar chart 資料
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    const ds = toLocalDateString(d)
    const rec = monthRecords.find(r => r.date === ds)
    return { value: rec ? dayIncome(rec) : 0, isToday: ds === todayStr, day: d.getDate() }
  })
  const week7Income = last7.reduce((s, b) => s + b.value, 0)

  // 中文日期顯示
  const DOW = ['週日','週一','週二','週三','週四','週五','週六'][today.getDay()]
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 · ${DOW}`

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 頂部問候 + 同步狀態 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 0' }}>
        <div>
          <div style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{dateLabel}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, letterSpacing: -0.5, marginTop: 2 }}>
            早安，老闆 👋
          </div>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 999,
            background: syncing ? T.skySoft   : T.mintSoft,
            color:      syncing ? T.skyInk    : T.mintInk,
            fontSize: 12, fontWeight: 700,
          }}
        >
          <Icon name={syncing ? 'sync' : 'cloud-check'} size={14} stroke={2.4} />
          <span>{syncing ? '同步中…' : '已同步'}</span>
        </div>
      </div>

      {/* 今日淨額 Hero 卡 */}
      <div
        style={{
          position: 'relative', overflow: 'hidden',
          padding: 20, borderRadius: T.r.xl,
          background: `linear-gradient(135deg, ${T.mint} 0%, #14B86E 100%)`,
          color: '#fff',
          boxShadow: '0 12px 32px rgba(16,199,126,0.32)',
        }}
      >
        {/* 裝飾圓圈 */}
        <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'absolute', right: 30, bottom: -50, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>今日淨額</div>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.font.num, letterSpacing: -1, marginTop: 4, lineHeight: 1.1 }}>
            {fmt(todayNet, { plus: true })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            {[
              { label: '收入',    value: fmt(todayIncome)                        },
              { label: '支出',    value: fmt(todayExpense)                       },
              { label: '扣分潤後', value: fmt(todayNetAfterFees, { plus: true }) },
            ].map((item, i) => (
              <div key={i} style={{ flex: 1 }}>
                {i > 0 && (
                  <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 1, height: '60%', background: 'rgba(255,255,255,0.2)' }} />
                )}
                <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.font.num, marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 快捷進入今日記帳 */}
      <button
        onClick={() => onNavigate('daily')}
        style={{
          padding: '16px 18px', borderRadius: T.r.lg, border: 'none',
          background: T.card, boxShadow: T.shadow.card,
          display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer', textAlign: 'left', width: '100%',
        }}
      >
        <div
          style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: T.lavenderSoft, color: T.lavenderInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="pencil" size={22} stroke={2.2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>編輯今日帳目</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {todayRecord ? '今日已有記錄，點擊編輯' : '今日尚未記帳，點擊開始'}
          </div>
        </div>
        <Icon name="chevron-r" size={18} color={T.muted} stroke={2.4} />
      </button>

      {/* 今日收入來源分解 */}
      <div>
        <div
          style={{
            fontSize: 13, fontWeight: 700, color: T.ink2,
            padding: '0 4px 10px',
            display: 'flex', justifyContent: 'space-between',
          }}
        >
          <span>今日收入來源</span>
          <span style={{ color: T.muted, fontWeight: 600 }}>{fmt(todayIncome)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {INCOME_SOURCES.map(src => {
            const value = todayRecord ? (todayRecord[src.key] as number) : 0
            const pct   = todayIncome > 0 ? Math.round((value / todayIncome) * 100) : 0
            return (
              <div
                key={src.key}
                style={{
                  padding: 14, borderRadius: T.r.md,
                  background: T.card, boxShadow: T.shadow.card,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: 9,
                      background: src.color.soft, color: src.color.ink,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name={src.icon} size={15} stroke={2.4} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2 }}>{src.label}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.3 }}>
                  {fmt(value)}
                </div>
                {/* 佔比條 */}
                <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: T.hairline, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: src.color.bg, borderRadius: 2, transition: 'width 400ms ease' }} />
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 4, fontWeight: 600 }}>
                  {pct}% 佔今日
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 近 7 天收入小圖 */}
      <div style={{ padding: 18, borderRadius: T.r.lg, background: T.card, boxShadow: T.shadow.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>近 7 天收入</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.4, marginTop: 2 }}>
              {fmt(week7Income)}
            </div>
          </div>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: T.mintInk, fontSize: 12, fontWeight: 700,
              background: T.mintSoft, padding: '4px 8px', borderRadius: 8,
            }}
          >
            <Icon name="trend-up" size={12} stroke={2.6} />
            本週
          </div>
        </div>
        <MiniBarChart bars={last7} />
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 6, fontSize: 10, color: T.muted, fontWeight: 600,
          }}
        >
          {last7.map((b, i) => <span key={i}>{b.day}日</span>)}
        </div>
      </div>

      {/* 本月淨額 + 食材成本率 快速統計 */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: '本月淨額',  value: fmt(mtdNet, { plus: true }), icon: 'wallet', soft: T.mintSoft,  ink: T.mintInk  },
          { label: '食材成本率', value: `${foodPct}%`,               icon: 'chart',  soft: T.peachSoft, ink: T.peachInk },
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              flex: 1, padding: '14px 16px', borderRadius: T.r.lg,
              background: T.card, boxShadow: T.shadow.card,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 24, height: 24, borderRadius: 8,
                  background: stat.soft, color: stat.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name={stat.icon} size={14} stroke={2.4} />
              </div>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{stat.label}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.3 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* 洞察卡片 */}
      {todayRecord && (todayRecord.uberEatsIncome + todayRecord.pandaIncome) > todayIncome * 0.4 && (
        <div
          style={{
            padding: 16, borderRadius: T.r.lg,
            background: `linear-gradient(135deg, ${T.sunSoft} 0%, ${T.peachSoft} 100%)`,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: 12, flexShrink: 0,
              background: '#fff', color: T.peachInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="sparkle" size={18} stroke={2.4} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>外送佔比偏高</div>
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
              外送平台已扣 30–35% 手續費，建議多推內用方案提升毛利。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
