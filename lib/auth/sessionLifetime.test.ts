// File: lib/auth/sessionLifetime.test.ts
// Role: tests unitaires du contrôle de durée de session (24h max).

import { describe, expect, it } from "vitest";
import {
  AUTH_SESSION_MAX_AGE_MS,
  computeSessionLifetimeState,
  parseSessionStartedAt
} from "@/lib/auth/sessionLifetime";

describe("sessionLifetime", () => {
  it("parse correctement un timestamp valide", () => {
    expect(parseSessionStartedAt("1700000000000")).toBe(1700000000000);
  });

  it("retourne null pour une valeur absente ou invalide", () => {
    expect(parseSessionStartedAt(null)).toBeNull();
    expect(parseSessionStartedAt("")).toBeNull();
    expect(parseSessionStartedAt("abc")).toBeNull();
    expect(parseSessionStartedAt("-120")).toBeNull();
  });

  it("considère la session valide avant 24h", () => {
    const startedAt = 1_700_000_000_000;
    const now = startedAt + AUTH_SESSION_MAX_AGE_MS - 1;
    const state = computeSessionLifetimeState(startedAt, now, AUTH_SESSION_MAX_AGE_MS);

    expect(state.isExpired).toBe(false);
    expect(state.remainingMs).toBe(1);
    expect(state.expiresAt).toBe(startedAt + AUTH_SESSION_MAX_AGE_MS);
  });

  it("considère la session expirée à partir de 24h", () => {
    const startedAt = 1_700_000_000_000;
    const now = startedAt + AUTH_SESSION_MAX_AGE_MS;
    const state = computeSessionLifetimeState(startedAt, now, AUTH_SESSION_MAX_AGE_MS);

    expect(state.isExpired).toBe(true);
    expect(state.remainingMs).toBe(0);
  });

  it("retourne un état neutre si l'horodatage de session est absent", () => {
    const state = computeSessionLifetimeState(null, 1_700_000_000_000, AUTH_SESSION_MAX_AGE_MS);

    expect(state.isExpired).toBe(false);
    expect(state.expiresAt).toBeNull();
    expect(state.remainingMs).toBe(AUTH_SESSION_MAX_AGE_MS);
  });
});

