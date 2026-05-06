import { useEffect, useRef, useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { Icon } from '../components/Icon'
import { useDailyRecord } from '../hooks/useDailyRecord'
import { getCategories, saveCategories } from '../lib/categories'
import { EditSheet, EMPTY_INCOME_DRAFT, EMPTY_EXPENSE_DRAFT } from '../components/CategoryEditSheet'
import type { DraftCategory } from '../components/CategoryEditSheet'
import type { TokenColor } from '../lib/tokens'

interface DailyEntryPageProps {
  date: string
  onDateChange: (date: string) => void
  onSync?: () => void
  syncing?: boolean
}

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

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const DOW = ['週日','週一','週二','週三','週四','週五','週六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${DOW}`
}

// 取備用顏色（colorMap 找不到時 fallback）
const FALLBACK_COLOR: TokenColor = { bg: T.lavender, soft: T.lavenderSoft, ink: T.lavenderInk }

export function DailyEntryPage({ date, onDateChange, onSync, syncing }: DailyEntryPageProps) {
  const { record, loading, save } = useDailyRecord(date)

  // 以 state 持有類別清單，新增類別後可即時刷新表單欄位
  const [allCats, setAllCats] = useState(() => getCategories())
  const incomeCategories  = allCats.filter(c => c.type === 'income'  && c.enabled)
  const expenseCategories = allCats.filter(c => c.type === 'expense' && c.enabled)

  // 新增類別 sheet：'income' | 'expense' | null
  const [addingType, setAddingType] = useState<'income' | 'expense' | null>(null)

  // 收支金額 map：key = category.id
  const [incomes,      setIncomes]      = useState<Record<string, number>>({})
  const [expenses,     setExpenses]     = useState<Record<string, number>>({})
  const [notes,        setNotes]        = useState('')
  const [saved,        setSaved]        = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [focusKey,     setFocusKey]     = useState<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  // 載入既有紀錄填入表單，過濾已刪除類別的孤立 key 避免寫回髒資料
  useEffect(() => {
    if (loading) return
    if (record && record.date !== date) return
    if (record) {
      const knownInc = new Set(allCats.filter(c => c.type === 'income').map(c => c.id))
      const knownExp = new Set(allCats.filter(c => c.type === 'expense').map(c => c.id))
      setIncomes(Object.fromEntries(Object.entries(record.incomes  ?? {}).filter(([k]) => knownInc.has(k))))
      setExpenses(Object.fromEntries(Object.entries(record.expenses ?? {}).filter(([k]) => knownExp.has(k))))
      setNotes(record.notes ?? '')
    } else {
      setIncomes({})
      setExpenses({})
      setNotes('')
    }
    setSaved(false)
  }, [date, record, loading])

  const totalIncome  = incomeCategories.reduce((s, c) => s + (incomes[c.id] ?? 0), 0)
  const totalExpense = expenseCategories.reduce((s, c) => s + (expenses[c.id] ?? 0), 0)
  const net          = totalIncome - totalExpense

  // 平台手續費：有 fee > 0 的收入類別
  const fees = Math.max(0, incomeCategories
    .filter(c => c.fee && c.fee > 0)
    .reduce((s, c) => s + (incomes[c.id] ?? 0) * c.fee!, 0))
  const netAfterFees = net - fees

  const handleSave = async () => {
    setShowConfirm(false)
    await save({ incomes, expenses, notes })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSync?.()
  }

  const handleSaveClick = () => {
    if (record) {
      setShowConfirm(true)  // 更新既有紀錄前先確認
    } else {
      handleSave()
    }
  }

  // 新增類別後寫入 localStorage 並刷新本地 state
  const handleCategoryAdd = (draft: DraftCategory) => {
    const updated = [...allCats, { ...draft, id: draft.id || Date.now().toString(36) }]
    saveCategories(updated)
    setAllCats(updated)
    setAddingType(null)
  }

  // 日期格式化：2026-05-05 → 2026年5月5日
  const [y, mo, d] = date.split('-')
  const dateLabel = `${y}年${parseInt(mo)}月${parseInt(d)}日`

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 日期選擇 + 同步狀態 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
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
        {/* 同步狀態徽章：同步中 / 已同步 / 待同步 */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            background: syncing ? T.skySoft : record?.syncStatus === 'SYNCED' ? T.mintSoft : '#FFF8E1',
            color:      syncing ? T.skyInk  : record?.syncStatus === 'SYNCED' ? T.mintInk  : '#B45309',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: 3, display: 'inline-block',
            background: syncing ? T.sky : record?.syncStatus === 'SYNCED' ? T.mint : '#F59E0B',
          }} />
          {syncing ? '同步中…' : record?.syncStatus === 'SYNCED' ? '已同步' : '待同步'}
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
              <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
                {incomeCategories.length} 個來源
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {incomeCategories.map(cat => {
                const color = colorMap[cat.color] ?? FALLBACK_COLOR
                const sublabel = cat.fee && cat.fee > 0
                  ? `自動扣 ${Math.round(cat.fee * 100)}% 平台手續費`
                  : null
                return (
                  <AmountField
                    key={cat.id}
                    icon={cat.icon} label={cat.name} sublabel={sublabel}
                    color={color}
                    value={incomes[cat.id] ?? 0}
                    onChange={v => setIncomes(prev => ({ ...prev, [cat.id]: v }))}
                    focused={focusKey === cat.id}
                    onFocus={() => setFocusKey(cat.id)}
                  />
                )
              })}
            </div>

            <button
              onClick={() => setAddingType('income')}
              style={{
                width: '100%', marginTop: 6, padding: '10px',
                border: `1.5px dashed ${T.mint}`, borderRadius: 14,
                background: 'transparent', cursor: 'pointer',
                color: T.mint, fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: T.font.sans,
              }}
            >
              <Icon name="plus" size={14} stroke={2.6} />
              新增收入來源
            </button>

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
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {expenseCategories.map(cat => {
                const color = colorMap[cat.color] ?? FALLBACK_COLOR
                return (
                  <AmountField
                    key={cat.id}
                    icon={cat.icon} label={cat.name} sublabel={null}
                    color={color}
                    value={expenses[cat.id] ?? 0}
                    onChange={v => setExpenses(prev => ({ ...prev, [cat.id]: v }))}
                    focused={focusKey === cat.id}
                    onFocus={() => setFocusKey(cat.id)}
                  />
                )
              })}
            </div>

            <button
              onClick={() => setAddingType('expense')}
              style={{
                width: '100%', marginTop: 6, padding: '10px',
                border: `1.5px dashed ${T.coral}`, borderRadius: 14,
                background: 'transparent', cursor: 'pointer',
                color: T.coral, fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: T.font.sans,
              }}
            >
              <Icon name="plus" size={14} stroke={2.6} />
              新增支出類別
            </button>

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

          {/* 儲存 / 更新按鈕 */}
          <button
            onClick={handleSaveClick}
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
            {saved ? '已儲存 ✓' : record ? '更新帳目' : '儲存帳目'}
          </button>

          {/* 更新確認 modal */}
          {showConfirm && (
            <div
              onClick={() => setShowConfirm(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                padding: '0 16px 32px',
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 480,
                  background: '#fff', borderRadius: 24, padding: 24,
                  display: 'flex', flexDirection: 'column', gap: 16,
                  boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
                }}
              >
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>確定更新帳目？</div>
                  <div style={{ fontSize: 13, color: T.muted, fontWeight: 600, marginTop: 6 }}>
                    更新到 {dateLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShowConfirm(false)}
                    style={{
                      flex: 1, padding: '14px 0', borderRadius: T.r.md,
                      border: `1.5px solid ${T.hairline}`, background: 'transparent',
                      fontSize: 14, fontWeight: 700, color: T.ink2,
                      cursor: 'pointer', fontFamily: T.font.sans,
                    }}
                  >取消</button>
                  <button
                    onClick={handleSave}
                    style={{
                      flex: 2, padding: '14px 0', borderRadius: T.r.md,
                      border: 'none', background: T.ink,
                      fontSize: 14, fontWeight: 800, color: '#fff',
                      cursor: 'pointer', fontFamily: T.font.sans,
                    }}
                  >確定更新</button>
                </div>
              </div>
            </div>
          )}

          {/* 當日淨額 summary 深色卡（已扣平台手續費） */}
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
                color: netAfterFees >= 0 ? '#4FE39D' : '#FF8E8E',
              }}>
                {fmt(netAfterFees, { plus: true, sign: true })}
              </span>
            </div>
            {fees > 0 && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <div>
                    <div style={{ opacity: 0.55, fontWeight: 600, fontSize: 11 }}>收入毛額</div>
                    <div style={{ fontFamily: T.font.num, fontWeight: 700, marginTop: 2 }}>
                      {fmt(net, { plus: true, sign: true })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ opacity: 0.55, fontWeight: 600, fontSize: 11 }}>外送平台分潤</div>
                    <div style={{ fontFamily: T.font.num, fontWeight: 700, marginTop: 2, color: '#FF8E8E' }}>
                      -{fmt(fees)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* 新增類別 sheet（從記帳頁快速新增收入/支出來源） */}
      {addingType && (
        <EditSheet
          draft={{ ...(addingType === 'income' ? EMPTY_INCOME_DRAFT : EMPTY_EXPENSE_DRAFT), id: Date.now().toString(36) }}
          isNew
          onSave={handleCategoryAdd}
          onDelete={() => {}}
          onClose={() => setAddingType(null)}
        />
      )}
    </div>
  )
}
