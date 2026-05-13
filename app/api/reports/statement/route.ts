// POST /api/reports/statement
// Génère un rapport PDF / Word d'un état financier seul (bilan OU compte
// de résultat) — cover + sommaire + l'état lui-même, sans synthèse ni
// analyse. Utilisé par la page /etats-financiers/{bilan|compte-de-resultat}.
//
// Le client peut pousser ses `effectiveMappedData` (post-recompute par la
// TemporalityBar) pour garantir que l'export reflète exactement la
// période/ l'année sélectionnée à l'écran.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import path from "node:path";

import {
  generateStatementReportPdf,
  suggestReportFilename,
  REPORT_MIME,
  type ReportFormat,
} from "@/services/reports/financialReportPdf";
import {
  buildStatementReportPayload,
  type StatementKind,
} from "@/services/reports/buildStatementReportPayload";
import { getUserProfile } from "@/services/userProfileStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { AnalysisRecord, MappedFinancialData } from "@/types/analysis";

export const runtime = "nodejs";

const ANALYSES_COLLECTION = "analyses";
const LOGO_PATH = path.join(process.cwd(), "public", "images", "LogoV3.png");

type RequestBody = {
  analysisId?: string;
  /** "bilan" → cover + toc + bilan actif + bilan passif.
   *  "cdr"   → cover + toc + compte de résultat. */
  kind?: StatementKind;
  format?: ReportFormat;
  /** Données mappées effectives (recomputées sur la période sélectionnée
   *  côté client). Override `analysis.mappedData` à la sérialisation. */
  effectiveMappedData?: MappedFinancialData | null;
};

export async function POST(request: NextRequest) {
  const rateLimited = enforceRouteRateLimit(request, {
    routeId: "api-reports-statement",
    maxRequests: 6,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const analysisId = body.analysisId?.trim();
  if (!analysisId) {
    return NextResponse.json({ error: "analysisId manquant." }, { status: 400 });
  }
  const kind: StatementKind = body.kind === "cdr" ? "cdr" : "bilan";
  const requestedFormat: ReportFormat = body.format === "docx" ? "docx" : "pdf";

  const analysis = await readAnalysis(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }
  if (analysis.userId !== userId) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  let companyName = "Vyzor";
  try {
    const profile = await getUserProfile(userId);
    if (profile?.companyName?.trim()) companyName = profile.companyName.trim();
  } catch {
    // best effort
  }

  // Si le client a fourni des mappedData effectives (post-recompute par
  // la TemporalityBar / sélecteur d'année), on les substitue à
  // `analysis.mappedData` à la sérialisation — garantit la parité écran ↔ export.
  const effectiveMappedData =
    body.effectiveMappedData && typeof body.effectiveMappedData === "object"
      ? body.effectiveMappedData
      : null;

  const payload = buildStatementReportPayload(analysis, {
    statementKind: kind,
    companyName,
    logoPath: LOGO_PATH,
    effectiveMappedData,
  });

  let result: { buffer: Buffer; format: ReportFormat };
  try {
    result = await generateStatementReportPdf(payload, requestedFormat);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la génération du rapport.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }

  // Nom de fichier : "rapport-bilan-2025-12.pdf" ou "rapport-cdr-2025-12.pdf"
  const baseName = suggestReportFilename(analysis, result.format).replace(
    "rapport-financier",
    kind === "bilan" ? "rapport-bilan" : "rapport-compte-de-resultat",
  );

  return new NextResponse(result.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": REPORT_MIME[result.format],
      "Content-Disposition": `attachment; filename="${baseName}"`,
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
    },
  });
}

// ─── Helpers Admin SDK ─────────────────────────────────────────────────────

async function readAnalysis(analysisId: string): Promise<AnalysisRecord | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(ANALYSES_COLLECTION).doc(analysisId).get();
  if (!snap.exists) return null;
  return hydrateAnalysis(snap.id, snap.data() as Record<string, unknown>);
}

function hydrateAnalysis(id: string, data: Record<string, unknown>): AnalysisRecord {
  const createdAtRaw = data.createdAt;
  let createdAt: string;
  if (createdAtRaw instanceof Timestamp) {
    createdAt = createdAtRaw.toDate().toISOString();
  } else if (typeof createdAtRaw === "string") {
    createdAt = createdAtRaw;
  } else {
    createdAt = new Date().toISOString();
  }
  return {
    ...(data as object),
    id,
    createdAt,
  } as AnalysisRecord;
}
