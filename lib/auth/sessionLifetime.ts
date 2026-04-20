// File: lib/auth/sessionLifetime.ts
// Role: helpers purs pour appliquer une durée de session maximale côté client.

export const AUTH_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type SessionLifetimeState = {
  expiresAt: number | null;
  remainingMs: number;
  isExpired: boolean;
};

export function parseSessionStartedAt(rawValue: string | null): number | null {
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function computeSessionLifetimeState(
  sessionStartedAt: number | null,
  now: number = Date.now(),
  maxAgeMs: number = AUTH_SESSION_MAX_AGE_MS
): SessionLifetimeState {
  if (sessionStartedAt === null) {
    return {
      expiresAt: null,
      remainingMs: maxAgeMs,
      isExpired: false
    };
  }

  const expiresAt = sessionStartedAt + maxAgeMs;
  const remainingMs = Math.max(0, expiresAt - now);

  return {
    expiresAt,
    remainingMs,
    isExpired: remainingMs <= 0
  };
}

