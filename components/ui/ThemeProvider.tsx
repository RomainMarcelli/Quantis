// File: components/ui/ThemeProvider.tsx
// Role: provider global de theme (dark/light) avec persistance locale et API React context.
"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { firebaseAuthGateway } from "@/services/auth";
import { getUserProfile, saveUserThemePreference } from "@/services/userProfileStore";
import type { UserThemePreference } from "@/types/profile";

export type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "quantis.theme";
const DEFAULT_THEME: AppTheme = "dark";

type ThemeContextValue = {
  theme: AppTheme;
  isDark: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(DEFAULT_THEME);
  const themeRef = useRef<AppTheme>("dark");
  const currentUserIdRef = useRef<string | null>(null);
  const isProfileThemeLoadedRef = useRef(false);
  const isSyncInProgressRef = useRef(false);
  const lastSyncedThemeRef = useRef<AppTheme | null>(null);

  useLayoutEffect(() => {
    const storedTheme = readStoredTheme();
    applyTheme(storedTheme);
    setThemeState(storedTheme);
    themeRef.current = storedTheme;
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    applyTheme(nextTheme);
    setThemeState(nextTheme);
    themeRef.current = nextTheme;
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === "dark",
      setTheme,
      toggleTheme
    }),
    [setTheme, theme, toggleTheme]
  );

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((user) => {
      currentUserIdRef.current = user?.uid ?? null;
      isProfileThemeLoadedRef.current = false;
      lastSyncedThemeRef.current = null;

      if (!user) {
        return;
      }

      void syncThemeFromUserProfile(user.uid);
    });

    return unsubscribe;
    // syncThemeFromUserProfile uses refs and stable setters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const userId = currentUserIdRef.current;
    if (!userId) {
      return;
    }

    if (!isProfileThemeLoadedRef.current) {
      return;
    }

    if (lastSyncedThemeRef.current === theme) {
      return;
    }

    void persistThemePreference(userId, theme);
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;

  async function syncThemeFromUserProfile(userId: string): Promise<void> {
    try {
      const profile = await getUserProfile(userId);
      if (currentUserIdRef.current !== userId) {
        return;
      }
      const remoteTheme = profile?.themePreference;

      if (remoteTheme === "dark" || remoteTheme === "light") {
        applyTheme(remoteTheme);
        setThemeState(remoteTheme);
        themeRef.current = remoteTheme;
        lastSyncedThemeRef.current = remoteTheme;
      } else {
        await persistThemePreference(userId, themeRef.current);
      }
    } catch {
      // Non-bloquant: le mode local reste prioritaire si Firestore n'est pas joignable.
    } finally {
      isProfileThemeLoadedRef.current = true;
    }
  }

  async function persistThemePreference(userId: string, nextTheme: AppTheme): Promise<void> {
    if (currentUserIdRef.current !== userId) {
      return;
    }

    if (isSyncInProgressRef.current) {
      return;
    }

    isSyncInProgressRef.current = true;
    try {
      await saveUserThemePreference(userId, nextTheme as UserThemePreference);
      lastSyncedThemeRef.current = nextTheme;
    } catch {
      // Non-bloquant: on garde la preference locale meme en cas d'erreur reseau.
    } finally {
      isSyncInProgressRef.current = false;
    }
  }
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme doit être utilisé dans <ThemeProvider />.");
  }
  return context;
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.remove("dark", "light");
  root.classList.add(theme);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "light" ? "light" : DEFAULT_THEME;
}
