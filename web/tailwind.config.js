/** @type {import('tailwindcss').Config} */
// Theme scales are REPLACED (not extended) so utilities can only speak the
// design system: every value is backed by a custom property from
// src/styles/tokens.css, which also carries the light/dark palettes —
// utilities theme automatically, no dark: variants needed.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      page: 'var(--color-page)',
      surface: 'var(--color-surface)',
      ink: 'var(--color-ink)',
      muted: 'var(--color-muted)',
      hairline: 'var(--color-border)',
      'hairline-strong': 'var(--color-border-strong)',
      accent: {
        DEFAULT: 'var(--color-accent)', // fills/active/focus only — not 12px text
        text: 'var(--color-accent-text)', // the AA terracotta for text/links
      },
      'on-accent': 'var(--color-on-accent)',
      info: { DEFAULT: 'var(--color-info)', surface: 'var(--color-info-surface)' },
      success: { DEFAULT: 'var(--color-success)', surface: 'var(--color-success-surface)' },
      warning: { DEFAULT: 'var(--color-warning)', surface: 'var(--color-warning-surface)' },
      critical: { DEFAULT: 'var(--color-critical)', surface: 'var(--color-critical-surface)' },
    },
    borderColor: (theme) => ({ ...theme('colors'), DEFAULT: 'var(--color-border)' }),
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'Helvetica Neue', 'Arial', 'sans-serif'],
      mono: ['IBM Plex Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
    },
    // 12px is home base; larger steps only for real hierarchy. UI sizes
    // carry the constant 0.3px tracking; scaled/reading sizes drop it.
    fontSize: {
      '2xs': ['var(--font-size-2xs)', { lineHeight: '16px', letterSpacing: 'var(--tracking)' }],
      base: ['var(--font-size-base)', { lineHeight: 'var(--leading-ui)', letterSpacing: 'var(--tracking)' }],
      sm: ['var(--font-size-sm)', { lineHeight: 'var(--leading-ui)', letterSpacing: 'var(--tracking)' }],
      md: ['var(--font-size-md)', { lineHeight: 'var(--leading-normal)', letterSpacing: 'var(--tracking-tight)' }],
      lg: ['var(--font-size-lg)', { lineHeight: 'var(--leading-normal)', letterSpacing: 'var(--tracking-tight)' }],
      xl: ['var(--font-size-xl)', { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' }],
      '2xl': ['var(--font-size-2xl)', { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' }],
      '3xl': ['var(--font-size-3xl)', { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' }],
    },
    fontWeight: { regular: '400', medium: '500', bold: '700' },
    lineHeight: {
      tight: 'var(--leading-tight)',
      ui: 'var(--leading-ui)',
      link: 'var(--leading-link)',
      body: 'var(--leading-body)',
      normal: 'var(--leading-normal)',
    },
    letterSpacing: { ui: 'var(--tracking)', none: 'var(--tracking-tight)' },
    // 5px rhythm: 5 · 10 · 15 · 20 · 30 · 45 · 60 · 90 · 120
    spacing: {
      0: '0',
      px: '1px',
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      5: 'var(--space-5)',
      6: 'var(--space-6)',
      7: 'var(--space-7)',
      8: 'var(--space-8)',
      9: 'var(--space-9)',
    },
    borderRadius: { none: '0' }, // square, always
    borderWidth: { DEFAULT: 'var(--border-width)', 0: '0', 2: 'var(--border-thick)' },
    boxShadow: { none: 'none' }, // hairline structure, no elevation
    extend: {
      height: { header: 'var(--header-height)' },
      maxWidth: { container: 'var(--container-max)' },
      zIndex: {
        sticky: '100',
        dropdown: '200',
        overlay: '300',
        modal: '400',
        toast: '500',
        tooltip: '600',
      },
      transitionDuration: { DEFAULT: '120ms', slow: '240ms' },
      outlineColor: { 'focus-ring': 'var(--focus-ring)' },
    },
  },
  plugins: [],
}
