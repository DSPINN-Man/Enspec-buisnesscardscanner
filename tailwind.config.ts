import type { Config } from 'tailwindcss';

// Token system — light, warm, minimal. Cream parchment backdrop, white
// surfaces, purple accent. Replaces the previous dark glass theme.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:          '#EFEAE3',   // warm cream
        'bg-2':      '#E8E2D8',
        card:        '#FFFFFF',
        ink:         '#0F0F12',
        'ink-2':     '#6B6F76',
        'ink-3':     '#9AA0A6',
        hairline:    '#E5DFD5',
        'hairline-2':'#D7D0C2',
        accent:      '#7C3AED',   // purple-600
        'accent-2':  '#A78BFA',   // purple-400
        'accent-soft':'#EDE5FF',
        warn:        '#F59E0B',
        ok:          '#10B981',
        danger:      '#EF4444',
        // avatar tones (warm + cool mix to sit nicely on cream)
        'av-amber':  '#F4A261',
        'av-slate':  '#9AA0A6',
        'av-rose':   '#E07A8B',
        'av-teal':   '#52B6A4',
        'av-blue':   '#7AA1E1',
        'av-violet': '#B19CE0',
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      fontFamily: {
        sans:    ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['"Inter Tight"', '"Inter"', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,15,18,0.04), 0 12px 32px -16px rgba(15,15,18,0.10)',
        cta:  '0 8px 24px -8px rgba(124,58,237,0.45)',
      },
      keyframes: {
        pulseRing: { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
      },
      animation: { pulseRing: 'pulseRing 2s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
