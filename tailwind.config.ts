import type { Config } from 'tailwindcss';

// Token evolution: kept shadcn slate spine from the source repo
// (222 47% dark / 210 40% light) and lifted the indigo scale as
// the signature interactive accent.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:          '#0B0F1A',
        'bg-2':      '#111726',
        surface:     'rgba(255,255,255,0.06)',
        'surface-2': 'rgba(255,255,255,0.10)',
        hairline:    'rgba(255,255,255,0.12)',
        'hairline-2':'rgba(255,255,255,0.20)',
        ink:         '#F8FAFC',
        'ink-2':     '#94A3B8',
        'ink-3':     '#64748B',
        accent:      '#6366F1',
        'accent-2':  '#818CF8',
        warn:        '#F59E0B',
        ok:          '#10B981',
        danger:      '#EF4444',
      },
      borderRadius: { xl2: '1.25rem' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        pulseRing: { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
      },
      animation: { pulseRing: 'pulseRing 2s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
