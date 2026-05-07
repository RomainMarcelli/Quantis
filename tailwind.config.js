/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./services/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // ─── Couleurs Tailwind référencées par classes (text-quantis-*, bg-*) ──
        // Pointent vers les CSS variables sémantiques définies dans
        // app/globals.css. Cela permet aux classes existantes
        // (`text-quantis-gold`, `bg-quantis-base`) de basculer
        // automatiquement entre dark et light selon le `data-theme` posé
        // sur <html> par ThemeProvider — pas de refacto requis côté
        // composants pour ces classes.
        quantis: {
          // Backgrounds
          base: "var(--app-bg)",
          surface: "var(--app-bg-elevated)",
          paper: "var(--quantis-paper)",
          smoke: "var(--quantis-smoke)",
          white: "var(--quantis-white)",
          // Text
          carbon: "var(--quantis-carbon)",
          slate: "var(--quantis-slate)",
          muted: "var(--app-text-secondary)",
          // Borders
          border: "var(--app-border)",
          mist: "var(--quantis-mist)",
          // Brand — format RGB-space pour supporter les modificateurs
          // d'opacité Tailwind (text-quantis-gold/50, bg-quantis-gold/10).
          // L'app-brand-gold-rgb flip selon le theme (cf. globals.css).
          gold: "rgb(var(--app-brand-gold-rgb) / <alpha-value>)",
          emerald: "var(--app-success)",
          crimson: "var(--app-danger)"
        }
      }
    }
  },
  plugins: []
};
