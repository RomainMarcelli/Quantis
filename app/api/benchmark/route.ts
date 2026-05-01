// File: app/api/benchmark/route.ts
// Role: route GET qui sert la vue Vyzor (médianes marché P25/P50/P75) au client.
// L'anon key reste server-only ; le client n'appelle Supabase qu'au travers de cette route.
import { NextResponse } from "next/server";
import { fetchVyzorBenchmark } from "@/services/vyzorBenchmark";

export const revalidate = 3600;

export async function GET() {
  const result = await fetchVyzorBenchmark();

  if (!result.ok) {
    const status = result.reason === "missing_env" ? 503 : 502;
    return NextResponse.json(
      { error: result.reason, detail: result.detail ?? null },
      { status }
    );
  }

  return NextResponse.json(
    { row: result.row },
    {
      headers: {
        // Cache CDN partagé : les médianes marché sont publiques et changent peu.
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
      }
    }
  );
}
