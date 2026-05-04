import { useState } from 'react'
import { T } from '../lib/tokens'
import { Icon } from '../components/Icon'

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
}

export function SettingsPage({
  syncing, onSync,
  googleEmail, onSignIn, onSignOut, signInError, isConfigured, creating,
  restoring, onRestore, onClearLocal,
  onSetCustomSheet,
}: Props) {
  const [signingIn,    setSigningIn]    = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customId,     setCustomId]     = useState('')
  const [customName,   setCustomName]   = useState('')
  const [customSaved,  setCustomSaved]  = useState(false)

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
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 店家身份卡 */}
      <div style={{
        padding: 18, borderRadius: T.r.xl,
        background: `linear-gradient(135deg, ${T.lavenderSoft} 0%, ${T.skySoft} 100%)`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18, background: '#fff', color: T.lavenderInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, fontFamily: T.font.num,
          boxShadow: '0 4px 12px rgba(155,138,251,0.24)',
        }}>店</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>我的餐廳</div>
          <div style={{ fontSize: 12, color: T.ink2, fontWeight: 600, marginTop: 2 }}>
            {googleEmail ? '已連結 Google 帳號' : '連結 Google 帳號以啟用雲端備份'}
          </div>
        </div>
      </div>

      {/* Google 雲端備份 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '4px 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Google 雲端備份
        </div>
        <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>

          {/* Client ID 未設定警告 */}
          {!isConfigured && (
            <div style={{ padding: '10px 16px', background: T.sunSoft, borderBottom: `1px solid ${T.hairline}`, fontSize: 12, color: T.sunInk, fontWeight: 600, lineHeight: 1.5 }}>
              ⚠️ 尚未設定 VITE_GOOGLE_CLIENT_ID，請在 frontend/.env 填入後重啟。
            </div>
          )}

          {/* 登入錯誤 */}
          {signInError && (
            <div style={{ padding: '10px 16px', background: T.coralSoft, borderBottom: `1px solid ${T.hairline}`, fontSize: 12, color: T.coralInk, fontWeight: 600, lineHeight: 1.5 }}>
              登入失敗：{signInError}
            </div>
          )}

          {!googleEmail ? (
            /* ── 未連結 ── */
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 60, height: 60, borderRadius: 20,
                background: T.mintSoft, color: T.mintInk,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
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
          ) : (
            /* ── 已連結 ── */
            <>
              {/* 帳號列 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hairline}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.mintSoft, color: T.mintInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="users" size={18} stroke={2.2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{googleEmail}</div>
                  <div style={{ fontSize: 11, color: T.mintInk, fontWeight: 600, marginTop: 2 }}>已連結</div>
                </div>
                <button
                  onClick={onSignOut}
                  style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: T.coralSoft, color: T.coralInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, flexShrink: 0 }}
                >
                  登出
                </button>
              </div>

              {/* ☁️ → 📱  從雲端還原 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hairline}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.coralSoft, color: T.coralInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrow-down" size={18} stroke={2.4} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>從雲端還原</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>
                    ☁️ → 📱　本機資料將被覆蓋
                  </div>
                </div>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: T.coralSoft, color: T.coralInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, flexShrink: 0, opacity: restoring ? 0.5 : 1 }}
                >
                  {restoring ? '還原中…' : '還原'}
                </button>
              </div>

              {/* 📱 → ☁️  同步到雲端 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hairline}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.skySoft, color: T.skyInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="arrow-up" size={18} stroke={2.4} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>同步到雲端</div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>
                    {syncing ? '同步中…' : '📱 → ☁️　儲存帳目時自動同步'}
                  </div>
                </div>
                <button
                  onClick={onSync}
                  disabled={syncing}
                  style={{ padding: '6px 14px', borderRadius: 999, border: 'none', background: T.skySoft, color: T.skyInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: syncing ? 0.4 : 1 }}
                >
                  <Icon name="sync" size={12} stroke={2.6} />
                  立即同步
                </button>
              </div>

              {/* 進階（收折） */}
              <div>
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  style={{ width: '100%', padding: '12px 16px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: T.font.sans }}
                >
                  <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>進階設定</span>
                  <Icon name={showAdvanced ? 'chevron-d' : 'chevron-r'} size={14} color={T.muted} stroke={2.4} />
                </button>
                {showAdvanced && (
                  <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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

                    {/* 清除本機資料 */}
                    <div style={{ height: 1, background: T.hairline, margin: '4px 0' }} />
                    <button
                      onClick={handleClearLocal}
                      style={{ padding: '10px 0', borderRadius: T.r.sm, border: `1.5px solid ${T.coralSoft}`, background: 'transparent', color: T.coralInk, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}
                    >
                      清除本機資料
                    </button>
                    <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
                      僅刪除此裝置記錄，雲端試算表不受影響。
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 應用程式設定 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, padding: '4px 4px 8px', letterSpacing: 0.4, textTransform: 'uppercase' }}>應用程式</div>
        <div style={{ background: T.card, borderRadius: T.r.lg, boxShadow: T.shadow.card, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.hairline}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: T.skySoft, color: T.skyInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="package" size={18} stroke={2.2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>外送平台費率</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>Uber Eats 30%・foodpanda 35%</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: T.lavenderSoft, color: T.lavenderInk, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="receipt" size={18} stroke={2.2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>隱私政策與條款</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>
                <a href="/Ready-mPOS/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: T.skyInk, textDecoration: 'none' }}>隱私政策</a>
                {' '}·{' '}
                <a href="/Ready-mPOS/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: T.skyInk, textDecoration: 'none' }}>服務條款</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 8 }}>
        Ready-mPOS v1.0 · MVP
      </div>
    </div>
  )
}
