import { useState, useEffect } from 'react'
import { LedgerPage } from './pages/LedgerPage'
import { MonthlyReportPage } from './pages/MonthlyReportPage'
import { SettingsPage } from './pages/SettingsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { Icon } from './components/Icon'
import { T } from './lib/tokens'
import { useSyncService } from './hooks/useSyncService'
import { registerSW, sendReminderToSW, getPermission } from './lib/notification'

type Tab = 'daily' | 'monthly' | 'settings'
type SubPage = 'categories' | null

function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 導覽順序：帳目（落地頁，月曆＋逐筆列表）→ 月結 → 設定（首頁已於 2.2.0 移除，指標併入帳目頁小計）
const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'daily',    label: '帳目', icon: 'calendar' },
  { id: 'monthly',  label: '月結', icon: 'chart'    },
  { id: 'settings', label: '設定', icon: 'settings' },
]

function App() {
  // 落地頁改為「帳目」（月曆＋逐筆列表），取代舊的 Dashboard 落地頁
  const [tab, setTab] = useState<Tab>('daily')

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
    migrating, migrateMsg,
    clearLocalData,
    isConfigured, setCustomSheet,
  } = useSyncService()

  // 月結報表點擊某天 → 切換到每日記帳並帶入選定日期
  const handleSelectDate = (date: string) => {
    setDailyDate(date)
    setTab('daily')
  }

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
        {tab === 'daily' && (
          <LedgerPage date={dailyDate} onDateChange={setDailyDate} onSync={syncAll} />
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
            onSyncAll={syncAll}
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

      {/* 🔴 新舊資料轉換阻擋層：cutover 遷移期間全螢幕遮罩，防止使用者操作干擾備份／改寫中的資料。
          蓋過 nav 與 FAB（z-index 最高），使用者無法點記帳，只能等待；完成後自動消失（一般同步不觸發）。 */}
      {migrating && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(26,27,37,0.72)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: T.card,
              borderRadius: 24,
              padding: '32px 28px',
              maxWidth: 320,
              width: '100%',
              boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div className="mpos-spin" style={{ display: 'flex', color: T.mint }}>
              <Icon name="sync" size={40} stroke={2.4} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>資料升級中</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.muted, lineHeight: 1.6 }}>
              正在把您的舊帳目轉換成新格式，<br />
              請勿關閉或操作 App，完成後會自動回到畫面。
            </div>
            {migrateMsg && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: T.mintInk,
                  background: T.mintSoft,
                  padding: '6px 14px',
                  borderRadius: 999,
                }}
              >
                {migrateMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
