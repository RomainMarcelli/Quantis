// GET /api/cabinet/portefeuille
// Liste les dossiers (Companies) du cabinet de l'user authentifié avec
// leurs KPIs synthétiques pour affichage dans la vue Portefeuille.
//
// Sprint C Tâche 5. Réservé aux users avec accountType === "firm_member".

import { NextResponse, type NextRequest } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { listFirmsForUser, getFirm } from "@/services/companies/firmStore";
import { listActiveMappingsForUser } from "@/services/companies/connectionCompanyStore";
import { getCompany } from "@/services/companies/companyStore";

export const runtime = "nodejs";

type DossierDto = {
  companyId: string;
  name: string;
  externalCompanyId: string | null;
  externalCompanyName: string | null;
  connectionId: string;
  lastSyncedAt: string | null;
  lastSyncStatus: "success" | "failed" | "in_progress" | "partial" | "never" | "unknown";
  kpis: {
    ca: number | null;
    tresorerieNette: number | null;
    vyzorScore: number | null;
  };
};

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const db = getFirebaseAdminFirestore();

  // 1. Vérifie que le user est firm_member et récupère son firmId.
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() ?? {} : {};
  const accountType = (userData.accountType as string | undefined) ?? "company_owner";
  if (accountType !== "firm_member") {
    return NextResponse.json(
      { error: "Accès réservé aux comptes cabinet (firm_member)." },
      { status: 403 }
    );
  }

  const firmId = userData.firmId as string | undefined;
  if (!firmId) {
    return NextResponse.json(
      { error: "Aucun cabinet rattaché à votre compte." },
      { status: 404 }
    );
  }

  // Vérifie l'appartenance à la Firm (sécurité défensive).
  const firm = await getFirm(firmId);
  if (!firm) {
    return NextResponse.json({ error: "Cabinet introuvable." }, { status: 404 });
  }
  if (!firm.memberUserIds.includes(userId)) {
    return NextResponse.json(
      { error: "Vous n'êtes pas membre de ce cabinet." },
      { status: 403 }
    );
  }

  // 2. Liste les mappings actifs du user (Sprint C : 1 firm → N mappings via Connections owned by firm_members).
  const mappings = await listActiveMappingsForUser(userId);

  // 3. Pour chaque mapping, charge la Company + dernière analyse pour les KPIs synthétiques.
  const dossiers: DossierDto[] = [];
  for (const mapping of mappings) {
    const company = await getCompany(mapping.companyId);
    if (!company || company.status !== "active") continue;

    // Charge la connection pour récupérer lastSyncAt / lastSyncStatus.
    let lastSyncedAt: string | null = null;
    let lastSyncStatus: DossierDto["lastSyncStatus"] = "unknown";
    try {
      const connSnap = await db.collection("connections").doc(mapping.connectionId).get();
      if (connSnap.exists) {
        const cd = connSnap.data() ?? {};
        lastSyncedAt = (cd.lastSyncAt as string | null) ?? null;
        const status = cd.lastSyncStatus as string | undefined;
        if (status === "success" || status === "failed" || status === "in_progress" || status === "partial" || status === "never") {
          lastSyncStatus = status;
        }
      }
    } catch {
      /* swallow — lecture best effort */
    }

    // Charge l'analyse la plus récente de cette Company (KPIs synthétiques).
    let ca: number | null = null;
    let tresorerieNette: number | null = null;
    let vyzorScore: number | null = null;
    try {
      const analysesSnap = await db
        .collection("analyses")
        .where("companyId", "==", company.id)
        .where("userId", "==", userId)
        .get();
      // Tri local par createdAt desc — on évite un index composite pour Sprint C.
      const analyses = analysesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as Record<string, unknown>))
        .sort((a, b) => {
          const av = String(a.createdAt ?? "");
          const bv = String(b.createdAt ?? "");
          return bv.localeCompare(av);
        });
      if (analyses.length > 0) {
        const latest = analyses[0]!;
        const kpis = latest.kpis as Record<string, number | null> | undefined;
        const mapped = latest.mappedData as Record<string, number | null> | undefined;
        if (kpis) {
          if (typeof kpis.ca === "number") ca = kpis.ca;
          if (typeof kpis.tn === "number") tresorerieNette = kpis.tn;
        }
        // Fallback CA via mappedData.total_prod_expl si pas de kpi.ca.
        if (ca === null && mapped && typeof mapped.total_prod_expl === "number") {
          ca = mapped.total_prod_expl;
        }
        const score = latest.quantisScore as { vyzor_score?: number } | undefined;
        if (score && typeof score.vyzor_score === "number") {
          vyzorScore = score.vyzor_score;
        }
      }
    } catch {
      /* swallow — lecture best effort */
    }

    dossiers.push({
      companyId: company.id,
      name: company.name,
      externalCompanyId: mapping.externalCompanyId || null,
      externalCompanyName: mapping.externalCompanyName ?? null,
      connectionId: mapping.connectionId,
      lastSyncedAt,
      lastSyncStatus,
      kpis: { ca, tresorerieNette, vyzorScore },
    });
  }

  return NextResponse.json(
    {
      firm: { firmId: firm.firmId, name: firm.name },
      dossiers,
      total: dossiers.length,
    },
    { status: 200 }
  );
}
