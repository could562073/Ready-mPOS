import { useRef, useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from '../components/Icon'
import { useMonthlyRecords } from '../hooks/useMonthlyRecords'
import { getCategories, calcFees } from '../lib/categories'
import type { DailyRecord } from '../types'

// 加總 incomes / expenses Record 的所有值
function dayIncome(r: DailyRecord)  { return Object.values(r.incomes  ?? {}).reduce((s, v) => s + v, 0) }
function dayExpense(r: DailyRecord) { return Object.values(r.expenses ?? {}).reduce((s, v) => s + v, 0) }

function toMonthString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(m: string) {
  const [y, mo] = m.split('-')
  return `${y} 年 ${parseInt(mo)} 月`
}

// SVG 趨勢雙折線圖
function TrendChart({ records }: { records: DailyRecord[] }) {
  const W = 340, H = 140, PAD = 10
  if (records.length === 0) return null

  const days = records.map(r => ({
    income:  dayIncome(r),
    expense: dayExpense(r),
    day:     parseInt(r.date.slice(8)),
  }))

  const maxV = Math.max(...days.flatMap(d => [d.income, d.expense]), 1)
  const xAt = (i: number) => PAD + (i / Math.max(days.length - 1, 1)) * (W - PAD * 2)
  const yAt = (v: number) => H - PAD - (v / maxV) * (H - PAD * 2)

  const linePath = (key: 'income' | 'expense') =>
    days.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`).join(' ')

  const areaPath = (key: 'income' | 'expense') => {
    const top = linePath(key)
    return `${top} L${xAt(days.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${xAt(0).toFixed(1)},${(H - PAD).toFixed(1)} Z`
  }

  const last = days[days.length - 1]

  return (
    <div style={{ background: T.card, borderRadius: T.r.lg, padding: 18, boxShadow: T.shadow.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>收支趨勢</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 700 }}>
          {[{ color: T.mint, label: '收入' }, { color: T.coral, label: '支出' }].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: item.color, display: 'inline-block' }} />
              <span style={{ color: T.ink2 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <svg
        width={W} height={H}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        viewBox={`0 0 ${W} ${H}`}
      >
        <defs>
          <linearGradient id="incFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={T.mint}  stopOpacity="0.28" />
            <stop offset="100%" stopColor={T.mint} stopOpacity="0"    />
          </linearGradient>
          <linearGradient id="expFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={T.coral}  stopOpacity="0.22" />
            <stop offset="100%" stopColor={T.coral} stopOpacity="0"    />
          </linearGradient>
        </defs>

        {/* 橫向格線 */}
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p}
            x1={PAD} x2={W - PAD}
            y1={PAD + p * (H - PAD * 2)} y2={PAD + p * (H - PAD * 2)}
            stroke={T.hairline} strokeWidth="1"
          />
        ))}

        <path d={areaPath('income')}  fill="url(#incFill)" />
        <path d={areaPath('expense')} fill="url(#expFill)" />
        <path d={linePath('income')}  fill="none" stroke={T.mint}  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath('expense')} fill="none" stroke={T.coral} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* 今日端點 */}
        <circle cx={xAt(days.length - 1)} cy={yAt(last.income)}  r="5" fill="#fff" stroke={T.mint}  strokeWidth="2.5" />
        <circle cx={xAt(days.length - 1)} cy={yAt(last.expense)} r="5" fill="#fff" stroke={T.coral} strokeWidth="2.5" />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: T.muted, fontWeight: 600 }}>
        <span>1日</span>
        <span>{Math.round(days.length / 2)}日</span>
        <span>{days[days.length - 1].day}日</span>
      </div>
    </div>
  )
}

// 分類橫條圖（動態類別，收入/支出分組）
function CategoryBars({ records }: { records: DailyRecord[] }) {
  const allCats = getCategories()
  const buildGroup = (type: 'income' | 'expense') => {
    const items = allCats
      .filter(cat => cat.type === type)
      .map(cat => ({
        l: cat.name,
        v: records.reduce((s, r) => {
          const map = type === 'income' ? (r.incomes ?? {}) : (r.expenses ?? {})
          return s + (map[cat.id] ?? 0)
        }, 0),
        c: (colorMap[cat.color] ?? colorMap['mint']).bg,
      }))
      .filter(c => c.v > 0)
    const total = items.reduce((s, c) => s + c.v, 0)
    return { items, total }
  }

  const income  = buildGroup('income')
  const expense = buildGroup('expense')

  if (income.items.length === 0 && expense.items.length === 0) return null

  const renderGroup = (
    title: string,
    items: { l: string; v: number; c: string }[],
    total: number,
    totalColor: string,
  ) => {
    if (items.length === 0) return null
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.4, textTransform: 'uppercase' as const }}>{title}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: totalColor, fontFamily: T.font.num }}>{fmt(total)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {items.map(c => {
            const pct = total > 0 ? Math.round((c.v / total) * 100) : 0
            return (
              <div key={c.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: T.ink2, fontWeight: 700 }}>{c.l}</span>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>
                    <span style={{ color: T.muted, fontFamily: T.font.num, fontWeight: 700, marginRight: 6 }}>{pct}%</span>
                    <span style={{ color: T.ink, fontFamily: T.font.num }}>{fmt(c.v)}</span>
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: T.bg, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(pct, c.v > 0 ? 1.5 : 0)}%`, height: '100%', background: c.c, borderRadius: 4, transition: 'width 400ms ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div style={{ background: T.card, borderRadius: T.r.lg, padding: 18, boxShadow: T.shadow.card }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 14 }}>本月分類</div>
      {renderGroup('收入', income.items, income.total, T.mintInk)}
      {renderGroup('支出', expense.items, expense.total, T.coralInk)}
    </div>
  )
}

interface Props {
  onSelectDate: (date: string) => void
}

export function MonthlyReportPage({ onSelectDate }: Props) {
  const [month, setMonth] = useState(() => toMonthString(new Date()))
  const [view,  setView]  = useState<'chart' | 'list'>('chart')
  const monthInputRef = useRef<HTMLInputElement>(null)
  const { records, loading } = useMonthlyRecords(month)

  const allCategories = getCategories()
  const totalIncome   = records.reduce((s, r) => s + dayIncome(r),  0)
  const totalExpense  = records.reduce((s, r) => s + dayExpense(r), 0)
  const totalFees     = records.reduce((s, r) => s + calcFees(r, allCategories), 0)
  const net           = totalIncome - totalExpense - totalFees
  const avgDaily      = records.length > 0 ? Math.round(net / records.length) : 0

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 月份選擇器 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 0' }}>
        {/* onClick 呼叫 showPicker() 解決 desktop 必須點到隱藏日曆圖示才能開啟的問題 */}
        {/* overlay input 保留讓 iOS 直接觸碰時能打開原生選擇器 */}
        <div
          style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
          onClick={() => { try { monthInputRef.current?.showPicker() } catch {} }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 999,
              background: T.card, boxShadow: T.shadow.card,
              fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.font.sans,
              pointerEvents: 'none',
            }}
          >
            <Icon name="calendar" size={14} stroke={2.4} color={T.lavenderInk} />
            {formatMonthLabel(month)}
            <Icon name="chevron-d" size={14} stroke={2.4} color={T.muted} />
          </div>
          <input
            ref={monthInputRef}
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, cursor: 'pointer' }}
          />
        </div>
        {/* 匯出 stub */}
        <button
          style={{
            width: 36, height: 36, borderRadius: 12,
            background: T.card, border: 'none', boxShadow: T.shadow.card,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <Icon name="receipt" size={16} stroke={2.4} color={T.ink2} />
        </button>
      </div>

      {/* 本月淨額 Hero 卡 */}
      <div
        style={{
          position: 'relative', overflow: 'hidden',
          padding: 20, borderRadius: T.r.xl,
          background: net >= 0
            ? `linear-gradient(135deg, ${T.lavender} 0%, #7B5BD8 100%)`
            : `linear-gradient(135deg, ${T.coral} 0%, #D63E3E 100%)`,
          color: '#fff',
          boxShadow: net >= 0
            ? '0 12px 32px rgba(155,138,251,0.32)'
            : '0 12px 32px rgba(255,107,107,0.32)',
        }}
      >
        <div style={{ position: 'absolute', right: -30, top: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
            本月淨額（累計 {records.length} 天）
          </div>
          <div style={{ fontSize: 38, fontWeight: 800, fontFamily: T.font.num, letterSpacing: -1, marginTop: 4 }}>
            {fmt(net, { plus: true, sign: true })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[
              { label: '總收入', value: fmt(totalIncome)  },
              { label: '總支出', value: fmt(totalExpense) },
              { label: '日均',   value: fmt(avgDaily)     },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.16)' }}>
                <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.font.num, marginTop: 2 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted, fontSize: 14 }}>載入中⋯</div>
      ) : records.length === 0 ? (
        <div style={{ background: T.card, borderRadius: T.r.lg, padding: 40, textAlign: 'center', boxShadow: T.shadow.card }}>
          <div style={{ color: T.muted, fontSize: 14 }}>本月尚無記帳紀錄</div>
          <div style={{ color: T.hairline, fontSize: 12, marginTop: 4 }}>切換到「記帳」頁面開始記錄</div>
        </div>
      ) : (
        <>
          {/* 圖表 / 明細 切換 */}
          <div style={{ display: 'flex', padding: 4, borderRadius: 14, background: T.card, boxShadow: T.shadow.card }}>
            {[{ k: 'chart' as const, l: '趨勢圖' }, { k: 'list' as const, l: '每日明細' }].map(tab => (
              <button
                key={tab.k}
                onClick={() => setView(tab.k)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 11, border: 'none',
                  background: view === tab.k ? T.ink : 'transparent',
                  color:      view === tab.k ? '#fff' : T.ink2,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 160ms ease', fontFamily: T.font.sans,
                }}
              >{tab.l}</button>
            ))}
          </div>

          {view === 'chart' ? (
            <>
              <TrendChart records={records} />
              <CategoryBars records={records} />
            </>
          ) : (
            /* 每日明細表 */
            <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
              {/* 表頭 */}
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr', padding: '10px 14px', fontSize: 11, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>日期</span>
                <span style={{ textAlign: 'right' }}>收入</span>
                <span style={{ textAlign: 'right' }}>支出</span>
                <span style={{ textAlign: 'right' }}>淨額</span>
              </div>

              {[...records].reverse().map(r => {
                const inc = dayIncome(r)
                const exp = dayExpense(r)
                const rowNet = inc - exp - calcFees(r, allCategories)
                const day = parseInt(r.date.slice(8))
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelectDate(r.date)}
                    style={{
                      display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
                      padding: '12px 14px', alignItems: 'center',
                      borderTop: `1px solid ${T.hairline}`,
                      cursor: 'pointer', width: '100%', background: 'transparent', border: 'none',
                      fontFamily: T.font.sans,
                    }}
                  >
                    <div>
                      <span style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: T.bg, color: T.ink2,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 800, fontFamily: T.font.num,
                      }}>{day}</span>
                    </div>
                    <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: T.mintInk, fontFamily: T.font.num }}>{fmt(inc)}</span>
                    <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: T.coralInk, fontFamily: T.font.num }}>{fmt(exp)}</span>
                    <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: rowNet >= 0 ? T.ink : T.coralInk, fontFamily: T.font.num }}>
                      {fmt(rowNet, { plus: true, sign: true })}
                    </span>
                  </button>
                )
              })}

              {/* 合計列 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
                padding: '14px 14px', alignItems: 'center',
                borderTop: `2px solid ${T.ink}`,
                background: T.bg,
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: T.ink }}>合計</span>
                <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: T.mintInk, fontFamily: T.font.num }}>{fmt(totalIncome)}</span>
                <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: T.coralInk, fontFamily: T.font.num }}>{fmt(totalExpense)}</span>
                <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.font.num }}>
                  {fmt(net, { plus: true, sign: true })}
                </span>
              </div>
            </div>
          )}

          {/* 匯出按鈕（stub） */}
          <button
            style={{
              padding: 14, borderRadius: T.r.md, border: 'none',
              background: T.card, boxShadow: T.shadow.card,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 14, fontWeight: 700, color: T.ink, cursor: 'pointer', fontFamily: T.font.sans,
            }}
          >
            <Icon name="cloud" size={16} stroke={2.4} color={T.lavenderInk} />
            匯出 PDF / 同步 Google Sheets
          </button>
        </>
      )}
    </div>
  )
}
