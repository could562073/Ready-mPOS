import { useEffect, useRef, useState } from 'react'
import { T, PLATFORM_FEES, incomeColors, expenseColors } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from '../components/Icon'
import { useDailyRecord } from '../hooks/useDailyRecord'
import type { TokenColor } from '../lib/tokens'

interface DailyEntryPageProps {
  date: string
  onDateChange: (date: string) => void
  onSync?: () => void
}

// 表單欄位設定
const INCOME_FIELDS = [
  { key: 'cashIncome',     label: '現金收入',   icon: 'cash',    color: incomeColors.cash,  sublabel: null                   },
  { key: 'cardIncome',     label: '刷卡收入',   icon: 'card',    color: incomeColors.card,  sublabel: null                   },
  { key: 'uberEatsIncome', label: 'Uber Eats',  icon: 'bike',    color: incomeColors.uber,  sublabel: '自動扣 30% 平台手續費' },
  { key: 'pandaIncome',    label: 'foodpanda',  icon: 'package', color: incomeColors.panda, sublabel: '自動扣 35% 平台手續費' },
] as const

const EXPENSE_FIELDS = [
  { key: 'foodCost',    label: '食材採購', icon: 'package', color: expenseColors.food },
  { key: 'staffSalary', label: '員工薪資', icon: 'users',   color: expenseColors.wage },
  { key: 'miscExpense', label: '雜支',     icon: 'tag',     color: expenseColors.misc },
] as const

// 單一金額輸入欄
function AmountField({
  icon, label, sublabel, color, value, onChange, focused, onFocus,
}: {
  icon: string
  label: string
  sublabel?: string | null
  color: TokenColor
  value: number
  onChange: (v: number) => void
  focused: boolean
  onFocus: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div
      onClick={() => { ref.current?.focus(); onFocus() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px', borderRadius: 18,
        background: focused ? color.soft : 'transparent',
        transition: 'background 160ms ease',
        cursor: 'text',
      }}
    >
      <div
        style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          background: focused ? color.bg : color.soft,
          color: focused ? '#fff' : color.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 160ms ease',
        }}
      >
        <Icon name={icon} size={20} stroke={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 1 }}>{sublabel}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>$</span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={value === 0 ? '' : value.toLocaleString('en-US')}
          onFocus={onFocus}
          onChange={e => {
            const raw = e.target.value.replace(/[^\d]/g, '')
            onChange(raw === '' ? 0 : parseInt(raw, 10))
          }}
          placeholder="0"
          style={{
            width: 100, textAlign: 'right',
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: T.font.num, fontSize: 19, fontWeight: 800,
            color: T.ink, letterSpacing: -0.3, padding: 0,
          }}
        />
      </div>
    </div>
  )
}

// 格式化日期標籤
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const DOW = ['週日','週一','週二','週三','週四','週五','週六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${DOW}`
}

