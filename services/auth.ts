import type { UserSession } from "@/types/auth";

const STORAGE_KEY = "quantis_session";

export const bypassLoginEnabled = process.env.NEXT_PUBLIC_BYPASS_LOGIN === "1";

export function canLoginWithSiren(siren: string): boolean {
  return siren.trim() === "1";
}

export function saveSession(session: UserSession): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getSession(): UserSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

