import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { Icon } from '../components/Icon'
import { getCategories, saveCategories, ICON_OPTIONS, COLOR_OPTIONS } from '../lib/categories'
import type { Category } from '../types'

interface Props {
  onBack: () => void
  googleEmail: string | null
  onSyncCategories: (cats: Category[]) => void
}

// 編輯中的類別草稿（包含新增和修改）
interface DraftCategory extends Omit<Category, 'id'> {
  id: string
}

const EMPTY_INCOME_DRAFT: DraftCategory = {
  id: '', name: '', icon: 'tag', color: 'mint', fee: 0, enabled: true, type: 'income',
}
const EMPTY_EXPENSE_DRAFT: DraftCategory = {
  id: '', name: '', icon: 'tag', color: 'coral', fee: 0, enabled: true, type: 'expense',
}

// 類別列表單行
function CategoryRow({ cat, onToggle, onEdit }: {
  cat: Category
  onToggle: () => void
  onEdit: () => void
}) {
  const color = colorMap[cat.color] ?? colorMap['mint']
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      opacity: cat.enabled ? 1 : 0.45,
      transition: 'opacity 200ms',
    }}>
      {/* 圖示 */}
      <div style={{
        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
        background: color.soft, color: color.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={cat.icon} size={18} stroke={2.2} />
      </div>

      {/* 名稱 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cat.name || '（未命名）'}
        </div>
        {cat.fee && cat.fee > 0 ? (
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 1 }}>
            手續費 {Math.round(cat.fee * 100)}%
          </div>
        ) : null}
      </div>

      {/* Toggle */}
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        style={{
          width: 44, height: 26, borderRadius: 13, border: 'none', flexShrink: 0,
          background: cat.enabled ? T.mint : '#D8D9E0',
          position: 'relative', cursor: 'pointer',
          transition: 'background 200ms',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: cat.enabled ? 20 : 2,
          width: 22, height: 22, borderRadius: 11, background: '#fff',
          transition: 'left 200ms',
          boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
        }} />
      </button>

      {/* 編輯按鈕 */}
      <button
        onClick={onEdit}
        style={{
          width: 32, height: 32, borderRadius: 10, border: 'none', flexShrink: 0,
          background: T.bg, color: T.muted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="chevron-r" size={15} stroke={2.4} />
      </button>
    </div>
  )
}

// 圖示選擇格
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

// 顏色選擇格
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

// 底部編輯 Sheet（overlay）
function EditSheet({ draft, isNew, onSave, onDelete, onClose }: {
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
      {/* 半透明背景 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(26,27,37,0.45)',
        }}
      />
      {/* Sheet 本體 */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430,
          background: T.card, borderRadius: '24px 24px 0 0',
          padding: '0 0 calc(env(safe-area-inset-bottom) + 16px)',
          zIndex: 101,
          boxShadow: '0 -4px 32px rgba(26,27,37,0.18)',
        }}
      >
        {/* 拖曳指示條 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.hairline }} />
        </div>

        {/* 標題列 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* 即時預覽圖示 */}
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

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '65vh', overflowY: 'auto' }}>
          {/* 名稱 */}
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

          {/* 圖示 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>圖示</div>
            <IconGrid selected={local.icon} onChange={icon => update({ icon })} />
          </div>

          {/* 顏色 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>顏色</div>
            <ColorGrid selected={local.color} onChange={color => update({ color })} />
          </div>

          {/* 手續費（收入類別才顯示） */}
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

          {/* 操作按鈕區 */}
          <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
            {!isNew && (
              <button
                onClick={onDelete}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: T.r.md, border: 'none',
                  background: T.coralSoft, color: T.coralInk,
                  fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: T.font.sans,
                }}
              >
                刪除
              </button>
            )}
            <button
              onClick={() => { if (local.name.trim()) onSave(local) }}
              disabled={!local.name.trim()}
              style={{
                flex: 2, padding: '14px 0', borderRadius: T.r.md, border: 'none',
                background: local.name.trim() ? T.ink : '#D8D9E0',
                color: '#fff',
                fontSize: 14, fontWeight: 800, cursor: local.name.trim() ? 'pointer' : 'default',
                fontFamily: T.font.sans, transition: 'background 150ms',
              }}
            >
              儲存
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function CategoriesPage({ onBack, googleEmail, onSyncCategories }: Props) {
  const [categories, setCategories] = useState<Category[]>(() => getCategories())
  const [editTarget, setEditTarget] = useState<{ cat: DraftCategory; isNew: boolean } | null>(null)

  // 儲存並同步
  const persist = (updated: Category[]) => {
    setCategories(updated)
    saveCategories(updated)
    onSyncCategories(updated)
  }

  const handleToggle = (id: string) => {
    persist(categories.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c))
  }

  const handleEdit = (cat: Category) => {
    setEditTarget({ cat: { ...cat }, isNew: false })
  }

  const handleAdd = (type: 'income' | 'expense') => {
    const base = type === 'income' ? EMPTY_INCOME_DRAFT : EMPTY_EXPENSE_DRAFT
    setEditTarget({ cat: { ...base, id: Date.now().toString(36) }, isNew: true })
  }

  const handleSave = (draft: DraftCategory) => {
    const exists = categories.some(c => c.id === draft.id)
    const updated = exists
      ? categories.map(c => c.id === draft.id ? { ...c, ...draft } : c)
      : [...categories, draft as Category]
    persist(updated)
    setEditTarget(null)
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('確定刪除這個類別？歷史帳目不受影響。')) return
    persist(categories.filter(c => c.id !== id))
    setEditTarget(null)
  }

  const incomeList  = categories.filter(c => c.type === 'income')
  const expenseList = categories.filter(c => c.type === 'expense')

  return (
    <>
      <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 頂部標題列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
          <button
            onClick={onBack}
            style={{
              width: 36, height: 36, borderRadius: 12, border: 'none',
              background: T.card, color: T.ink, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: T.shadow.card,
            }}
          >
            <Icon name="chevron-l" size={18} stroke={2.6} />
          </button>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>類別管理</span>
        </div>

        {/* Google 未登入提示 */}
        {!googleEmail && (
          <div style={{
            padding: '12px 14px', borderRadius: T.r.md,
            background: T.sunSoft, fontSize: 12, color: T.sunInk, fontWeight: 600, lineHeight: 1.6,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Icon name="cloud" size={15} stroke={2.4} color={T.sunInk} />
            <span>登入 Google 後，類別設定才能跨裝置同步。目前的更改只會儲存在這台裝置。</span>
          </div>
        )}

        {/* 收入類別 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '0 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' as const }}>
            收入類別
          </div>
          <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
            {incomeList.map((cat, i) => (
              <div key={cat.id} style={{ borderBottom: i < incomeList.length - 1 ? `1px solid ${T.hairline}` : 'none' }}>
                <CategoryRow cat={cat} onToggle={() => handleToggle(cat.id)} onEdit={() => handleEdit(cat)} />
              </div>
            ))}
            <button
              onClick={() => handleAdd('income')}
              style={{
                width: '100%', padding: '13px 16px',
                border: 'none', borderTop: `1px solid ${T.hairline}`,
                background: 'transparent', cursor: 'pointer', fontFamily: T.font.sans,
                display: 'flex', alignItems: 'center', gap: 8,
                color: T.mint, fontSize: 13, fontWeight: 700,
              }}
            >
              <div style={{ width: 24, height: 24, borderRadius: 7, background: T.mintSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={14} stroke={2.6} color={T.mint} />
              </div>
              新增收入類別
            </button>
          </div>
        </div>

        {/* 支出類別 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '0 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' as const }}>
            支出類別
          </div>
          <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
            {expenseList.map((cat, i) => (
              <div key={cat.id} style={{ borderBottom: i < expenseList.length - 1 ? `1px solid ${T.hairline}` : 'none' }}>
                <CategoryRow cat={cat} onToggle={() => handleToggle(cat.id)} onEdit={() => handleEdit(cat)} />
              </div>
            ))}
            <button
              onClick={() => handleAdd('expense')}
              style={{
                width: '100%', padding: '13px 16px',
                border: 'none', borderTop: `1px solid ${T.hairline}`,
                background: 'transparent', cursor: 'pointer', fontFamily: T.font.sans,
                display: 'flex', alignItems: 'center', gap: 8,
                color: T.coral, fontSize: 13, fontWeight: 700,
              }}
            >
              <div style={{ width: 24, height: 24, borderRadius: 7, background: T.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={14} stroke={2.6} color={T.coral} />
              </div>
              新增支出類別
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, fontWeight: 600 }}>
          停用的類別不會出現在記帳頁，但歷史報表仍會保留
        </div>
      </div>

      {/* 底部編輯 Sheet */}
      {editTarget && (
        <EditSheet
          draft={editTarget.cat}
          isNew={editTarget.isNew}
          onSave={handleSave}
          onDelete={() => handleDelete(editTarget.cat.id)}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  )
}
