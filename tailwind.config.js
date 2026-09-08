/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm, calm neutrals + a single confident accent
        ink: {
          DEFAULT: '#1c1b22',
          soft: '#3a3942',
          muted: '#6b6a76',
          faint: '#9b9aa6',
        },
        paper: {
          DEFAULT: '#ffffff',
          soft: '#f7f6f4',
          sunk: '#efedea',
        },
        accent: {
          DEFAULT: '#4f46e5',
          soft: '#eef0ff',
          ink: '#3730a3',
        },
        // Semantic stakes — separate from the accent, used by the agent
        // surfaces to encode "what happens if you ignore this".
        stake: {
          crit: '#b3123c',
          'crit-soft': '#fdeaef',
          'crit-line': '#f4d3dc',
          high: '#a15c07',
          'high-soft': '#fdf3e3',
          'high-line': '#f0e0c4',
          calm: '#0d7268',
          'calm-soft': '#e3f3f1',
          'calm-line': '#cfe8e4',
        },
        // Soft, light blue for the user's own message bubbles — readable with
        // dark text (no white text needed).
        mine: {
          DEFAULT: '#edf0ff',
          ink: '#3730a3',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          'Segoe UI',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,27,34,0.04), 0 8px 24px rgba(28,27,34,0.06)',
        pop: '0 12px 40px rgba(28,27,34,0.16)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'pop-in': 'pop-in 0.14s ease-out',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
