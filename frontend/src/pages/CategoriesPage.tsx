import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { Icon } from '../components/Icon'
import { getCategories, saveCategories } from '../lib/categories'
import { EditSheet, EMPTY_INCOME_DRAFT, EMPTY_EXPENSE_DRAFT } from '../components/CategoryEditSheet'
import type { DraftCategory } from '../components/CategoryEditSheet'
import type { Category } from '../types'
import { db } from '../db'

interface Props {
  onBack: () => void
  googleEmail: string | null
  onSyncCategories: (cats: Category[]) => void
  // 重命名或刪除類別後需呼叫，會重寫雲端月份分頁的欄位標題並推送整月資料
  onSyncAll: () => void
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


export function CategoriesPage({ onBack, googleEmail, onSyncCategories, onSyncAll }: Props) {
  const [categories, setCategories] = useState<Category[]>(() => getCategories())
  const [editTarget, setEditTarget] = useState<{ cat: DraftCategory; isNew: boolean } | null>(null)

  // 立即存入 localStorage（saveCategories 內部會標記 dirty 旗標）
  const persist = (updated: Category[]) => {
    setCategories(updated)
    saveCategories(updated)
  }

  // 重命名/刪除會改變 Google Sheets 月份分頁的欄位標題，
  // 標記所有本機記錄為 PENDING：
  // 1) syncAll 合併階段 PENDING 記錄不會被雲端拉取覆蓋（保住本機金額）
  // 2) 後續推送階段會把每個月用新欄位重寫，雲端與本機對齊
  const markAllRecordsPending = async () => {
    const now = new Date().toISOString()
    await db.dailyRecords.toCollection().modify({ syncStatus: 'PENDING', updatedAt: now })
  }

  const handleToggle = (id: string) => {
    const updated = categories.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
    persist(updated)
    onSyncCategories(updated)
  }

  const handleEdit = (cat: Category) => {
    setEditTarget({ cat: { ...cat }, isNew: false })
  }

  const handleAdd = (type: 'income' | 'expense') => {
    const base = type === 'income' ? EMPTY_INCOME_DRAFT : EMPTY_EXPENSE_DRAFT
    setEditTarget({ cat: { ...base, id: Date.now().toString(36) }, isNew: true })
  }

  const handleSave = async (draft: DraftCategory) => {
    const existing = categories.find(c => c.id === draft.id)
    const isRename = !!existing && existing.name !== draft.name

    const updated = existing
      ? categories.map(c => c.id === draft.id ? { ...c, ...draft } : c)
      : [...categories, draft as Category]
    persist(updated)
    setEditTarget(null)

    if (isRename) {
      await markAllRecordsPending()
      onSyncAll()
    } else {
      onSyncCategories(updated)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定刪除這個類別？歷史帳目不受影響。')) return
    const updated = categories.filter(c => c.id !== id)
    persist(updated)
    setEditTarget(null)
    await markAllRecordsPending()
    onSyncAll()
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
