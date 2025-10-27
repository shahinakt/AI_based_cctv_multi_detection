/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6', // Blue-500
        secondary: '#6B7280', // Gray-500
        accent: '#EF4444', // Red-500
        background: '#1F2937', // Gray-800
        surface: '#374151', // Gray-700
        text: '#F9FAFB', // Gray-50
        'text-secondary': '#D1D5DB', // Gray-300
      }
    },
  },
  plugins: [],
}