// lib/server/rateLimit.ts
// Implémente un rate limiting simple "fixed window" pour protéger les routes API sensibles.
import { NextRequest, NextResponse } from "next/server";
import { logHttpSecurityErrorFromRequest } from "@/lib/server/securityAudit";

type RateLimitWindowState = {
  count: number;
  resetAt: number;
};

type RateLimitCheckInput = {
  key: string;
  maxRequests: number;
  windowMs: number;
  nowMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RouteRateLimitConfig = {
  routeId: string;
  maxRequests: number;
  windowMs: number;
};

// Store mémoire local au process Node.js (MVP).
// Note: en serverless multi-instance, chaque instance garde son propre compteur.
const fixedWindowStore = new Map<string, RateLimitWindowState>();

export function enforceRouteRateLimit(
  request: NextRequest,
  config: RouteRateLimitConfig
): NextResponse | null {
  const clientIdentifier = getRequestClientIdentifier(request);
  const key = `${config.routeId}:${clientIdentifier}`;

  const result = checkFixedWindowRateLimit({
    key,
    maxRequests: config.maxRequests,
    windowMs: config.windowMs
  });

  if (!result.allowed) {
    // Journalise le dépassement pour suivi sécurité (abus, flood, brute-force).
    void logHttpSecurityErrorFromRequest(request, {
      eventType: "rate_limit_exceeded",
      statusCode: 429,
      userId: null,
      message: `Limite dépassée pour ${config.routeId}.`,
      metadata: {
        routeId: config.routeId,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        clientIdentifier
      }
    });
    return buildRateLimitExceededResponse(result);
  }

  return null;
}

export function checkFixedWindowRateLimit(input: RateLimitCheckInput): RateLimitResult {
  const nowMs = input.nowMs ?? Date.now();
  const state = fixedWindowStore.get(input.key);

  // Première requête de la fenêtre.
  if (!state || state.resetAt <= nowMs) {
    const resetAt = nowMs + input.windowMs;
    fixedWindowStore.set(input.key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, input.maxRequests - 1),
      resetAt,
      retryAfterSeconds: Math.ceil(input.windowMs / 1000)
    };
  }

  // Fenêtre active: on incrémente puis on décide.
  state.count += 1;
  fixedWindowStore.set(input.key, state);

  const remaining = Math.max(0, input.maxRequests - state.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - nowMs) / 1000));
  const allowed = state.count <= input.maxRequests;

  return {
    allowed,
    remaining,
    resetAt: state.resetAt,
    retryAfterSeconds
  };
}

function buildRateLimitExceededResponse(result: RateLimitResult): NextResponse {
  // Message volontairement générique pour limiter les détails exploitables.
  return NextResponse.json(
    { error: "Trop de requêtes. Réessayez dans quelques instants." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000))
      }
    }
  );
}

function getRequestClientIdentifier(request: NextRequest): string {
  // `x-forwarded-for` est prioritaire en production derrière proxy (Vercel/NGINX).
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  // Fallback explicite pour garder un comportement déterministe.
  return "unknown-client";
}

export function resetRateLimitStoreForTests(): void {
  fixedWindowStore.clear();
}
