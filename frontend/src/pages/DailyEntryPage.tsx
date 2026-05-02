import { useEffect, useState } from 'react'
import { AmountInput } from '../components/AmountInput'
import { useDailyRecord } from '../hooks/useDailyRecord'

const SYNC_LABEL: Record<string, string> = {
  PENDING: '🕐 待同步',
  SYNCED: '✅ 已同步',
  CONFLICT: '⚠️ 衝突，請確認',
}

interface DailyEntryPageProps {
  date: string
  onDateChange: (date: string) => void
  onSync?: () => void
}

export function DailyEntryPage({ date, onDateChange, onSync }: DailyEntryPageProps) {
  const { record, loading, save } = useDailyRecord(date)

  const [cashIncome, setCashIncome] = useState(0)
  const [cardIncome, setCardIncome] = useState(0)
  const [uberEatsIncome, setUberEatsIncome] = useState(0)
  const [pandaIncome, setPandaIncome] = useState(0)
  const [foodCost, setFoodCost] = useState(0)
  const [staffSalary, setStaffSalary] = useState(0)
  const [miscExpense, setMiscExpense] = useState(0)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  // 日期切換或首次載入完成後，將既有紀錄填入表單
  // 使用 loading 作為依賴，避免儲存後觸發不必要的表單重置
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
      setCashIncome(0)
      setCardIncome(0)
      setUberEatsIncome(0)
      setPandaIncome(0)
      setFoodCost(0)
      setStaffSalary(0)
      setMiscExpense(0)
      setNotes('')
    }
    setSaved(false)
  }, [date, loading])

  // 自動計算小計與淨額
  const totalIncome = cashIncome + cardIncome + uberEatsIncome + pandaIncome
  const totalExpense = foodCost + staffSalary + miscExpense
  const net = totalIncome - totalExpense

  const fmt = (n: number) => n.toLocaleString('zh-TW')

  const handleSave = async () => {
    await save({ cashIncome, cardIncome, uberEatsIncome, pandaIncome, foodCost, staffSalary, miscExpense, notes })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // 儲存完成後立即嘗試同步（有網路才會真正執行）
    onSync?.()
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">每日記帳</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="text-gray-400 text-sm">載入中⋯</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 收入區塊 */}
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              收入
            </h2>
            <AmountInput label="現金收入" value={cashIncome} onChange={setCashIncome} />
            <AmountInput label="刷卡收入" value={cardIncome} onChange={setCardIncome} />
            <AmountInput label="Uber Eats" value={uberEatsIncome} onChange={setUberEatsIncome} />
            <AmountInput label="熊貓外送" value={pandaIncome} onChange={setPandaIncome} />
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-700">收入小計</span>
              <span className="text-base font-bold text-green-600">${fmt(totalIncome)}</span>
            </div>
          </section>

          {/* 支出區塊 */}
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              支出
            </h2>
            <AmountInput label="食材採購" value={foodCost} onChange={setFoodCost} />
            <AmountInput label="員工薪資" value={staffSalary} onChange={setStaffSalary} />
            <AmountInput label="雜支" value={miscExpense} onChange={setMiscExpense} />
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-700">支出小計</span>
              <span className="text-base font-bold text-red-500">${fmt(totalExpense)}</span>
            </div>
          </section>

          {/* 當日淨額 */}
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-800">當日淨額</span>
              <span className={`text-xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {net >= 0 ? '+' : ''}${fmt(net)}
              </span>
            </div>
          </section>

          {/* 備註 */}
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              備註
            </h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="今日特殊事項⋯"
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </section>

          {/* 儲存按鈕 */}
          <button
            onClick={handleSave}
            className={`w-full py-3.5 rounded-2xl font-semibold text-base transition-colors ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
            }`}
          >
            {saved ? '已儲存 ✓' : record ? '更新紀錄' : '儲存今日帳目'}
          </button>

          {/* 同步狀態 */}
          {record && (
            <p className="text-center text-xs text-gray-400 pb-4">
              {SYNC_LABEL[record.syncStatus]}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
