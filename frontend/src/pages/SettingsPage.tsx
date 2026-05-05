import { useEffect, useState } from 'react'
import { T } from '../lib/tokens'
import { Icon } from '../components/Icon'
import { db } from '../db'

interface Props {
  syncing: boolean
  onSync?: () => void
  googleEmail: string | null
  onSignIn: () => Promise<void>
  onSignOut: () => void
  signInError: string | null
  isConfigured: boolean
  creating: boolean
  restoring: boolean
  onRestore: () => void
  onClearLocal: () => Promise<void>
  onSetCustomSheet: (id: string, name: string) => void
  onNavigateCategories: () => void
}

// 通用設定列元件（對齊原型 SettingRow）
function SettingRow({ icon, iconBg, iconColor, title, subtitle, right, last, onClick }: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  subtitle?: string
  right?: React.ReactNode   // undefined = 預設顯示 chevron；null = 不顯示右側
  last?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', cursor: onClick ? 'pointer' : 'default',
        borderBottom: last ? 'none' : `1px solid ${T.hairline}`,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} stroke={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right === undefined ? <Icon name="chevron-r" size={16} color={T.muted} stroke={2.4} /> : right}
    </div>
  )
}

// Toggle 開關（對齊原型）
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(!on) }}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none',
        background: on ? T.mint : '#D8D9E0',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background 200ms',
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

// Section 標題列
function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '4px 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' as const }}>
      {label}
    </div>
  )
}

