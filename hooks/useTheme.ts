// File: hooks/useTheme.ts
// Role: hook custom pour accéder au thème applicatif global.
import { useThemeContext } from "@/components/ui/ThemeProvider";

export function useTheme() {
  return useThemeContext();
}

