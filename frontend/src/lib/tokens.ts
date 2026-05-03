// 設計系統 token — Cash App / Toss 風格，柔和色塊
export const T = {
  // 背景與表面
  bg:       '#F4F5F9',
  bgWarm:   '#FAFAFB',
  card:     '#FFFFFF',
  ink:      '#1A1B25',
  ink2:     '#4A4D5C',
  muted:    '#8B8E9E',
  hairline: 'rgba(26, 27, 37, 0.06)',

  // 語意色彩
  mint:         '#10C77E',
  mintSoft:     '#D6F5E6',
  mintInk:      '#0A8F58',

  coral:        '#FF6B6B',
  coralSoft:    '#FFE0E0',
  coralInk:     '#D63E3E',

  peach:        '#FFB088',
  peachSoft:    '#FFE8DA',
  peachInk:     '#D97843',

  lavender:     '#9B8AFB',
  lavenderSoft: '#E8E4FF',
  lavenderInk:  '#6E5BD8',

  sky:          '#5EC8FF',
  skySoft:      '#D5EFFF',
  skyInk:       '#1F8FCC',

  sun:          '#FFD166',
  sunSoft:      '#FFF1CB',
  sunInk:       '#C4940F',

  // 外送平台
  uber:         '#7B5BD8',
  uberSoft:     '#E8E0F8',
  uberInk:      '#5B3DA8',
  panda:        '#FF5095',
  pandaSoft:    '#FFE6F0',
  pandaInk:     '#C9376E',

  // 圓角
  r: { sm: 12, md: 18, lg: 24, xl: 28, pill: 999 },

  // 陰影
  shadow: {
    card:   '0 1px 2px rgba(26,27,37,0.04), 0 8px 24px rgba(26,27,37,0.04)',
    raised: '0 2px 4px rgba(26,27,37,0.05), 0 16px 32px rgba(26,27,37,0.08)',
    pop:    '0 4px 12px rgba(26,27,37,0.06), 0 24px 48px rgba(26,27,37,0.12)',
  },

  font: {
    sans: '"Plus Jakarta Sans", "Noto Sans TC", -apple-system, system-ui, sans-serif',
    num:  '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
  },
} as const;

export type TokenColor = { bg: string; soft: string; ink: string };

// 收入來源色彩對應
export const incomeColors: Record<string, TokenColor> = {
  cash:  { bg: T.mint,   soft: T.mintSoft,   ink: T.mintInk   },
  card:  { bg: T.sky,    soft: T.skySoft,    ink: T.skyInk    },
  uber:  { bg: T.uber,   soft: T.uberSoft,   ink: T.uberInk   },
  panda: { bg: T.panda,  soft: T.pandaSoft,  ink: T.pandaInk  },
};

// 支出類別色彩對應
export const expenseColors: Record<string, TokenColor> = {
  food: { bg: T.peach,    soft: T.peachSoft,    ink: T.peachInk    },
  wage: { bg: T.lavender, soft: T.lavenderSoft, ink: T.lavenderInk },
  misc: { bg: T.coral,    soft: T.coralSoft,    ink: T.coralInk    },
};

// 外送平台手續費率
export const PLATFORM_FEES: Record<string, number> = {
  uber:  0.30,
  panda: 0.35,
};
