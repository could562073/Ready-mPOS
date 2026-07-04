import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { Icon } from './Icon'
import { getCategories } from '../lib/categories'
import { addTransaction, updateTransaction, deleteTransaction } from '../lib/transactions'
import { resolveDefaultSub } from '../lib/txDraft'
import type { Transaction } from '../types'

// 記帳草稿 — 金額一律正數，收支方向由 type 決定
interface Draft {
  type: 'income' | 'expense'
  categoryId: string
  subId: string | null
  amount: number
  note: string
  d: string // 'YYYY-MM-DD'
}

function draftFromEditing(editing: Transaction, fallbackDate: string): Draft {
  return {
    type: editing.type,
    categoryId: editing.categoryId,
    subId: editing.subId ?? null,
    amount: editing.amount,
    note: editing.note ?? '',
    d: editing.date || fallbackDate,
  }
}

function emptyDraft(date: string): Draft {
  return { type: 'expense', categoryId: '', subId: null, amount: 0, note: '', d: date }
}

export function TransactionSheet({ date, editing, onClose, onSaved }: {
  date: string                 // 新增時預設日期 'YYYY-MM-DD'
  editing: Transaction | null  // null=新增；非 null=編輯此筆
  onClose: () => void
  onSaved: () => void          // 儲存/刪除成功後通知
}) {
  const isNew = editing === null
  const [draft, setDraft] = useState<Draft>(() => editing ? draftFromEditing(editing, date) : emptyDraft(date))
  const update = (patch: Partial<Draft>) => setDraft(prev => ({ ...prev, ...patch }))

  const categories = getCategories().filter(c => c.type === draft.type && c.enabled)
  const selectedCat = categories.find(c => c.id === draft.categoryId)
  const subOptions = selectedCat?.subs ?? []
  const previewColor = colorMap[selectedCat?.color ?? 'coral'] ?? colorMap['coral']

  const canSave = draft.categoryId !== '' && draft.amount > 0

  // 收支切換 — 類別依 type 過濾，切換時清空已選類別/二級
  const switchType = (type: 'income' | 'expense') => {
    if (type === draft.type) return
    update({ type, categoryId: '', subId: null })
  }

  // 選定一級類別 — 二級自動帶入該類別的有效預設（dangling 視為無）
  const pickCategory = (catId: string) => {
    const cat = categories.find(c => c.id === catId)
    update({ categoryId: catId, subId: resolveDefaultSub(cat) })
  }

  const buildInput = () => ({
    date: draft.d,
    type: draft.type,
    categoryId: draft.categoryId,
    subId: draft.subId,
    amount: draft.amount,
    note: draft.note.trim() || undefined,
  })

  const save = async (continueAfter: boolean) => {
    if (!canSave) return
    if (isNew) {
      await addTransaction(buildInput())
      if (continueAfter) {
        update({ amount: 0, note: '' }) // 保留 type/category/sub/date，只清金額與備註
      } else {
        onSaved()
      }
    } else {
      await updateTransaction(editing!.localId!, buildInput())
      onSaved()
    }
  }

  const remove = async () => {
    await deleteTransaction(editing!.localId!)
    onSaved()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(26,27,37,0.45)' }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: T.card, borderRadius: '24px 24px 0 0',
        padding: '0 0 calc(env(safe-area-inset-bottom) + 16px)',
        zIndex: 101,
        boxShadow: '0 -4px 32px rgba(26,27,37,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.hairline }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 13,
              background: previewColor.soft, color: previewColor.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={selectedCat?.icon ?? 'tag'} size={20} stroke={2.2} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
              {isNew ? '新增交易' : '編輯交易'}
            </span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: T.bg, borderRadius: 10, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
            <Icon name="x" size={16} stroke={2.4} />
          </button>
        </div>

        {/* 可捲動內容區 — 不含操作按鈕 */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '55vh', overflowY: 'auto', paddingBottom: 8 }}>

          {/* 收入/支出切換 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['expense', 'income'] as const).map(t => {
              const selected = draft.type === t
              return (
                <button
                  key={t}
                  aria-label={t === 'income' ? '收入' : '支出'}
                  onClick={() => switchType(t)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: T.r.sm, border: 'none', cursor: 'pointer',
                    fontFamily: T.font.sans, fontSize: 14, fontWeight: 800,
                    background: selected ? T.ink : T.bg, color: selected ? '#fff' : T.muted,
                    transition: 'all 150ms',
                  }}
                >
                  {t === 'income' ? '收入' : '支出'}
                </button>
              )
            })}
          </div>

          {/* 一級類別 chips */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>類別</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {categories.map(c => {
                const selected = draft.categoryId === c.id
                const cc = colorMap[c.color] ?? colorMap['coral']
                return (
                  <button
                    key={c.id}
                    aria-label={`類別 ${c.name}`}
                    onClick={() => pickCategory(c.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: selected ? T.ink : T.bg, color: selected ? '#fff' : T.muted,
                      transition: 'all 150ms',
                    }}
                  >
                    <Icon name={c.icon} size={14} stroke={2.4} color={selected ? '#fff' : cc.ink} />
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 二級 chips — 僅當選定類別有 subs 才顯示 */}
          {subOptions.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>二級分類</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {([{ id: null as string | null, name: '無' }, ...subOptions]).map(opt => {
                  const selected = draft.subId === opt.id
                  return (
                    <button
                      key={opt.id ?? '__none__'}
                      aria-label={`二級 ${opt.name}`}
                      onClick={() => update({ subId: opt.id })}
                      style={{
                        padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                        fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
                        background: selected ? T.ink : T.bg, color: selected ? '#fff' : T.muted,
                        transition: 'all 150ms',
                      }}
                    >
                      {opt.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 金額 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>金額</div>
            <input
              type="text"
              inputMode="decimal"
              aria-label="金額"
              value={draft.amount === 0 ? '' : String(draft.amount)}
              onChange={e => update({ amount: Math.max(0, Number(e.target.value) || 0) })}
              placeholder="0"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: T.r.md,
                border: `1.5px solid ${T.hairline}`,
                fontSize: 20, fontWeight: 800, color: T.ink,
                background: T.bg, outline: 'none', fontFamily: T.font.num,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 備註（選填） */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>備註</div>
            <input
              value={draft.note}
              onChange={e => update({ note: e.target.value })}
              placeholder="選填"
              aria-label="備註"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: T.r.md,
                border: `1.5px solid ${T.hairline}`,
                fontSize: 14, fontWeight: 600, color: T.ink,
                background: T.bg, outline: 'none', fontFamily: T.font.sans,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 日期 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>日期</div>
            <input
              type="date"
              value={draft.d}
              onChange={e => update({ d: e.target.value })}
              aria-label="日期"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: T.r.md,
                border: `1.5px solid ${T.hairline}`,
                fontSize: 14, fontWeight: 700, color: T.ink,
                background: T.bg, outline: 'none', fontFamily: T.font.sans,
                boxSizing: 'border-box',
              }}
            />
          </div>

        </div>

        {/* 固定底部按鈕區 — 永遠可見，不受捲動影響 */}
        <div style={{ padding: '12px 20px 0', borderTop: `1px solid ${T.hairline}`, display: 'flex', gap: 10 }}>
          {!isNew && (
            <button
              onClick={remove}
              aria-label="刪除交易"
              style={{
                flex: 1, padding: '14px 0', borderRadius: T.r.md, border: 'none',
                background: T.coralSoft, color: T.coralInk,
                fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: T.font.sans,
              }}
            >刪除</button>
          )}
          {isNew && (
            <button
              onClick={() => save(true)}
              disabled={!canSave}
              aria-label="儲存並繼續"
              style={{
                flex: 1, padding: '14px 0', borderRadius: T.r.md, border: 'none',
                background: canSave ? T.bg : '#EAEAEF',
                color: canSave ? T.ink2 : T.muted,
                fontSize: 13, fontWeight: 800, cursor: canSave ? 'pointer' : 'default',
                fontFamily: T.font.sans, transition: 'background 150ms',
              }}
            >儲存並繼續</button>
          )}
          <button
            onClick={() => save(false)}
            disabled={!canSave}
            aria-label="儲存"
            style={{
              flex: 2, padding: '14px 0', borderRadius: T.r.md, border: 'none',
              background: canSave ? T.ink : '#D8D9E0',
              color: '#fff',
              fontSize: 14, fontWeight: 800, cursor: canSave ? 'pointer' : 'default',
              fontFamily: T.font.sans, transition: 'background 150ms',
            }}
          >儲存</button>
        </div>
      </div>
    </>
  )
}