export function DailyEntryPage({ date, onDateChange, onSync }: DailyEntryPageProps) {
  const { record, loading, save } = useDailyRecord(date)

  const [cashIncome,     setCashIncome]     = useState(0)
  const [cardIncome,     setCardIncome]     = useState(0)
  const [uberEatsIncome, setUberEatsIncome] = useState(0)
  const [pandaIncome,    setPandaIncome]    = useState(0)
  const [foodCost,       setFoodCost]       = useState(0)
  const [staffSalary,    setStaffSalary]    = useState(0)
  const [miscExpense,    setMiscExpense]    = useState(0)
  const [notes,          setNotes]          = useState('')
  const [saved,    setSaved]    = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  // 載入既有紀錄填入表單
  useEffect(() => {
    if (loading) return
    if (record) {
      setCashIncome(record.cashIncome)
      setCardIncome(record.cardIncome)
      setUberEatsIncome(record.uberEatsIncome)
      setPandaIncome(record.pandaIncome)
      setFoodCost(record.foodCost)
      setStaffSalary(record.staffSalary)
      setMiscExpense(record.miscExpense)
      setNotes(record.notes ?? '')
    } else {
      setCashIncome(0); setCardIncome(0); setUberEatsIncome(0); setPandaIncome(0)
      setFoodCost(0); setStaffSalary(0); setMiscExpense(0); setNotes('')
    }
    setSaved(false)
  }, [date, loading])

  const totalIncome  = cashIncome + cardIncome + uberEatsIncome + pandaIncome
  const totalExpense = foodCost + staffSalary + miscExpense
  const net          = totalIncome - totalExpense
  const fees         = uberEatsIncome * PLATFORM_FEES.uber + pandaIncome * PLATFORM_FEES.panda
  const netAfterFees = net - fees

  const handleSave = async () => {
    await save({ cashIncome, cardIncome, uberEatsIncome, pandaIncome, foodCost, staffSalary, miscExpense, notes })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSync?.()
  }

  // 欄位值 map（方便統一渲染）
  const incomeValues: Record<string, number> = { cashIncome, cardIncome, uberEatsIncome, pandaIncome }
  const incomeSetters: Record<string, (v: number) => void> = {
    cashIncome: setCashIncome, cardIncome: setCardIncome,
    uberEatsIncome: setUberEatsIncome, pandaIncome: setPandaIncome,
  }
  const expenseValues: Record<string, number>  = { foodCost, staffSalary, miscExpense }
  const expenseSetters: Record<string, (v: number) => void> = {
    foodCost: setFoodCost, staffSalary: setStaffSalary, miscExpense: setMiscExpense,
  }

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 日期選擇 + 自動儲存狀態 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
        {/* onClick 呼叫 showPicker() 解決 desktop 必須點到隱藏日曆圖示才能開啟的問題 */}
        {/* overlay input 保留讓 iOS 直接觸碰時能打開原生選擇器 */}
        <div
          style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
          onClick={() => { try { dateInputRef.current?.showPicker() } catch {} }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 999,
              background: T.card, boxShadow: T.shadow.card,
              fontSize: 14, fontWeight: 700, color: T.ink,
              fontFamily: T.font.sans, pointerEvents: 'none',
            }}
          >
            <Icon name="calendar" size={14} stroke={2.4} color={T.lavenderInk} />
            <span>{formatDateLabel(date)}</span>
            <Icon name="chevron-d" size={14} stroke={2.4} color={T.muted} />
          </div>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={e => onDateChange(e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, cursor: 'pointer' }}
          />
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 999,
            background: T.mintSoft, color: T.mintInk,
            fontSize: 11, fontWeight: 700,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.mint, display: 'inline-block' }} />
          {record?.syncStatus === 'SYNCED' ? '已同步' : '自動儲存'}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted, fontSize: 14 }}>載入中⋯</div>
      ) : (
        <>
          {/* 收入卡 */}
          <div style={{ background: T.card, borderRadius: T.r.xl, padding: 14, boxShadow: T.shadow.card }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: T.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrow-up" size={13} stroke={2.8} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>收入</span>
              </div>
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>4 個來源</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {INCOME_FIELDS.map(f => (
                <AmountField
                  key={f.key}
                  icon={f.icon} label={f.label} sublabel={f.sublabel}
                  color={f.color}
                  value={incomeValues[f.key]}
                  onChange={incomeSetters[f.key]}
                  focused={focusKey === f.key}
                  onFocus={() => setFocusKey(f.key)}
                />
              ))}
            </div>

            {/* 收入小計 */}
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: T.mintSoft, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.mintInk }}>收入小計</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: T.mintInk, fontFamily: T.font.num, letterSpacing: -0.4 }}>
                {fmt(totalIncome)}
              </span>
            </div>
          </div>

          {/* 支出卡 */}
          <div style={{ background: T.card, borderRadius: T.r.xl, padding: 14, boxShadow: T.shadow.card }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: T.coral, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrow-down" size={13} stroke={2.8} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>支出</span>
              </div>
              {/* 拍照記帳（stub） */}
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 8,
                  background: T.peachSoft, color: T.peachInk, border: 'none',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans,
                }}
              >
                <Icon name="camera" size={12} stroke={2.6} />
                拍照記帳
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {EXPENSE_FIELDS.map(f => (
                <AmountField
                  key={f.key}
                  icon={f.icon} label={f.label} sublabel={null}
                  color={f.color}
                  value={expenseValues[f.key]}
                  onChange={expenseSetters[f.key]}
                  focused={focusKey === f.key}
                  onFocus={() => setFocusKey(f.key)}
                />
              ))}
            </div>

            {/* 支出小計 */}
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: T.coralSoft, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.coralInk }}>支出小計</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: T.coralInk, fontFamily: T.font.num, letterSpacing: -0.4 }}>
                {fmt(totalExpense)}
              </span>
            </div>
          </div>

          {/* 備註 */}
          <div style={{ background: T.card, borderRadius: T.r.lg, padding: '14px 16px', boxShadow: T.shadow.card }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon name="receipt" size={16} stroke={2.4} color={T.muted} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.ink2 }}>今日備註</span>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="例如：母親節訂位爆滿、冷氣維修…"
              style={{
                width: '100%', minHeight: 56, resize: 'none',
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: T.font.sans, fontSize: 14, color: T.ink,
                lineHeight: 1.5, padding: 0,
              }}
            />
          </div>

          {/* 儲存按鈕 */}
          <button
            onClick={handleSave}
            style={{
              width: '100%', padding: '16px', borderRadius: T.r.lg, border: 'none',
              background: saved ? T.mint : T.ink,
              color: '#fff', fontSize: 15, fontWeight: 800,
              cursor: 'pointer', fontFamily: T.font.sans,
              transition: 'background 200ms',
              boxShadow: saved
                ? `0 8px 24px rgba(16,199,126,0.32)`
                : `0 8px 24px rgba(26,27,37,0.24)`,
            }}
          >
            {saved ? '已儲存 ✓' : record ? '更新今日帳目' : '儲存今日帳目'}
          </button>

          {/* 當日淨額 summary 深色卡 */}
          <div
            style={{
              background: T.ink, color: '#fff',
              borderRadius: T.r.lg, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 12px 32px rgba(26,27,37,0.24)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.7 }}>當日淨額</span>
              <span style={{
                fontSize: 30, fontWeight: 800, fontFamily: T.font.num, letterSpacing: -0.6,
                color: net >= 0 ? '#4FE39D' : '#FF8E8E',
              }}>
                {fmt(net, { plus: true, sign: true })}
              </span>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <div>
                <div style={{ opacity: 0.55, fontWeight: 600, fontSize: 11 }}>外送平台分潤</div>
                <div style={{ fontFamily: T.font.num, fontWeight: 700, marginTop: 2 }}>
                  -{fmt(fees)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ opacity: 0.55, fontWeight: 600, fontSize: 11 }}>實收淨額</div>
                <div style={{ fontFamily: T.font.num, fontWeight: 700, marginTop: 2, color: '#4FE39D' }}>
                  {fmt(netAfterFees, { plus: true, sign: true })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
