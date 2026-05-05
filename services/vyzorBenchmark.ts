// File: services/vyzorBenchmark.ts
// Role: lit la vue Supabase v_vyzor_global_stats_360_full côté serveur (RLS off, anon read).
// Cache via Next.js fetch cache (revalidate horaire).
import type { VyzorBenchmarkRow } from "@/types/benchmark";

const VYZOR_VIEW_NAME = "v_vyzor_global_stats_360_full";
const REVALIDATE_SECONDS = 3600;

export type FetchVyzorBenchmarkResult =
  | { ok: true; row: VyzorBenchmarkRow }
  | { ok: false; reason: "missing_env" | "http_error" | "empty_view" | "parse_error"; detail?: string };

function readSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

export async function fetchVyzorBenchmark(): Promise<FetchVyzorBenchmarkResult> {
  const env = readSupabaseEnv();
  if (!env) {
    return { ok: false, reason: "missing_env" };
  }

  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/${VYZOR_VIEW_NAME}?select=*&limit=1`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        Accept: "application/json"
      },
      next: { revalidate: REVALIDATE_SECONDS }
    });
  } catch (error) {
    return {
      ok: false,
      reason: "http_error",
      detail: error instanceof Error ? error.message : "fetch failed"
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "http_error",
      detail: `HTTP ${response.status} ${response.statusText}`
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      ok: false,
      reason: "parse_error",
      detail: error instanceof Error ? error.message : "invalid JSON"
    };
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    return { ok: false, reason: "empty_view" };
  }

  const first = payload[0];
  if (!first || typeof first !== "object") {
    return { ok: false, reason: "parse_error", detail: "first row is not an object" };
  }

  return { ok: true, row: first as VyzorBenchmarkRow };
}
