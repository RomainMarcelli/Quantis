/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./services/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        quantis: {
          smoke: "#f4f5f7",
          paper: "#fafafa",
          white: "#ffffff",
          carbon: "#1a1a1a",
          slate: "#6b7280",
          mist: "#e5e7eb",
          base: "#09090b",
          surface: "#18181b",
          border: "#27272a",
          muted: "#8b8b93",
          gold: "#d4af37",
          emerald: "#0f766e",
          crimson: "#9f1239"
        }
      }
    }
  },
  plugins: []
};
