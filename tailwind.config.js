/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        'canvas-backdrop': 'var(--bg-canvas-backdrop)',
        subtle: 'var(--bg-subtle)',
        panel: 'var(--bg-panel)',
        active: 'var(--bg-active)',
        
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        
        'brand-blue': 'var(--brand-blue)',
        'brand-blue-hover': 'var(--brand-blue-hover)',
        'brand-blue-subtle': 'var(--brand-blue-subtle)',
        
        'status-success': 'var(--status-success)',
        'status-success-bg': 'var(--status-success-bg)',
        'status-success-border': 'var(--status-success-border)',
        
        'status-warning': 'var(--status-warning)',
        'status-warning-bg': 'var(--status-warning-bg)',
        'status-warning-border': 'var(--status-warning-border)',
        
        'status-danger': 'var(--status-danger)',
        'status-danger-bg': 'var(--status-danger-bg)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif'
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}
