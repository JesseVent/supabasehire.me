import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Custom Font', 'Circular', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['Source Code Pro', 'Office Code Pro', 'JetBrains Mono', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#3ECF8E',
          50: '#EDFDF5',
          100: '#D3FAE8',
          200: '#A7F3D1',
          300: '#6EE7B0',
          400: '#3ECF8E',
          500: '#20B274',
          600: '#16885A',
          700: '#0F6644',
          800: '#0A4D33',
          900: '#063323',
          950: '#031A12',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: '8px',   /* DS radius-lg */
        md: '6px',   /* DS radius-md (workhorse) */
        sm: '4px',   /* DS radius-sm */
        xs: '2px',   /* DS radius-xs */
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.18)',
        md: '0 2px 4px -1px rgba(0, 0, 0, 0.22), 0 4px 12px -2px rgba(0, 0, 0, 0.28)',
        lg: '0 8px 24px -4px rgba(0, 0, 0, 0.36), 0 2px 6px -2px rgba(0, 0, 0, 0.30)',
        overlay: '0 6px 20px -4px rgba(0, 0, 0, 0.45)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
export default config
