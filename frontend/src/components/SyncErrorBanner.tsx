// frontend/src/components/SyncErrorBanner.tsx
// 雲端同步失敗的使用者可見提示（2.2.2）。
//
// 為什麼需要它：在此之前同步失敗只寫進 console 並寄診斷信給開發者，客戶端毫無感覺——
// 正式站客戶連續多日所有寫入都被 Google 擋下（403），帳目一直停在本機 PENDING，
// 使用者卻以為早就上雲了。這是「靜默失敗」，比失敗本身更危險。
//
// 語氣刻意用琥珀色（warning）而非紅色：資料其實安全存在本機，不是遺失，
// 用紅色會讓老闆以為帳目不見了而恐慌。
import { T } from '../lib/tokens'
import { Icon } from './Icon'
import type { WriteFailureKind } from '../lib/syncDiag'
import { isErrorReportEnabled } from '../lib/errorReport'

export function SyncErrorBanner({ kind, message, paused, retrying, onRetry, onDismiss }: {
  kind: WriteFailureKind
  message: string
  /** 自動同步是否已因此成因暫停（2.4.0） */
  paused: boolean
  /** 同步進行中（重試按鈕改顯示「重試中…」並停用） */
  retrying: boolean
  onRetry: () => void
  onDismiss: () => void
}) {
  // UNKNOWN = 成因不明（多半是暫時性網路問題），下次同步會自動重試 → 用較低調的說法
  const title = kind === 'UNKNOWN' ? '雲端同步暫時失敗' : '帳目尚未上傳到雲端'
  // 容量滿是「客戶自己動手清完才會好」的成因，按鈕文案直接對上那個動作；
  // 其他成因（權限／授權／未知）客戶不一定做了什麼，就只說「立即重試」。
  const retryLabel = kind === 'QUOTA_FULL' ? '我已清理完成，立即重試' : '立即重試'

  return (
    <div
      style={{
        margin: '0 16px 12px',
        padding: '12px 14px',
        borderRadius: T.r.md,
        background: T.sunSoft,
        color: T.sunInk,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ paddingTop: 1, flexShrink: 0 }}>
        <Icon name="cloud" size={16} stroke={2.4} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, fontWeight: 600 }}>{message}</div>

        {/* 2.4.0：自動同步已暫停時要講清楚「暫停了、但會自己恢復」。
            只說「同步失敗」而不說暫停，客戶會以為 App 還在背景重試。 */}
        {paused && (
          <div style={{ fontSize: 11, lineHeight: 1.5, fontWeight: 600, opacity: 0.85, marginTop: 4 }}>
            為避免一直重複失敗，自動同步已暫停；問題排除後重開 App 會自動恢復。
          </div>
        )}

        {/* 🔴 手動重試：客戶清完空間後不必等下次開 App，也不必等 6 小時心跳。
            無視暫停閘門（走 retryNow），這是「我已經處理好了」的唯一出口。 */}
        <button
          onClick={onRetry}
          disabled={retrying}
          style={{
            marginTop: 8,
            border: `1px solid ${T.sunInk}`,
            borderRadius: 999,
            background: 'transparent',
            color: T.sunInk,
            fontFamily: T.font.sans,
            fontSize: 12,
            fontWeight: 800,
            padding: '5px 12px',
            cursor: retrying ? 'default' : 'pointer',
            opacity: retrying ? 0.6 : 1,
          }}
        >
          {retrying ? '重試中…' : retryLabel}
        </button>

        {/* 2.4.0：回報是自動的（工作項目 C 的「要不要送出」詢問視窗已暫緩），
            但客戶有權知道有東西被送出去、以及送的不是他的帳目內容。 */}
        {isErrorReportEnabled() && (
          <div style={{ fontSize: 11, lineHeight: 1.5, fontWeight: 600, opacity: 0.75, marginTop: 6 }}>
            此問題已自動回報給開發者（僅傳送錯誤訊息，不含帳目內容與金額）
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="關閉提示"
        style={{
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          color: T.sunInk,
          padding: 2,
          cursor: 'pointer',
          opacity: 0.7,
        }}
      >
        <Icon name="x" size={14} stroke={2.4} />
      </button>
    </div>
  )
}
