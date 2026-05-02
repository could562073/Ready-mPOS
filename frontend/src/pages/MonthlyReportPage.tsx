import { useState } from 'react'
import { useMonthlyRecords } from '../hooks/useMonthlyRecords'
import type { DailyRecord } from '../types'

function toMonthString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function dayIncome(r: DailyRecord): number {
  return r.cashIncome + r.cardIncome + r.uberEatsIncome + r.pandaIncome
}

function dayExpense(r: DailyRecord): number {
  return r.foodCost + r.staffSalary + r.miscExpense
}

const SYNC_ICON: Record<string, string> = {
  PENDING: '🕐',
  SYNCED: '✅',
  CONFLICT: '⚠️',
}

interface MonthlyReportPageProps {
  onSelectDate: (date: string) => void
}

export function MonthlyReportPage({ onSelectDate }: MonthlyReportPageProps) {
  const [month, setMonth] = useState(() => toMonthString(new Date()))
  const { records, loading } = useMonthlyRecords(month)

  // 月合計自動彙整，消除人工加總誤差
  const totalIncome = records.reduce((sum, r) => sum + dayIncome(r), 0)
  const totalExpense = records.reduce((sum, r) => sum + dayExpense(r), 0)
  const monthlyNet = totalIncome - totalExpense

  const fmt = (n: number) => n.toLocaleString('zh-TW')

  return (
    <div className="max-w-md mx-auto px-4 py-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">月結報表</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="text-gray-400 text-sm">載入中⋯</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 月度摘要卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">總收入</p>
              <p className="text-sm font-bold text-green-600">${fmt(totalIncome)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">總支出</p>
              <p className="text-sm font-bold text-red-500">${fmt(totalExpense)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">月淨額</p>
              <p
                className={`text-sm font-bold ${
                  monthlyNet >= 0 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {monthlyNet >= 0 ? '+' : ''}${fmt(monthlyNet)}
              </p>
            </div>
          </div>

          {/* 每日明細 */}
          {records.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
              <p className="text-gray-400 text-sm">本月尚無記帳紀錄</p>
              <p className="text-gray-300 text-xs mt-1">切換到「每日記帳」開始記錄</p>
            </div>
          ) : (
            <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 欄位標題 */}
              <div className="grid grid-cols-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400">日期</span>
                <span className="text-xs font-semibold text-gray-400 text-right">收入</span>
                <span className="text-xs font-semibold text-gray-400 text-right">支出</span>
                <span className="text-xs font-semibold text-gray-400 text-right">淨額</span>
              </div>

              {/* 每日記錄列 */}
              {records.map((r) => {
                const inc = dayIncome(r)
                const exp = dayExpense(r)
                const net = inc - exp
                const day = r.date.slice(8) // 'YYYY-MM-DD' → 'DD'
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelectDate(r.date)}
                    className="w-full grid grid-cols-4 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                  >
                    <span className="text-sm text-gray-700 flex items-center gap-1">
                      {day} 日
                      <span className="text-xs leading-none">{SYNC_ICON[r.syncStatus]}</span>
                    </span>
                    <span className="text-sm text-green-600 text-right">${fmt(inc)}</span>
                    <span className="text-sm text-red-500 text-right">${fmt(exp)}</span>
                    <span
                      className={`text-sm font-medium text-right ${
                        net >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {net >= 0 ? '+' : ''}${fmt(net)}
                    </span>
                  </button>
                )
              })}

              {/* 月合計列 */}
              <div className="grid grid-cols-4 px-4 py-3 bg-gray-50 border-t border-gray-200">
                <span className="text-xs font-semibold text-gray-600">
                  月合計 <span className="text-gray-400 font-normal">({records.length}天)</span>
                </span>
                <span className="text-xs font-bold text-green-600 text-right">
                  ${fmt(totalIncome)}
                </span>
                <span className="text-xs font-bold text-red-500 text-right">
                  ${fmt(totalExpense)}
                </span>
                <span
                  className={`text-xs font-bold text-right ${
                    monthlyNet >= 0 ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {monthlyNet >= 0 ? '+' : ''}${fmt(monthlyNet)}
                </span>
              </div>
            </section>
          )}

          {records.length > 0 && (
            <p className="text-center text-xs text-gray-400 pb-2">點擊日期可編輯當日帳目</p>
          )}
        </div>
      )}
    </div>
  )
}
