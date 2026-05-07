// POST /api/reports/financial
// Génère un rapport PDF financier 4 pages pour une analyse donnée et le renvoie
// en application/pdf. La génération est déléguée à un script Python (reportlab)
// invoqué par le service `generateFinancialReportPdf`.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  generateFinancialReportPdf,
  suggestReportFilename,
} from "@/services/reports/financialReportPdf";
import { getUserProfile } from "@/services/userProfileStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { findPreviousAnalysisByFiscalYear } from "@/services/analysisHistory";
import type { AnalysisRecord } from "@/types/analysis";

export const runtime = "nodejs";

const ANALYSES_COLLECTION = "analyses";

type ReportRequestBody = {
  analysisId?: string;
};

export async function POST(request: NextRequest) {
  // Rate limit : la génération PDF est coûteuse (subprocess Python) — 4/min.
  const rateLimited = enforceRouteRateLimit(request, {
    routeId: "api-reports-financial",
    maxRequests: 4,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  // Auth.
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Body.
  let body: ReportRequestBody;
  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  const analysisId = body.analysisId?.trim();
  if (!analysisId) {
    return NextResponse.json({ error: "analysisId manquant." }, { status: 400 });
  }

  // Lecture de l'analyse via Admin SDK (pas le client SDK : on a besoin de
  // bypasser les règles Firestore côté serveur).
  const analysis = await readAnalysis(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }
  if (analysis.userId !== userId) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  // Profil utilisateur pour le nom de société (fallback "Vyzor").
  let companyName = "Vyzor";
  try {
    const profile = await getUserProfile(userId);
    if (profile?.companyName?.trim()) {
      companyName = profile.companyName.trim();
    }
  } catch {
    // Best effort — on garde le fallback.
  }

  // Pour les variations N-1 dans les cartes KPI : on liste les analyses du même
  // utilisateur et on cherche celle de l'exercice précédent dans le même dossier.
  // Lecture Admin pour ne pas dépendre du client SDK côté serveur.
  let previousAnalysis: AnalysisRecord | null = null;
  try {
    const allAnalyses = await listUserAnalysesAdmin(userId);
    previousAnalysis = findPreviousAnalysisByFiscalYear({
      analyses: allAnalyses,
      currentAnalysis: analysis,
      preferSameFolder: true,
    });
  } catch {
    // Best effort — un rapport sans N-1 reste valide.
  }

  // Génération.
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateFinancialReportPdf(analysis, { companyName, previousAnalysis });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la génération du rapport PDF.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }

  const filename = suggestReportFilename(analysis);
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
      "Cache-Control": "no-store",
    },
  });
}

// ─── Helpers Admin SDK ──────────────────────────────────────────────────────

async function readAnalysis(analysisId: string): Promise<AnalysisRecord | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(ANALYSES_COLLECTION).doc(analysisId).get();
  if (!snap.exists) return null;
  return hydrateAnalysis(snap.id, snap.data() as Record<string, unknown>);
}

async function listUserAnalysesAdmin(userId: string): Promise<AnalysisRecord[]> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(ANALYSES_COLLECTION).where("userId", "==", userId).get();
  return snap.docs.map((doc) => hydrateAnalysis(doc.id, doc.data()));
}

/**
 * Hydrate un AnalysisRecord depuis Firestore — version simplifiée du
 * `toAnalysisRecord` côté client. On ne fait que les champs strictement
 * consommés par le générateur de rapport PDF.
 */
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

  // Pass-through tel quel pour les autres champs : le service PDF lit ce dont
  // il a besoin, le reste est ignoré.
  return {
    ...(data as object),
    id,
    createdAt,
  } as AnalysisRecord;
}