export function SettingsPage({
  syncing, onSync,
  googleEmail, onSignIn, onSignOut, signInError, isConfigured, creating,
  restoring, onRestore, onClearLocal,
  onSetCustomSheet, onNavigateCategories,
}: Props) {
  const [signingIn,    setSigningIn]    = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customId,     setCustomId]     = useState('')
  const [customName,   setCustomName]   = useState('')
  const [customSaved,  setCustomSaved]  = useState(false)
  const [autoSync,     setAutoSync]     = useState(true)
  const [reminder,     setReminder]     = useState(true)

  // 店家身份
  const [restaurantName, setRestaurantName] = useState(() => localStorage.getItem('mpos_restaurant_name') || '我的餐廳')
  const [ownerName,      setOwnerName]      = useState(() => localStorage.getItem('mpos_owner_name') || '')
  const [editingProfile, setEditingProfile] = useState(false)
  const [draftName,      setDraftName]      = useState('')
  const [draftOwner,     setDraftOwner]     = useState('')
  const [recordCount,    setRecordCount]    = useState(0)

  useEffect(() => {
    db.dailyRecords.count().then(setRecordCount)
  }, [])

  const handleEditProfile = () => {
    setDraftName(restaurantName)
    setDraftOwner(ownerName)
    setEditingProfile(true)
  }

  const handleSaveProfile = () => {
    const name = draftName.trim() || '我的餐廳'
    const owner = draftOwner.trim()
    setRestaurantName(name)
    setOwnerName(owner)
    localStorage.setItem('mpos_restaurant_name', name)
    localStorage.setItem('mpos_owner_name', owner)
    setEditingProfile(false)
  }

  const handleSignIn = async () => {
    setSigningIn(true)
    try { await onSignIn() } finally { setSigningIn(false) }
  }

  const handleRestore = () => {
    if (!window.confirm(
      '確定要從雲端還原資料？\n\n此裝置的所有本機資料將被雲端資料覆蓋，此操作不可還原。'
    )) return
    onRestore()
  }

  const handleClearLocal = async () => {
    if (!window.confirm(
      '確定要清除本機資料？\n\n此裝置的所有記錄將被刪除，雲端試算表不受影響。'
    )) return
    await onClearLocal()
  }

  const handleSaveCustom = () => {
    if (!customId.trim()) return
    onSetCustomSheet(customId.trim(), customName.trim() || '自訂試算表')
    setCustomSaved(true)
    setTimeout(() => { setCustomSaved(false); setShowAdvanced(false) }, 1500)
  }

  const connectLabel = creating ? '建立試算表中…' : signingIn ? '連結中…' : '連結 Google 帳號'

  return (
    <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 店家身份卡 */}
      <div style={{
        padding: 18, borderRadius: 24,
        background: `linear-gradient(135deg, ${T.lavenderSoft} 0%, ${T.skySoft} 100%)`,
      }}>
        {editingProfile ? (
          /* 編輯模式 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2, marginBottom: 2 }}>編輯店家資訊</div>
            <input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              placeholder="餐廳 / 店家名稱"
              autoFocus
              style={{
                padding: '10px 14px', borderRadius: T.r.md,
                border: `1.5px solid ${T.lavender}`, outline: 'none',
                fontSize: 14, fontWeight: 700, color: T.ink,
                fontFamily: T.font.sans, background: '#fff',
              }}
            />
            <input
              value={draftOwner}
              onChange={e => setDraftOwner(e.target.value)}
              placeholder="老闆姓名（選填）"
              style={{
                padding: '10px 14px', borderRadius: T.r.md,
                border: `1.5px solid ${T.hairline}`, outline: 'none',
                fontSize: 14, color: T.ink,
                fontFamily: T.font.sans, background: '#fff',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setEditingProfile(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: T.r.md,
                  border: `1.5px solid ${T.hairline}`, background: 'transparent',
                  fontSize: 13, fontWeight: 700, color: T.ink2, cursor: 'pointer', fontFamily: T.font.sans,
                }}
              >取消</button>
              <button
                onClick={handleSaveProfile}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: T.r.md,
                  border: 'none', background: T.lavender,
                  fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: T.font.sans,
                }}
              >儲存</button>
            </div>
          </div>
        ) : (
          /* 顯示模式 */
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18, background: '#fff', color: T.lavenderInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800,
              boxShadow: '0 4px 12px rgba(155,138,251,0.24)',
              flexShrink: 0,
            }}>
              {restaurantName.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {restaurantName}
              </div>
              <div style={{ fontSize: 12, color: T.ink2, fontWeight: 600, marginTop: 2 }}>
                已記帳 {recordCount} 天{ownerName ? ` · 老闆 ${ownerName}` : ''}
              </div>
            </div>
            <button
              onClick={handleEditProfile}
              style={{
                width: 36, height: 36, borderRadius: 12, border: 'none',
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              }}
            >
              <Icon name="pencil" size={16} stroke={2.4} color={T.ink2} />
            </button>
          </div>
        )}
      </div>

      {/* 錯誤提示 */}
      {!isConfigured && (
        <div style={{ padding: '10px 14px', borderRadius: T.r.md, background: T.sunSoft, fontSize: 12, color: T.sunInk, fontWeight: 600, lineHeight: 1.5 }}>
          ⚠️ 尚未設定 VITE_GOOGLE_CLIENT_ID，請在 frontend/.env 填入後重啟。
        </div>
      )}
      {signInError && (
        <div style={{ padding: '10px 14px', borderRadius: T.r.md, background: T.coralSoft, fontSize: 12, color: T.coralInk, fontWeight: 600, lineHeight: 1.5 }}>
          登入失敗：{signInError}
        </div>
      )}

      {/* 類別管理 */}
      <div>
        <SectionLabel label="類別管理" />
        <div style={{ background: T.card, borderRadius: 22, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <SettingRow
            icon="arrow-up" iconBg={T.mintSoft} iconColor={T.mintInk}
            title="收入類別" subtitle="現金、刷卡、Uber Eats、foodpanda"
            onClick={onNavigateCategories}
          />
          <SettingRow
            icon="arrow-down" iconBg={T.coralSoft} iconColor={T.coralInk}
            title="支出類別" subtitle="食材、薪資、雜支"
            onClick={onNavigateCategories}
          />
          <SettingRow
            icon="package" iconBg="#E8E0F8" iconColor="#5B3DA8"
            title="外送平台費率" subtitle="Uber 30% · foodpanda 35%"
            onClick={onNavigateCategories} last
          />
        </div>
      </div>

      {/* 應用程式 */}
      <div>
        <SectionLabel label="應用程式" />
        <div style={{ background: T.card, borderRadius: 22, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <SettingRow
            icon="cloud" iconBg={T.skySoft} iconColor={T.skyInk}
            title="自動同步" subtitle="每筆變更即時上傳"
            right={<Toggle on={autoSync} onChange={setAutoSync} />}
          />
          <SettingRow
            icon="sparkle" iconBg={T.sunSoft} iconColor={T.sunInk}
            title="打烊提醒" subtitle="每晚 22:30 提醒記帳"
            right={<Toggle on={reminder} onChange={setReminder} />}
          />
          <SettingRow
            icon="camera" iconBg={T.peachSoft} iconColor={T.peachInk}
            title="發票 OCR 辨識" subtitle="拍照自動填入金額"
            right={null} last
          />
        </div>
      </div>

      {/* 資料 — 含 Google Sheets 同步 */}
      <div>
        <SectionLabel label="資料" />
        {googleEmail ? (
        /* ── 已連結：緊湊同步狀態卡（對齊原型） ── */
        <div style={{ background: T.card, borderRadius: 22, padding: '14px 16px', boxShadow: T.shadow.card }}>
          {/* 帳號 + 同步按鈕 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0,
              background: T.mintSoft, color: T.mintInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <Icon name="cloud-check" size={20} stroke={2.2} />
              <span style={{
                position: 'absolute', top: 0, right: 0,
                width: 10, height: 10, borderRadius: 5,
                background: T.mint, border: '2px solid #fff',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>已連結 Google Sheets</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {googleEmail}
              </div>
            </div>
            <button
              onClick={onSync}
              disabled={syncing}
              style={{
                padding: '6px 12px', borderRadius: 999,
                background: T.bg, border: 'none',
                fontSize: 12, fontWeight: 700, color: T.ink2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.font.sans,
                flexShrink: 0, opacity: syncing ? 0.4 : 1,
              }}
            >
              <Icon name="sync" size={12} stroke={2.6} />
              {syncing ? '同步中…' : '同步'}
            </button>
          </div>

          {/* 進階設定 collapse（還原 / 清除 / 自訂 sheet / 登出） */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              width: '100%', padding: '10px 0 0', border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', fontFamily: T.font.sans, marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>進階設定</span>
            <Icon name={showAdvanced ? 'chevron-d' : 'chevron-r'} size={14} color={T.muted} stroke={2.4} />
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>
              {/* 從雲端還原 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink2 }}>☁️ → 📱　從雲端還原</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginTop: 2 }}>本機資料將被覆蓋，無法復原</div>
                </div>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  style={{ padding: '7px 14px', borderRadius: 999, border: 'none', background: T.coralSoft, color: T.coralInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, flexShrink: 0, opacity: restoring ? 0.5 : 1 }}
                >
                  {restoring ? '還原中…' : '還原'}
                </button>
              </div>

              <div style={{ height: 1, background: T.hairline }} />

              {/* 自訂試算表 */}
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>使用現有試算表</div>
              <input
                value={customId}
                onChange={e => setCustomId(e.target.value)}
                placeholder="試算表 ID（從網址複製）"
                style={{ padding: '8px 12px', borderRadius: T.r.sm, border: `1.5px solid ${T.hairline}`, fontSize: 12, fontFamily: T.font.sans, color: T.ink, background: T.bg, outline: 'none' }}
              />
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="顯示名稱（選填）"
                style={{ padding: '8px 12px', borderRadius: T.r.sm, border: `1.5px solid ${T.hairline}`, fontSize: 12, fontFamily: T.font.sans, color: T.ink, background: T.bg, outline: 'none' }}
              />
              <button
                onClick={handleSaveCustom}
                disabled={!customId.trim()}
                style={{ padding: '10px 0', borderRadius: T.r.sm, border: 'none', background: customSaved ? T.mintSoft : T.ink, color: customSaved ? T.mintInk : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, transition: 'all 200ms', opacity: !customId.trim() ? 0.4 : 1 }}
              >
                {customSaved ? '已套用 ✓' : '套用'}
              </button>
              <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
                從試算表網址複製：…/spreadsheets/d/<strong>這段ID</strong>/edit
              </div>

              <div style={{ height: 1, background: T.hairline }} />

              {/* 清除本機資料 */}
              <button
                onClick={handleClearLocal}
                style={{ padding: '10px 0', borderRadius: T.r.sm, border: `1.5px solid ${T.coralSoft}`, background: 'transparent', color: T.coralInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}
              >
                清除本機資料
              </button>
              <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
                僅刪除此裝置記錄，雲端試算表不受影響。
              </div>

              <div style={{ height: 1, background: T.hairline }} />

              {/* 登出 */}
              <button
                onClick={onSignOut}
                style={{ padding: '10px 0', borderRadius: T.r.sm, border: 'none', background: T.coralSoft, color: T.coralInk, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}
              >
                登出 Google 帳號
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── 未連結：登入引導 ── */
        <div style={{ background: T.card, borderRadius: 22, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: 20, background: T.mintSoft, color: T.mintInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="cloud" size={30} stroke={1.8} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>自動備份到 Google Sheets</div>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginTop: 6, lineHeight: 1.6 }}>
                連結後每次儲存帳目時自動同步雲端，<br />換裝置也能輕鬆還原資料。
              </div>
            </div>
            <button
              onClick={handleSignIn}
              disabled={signingIn || creating || !isConfigured}
              style={{
                width: '100%', padding: '14px 0', borderRadius: T.r.md, border: 'none',
                background: T.ink, color: '#fff',
                fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: T.font.sans,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: (!isConfigured || signingIn || creating) ? 0.5 : 1,
                transition: 'opacity 150ms',
              }}
            >
              <Icon name="cloud-check" size={18} color="#fff" stroke={2.2} />
              {connectLabel}
            </button>
          </div>
        </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 8 }}>
        Ready-mPOS v1.0 · MVP
      </div>
    </div>
  )
}
