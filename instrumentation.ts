// Runs once before any Next.js server module loads.
// pdfjs-dist (used by pdf-parse v2) references DOMMatrix at import time —
// even for text-only extraction — which is absent from Node.js 18 (Vercel default).
// This shim prevents the ReferenceError without affecting pdf parsing behavior.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (typeof (globalThis as unknown as Record<string, unknown>).DOMMatrix === "undefined") {
      (globalThis as unknown as Record<string, unknown>).DOMMatrix = class DOMMatrix {
        constructor(_init?: string | number[]) {}
      };
    }
  }
}
