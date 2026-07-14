// frontend/src/components/CostStructureCard.tsx
// 成本結構卡（升級自月結「本月分類」橫條卡）：
//   每列 = 一級類別：金額 + 佔組內比條 + vs 上月增減；支出列另顯示「佔收入比」（食材率/人事率）。
//   點列展開二級細目（金額 + 佔該一級 %）。未知類別（不在 categories 內）不顯示，
//   與既有 dayIncome/dayExpense 只計已知類別的慣例一致。
import { useState } from 'react'
import { T, colorMap } from '../lib/tokens'
import { fmt } from '../lib/fmt'
import { sumByCategoryAndSub, delta } from '../lib/monthReport'
import type { Transaction, Category } from '../types'

export function CostStructureCard({ txs, prevTxs, categories, totalIncome }: {
  txs: Transaction[]       // 本月交易
  prevTxs: Transaction[]   // 上月比較基準交易（已 limitToDay，同期/全月由呼叫端決定）
  categories: Category[]
  totalIncome: number      // 本月總收入毛額（佔收入比分母；0 時不顯示佔收入比）
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const catById = new Map(categories.map(c => [c.id, c]))

  const renderGroup = (type: 'income' | 'expense', title: string, totalColor: string) => {
    // 只顯示已知類別（未知 categoryId 略過，防雲端陌生資料污染畫面）
    const rows = sumByCategoryAndSub(txs, categories, type).filter(r => catById.has(r.categoryId))
    if (rows.length === 0) return null
    const prevRows = new Map(
      sumByCategoryAndSub(prevTxs, categories, type).map(r => [r.categoryId, r.total]),
    )
    const groupTotal = rows.reduce((s, r) => s + r.total, 0)

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: 0.4, textTransform: 'uppercase' as const }}>{title}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: totalColor, fontFamily: T.font.num }}>{fmt(groupTotal)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {rows.map(r => {
            const cat = catById.get(r.categoryId)!
            const pct = groupTotal > 0 ? Math.round((r.total / groupTotal) * 100) : 0
            const prev = prevRows.get(r.categoryId)
            const d = prev === undefined ? null : delta(r.total, prev) // null = 上月無此類別 →「新」
            // 支出增加=紅、支出減少=綠；收入相反；持平=灰
            const deltaColor =
              d === null || d.diff === 0 ? T.muted
              : (type === 'expense') === (d.diff > 0) ? T.coralInk : T.mintInk
            const incomePct = type === 'expense' && totalIncome > 0
              ? Math.round((r.total / totalIncome) * 100) : null
            const open = expanded === r.categoryId
            const hasSubs = r.subs.length > 1 || r.subs[0]?.label !== '（未分類）'

            return (
              <div key={r.categoryId}>
                <div
                  {...(hasSubs
                    ? { role: 'button', tabIndex: 0, 'aria-expanded': open, 'aria-label': `${cat.name} 細目` }
                    : {})}
                  onClick={() => hasSubs && setExpanded(open ? null : r.categoryId)}
                  onKeyDown={e => {
                    if (!hasSubs) return
                    if (e.key === ' ') e.preventDefault() // 防止 Space 觸發頁面捲動
                    if (e.key === 'Enter' || e.key === ' ') setExpanded(open ? null : r.categoryId)
                  }}
                  style={{ cursor: hasSubs ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, color: T.ink2, fontWeight: 700 }}>
                      {cat.name}
                      {incomePct !== null && (
                        <span style={{ color: T.muted, fontWeight: 600, marginLeft: 6 }}>佔收入 {incomePct}%</span>
                      )}
                      {hasSubs && <span style={{ color: T.muted, marginLeft: 4 }}>{open ? '▾' : '▸'}</span>}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>
                      <span style={{ color: deltaColor, fontFamily: T.font.num, fontWeight: 700, marginRight: 8 }}>
                        {d === null ? '新'
                          : d.diff === 0 ? '─ 持平'
                          : `${d.diff > 0 ? '▲' : '▼'}${fmt(Math.abs(d.diff))}${d.pct !== null ? `（${d.pct > 0 ? '+' : ''}${d.pct}%）` : ''}`}
                      </span>
                      <span style={{ color: T.muted, fontFamily: T.font.num, fontWeight: 700, marginRight: 6 }}>{pct}%</span>
                      <span style={{ color: T.ink, fontFamily: T.font.num }}>{fmt(r.total)}</span>
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: T.bg, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(pct, r.total > 0 ? 1.5 : 0)}%`, height: '100%', background: (colorMap[cat.color] ?? colorMap['mint']).bg, borderRadius: 4, transition: 'width 400ms ease' }} />
                  </div>
                </div>

                {/* 二級細目（點一級展開） */}
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${T.hairline}` }}>
                    {r.subs.map(s => (
                      <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.num }}>
                          <span style={{ color: T.muted, marginRight: 6 }}>{r.total > 0 ? Math.round((s.amount / r.total) * 100) : 0}%</span>
                          <span style={{ color: T.ink }}>{fmt(s.amount)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  const income = renderGroup('income', '收入', T.mintInk)
  const expense = renderGroup('expense', '支出', T.coralInk)
  if (!income && !expense) return null

  return (
    <div style={{ background: T.card, borderRadius: T.r.lg, padding: 18, boxShadow: T.shadow.card }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 14 }}>本月分類</div>
      {income}
      {expense}
    </div>
  )
}
