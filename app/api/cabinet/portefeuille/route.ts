// GET /api/cabinet/portefeuille
// Liste les dossiers (Companies) du cabinet de l'user authentifié avec
// leurs KPIs synthétiques pour affichage dans la vue Portefeuille.
//
// Réservé aux users avec accountType === "firm_member".
//
// Approche firm-driven (refacto cabinet-ux) : on liste toutes les Companies
// dont `firmId === user.firmId`, peu importe leur source. Pour chacune, on
// cherche optionnellement un mapping connection_companies pour enrichir
// avec lastSyncAt / lastSyncStatus / externalCompanyId. Les Companies
// ajoutées manuellement (FEC / Excel / PDF) sans Connection apparaissent
// désormais avec un statut "never" et pas d'externalCompanyId.
//
// L'ancien comportement (mapping-driven) ratait les Companies sans
// mapping — c'est ce bug qui faisait disparaître les ajouts manuels du
// portefeuille.

import { NextResponse, type NextRequest } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { getFirm } from "@/services/companies/firmStore";

export const runtime = "nodejs";

type DossierDto = {
  companyId: string;
  name: string;
  externalCompanyId: string | null;
  externalCompanyName: string | null;
  connectionId: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: "success" | "failed" | "in_progress" | "partial" | "never" | "unknown";
  source: string | null;
  kpis: {
    ca: number | null;
    tresorerieNette: number | null;
    vyzorScore: number | null;
    ebitda: number | null;
    resultatNet: number | null;
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

  // 1. Vérifie firm_member + récupère firmId.
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

  // 2. Liste toutes les Companies actives du cabinet (firm-driven).
  const companiesSnap = await db
    .collection("companies")
    .where("firmId", "==", firmId)
    .where("status", "==", "active")
    .get();
  const companies: Array<Record<string, unknown> & { id: string }> = companiesSnap.docs.map(
    (d) => ({ ...(d.data() as Record<string, unknown>), id: d.id })
  );

  // 3. Pour chaque Company, on enrichit avec mapping (sync) + analyse (KPIs).
  const dossiers: DossierDto[] = [];
  for (const company of companies) {
    const companyId = company.id;
    const name = String(company.name ?? "Sans nom");
    const source = typeof company.source === "string" ? company.source : null;

    // Mapping optionnel (les ajouts manuels n'en ont pas).
    let connectionId: string | null = null;
    let externalCompanyId: string | null = null;
    let externalCompanyName: string | null = null;
    let lastSyncedAt: string | null = null;
    let lastSyncStatus: DossierDto["lastSyncStatus"] = "never";
    try {
      const mappingSnap = await db
        .collection("connection_companies")
        .where("companyId", "==", companyId)
        .where("isActive", "==", true)
        .limit(1)
        .get();
      if (!mappingSnap.empty) {
        const mapping = mappingSnap.docs[0]!.data();
        connectionId = (mapping.connectionId as string | null) ?? null;
        externalCompanyId = (mapping.externalCompanyId as string | null) ?? null;
        externalCompanyName = (mapping.externalCompanyName as string | null) ?? null;
        if (connectionId) {
          const connSnap = await db.collection("connections").doc(connectionId).get();
          if (connSnap.exists) {
            const cd = connSnap.data() ?? {};
            lastSyncedAt = (cd.lastSyncAt as string | null) ?? null;
            const status = cd.lastSyncStatus as string | undefined;
            if (
              status === "success" ||
              status === "failed" ||
              status === "in_progress" ||
              status === "partial" ||
              status === "never"
            ) {
              lastSyncStatus = status;
            }
          }
        }
      }
    } catch {
      /* swallow — read best effort */
    }

    // Dernière analyse pour les KPIs synthétiques (CA, tn, ebitda, score).
    let ca: number | null = null;
    let tresorerieNette: number | null = null;
    let vyzorScore: number | null = null;
    let ebitda: number | null = null;
    let resultatNet: number | null = null;
    try {
      const analysesSnap = await db
        .collection("analyses")
        .where("companyId", "==", companyId)
        .where("userId", "==", userId)
        .get();
      const analyses = analysesSnap.docs
        .map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }))
        .sort((a, b) => {
          const av = String((a as Record<string, unknown>).createdAt ?? "");
          const bv = String((b as Record<string, unknown>).createdAt ?? "");
          return bv.localeCompare(av);
        });
      if (analyses.length > 0) {
        const latest = analyses[0]! as Record<string, unknown>;
        const kpis = latest.kpis as Record<string, number | null> | undefined;
        const mapped = latest.mappedData as Record<string, number | null> | undefined;
        if (kpis) {
          if (typeof kpis.ca === "number") ca = kpis.ca;
          if (typeof kpis.tn === "number") tresorerieNette = kpis.tn;
          if (typeof kpis.ebitda === "number") ebitda = kpis.ebitda;
          if (typeof kpis.resultat_net === "number") resultatNet = kpis.resultat_net;
          if (resultatNet === null && typeof kpis.resultatNet === "number") {
            resultatNet = kpis.resultatNet;
          }
        }
        if (ca === null && mapped && typeof mapped.total_prod_expl === "number") {
          ca = mapped.total_prod_expl;
        }
        // Fallback résultat net via mappedData.resultat_exercice si pas de kpi.
        if (resultatNet === null && mapped && typeof mapped.resultat_exercice === "number") {
          resultatNet = mapped.resultat_exercice;
        }
        const score = latest.quantisScore as { vyzor_score?: number } | undefined;
        if (score && typeof score.vyzor_score === "number") {
          vyzorScore = score.vyzor_score;
        }
      }
    } catch {
      /* swallow */
    }

    dossiers.push({
      companyId,
      name,
      externalCompanyId,
      externalCompanyName,
      connectionId,
      lastSyncedAt,
      lastSyncStatus,
      source,
      kpis: { ca, tresorerieNette, vyzorScore, ebitda, resultatNet },
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
