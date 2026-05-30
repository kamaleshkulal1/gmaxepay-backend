/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
      gilroy: ['Gilroy', 'sans-serif'],
    },
      colors: {
        darkBlue: '#662d91',
        pink: '#AE87CD',
      },
      animation:{
        'infinite-scroll':'infinite-scroll 25s linear infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
      keyframes:{
        'infinite-scroll':{
          '0%':{transform:'translateX(0)'},
          '100%':{transform:'translateX(-100%)'},
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        }
      },
      screens: {
        xxs:'320px',
        xs: '480px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        xxl: '1400px',
        xxlg: '1600px',
      },
    },
  },
  plugins: [],
};
