import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { Icon } from './Icon'
import { ICON_OPTIONS, COLOR_OPTIONS, addSub, renameSub, deleteSub, setDefaultSub } from '../lib/categories'

export interface DraftCategory {
  id: string
  name: string
  icon: string
  color: string
  fee?: number
  enabled: boolean
  type: 'income' | 'expense'
  subs?: { id: string; name: string }[]
  defaultSubId?: string | null
}

export const EMPTY_INCOME_DRAFT: DraftCategory = {
  id: '', name: '', icon: 'tag', color: 'mint', fee: 0, enabled: true, type: 'income', subs: [], defaultSubId: null,
}
export const EMPTY_EXPENSE_DRAFT: DraftCategory = {
  id: '', name: '', icon: 'tag', color: 'coral', fee: 0, enabled: true, type: 'expense', subs: [], defaultSubId: null,
}

function IconGrid({ selected, onChange }: { selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {ICON_OPTIONS.map(name => (
        <button
          key={name}
          onClick={() => onChange(name)}
          style={{
            width: 44, height: 44, borderRadius: 13, border: 'none',
            background: selected === name ? T.ink : T.bg,
            color: selected === name ? '#fff' : T.muted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 150ms',
          }}
        >
          <Icon name={name} size={20} stroke={2} />
        </button>
      ))}
    </div>
  )
}

function ColorGrid({ selected, onChange }: { selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {COLOR_OPTIONS.map(key => {
        const c = colorMap[key] ?? colorMap['mint']
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: c.bg, cursor: 'pointer',
              outline: selected === key ? `3px solid ${T.ink}` : '3px solid transparent',
              outlineOffset: 2,
              transition: 'outline 150ms',
            }}
          />
        )
      })}
    </div>
  )
}

export function EditSheet({ draft, isNew, onSave, onDelete, onClose }: {
  draft: DraftCategory
  isNew: boolean
  onSave: (d: DraftCategory) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<DraftCategory>(draft)
  const update = (patch: Partial<DraftCategory>) => setLocal(prev => ({ ...prev, ...patch }))
  const previewColor = colorMap[local.color] ?? colorMap['mint']

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
              <Icon name={local.icon} size={20} stroke={2.2} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>
              {isNew ? '新增類別' : '編輯類別'}
            </span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: T.bg, borderRadius: 10, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
            <Icon name="x" size={16} stroke={2.4} />
          </button>
        </div>

        {/* 可捲動內容區 — 不含操作按鈕 */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '55vh', overflowY: 'auto', paddingBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>名稱</div>
            <input
              value={local.name}
              onChange={e => update({ name: e.target.value })}
              placeholder="例如：外送平台"
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', borderRadius: T.r.md,
                border: `1.5px solid ${T.hairline}`,
                fontSize: 15, fontWeight: 700, color: T.ink,
                background: T.bg, outline: 'none', fontFamily: T.font.sans,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>圖示</div>
            <IconGrid selected={local.icon} onChange={icon => update({ icon })} />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>顏色</div>
            <ColorGrid selected={local.color} onChange={color => update({ color })} />
          </div>

          {local.type === 'income' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>平台手續費 %</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginBottom: 8 }}>
                0 表示無手續費，輸入 30 = 扣 30%
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0} max={100} step={1}
                  value={Math.round((local.fee ?? 0) * 100)}
                  onChange={e => update({ fee: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
                  style={{
                    width: 80, padding: '10px 12px', borderRadius: T.r.sm,
                    border: `1.5px solid ${T.hairline}`,
                    fontSize: 15, fontWeight: 700, color: T.ink,
                    background: T.bg, outline: 'none', fontFamily: T.font.num,
                    textAlign: 'right',
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>%</span>
              </div>
            </div>
          )}

          {/* 二級分類（繼承一級 icon/color/fee，只編輯名稱與預設） */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>二級分類</div>
            {(local.subs ?? []).length === 0 && (
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginBottom: 8 }}>
                可選。例如「雜項」下加「瓦斯費」「水費」，記帳時就能選到。
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(local.subs ?? []).map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={s.name}
                    onChange={e => setLocal(renameSub(local, s.id, e.target.value) as DraftCategory)}
                    placeholder="二級名稱"
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: T.r.sm,
                      border: `1.5px solid ${T.hairline}`, fontSize: 14, fontWeight: 600,
                      color: T.ink, background: T.bg, outline: 'none', fontFamily: T.font.sans, boxSizing: 'border-box',
                    }}
                  />
                  <button
                    aria-label={`刪除二級 ${s.name}`}
                    onClick={() => setLocal(deleteSub(local, s.id) as DraftCategory)}
                    style={{
                      width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                      background: T.coralSoft, color: T.coralInk, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="x" size={14} stroke={2.4} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setLocal(addSub(local, '') as DraftCategory)}
              style={{
                marginTop: 8, width: '100%', padding: '10px 12px', borderRadius: T.r.sm,
                border: `1.5px dashed ${T.hairline}`, background: 'transparent', cursor: 'pointer',
                fontFamily: T.font.sans, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, color: T.muted, fontSize: 13, fontWeight: 700,
              }}
            >
              <Icon name="plus" size={14} stroke={2.6} /> 新增二級分類
            </button>

            {/* 預設二級（單選，含「無」） */}
            {(local.subs ?? []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>記帳時預設帶入</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {([{ id: null as string | null, name: '無' }, ...(local.subs ?? [])]).map(opt => {
                    const selected = (local.defaultSubId ?? null) === opt.id
                    return (
                      <button
                        key={opt.id ?? '__none__'}
                        onClick={() => setLocal(setDefaultSub(local, opt.id) as DraftCategory)}
                        style={{
                          padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                          fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
                          background: selected ? T.ink : T.bg, color: selected ? '#fff' : T.muted,
                          transition: 'all 150ms',
                        }}
                      >
                        {opt.name || '（未命名）'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* 固定底部按鈕區 — 永遠可見，不受捲動影響 */}
        <div style={{ padding: '12px 20px 0', borderTop: `1px solid ${T.hairline}`, display: 'flex', gap: 10 }}>
          {!isNew && (
            <button
              onClick={onDelete}
              style={{
                flex: 1, padding: '14px 0', borderRadius: T.r.md, border: 'none',
                background: T.coralSoft, color: T.coralInk,
                fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: T.font.sans,
              }}
            >刪除</button>
          )}
          <button
            onClick={() => {
              if (!local.name.trim()) return
              // 儲存時把二級名稱 trim、丟掉空白項；若預設二級已被刪/清空則歸零
              const subs = (local.subs ?? []).map(s => ({ ...s, name: s.name.trim() })).filter(s => s.name)
              const defaultSubId = subs.some(s => s.id === local.defaultSubId) ? local.defaultSubId! : null
              onSave({ ...local, subs, defaultSubId })
            }}
            disabled={!local.name.trim()}
            style={{
              flex: 2, padding: '14px 0', borderRadius: T.r.md, border: 'none',
              background: local.name.trim() ? T.ink : '#D8D9E0',
              color: '#fff',
              fontSize: 14, fontWeight: 800, cursor: local.name.trim() ? 'pointer' : 'default',
              fontFamily: T.font.sans, transition: 'background 150ms',
            }}
          >儲存</button>
        </div>
      </div>
    </>
  )
}
