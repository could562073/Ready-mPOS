import { useState } from 'react'
import { DailyEntryPage } from './pages/DailyEntryPage'
import { MonthlyReportPage } from './pages/MonthlyReportPage'
import { useSyncService } from './hooks/useSyncService'

type Tab = 'daily' | 'monthly'

// 轉換為本地時間 YYYY-MM-DD
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function App() {
  const [tab, setTab] = useState<Tab>('daily')
  const [dailyDate, setDailyDate] = useState(() => toLocalDateString(new Date()))
  // 同步服務：監聽 online 事件 + 提供手動觸發
  const { syncing, syncAll } = useSyncService()

  // 月結報表點擊日期 → 切換到每日記帳並帶入選定日期
  const handleSelectDate = (date: string) => {
    setDailyDate(date)
    setTab('daily')
  }

  return (
    <div className="max-w-md mx-auto">
      {/* 頁面內容，底部留空給 tab bar */}
      <div className="pb-20">
        {tab === 'daily' ? (
          <DailyEntryPage date={dailyDate} onDateChange={setDailyDate} onSync={syncAll} />
        ) : (
          <MonthlyReportPage onSelectDate={handleSelectDate} />
        )}
      </div>

      {/* 底部 Tab 導覽列 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-center z-10">
        {/* 同步進行中提示條 */}
        {syncing && (
          <div className="absolute -top-6 left-0 right-0 flex justify-center">
            <span className="text-xs text-blue-500 bg-blue-50 px-3 py-0.5 rounded-full shadow-sm">
              同步中⋯
            </span>
          </div>
        )}
        <div className="w-full max-w-md flex">
          <button
            onClick={() => setTab('daily')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${
              tab === 'daily' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-xl leading-none">📝</span>
            <span className="text-xs font-medium">每日記帳</span>
          </button>
          <button
            onClick={() => setTab('monthly')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${
              tab === 'monthly' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-xl leading-none">📊</span>
            <span className="text-xs font-medium">月結報表</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App
