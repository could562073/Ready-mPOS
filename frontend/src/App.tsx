import { useState, useEffect } from 'react'
import { DashboardPage } from './pages/DashboardPage'
import { DailyEntryPage } from './pages/DailyEntryPage'
import { MonthlyReportPage } from './pages/MonthlyReportPage'
import { SettingsPage } from './pages/SettingsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { Icon } from './components/Icon'
import { T } from './lib/tokens'
import { useSyncService } from './hooks/useSyncService'
import { registerSW, sendReminderToSW, getPermission } from './lib/notification'

type Tab = 'dashboard' | 'daily' | 'monthly' | 'settings'
type SubPage = 'categories' | null

function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: '首頁',   icon: 'home'     },
  { id: 'daily',     label: '記帳',   icon: 'pencil'   },
  { id: 'monthly',   label: '月結',   icon: 'chart'    },
  { id: 'settings',  label: '設定',   icon: 'settings' },
]

function App() {
  const [tab, setTab] = useState<Tab>('dashboard')

  // 啟動時註冊 Service Worker，並將已儲存的提醒設定送給 SW
  useEffect(() => {
    registerSW().then(() => {
      if (!('serviceWorker' in navigator)) return
      navigator.serviceWorker.ready.then(() => {
        const enabled = localStorage.getItem('mpos_reminder_enabled') === 'true'
        const time    = localStorage.getItem('mpos_reminder_time') || '22:30'
        if (enabled && getPermission() === 'granted') {
          sendReminderToSW(true, time)
        }
      })
    })
  }, [])
  const [dailyDate, setDailyDate] = useState(() => toLocalDateString(new Date()))
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('mpos_onboarded')
  )
  const [subPage, setSubPage] = useState<SubPage>(null)

  const {
    syncing, syncAll, syncCategories,
    googleEmail, signIn, signOut, signInError, creating,
    restoring, restoreFromSheets,
    clearLocalData,
    isConfigured, setCustomSheet,
  } = useSyncService()

  // 月結報表點擊某天 → 切換到每日記帳並帶入選定日期
  const handleSelectDate = (date: string) => {
    setDailyDate(date)
    setTab('daily')
  }

  // Dashboard 的「編輯今日帳目」按鈕
  const handleNavigate = (target: Tab) => setTab(target)

  const handleOnboardingDone = () => {
    localStorage.setItem('mpos_onboarded', '1')
    setShowOnboarding(false)
  }

  if (showOnboarding) {
    return <OnboardingPage onDone={handleOnboardingDone} />
  }

  return (
    <div
      style={{
        maxWidth: 430,
        margin: '0 auto',
        minHeight: '100dvh',
        background: T.bg,
        fontFamily: T.font.sans,
        position: 'relative',
      }}
    >
      {/* 頁面內容，底部留空給 tab bar */}
      <div style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', paddingTop: 16 }}>
        {tab === 'dashboard' && (
          <DashboardPage onNavigate={handleNavigate} syncing={syncing} />
        )}
        {tab === 'daily' && (
          <DailyEntryPage date={dailyDate} onDateChange={setDailyDate} onSync={syncAll} syncing={syncing} />
        )}
        {tab === 'monthly' && (
          <MonthlyReportPage onSelectDate={handleSelectDate} />
        )}
        {tab === 'settings' && subPage === null && (
          <SettingsPage
            syncing={syncing}
            onSync={syncAll}
            googleEmail={googleEmail}
            onSignIn={signIn}
            onSignOut={signOut}
            signInError={signInError}
            isConfigured={isConfigured}
            creating={creating}
            restoring={restoring}
            onRestore={restoreFromSheets}
            onClearLocal={clearLocalData}
            onSetCustomSheet={setCustomSheet}
            onNavigateCategories={() => setSubPage('categories')}
          />
        )}
        {tab === 'settings' && subPage === 'categories' && (
          <CategoriesPage
            onBack={() => setSubPage(null)}
            googleEmail={googleEmail}
            onSyncCategories={syncCategories}
          />
        )}
      </div>

      {/* 底部 Tab 導覽列 */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 430,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: `1px solid ${T.hairline}`,
          display: 'flex',
          zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* 同步中提示 */}
        {syncing && (
          <div
            style={{
              position: 'absolute',
              top: -28,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 999,
              background: T.mintSoft,
              color: T.mintInk,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name="sync" size={12} stroke={2.6} />
            同步中…
          </div>
        )}

        {NAV_ITEMS.map(item => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 0 8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: active ? T.ink : T.muted,
                fontFamily: T.font.sans,
                transition: 'color 150ms',
                position: 'relative',
              }}
            >
              {/* 活躍指示點 */}
              {active && (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: T.mint,
                  }}
                />
              )}
              <Icon
                name={item.icon}
                size={22}
                color={active ? T.ink : T.muted}
                stroke={active ? 2.4 : 2}
              />
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default App
