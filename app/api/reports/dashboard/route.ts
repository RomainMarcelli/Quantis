// POST /api/reports/dashboard
// Génère un rapport PDF mode "dashboard" — cover + sommaire + une section
// par tableau de bord sélectionné. L'utilisateur passe la liste des
// `dashboardIds` (ex. "creation-valeur", "investissement-bfr",
// "custom:abc123"…) ; on charge chaque layout depuis Firestore et on
// sérialise les widgets pour le rendu Python.

import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import path from "node:path";

import {
  generateDashboardReportPdf,
  suggestReportFilename,
  REPORT_MIME,
  type ReportFormat,
} from "@/services/reports/financialReportPdf";
import {
  buildDashboardReportPayload,
  type DashboardReportInput,
} from "@/services/reports/buildDashboardReportPayload";
import { getUserProfile } from "@/services/userProfileStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { getDefaultDashboardLayout } from "@/lib/dashboard/defaultDashboardLayouts";
import type { AnalysisRecord } from "@/types/analysis";
import type { DashboardLayout, WidgetInstance } from "@/types/dashboard";

export const runtime = "nodejs";

const ANALYSES_COLLECTION = "analyses";
const LOGO_PATH = path.join(process.cwd(), "public", "images", "LogoV3.png");

/** Mapping fixe layoutId → label affiché dans le sommaire pour les onglets
 *  de l'analyse. Les dashboards custom (`custom:<uuid>`) tirent leur nom
 *  de la collection user/<uid>/dashboards directement. */
const FIXED_DASHBOARD_LABELS: Record<string, { title: string; description: string }> = {
  "creation-valeur": {
    title: "Création de valeur",
    description: "Indicateurs de richesse créée et marges opérationnelles",
  },
  "investissement-bfr": {
    title: "Investissement & BFR",
    description: "Cycle d'exploitation et besoin en fonds de roulement",
  },
  financement: {
    title: "Financement",
    description: "Structure financière et capacité de remboursement",
  },
  rentabilite: {
    title: "Rentabilité",
    description: "Performance des capitaux engagés (ROE, ROCE)",
  },
};

type RequestBody = {
  analysisId?: string;
  dashboardIds?: string[];
  format?: ReportFormat;
  effectiveKpis?: Record<string, number | null> | null;
};

export async function POST(request: NextRequest) {
  const rateLimited = enforceRouteRateLimit(request, {
    routeId: "api-reports-dashboard",
    maxRequests: 4,
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
  const dashboardIds = (body.dashboardIds ?? []).map((s) => s.trim()).filter(Boolean);
  const requestedFormat: ReportFormat = body.format === "docx" ? "docx" : "pdf";
  if (!analysisId) {
    return NextResponse.json({ error: "analysisId manquant." }, { status: 400 });
  }
  if (dashboardIds.length === 0) {
    return NextResponse.json({ error: "Aucun tableau de bord sélectionné." }, { status: 400 });
  }

  const analysis = await readAnalysis(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analyse introuvable." }, { status: 404 });
  }
  if (analysis.userId !== userId) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  // Parité écran ↔ rapport : si le client a poussé ses KPIs effectifs
  // (avec overrides Bridge / temporality slider), on les substitue à
  // `analysis.kpis` pour la sérialisation des widgets.
  if (body.effectiveKpis && typeof body.effectiveKpis === "object") {
    (analysis as unknown as { kpis: typeof body.effectiveKpis }).kpis = body.effectiveKpis;
  }

  // Profil utilisateur pour le nom de société.
  let companyName = "Vyzor";
  try {
    const profile = await getUserProfile(userId);
    if (profile?.companyName?.trim()) companyName = profile.companyName.trim();
  } catch {
    // best effort
  }

  // Charge chaque layout dans l'ordre demandé. Priorité :
  //   1. Firestore (l'utilisateur a customisé son layout)
  //   2. Layout par défaut (les 4 onglets fixes ont des défauts en code)
  //   3. Layout vide (custom dashboard jamais ouvert)
  // C'est CRITIQUE : sans le fallback (2), un utilisateur qui n'a jamais
  // customisé verrait son rapport vide, alors que l'écran montre les widgets
  // par défaut.
  const dashboards: DashboardReportInput["dashboards"] = [];
  for (const id of dashboardIds) {
    const stored = await readDashboardLayout(userId, id);
    const fallbackDefault = getDefaultDashboardLayout(id);
    const layout: DashboardLayout = stored ?? fallbackDefault ?? {
      id,
      widgets: [] as WidgetInstance[],
    };
    const meta = FIXED_DASHBOARD_LABELS[id];
    let title = meta?.title;
    let description = meta?.description;
    if (!title && id.startsWith("custom:")) {
      title = layout.name || "Tableau personnalisé";
    }
    if (!title) title = id;
    dashboards.push({ layout, title, description });
  }

  const payload = buildDashboardReportPayload(
    analysis,
    { dashboards },
    { companyName, logoPath: LOGO_PATH },
  );

  // Les sections sélectionnées sont toujours incluses (même vides) — un
  // tableau sans widget exploitable est simplement rendu avec son titre.
  // L'erreur 422 n'a plus de sens : le builder retourne toujours au moins
  // les sections demandées tant que `dashboardIds` est non vide.

  let result: { buffer: Buffer; format: ReportFormat };
  try {
    result = await generateDashboardReportPdf(payload, requestedFormat);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la génération du rapport.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }

  const filename = suggestReportFilename(analysis, result.format).replace(
    "rapport-financier",
    "rapport-tableau-de-bord",
  );
  return new NextResponse(result.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": REPORT_MIME[result.format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(result.buffer.length),
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

async function readDashboardLayout(userId: string, layoutId: string): Promise<DashboardLayout | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection("users").doc(userId).collection("dashboards").doc(layoutId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    id: layoutId,
    name: typeof data.name === "string" ? data.name : undefined,
    widgets: Array.isArray(data.widgets) ? (data.widgets as WidgetInstance[]) : [],
  };
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
