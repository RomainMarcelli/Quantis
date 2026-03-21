// middleware.ts
// Applique des en-têtes de sécurité HTTP globaux sur l'application (frontend + API).
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * CSP "v1 pragmatique":
 * - verrouille les sources par défaut sur self
 * - garde `unsafe-inline`/`unsafe-eval` pour compatibilité MVP
 * - ouvre explicitement Firebase/Google API + Vercel feedback en preview/prod
 */
function buildContentSecurityPolicy(): string {
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://apis.google.com",
    "https://www.gstatic.com",
    "https://vercel.live"
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    `script-src-elem ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https:",
    "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://vercel.live wss://*.firebaseio.com",
    "frame-src 'none'"
  ].join("; ");
}

export function middleware(_request: NextRequest) {
  // On réutilise la réponse Next standard, puis on enrichit les headers.
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );

  // HSTS uniquement en production pour éviter de polluer le dev local HTTP.
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}

export const config = {
  // On exclut les assets statiques de build pour réduire le coût middleware.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
