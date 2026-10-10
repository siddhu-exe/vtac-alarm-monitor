import type { Config } from 'tailwindcss';
import { WIDE_BREAKPOINT_PX } from './src/design/breakpoints';

const v = (name: string): string => `var(--${name})`;

/** name -> var(--prefix-name) */
function vars(prefix: string, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, v(`${prefix}-${n}`)]));
}

// Theme values are REPLACED (not extended) for colours, spacing, radii and type sizes, so a class
// outside the token set simply does not exist.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { wide: `${WIDE_BREAKPOINT_PX}px` },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ...vars('color', [
        'canvas',
        'surface',
        'surface-sunken',
        'surface-raised',
        'strip',
        'window-fill',
        'row-selected',
        'segment-off',
        'segment-on',
        'track',
        'line',
        'line-subtle',
        'line-strong',
        'window-edge',
        'legend-edge',
        'line-escalated',
        'line-suppressed',
        'fg',
        'fg-secondary',
        'fg-muted',
        'fg-strong',
        'fg-on-light',
        'trace-ecg',
        'trace-pleth',
        'trace-abp',
        'escalated',
        'suppressed',
        'gradcam',
        'onset',
        'ok',
        'warn',
        'absent',
        'focus',
        'link',
        'link-hover',
      ]),
    },
    spacing: {
      0: '0px',
      ...Object.fromEntries(
        ['px', '0-5', '1', '1-5', '2', '2-5', '3', '3-5', '4', '4-5', '5', '6', '8'].map((n) => [
          n.replace('-', '.'),
          v(`space-${n}`),
        ]),
      ),
      ...vars('size', [
        'dot',
        'dot-lg',
        'swatch-w',
        'swatch-h',
        'bar',
        'bar-lg',
        'bar-track',
        'icon-sm',
        'icon',
        'logo',
        'control',
        'control-sm',
        'control-min',
        'speed-min',
        'play-min',
        'row-min',
        'attr-name',
        'attr-pct',
        'card-label',
      ]),
      ...Object.fromEntries(
        ['strip-h', 'time-axis-h', 'label-w', 'readout-w', 'onset-w', 'line-w'].map((n) => [
          n.replace(/-[hw]$/, ''),
          v(`layout-${n}`),
        ]),
      ),
    },
    borderRadius: {
      none: '0px',
      full: '9999px',
      ...vars('radius', ['hair', 'track', 'chip', 'bar', 'button', 'panel']),
    },
    borderWidth: { DEFAULT: v('layout-line-w'), 0: '0px' },
    fontFamily: { sans: [v('font-sans')], mono: [v('font-mono')] },
    fontSize: Object.fromEntries(
      [
        'micro',
        'caption',
        'body-sm',
        'body',
        'title-sm',
        'title',
        'heading',
        'stat',
        'display',
      ].map((n) => [n, v(`font-size-${n}`)]),
    ),
    lineHeight: vars('leading', ['none', 'tight', 'normal']),
    letterSpacing: { normal: '0', ...vars('tracking', ['title', 'chip', 'head', 'badge']) },
    extend: {
      maxWidth: { page: v('layout-page-max') },
      minWidth: { feed: v('layout-feed-min') },
      flexGrow: { main: '999' },
      flexBasis: { main: v('layout-main-basis'), sidebar: v('layout-sidebar-basis') },
      gridTemplateColumns: {
        feed: v('layout-feed-cols'),
        attr: v('layout-attr-cols'),
        card: 'var(--size-card-label) minmax(0, 1fr)',
      },
      boxShadow: { 'row-selected': 'inset var(--layout-mark-w) 0 0 var(--color-fg)' },
      outlineWidth: { focus: v('layout-focus-w') },
      keyframes: { vtpulse: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.25' } } },
      animation: { live: 'vtpulse 1.4s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
