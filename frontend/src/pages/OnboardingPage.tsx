import { useState } from 'react'
import { T } from '../lib/tokens'
import { Icon } from '../components/Icon'

interface Props {
  onDone: () => void
}

const SLIDES = [
  {
    bg:          `linear-gradient(135deg, ${T.mint} 0%, #14B86E 100%)`,
    shadowColor: 'rgba(16,199,126,0.32)',
    icon:        'wallet' as const,
    title:       '告別手寫記帳本',
    desc:        '5 分鐘完成今日帳目，自動加總、自動對帳，月底不用再翻舊帳。',
  },
  {
    bg:          `linear-gradient(135deg, ${T.lavender} 0%, #7B5BD8 100%)`,
    shadowColor: 'rgba(155,138,251,0.32)',
    icon:        'chart' as const,
    title:       '外送分潤一鍵算',
    desc:        'Uber Eats、foodpanda 自動扣手續費；毛利率、食材成本一目了然。',
  },
  {
    bg:          `linear-gradient(135deg, ${T.sky} 0%, #1F8FCC 100%)`,
    shadowColor: 'rgba(94,200,255,0.32)',
    icon:        'cloud-check' as const,
    title:       '離線也能記，連網就同步',
    desc:        '收訊不好沒關係 — 資料先存手機，恢復連線自動備份到雲端。',
  },
]

export function OnboardingPage({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const cur = SLIDES[step]

  return (
    <div
      style={{
        maxWidth: 430, margin: '0 auto',
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        padding: '60px 24px 40px', background: T.bgWarm, fontFamily: T.font.sans,
      }}
    >
      {/* 跳過 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button
          onClick={onDone}
          style={{
            padding: '6px 14px', borderRadius: 999, border: 'none',
            background: 'transparent', color: T.muted,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans,
          }}
        >
          跳過
        </button>
      </div>

      {/* 視覺 Hero */}
      <div
        style={{
          height: 280, borderRadius: 32,
          background: cur.bg, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 20px 48px ${cur.shadowColor}`,
          marginBottom: 32, transition: 'background 320ms ease',
        }}
      >
        <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'absolute', left: -30, bottom: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
        <div
          style={{
            width: 96, height: 96, borderRadius: 28,
            background: 'rgba(255,255,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        >
          <Icon name={cur.icon} size={48} color="#fff" stroke={2} />
        </div>
      </div>

      {/* 文案 */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: -0.6, lineHeight: 1.2, marginBottom: 12 }}>
          {cur.title}
        </div>
        <div style={{ fontSize: 15, color: T.ink2, lineHeight: 1.6, fontWeight: 500 }}>
          {cur.desc}
        </div>
      </div>

      {/* 分頁點 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i === step ? T.ink : T.hairline,
              transition: 'all 200ms ease',
            }}
          />
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => step === SLIDES.length - 1 ? onDone() : setStep(step + 1)}
        style={{
          padding: 18, borderRadius: T.r.md, border: 'none',
          background: T.ink, color: '#fff',
          fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: T.font.sans,
          boxShadow: '0 8px 24px rgba(26,27,37,0.24)',
        }}
      >
        {step === SLIDES.length - 1 ? '開始記帳' : '下一步'}
      </button>
    </div>
  )
}
