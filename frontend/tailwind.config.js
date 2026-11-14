/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        steam: {
          dark: '#0b0f15',
          base: '#111722',
          nav: '#17202d',
          card: '#1b2635',
          cardHover: '#233246',
          border: '#2a3a4f',
          blue: '#1a9fff',
          blueHover: '#1580cc',
          accent: '#66c0f4',
          cyan: '#00d8d8',
          green: '#5ba32b',
          greenHover: '#4e8c25',
          gold: '#e5a93c',
          red: '#d94b4b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'steam-glow': '0 0 15px rgba(26, 159, 255, 0.25)',
        'steam-card': '0 4px 20px rgba(0, 0, 0, 0.45)',
      },
    },
  },
  plugins: [],
};
