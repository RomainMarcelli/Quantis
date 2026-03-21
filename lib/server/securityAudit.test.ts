// lib/server/securityAudit.test.ts
// Couvre les helpers purs du journal d'audit sécurité (IP et sanitation metadata).
import { describe, expect, it } from "vitest";
import {
  extractClientIpFromHeaders,
  isValidCronAuthorization,
  sanitizeSecurityMetadata
} from "@/lib/server/securityAudit";

describe("extractClientIpFromHeaders", () => {
  it("retourne la première IP de x-forwarded-for", () => {
    const ip = extractClientIpFromHeaders({
      forwardedFor: "203.0.113.10, 10.0.0.1",
      realIp: "198.51.100.99"
    });

    expect(ip).toBe("203.0.113.10");
  });

  it("utilise x-real-ip si x-forwarded-for est absent", () => {
    const ip = extractClientIpFromHeaders({
      realIp: "198.51.100.99"
    });

    expect(ip).toBe("198.51.100.99");
  });

  it("retourne null si aucune IP n'est disponible", () => {
    const ip = extractClientIpFromHeaders({});
    expect(ip).toBeNull();
  });
});

describe("sanitizeSecurityMetadata", () => {
  it("tronque les chaînes et préserve les types primitifs", () => {
    const sanitized = sanitizeSecurityMetadata({
      message: "x".repeat(240),
      attempts: 3,
      isBlocked: true
    }) as Record<string, unknown>;

    expect((sanitized.message as string).length).toBe(200);
    expect(sanitized.attempts).toBe(3);
    expect(sanitized.isBlocked).toBe(true);
  });

  it("applique des garde-fous de profondeur et de taille", () => {
    const sanitized = sanitizeSecurityMetadata({
      list: Array.from({ length: 30 }, (_, index) => index),
      nested: {
        level1: {
          level2: {
            level3: {
              level4: "too-deep"
            }
          }
        }
      }
    }) as Record<string, unknown>;

    expect((sanitized.list as unknown[]).length).toBe(20);
    expect(sanitized.nested).toEqual({
      level1: {
        level2: {
          level3: "[depth-limit]"
        }
      }
    });
  });
});

describe("isValidCronAuthorization", () => {
  it("retourne true quand le bearer token correspond au secret", () => {
    const result = isValidCronAuthorization("Bearer super-secret", "super-secret");
    expect(result).toBe(true);
  });

  it("retourne false quand le header est absent ou invalide", () => {
    expect(isValidCronAuthorization(null, "super-secret")).toBe(false);
    expect(isValidCronAuthorization("Bearer wrong-secret", "super-secret")).toBe(false);
  });

  it("retourne false quand le secret serveur est non défini", () => {
    const result = isValidCronAuthorization("Bearer super-secret", undefined);
    expect(result).toBe(false);
  });
});
