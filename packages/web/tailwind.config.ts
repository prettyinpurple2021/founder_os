import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Foundation
        obsidian: '#050608',
        carbon: '#0B0D10',
        gunmetal: '#15191F',
        graphite: '#232933',
        // Chrome
        'chrome-white': '#F8FAFC',
        'chrome-silver': '#D7DCE3',
        'chrome-steel': '#929AA6',
        'dark-chrome': '#3B424C',
        // Energy
        'founder-pink': '#FF2BA6',
        'neon-magenta': '#FF4FC3',
        'launch-lime': '#B7FF2A',
        'electric-lime': '#D5FF65',
        // Supporting
        'hyper-cyan': '#42E8FF',
        'plasma-violet': '#9D63FF',
        'alert-red': '#FF4D5F',
        'warning-amber': '#FFB547',
        'victory-gold': '#FFD36A',
        // Text
        'text-primary': '#F7F9FC',
        'text-secondary': '#B7BEC9',
        'text-muted': '#7C8491',
        'text-disabled': '#555D68',
      },
      fontFamily: {
        interface: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['72px', { lineHeight: '1.1', fontWeight: '800' }],
        'display-l': ['56px', { lineHeight: '1.15', fontWeight: '800' }],
        'h1': ['42px', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['34px', { lineHeight: '1.25', fontWeight: '700' }],
        'h3': ['28px', { lineHeight: '1.3', fontWeight: '700' }],
        'h4': ['22px', { lineHeight: '1.35', fontWeight: '600' }],
        'body-l': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'small': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
        '24': '96px',
      },
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      maxWidth: {
        'content': '1440px',
        'comfortable': '1280px',
      },
      transitionDuration: {
        'instant': '80ms',
        'fast': '140ms',
        'standard': '220ms',
        'slow': '360ms',
        'cinematic': '700ms',
      },
      transitionTimingFunction: {
        'enter': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'exit': 'cubic-bezier(0.7, 0, 0.84, 0)',
        'snap': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        'ignition': 'cubic-bezier(0.1, 0.9, 0.2, 1)',
      },
      boxShadow: {
        'glow-pink': '0 0 20px rgba(255, 43, 166, 0.3)',
        'glow-lime': '0 0 20px rgba(183, 255, 42, 0.3)',
        'glow-cyan': '0 0 20px rgba(66, 232, 255, 0.3)',
        'chrome-edge': '0 1px 0 rgba(248, 250, 252, 0.08), inset 0 1px 0 rgba(248, 250, 252, 0.04)',
        'panel': '0 4px 24px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.3)',
      },
      keyframes: {
        'chrome-sweep': {
          '0%': { transform: 'translateX(-200%) rotate(18deg)' },
          '100%': { transform: 'translateX(400%) rotate(18deg)' },
        },
        'pulse-pink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'charge': {
          '0%': { width: '0%' },
          '100%': { width: 'var(--charge-target, 100%)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'chrome-sweep': 'chrome-sweep 700ms var(--fl-ease-enter) forwards',
        'pulse-pink': 'pulse-pink 1.5s ease-in-out infinite',
        'charge': 'charge 600ms var(--fl-ease-ignition) forwards',
        'fade-in': 'fade-in 220ms var(--fl-ease-enter) both',
      },
    },
  },
  plugins: [],
};

export default config;
