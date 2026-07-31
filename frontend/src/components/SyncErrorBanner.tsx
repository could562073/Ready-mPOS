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

export function SyncErrorBanner({ kind, message, onDismiss }: {
  kind: WriteFailureKind
  message: string
  onDismiss: () => void
}) {
  // UNKNOWN = 成因不明（多半是暫時性網路問題），下次同步會自動重試 → 用較低調的說法
  const title = kind === 'UNKNOWN' ? '雲端同步暫時失敗' : '帳目尚未上傳到雲端'

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
