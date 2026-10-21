/** Colours are CSS variables (see src/styles.css) so light and dark themes share one token set. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'), panel: v('panel'), sunk: v('sunk'),
        ink: v('ink'), muted: v('muted'), faint: v('faint'), line: v('line'),
        cobalt: v('cobalt'), cobaltsoft: v('cobalt-soft'),
        pass: v('pass'), passsoft: v('pass-soft'),
        fail: v('fail'), failsoft: v('fail-soft'),
        advisory: v('advisory'), advisorysoft: v('advisory-soft'),
        review: v('review'), reviewsoft: v('review-soft'),
        agent: v('agent'), customer: v('customer'),
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
};
