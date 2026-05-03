import { useState } from 'react'
import { T } from '../lib/tokens'
import { Icon } from '../components/Icon'

interface Props {
  syncing: boolean
  onSync?: () => void
}

// iOS 風格 Toggle 開關
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(!on) }}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none',
        background: on ? T.mint : '#D8D9E0',
        position: 'relative', cursor: 'pointer',
        transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 22, height: 22, borderRadius: 11, background: '#fff',
        transition: 'left 200ms',
        boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
      }} />
    </button>
  )
}

// 設定列
function SettingRow({
  icon, color, title, subtitle, right, onClick, isLast = false,
}: {
  icon: string
  color: { soft: string; ink: string }
  title: string
  subtitle?: string
  right?: React.ReactNode
  onClick?: () => void
  isLast?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', cursor: onClick ? 'pointer' : 'default',
        borderBottom: isLast ? 'none' : `1px solid ${T.hairline}`,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: color.soft, color: color.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} stroke={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right ?? <Icon name="chevron-r" size={16} color={T.muted} stroke={2.4} />}
    </div>
  )
}

export function SettingsPage({ syncing, onSync }: Props) {
  const [autoSync, setAutoSync]   = useState(true)
  const [reminder, setReminder]   = useState(true)

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 店家身份卡 */}
      <div style={{
        padding: 18, borderRadius: T.r.xl,
        background: `linear-gradient(135deg, ${T.lavenderSoft} 0%, ${T.skySoft} 100%)`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          background: '#fff', color: T.lavenderInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, fontFamily: T.font.num,
          boxShadow: '0 4px 12px rgba(155,138,251,0.24)',
        }}>店</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>我的餐廳</div>
          <div style={{ fontSize: 12, color: T.ink2, fontWeight: 600, marginTop: 2 }}>開始記帳，告別手寫記帳本</div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 12,
          background: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}>
          <Icon name="pencil" size={16} stroke={2.4} color={T.ink2} />
        </button>
      </div>

      {/* 同步狀態 */}
      <div style={{ background: T.card, borderRadius: T.r.lg, padding: '14px 16px', boxShadow: T.shadow.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 13, position: 'relative',
            background: T.mintSoft, color: T.mintInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="cloud-check" size={20} stroke={2.2} />
            <span style={{
              position: 'absolute', top: 0, right: 0,
              width: 10, height: 10, borderRadius: 5, background: T.mint,
              border: '2px solid #fff',
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>離線優先，連網自動同步</div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>
              {syncing ? '同步中…' : '資料已儲存到本機'}
            </div>
          </div>
          <button
            onClick={onSync}
            style={{
              padding: '6px 12px', borderRadius: 999,
              background: T.bg, border: 'none',
              fontSize: 12, fontWeight: 700, color: T.ink2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.font.sans,
            }}
          >
            <Icon name="sync" size={12} stroke={2.6} />
            同步
          </button>
        </div>
      </div>

      {/* 類別管理 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '4px 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          類別管理
        </div>
        <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <SettingRow icon="arrow-up"  color={{ soft: T.mintSoft,  ink: T.mintInk  }} title="收入類別"     subtitle="現金、刷卡、Uber Eats、foodpanda" />
          <SettingRow icon="arrow-down" color={{ soft: T.coralSoft, ink: T.coralInk }} title="支出類別"     subtitle="食材、薪資、雜支" />
          <SettingRow icon="package"   color={{ soft: T.uberSoft,  ink: T.uberInk  }} title="外送平台費率" subtitle="Uber 30% · foodpanda 35%" isLast />
        </div>
      </div>

      {/* 應用程式設定 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '4px 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          應用程式
        </div>
        <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <SettingRow
            icon="cloud" color={{ soft: T.skySoft, ink: T.skyInk }}
            title="自動同步" subtitle="每筆變更即時上傳"
            right={<Toggle on={autoSync} onChange={setAutoSync} />}
          />
          <SettingRow
            icon="sparkle" color={{ soft: T.sunSoft, ink: T.sunInk }}
            title="打烊提醒" subtitle="每晚 22:30 提醒記帳"
            right={<Toggle on={reminder} onChange={setReminder} />}
          />
          <SettingRow icon="camera" color={{ soft: T.peachSoft, ink: T.peachInk }} title="發票 OCR 辨識" subtitle="拍照自動填入金額" isLast />
        </div>
      </div>

      {/* 資料 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '4px 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          資料
        </div>
        <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <SettingRow icon="receipt"     color={{ soft: T.lavenderSoft, ink: T.lavenderInk }} title="匯出對帳單"  subtitle="PDF / CSV / Google Sheets" />
          <SettingRow icon="cloud-check" color={{ soft: T.mintSoft,     ink: T.mintInk     }} title="本地備份"    subtitle="IndexedDB 離線儲存" isLast />
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 8 }}>
        Ready-mPOS v1.0 · MVP
      </div>
    </div>
  )
}
