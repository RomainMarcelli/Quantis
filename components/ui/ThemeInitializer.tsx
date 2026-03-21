// File: components/ui/ThemeInitializer.tsx
// Role: initialise le theme global au chargement et persiste le choix utilisateur dans localStorage.
"use client";

import { useEffect } from "react";

const THEME_STORAGE_KEY = "quantis.theme";

export function ThemeInitializer() {
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    // Regle produit de cette iteration: DA premium sombre par defaut sur toute l'application.
    // On respecte uniquement un choix utilisateur deja persiste en localStorage.
    const theme = stored === "dark" || stored === "light" ? stored : "dark";
    applyTheme(theme);
  }, []);

  return null;
}

export function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function getStoredTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}
