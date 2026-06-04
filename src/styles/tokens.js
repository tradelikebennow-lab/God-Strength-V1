// src/styles/tokens.js
// Design tokens — exported for use in inline styles when needed.
// Most consumers use the CSS variables defined in theme.css.

export const colors = {
  // Background depth scale (deepest to shallowest)
  bg0: '#070b14',       // page background, deepest
  bg1: '#0a0e1a',       // primary surface
  bg2: '#10162a',       // raised surface (cards)
  bg3: '#1a223a',       // elevated surface (hover)
  bg4: '#252f4d',       // border-emphasis surface

  // Primary blue (Linear-meets-Binance)
  primary: '#4d8eff',
  primaryHover: '#6fa3ff',
  primaryDim: '#2c5fb8',
  primaryGlow: 'rgba(77, 142, 255, 0.15)',

  // Accent — used for highlights and gradients
  accent: '#7aa3ff',
  accentDim: '#3b6fcc',

  // Semantic
  success: '#26d97a',
  successDim: '#15803d',
  successGlow: 'rgba(38, 217, 122, 0.12)',
  danger: '#f23645',
  dangerDim: '#a4202b',
  dangerGlow: 'rgba(242, 54, 69, 0.12)',
  warning: '#f0b90b',     // Binance yellow
  warningDim: '#a07a07',

  // Text (brightened for dark background contrast)
  fg: '#ffffff',
  fgMuted: '#c5cee0',
  fgDim: '#8a96b3',
  fgFaint: '#4a577a',

  // Borders
  border: '#1f2940',
  borderStrong: '#2e3a58',
};

export const space = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
  '4xl': '64px',
};

export const radius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  full: '9999px',
};

export const font = {
  ui: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  sizeXs: '11px',
  sizeSm: '12px',
  sizeMd: '13px',
  sizeBase: '14px',
  sizeLg: '16px',
  sizeXl: '20px',
  size2xl: '28px',
  size3xl: '36px',
  size4xl: '48px',
};

export const shadow = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  glow: '0 0 24px rgba(77, 142, 255, 0.2)',
};

export const motion = {
  fast: '120ms ease-out',
  base: '180ms ease-out',
  slow: '280ms ease-out',
};
