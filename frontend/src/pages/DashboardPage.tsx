import { T, colorMap } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from '../components/Icon'
import { useDailyRecord } from '../hooks/useDailyRecord'
import { useMonthlyRecords } from '../hooks/useMonthlyRecords'
import { getEnabledByType, getCategories, calcFees } from '../lib/categories'
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

// 加總 incomes / expenses — 只計已知類別 ID，避免 Sheets 同步帶入的陌生欄位虛增金額
function dayIncome(r: DailyRecord, ids: Set<string>)  {
  return [...ids].reduce((s, id) => s + (r.incomes?.[id]  ?? 0), 0)
}
function dayExpense(r: DailyRecord, ids: Set<string>) {
  return [...ids].reduce((s, id) => s + (r.expenses?.[id] ?? 0), 0)
}

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

  const prevMonthStr = toMonthString(new Date(today.getFullYear(), today.getMonth() - 1, 1))

  const { record: todayRecord } = useDailyRecord(todayStr)
  const { records: monthRecords }     = useMonthlyRecords(monthStr)
  const { records: prevMonthRecords } = useMonthlyRecords(prevMonthStr)

  // 從 localStorage 讀取啟用類別（mount 時讀一次）
  const incomeCategories  = getEnabledByType('income')
  const expenseCategories = getEnabledByType('expense')

  // 建立已知類別 ID 集合（含停用），防止陌生欄位污染加總
  const allCategories   = getCategories()
  const knownIncomeIds  = new Set(allCategories.filter(c => c.type === 'income').map(c => c.id))
  const knownExpenseIds = new Set(allCategories.filter(c => c.type === 'expense').map(c => c.id))

  // 今日加總
  const todayIncome  = todayRecord ? dayIncome(todayRecord, knownIncomeIds)   : 0
  const todayExpense = todayRecord ? dayExpense(todayRecord, knownExpenseIds) : 0
  const todayNet     = todayIncome - todayExpense

  // 外送平台手續費：所有 fee > 0 的收入類別
  const feeCategories = incomeCategories.filter(c => c.fee && c.fee > 0)
  const totalFees = todayRecord
    ? feeCategories.reduce((s, c) => s + (todayRecord.incomes[c.id] ?? 0) * c.fee!, 0)
    : 0
  const todayNetAfterFees = todayNet - totalFees

  // 本月加總（含手續費扣除）
  const mtdIncome  = monthRecords.reduce((s, r) => s + dayIncome(r, knownIncomeIds),   0)
  const mtdExpense = monthRecords.reduce((s, r) => s + dayExpense(r, knownExpenseIds), 0)
  const mtdFees    = monthRecords.reduce((s, r) => s + calcFees(r, allCategories), 0)
  const mtdNet     = mtdIncome - mtdExpense - mtdFees

  // 今日成本率（總支出 / 總收入）
  const costPct = todayIncome > 0 ? Math.round((todayExpense / todayIncome) * 100) : 0

  // 合併當月 + 上月紀錄，供跨月份的 7 天查找
  const allRecords = [...prevMonthRecords, ...monthRecords]

  // 近 7 天收入 bar chart 資料
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    const ds = toLocalDateString(d)
    const rec = allRecords.find(r => r.date === ds)
    return { value: rec ? dayIncome(rec, knownIncomeIds) : 0, isToday: ds === todayStr, day: d.getDate() }
  })
  const week7Income = last7.reduce((s, b) => s + b.value, 0)

  // 前 7 天收入（用於趨勢比較）
  const prev7Income = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (13 - i))
    const ds = toLocalDateString(d)
    const rec = allRecords.find(r => r.date === ds)
    return rec ? dayIncome(rec, knownIncomeIds) : 0
  }).reduce((s, v) => s + v, 0)

  // 趨勢 badge：相對前 7 天的漲跌幅
  const trendPct = prev7Income > 0
    ? Math.round(((week7Income - prev7Income) / prev7Income) * 100)
    : week7Income > 0 ? null : 0  // 前期無資料且本期有值 → null（顯示「新」）
  const trendUp = trendPct === null || trendPct >= 0

  // 外送佔比洞察：fee > 0 類別合計 > 40% 才顯示
  const feeIncome = todayRecord
    ? feeCategories.reduce((s, c) => s + (todayRecord.incomes[c.id] ?? 0), 0)
    : 0
  const feeRatio = todayIncome > 0 ? feeIncome / todayIncome : 0
  const showFeeInsight = feeRatio > 0.4 && feeCategories.length > 0

  const DOW = ['週日','週一','週二','週三','週四','週五','週六'][today.getDay()]
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 · ${DOW}`
  const ownerName = localStorage.getItem('mpos_owner_name') || ''

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 頂部問候 + 同步狀態 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 0' }}>
        <div>
          <div style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{dateLabel}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, letterSpacing: -0.5, marginTop: 2 }}>
            早安，{ownerName || '老闆'} 👋
          </div>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 999,
            background: syncing ? T.skySoft : T.mintSoft,
            color:      syncing ? T.skyInk  : T.mintInk,
            fontSize: 12, fontWeight: 700,
          }}
        >
          <Icon name={syncing ? 'sync' : 'cloud-check'} size={14} stroke={2.4} />
          <span>{syncing ? '同步中…' : '已同步'}</span>
        </div>
      </div>

      {/* 今日淨額 Hero 卡 — 負值時呈現紅色 */}
      <div
        style={{
          position: 'relative', overflow: 'hidden',
          padding: 20, borderRadius: T.r.xl,
          background: todayNetAfterFees < 0
            ? `linear-gradient(135deg, ${T.coral} 0%, #D63E3E 100%)`
            : `linear-gradient(135deg, ${T.mint} 0%, #14B86E 100%)`,
          color: '#fff',
          boxShadow: todayNetAfterFees < 0
            ? '0 12px 32px rgba(255,107,107,0.32)'
            : '0 12px 32px rgba(16,199,126,0.32)',
          transition: 'background 400ms ease, box-shadow 400ms ease',
        }}
      >
        <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'absolute', right: 30, bottom: -50, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
            {feeCategories.length > 0 ? '今日淨額（扣分潤後）' : '今日淨額'}
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.font.num, letterSpacing: -1, marginTop: 4, lineHeight: 1.1 }}>
            {fmt(todayNetAfterFees, { plus: true })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>收入</div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.font.num, marginTop: 2 }}>{fmt(todayIncome)}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>支出</div>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.font.num, marginTop: 2 }}>{fmt(todayExpense)}</div>
            </div>
            {feeCategories.length > 0 && (
              <>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>平台費</div>
                  <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.font.num, marginTop: 2 }}>-{fmt(totalFees)}</div>
                </div>
              </>
            )}
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
        <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: T.lavenderSoft, color: T.lavenderInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pencil" size={22} stroke={2.2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>編輯今日帳目</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {(() => {
              const ic = incomeCategories.filter(c => (todayRecord?.incomes[c.id] ?? 0) > 0).length
              const ec = expenseCategories.filter(c => (todayRecord?.expenses[c.id] ?? 0) > 0).length
              return ic + ec > 0
                ? `已記 ${ic + ec} 筆 · 收 ${ic} / 支 ${ec}`
                : '今日尚未記帳，點擊開始'
            })()}
          </div>
        </div>
        <Icon name="chevron-r" size={18} color={T.muted} stroke={2.4} />
      </button>

      {/* 今日收入來源分解（動態類別，條列式）— 已停用但有值的類別也照常顯示 */}
      {(() => {
        const rows = allCategories.filter(c => c.type === 'income' && (c.enabled || (todayRecord?.incomes[c.id] ?? 0) > 0))
        if (rows.length === 0) return null
        return (
        <div style={{ background: T.card, borderRadius: 22, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: T.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow-up" size={13} stroke={2.8} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>今日收入來源</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.mintInk, fontFamily: T.font.num, letterSpacing: -0.3 }}>{fmt(todayIncome)}</span>
          </div>
          <div style={{ borderTop: `1px solid ${T.hairline}` }}>
            {rows.map((cat, i) => {
              const color = colorMap[cat.color] ?? colorMap['mint']
              const value = todayRecord?.incomes[cat.id] ?? 0
              const pct   = todayIncome > 0 ? Math.round((value / todayIncome) * 100) : 0
              const isLast = i === rows.length - 1
              return (
                <div key={cat.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  borderBottom: isLast ? 'none' : `1px solid ${T.hairline}`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: color.soft, color: color.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={cat.icon} size={16} stroke={2.4} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.2 }}>{fmt(value)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.hairline, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, height: '100%', background: color.bg, borderRadius: 2, transition: 'width 400ms ease' }} />
                      </div>
                      <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, fontFamily: T.font.num, minWidth: 26, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )
      })()}

      {/* 今日支出明細 — 已停用但有值的類別也照常顯示 */}
      {(() => {
        const rows = allCategories.filter(c => c.type === 'expense' && (c.enabled || (todayRecord?.expenses[c.id] ?? 0) > 0))
        if (rows.length === 0) return null
        return (
        <div style={{ background: T.card, borderRadius: 22, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: T.coral, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow-down" size={13} stroke={2.8} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>今日支出明細</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.coralInk, fontFamily: T.font.num, letterSpacing: -0.3 }}>{fmt(todayExpense)}</span>
          </div>
          <div style={{ borderTop: `1px solid ${T.hairline}` }}>
            {rows.map((cat, i) => {
              const color = colorMap[cat.color] ?? colorMap['coral']
              const value = todayRecord?.expenses[cat.id] ?? 0
              const pct   = todayExpense > 0 ? Math.round((value / todayExpense) * 100) : 0
              const isLast = i === rows.length - 1
              return (
                <div key={cat.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  borderBottom: isLast ? 'none' : `1px solid ${T.hairline}`,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: color.soft, color: color.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={cat.icon} size={16} stroke={2.4} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.2 }}>{fmt(value)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.hairline, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, height: '100%', background: color.bg, borderRadius: 2, transition: 'width 400ms ease' }} />
                      </div>
                      <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, fontFamily: T.font.num, minWidth: 26, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )
      })()}

      {/* 近 7 天收入小圖 */}
      <div style={{ padding: 18, borderRadius: T.r.lg, background: T.card, boxShadow: T.shadow.card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>近 7 天收入</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.4, marginTop: 2 }}>
              {fmt(week7Income)}
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: trendUp ? T.mintSoft : T.coralSoft,
            color:      trendUp ? T.mintInk  : T.coralInk,
          }}>
            <Icon name={trendUp ? 'trend-up' : 'trend-down'} size={12} stroke={2.6} />
            {trendPct === null ? '新紀錄' : `${trendPct >= 0 ? '+' : ''}${trendPct}%`}
          </div>
        </div>
        <MiniBarChart bars={last7} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: T.muted, fontWeight: 600 }}>
          {last7.map((b, i) => <span key={i}>{b.day}日</span>)}
        </div>
      </div>

      {/* 本月淨額 + 今日成本率 */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: '本月淨額',  value: fmt(mtdNet, { plus: true }), icon: 'wallet', soft: T.mintSoft,  ink: T.mintInk  },
          { label: '今日成本率', value: `${costPct}%`,               icon: 'chart',  soft: T.peachSoft, ink: T.peachInk },
        ].map(stat => (
          <div key={stat.label} style={{ flex: 1, padding: '14px 16px', borderRadius: T.r.lg, background: T.card, boxShadow: T.shadow.card, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 8, background: stat.soft, color: stat.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={stat.icon} size={14} stroke={2.4} />
              </div>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{stat.label}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.font.num, letterSpacing: -0.3 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* 洞察卡片：fee > 0 類別佔比 > 40% 才顯示 */}
      {showFeeInsight && (
        <div style={{ padding: 16, borderRadius: T.r.lg, background: `linear-gradient(135deg, ${T.sunSoft} 0%, ${T.peachSoft} 100%)`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, background: '#fff', color: T.peachInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkle" size={18} stroke={2.4} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>外送佔比偏高</div>
            <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>
              {feeCategories.map(c => c.name).join('、')} 合計佔今日收入 {Math.round(feeRatio * 100)}%，
              已扣手續費 {fmt(totalFees)}，建議多推內用方案提升毛利。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
