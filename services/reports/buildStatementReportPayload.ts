// File: services/reports/buildStatementReportPayload.ts
// Role: builder du payload mode "statement" — variante allégée du rapport
// synthèse qui contient uniquement cover + sommaire + l'état financier
// sélectionné (bilan actif+passif OU compte de résultat). Pas de synthèse
// Vyzor, pas d'analyse ratio. Utilisé par /api/reports/statement quand
// l'utilisateur exporte depuis la page États financiers.
//
// Réutilise les helpers privés du payload synthèse (buildBilanActif,
// buildBilanPassif, buildCompteResultat) pour garantir une parité 100 %
// avec les pages bilan/CDR du rapport complet.

import type { AnalysisRecord, MappedFinancialData } from "@/types/analysis";
import {
  buildBilanActif,
  buildBilanPassif,
  buildCompteResultat,
  type BilanRow,
  type CdrRow,
  type CompanyInfo,
} from "@/services/reports/buildSyntheseReportPayload";

export type StatementKind = "bilan" | "cdr";

export type StatementReportPayload = {
  mode: "statement";
  statementKind: StatementKind;
  companyName: string;
  reportDate: string;
  reportTitle: string;
  periodLabel: string;
  periodEndLabel: string;
  logoPath: string;
  source: { kind: "dynamic" | "static"; providerLabel: string };
  companyInfo: CompanyInfo;
  toc: Array<{ num: number; title: string; description: string; page: number }>;
  tocGroups: Array<{ title: string; description: string }>;
  // Le payload contient TOUJOURS bilanActif/bilanPassif ET compteResultat
  // pour réutiliser tels quels les builders Python (qui lisent ces clés).
  // Les pages non rendues sont simplement filtrées par `_build_statement_story`
  // selon `statementKind`.
  bilanActif: BilanRow[];
  bilanPassif: BilanRow[];
  compteResultat: CdrRow[];
};

export type StatementReportOptions = {
  statementKind: StatementKind;
  companyName: string;
  logoPath: string;
  reportDate?: string;
  companyInfo?: CompanyInfo;
  /** Données mappées effectives (recomputées sur la période sélectionnée
   *  côté client si Bridge / temporality slider). Override `analysis.mappedData`. */
  effectiveMappedData?: MappedFinancialData | null;
};

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PROVIDER_LABELS: Record<string, string> = {
  pennylane: "Pennylane (sync automatique)",
  myunisoft: "MyUnisoft (sync automatique)",
  odoo: "Odoo (sync automatique)",
  fec: "Import FEC",
  upload: "Upload PDF",
};

export function buildStatementReportPayload(
  analysis: AnalysisRecord,
  options: StatementReportOptions,
): StatementReportPayload {
  const m = options.effectiveMappedData ?? analysis.mappedData;
  const meta = analysis.sourceMetadata;

  const reportDate = options.reportDate ?? formatDateFr(new Date().toISOString());
  const reportTitle = options.statementKind === "bilan"
    ? "Bilan financier"
    : "Compte de résultat";

  let periodLabel = analysis.fiscalYear ? `Exercice ${analysis.fiscalYear}` : "—";
  let periodEndLabel = "";
  if (meta?.periodStart && meta?.periodEnd) {
    const start = new Date(meta.periodStart);
    const end = new Date(meta.periodEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
      periodLabel = `${fmt(start)} — ${fmt(end)}`;
      periodEndLabel = end.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  }

  const providerKey = meta?.provider ?? "upload";
  const providerLabel = PROVIDER_LABELS[providerKey] ?? "Source non identifiée";

  // Sommaire fixe : 2 entrées pour bilan (actif + passif), 1 pour CDR.
  const toc = options.statementKind === "bilan"
    ? [
        { num: 1, title: "Bilan — Actif", description: "Détail des emplois de l'entreprise", page: 3 },
        { num: 2, title: "Bilan — Passif", description: "Détail des ressources de l'entreprise", page: 4 },
      ]
    : [
        { num: 1, title: "Compte de résultat", description: "Formation du résultat sur la période", page: 3 },
      ];
  const tocGroups = [
    {
      title: options.statementKind === "bilan" ? "Bilan" : "Compte de résultat",
      description: options.statementKind === "bilan"
        ? "Pages 3 à 4 — Photographie patrimoniale à la clôture"
        : "Page 3 — Formation du résultat sur la période",
    },
  ];

  return {
    mode: "statement",
    statementKind: options.statementKind,
    companyName: options.companyName,
    reportDate,
    reportTitle,
    periodLabel,
    periodEndLabel,
    logoPath: options.logoPath,
    source: { kind: meta?.type === "dynamic" ? "dynamic" : "static", providerLabel },
    companyInfo: options.companyInfo ?? {},
    toc,
    tocGroups,
    bilanActif: buildBilanActif(m),
    bilanPassif: buildBilanPassif(m),
    compteResultat: buildCompteResultat(m),
  };
}
