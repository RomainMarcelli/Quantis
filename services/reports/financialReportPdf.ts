// File: services/reports/financialReportPdf.ts
// Role: génère un rapport PDF d'analyse financière (6 pages) à partir d'une
// AnalysisRecord. La mise en page est déléguée à un script Python utilisant
// reportlab — appelé en sous-processus, JSON sur stdin, PDF binaire sur stdout.
//
// Design aligné sur le rapport client-side `downloadSyntheseReport` (PDFLayout
// @react-pdf) : page de garde avec score circle + 4 piliers, page synthèse,
// page tendance optionnelle (si dailyAccounting), 4 pages KPI sectionnées.
// Les cartes KPI dont la valeur est null sont MASQUÉES (pas de N/D affiché).

import { spawn } from "node:child_process";
import path from "node:path";
import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type {
  BalanceSheetSnapshot,
  BalanceSheetVariableCode,
  DailyAccountingEntry,
  PnlVariableCode,
} from "@/types/connectors";
import { buildRecommendations } from "@/services/reports/recommendations";

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT_PATH = path.join(process.cwd(), "services", "reports", "python", "financial_report.py");
const LOGO_PATH = path.join(process.cwd(), "public", "images", "LogoV3.png");
const SUBPROCESS_TIMEOUT_MS = 30_000;

const PROVIDER_LABELS: Record<string, string> = {
  pennylane: "Pennylane (sync automatique)",
  myunisoft: "MyUnisoft (sync automatique)",
  odoo: "Odoo (sync automatique)",
  fec: "Import FEC",
  upload: "Upload PDF",
};

const PNL_CODES: readonly PnlVariableCode[] = [
  "ventes_march", "prod_biens", "prod_serv", "prod_vendue",
  "prod_stockee", "prod_immo", "subv_expl", "autres_prod_expl",
  "total_prod_expl",
  "achats_march", "var_stock_march", "achats_mp", "var_stock_mp", "ace",
  "impots_taxes", "salaires", "charges_soc", "dap", "dprov",
  "autres_charges_expl", "total_charges_expl",
  "ebit",
  "prod_fin", "charges_fin", "prod_excep", "charges_excep",
  "is_impot", "resultat_exercice",
];

// ─── Contrat JSON envoyé au script Python ──────────────────────────────────
type LabeledItem = { label: string; valueLabel: string | null; description: string };

type ReportPayload = {
  companyName: string;
  reportDate: string;       // "DD/MM/YYYY"
  periodLabel: string;      // ex. "Avr. 2025 → Avr. 2026" ou "Exercice 2026"
  logoPath: string;
  source: { kind: "dynamic" | "static"; providerLabel: string };
  // Cover.
  quantisScore: {
    score: number | null;
    piliers: Array<{ label: string; value: number | null; valueLabel: string | null }>;
  };
  // Synthèse.
  heroKpis: Array<{ label: string; valueLabel: string | null; description: string }>;
  summaryRows: Array<{ label: string; valueLabel: string | null }>;
  alerts: Array<{ label: string; severity: "high" | "medium" | "low" }>;
  recommendations: string[];
  // Optionnel — graphe tendance 6 mois (rendu seulement si dailyAccounting dispo).
  monthlyChart?: Array<{ month: string; ca: number; charges: number }>;
  // Sections KPI — les items avec valueLabel === null sont masqués côté Python.
  valueCreationItems: LabeledItem[];
  investmentItems: LabeledItem[];
  financingItems: LabeledItem[];
  profitabilityItems: LabeledItem[];
  strengths: string[];
  improvements: string[];
};

// ─── Aggregation helpers ───────────────────────────────────────────────────

function sumDailyOverPeriod(daily: DailyAccountingEntry[]): Record<PnlVariableCode, number> {
  const totals = {} as Record<PnlVariableCode, number>;
  for (const code of PNL_CODES) totals[code] = 0;
  for (const day of daily) {
    for (const code of PNL_CODES) {
      totals[code] += day.values[code] ?? 0;
    }
  }
  return totals;
}

function buildMonthlyChart(daily: DailyAccountingEntry[]): Array<{ month: string; ca: number; charges: number }> {
  if (!daily || daily.length === 0) return [];
  const byMonth = new Map<string, { ca: number; charges: number }>();
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    const slot = byMonth.get(month) ?? { ca: 0, charges: 0 };
    slot.ca += (day.values.ventes_march ?? 0) + (day.values.prod_vendue ?? 0);
    slot.charges += day.values.total_charges_expl ?? 0;
    byMonth.set(month, slot);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, vals]) => ({ month, ...vals }));
}

/**
 * Extrait les valeurs bilan dont le rapport a besoin (pas tout le bilan, juste
 * les soldes mis en avant dans la synthèse). Stratégie : `balanceSheetSnapshot`
 * en priorité, sinon `mappedData`.
 */
type ReportBalance = {
  total_actif: number | null;
  total_cp: number | null;
  total_dettes: number | null;
};

function pickBalance(analysis: AnalysisRecord): ReportBalance {
  const m = analysis.mappedData;
  const snap = analysis.balanceSheetSnapshot;
  const fromSnap = (k: BalanceSheetVariableCode): number | null => {
    if (!snap) return null;
    const v = snap.values[k];
    return typeof v === "number" ? v : null;
  };
  const get = (k: BalanceSheetVariableCode): number | null => {
    const sv = fromSnap(k);
    if (sv !== null) return sv;
    const mv = (m as Record<string, number | null>)[k];
    return typeof mv === "number" ? mv : null;
  };
  return {
    total_actif: get("total_actif"),
    total_cp: get("total_cp"),
    total_dettes: get("total_dettes"),
  };
}

// ─── Formatters (sans U+202F qui pose problème en PDF) ─────────────────────
function fmtMoney(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(Math.round(value));
  return `${sign}${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

function fmtPercent(value: number | null, decimals = 2): string | null {
  if (value === null || value === undefined) return null;
  return `${value.toFixed(decimals).replace(".", ",")} %`;
}

function fmtRatio(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  return `${value.toFixed(2).replace(".", ",")}x`;
}

function fmtDays(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  return `${Math.round(value)} jours`;
}

function fmtYears(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  return `${value.toFixed(1).replace(".", ",")} ans`;
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Rating helpers (alignés sur lib/synthese/pdfReportModel.ts) ───────────
type KpiRating = { label: string; score: number };

function rateKpis(kpis: CalculatedKpis): KpiRating[] {
  const out: KpiRating[] = [];
  const add = (label: string, value: number | null, good: number, ok: number, invert = false) => {
    if (value === null || value === undefined) return;
    const score = invert
      ? value <= good ? 90 : value <= ok ? 60 : 30
      : value >= good ? 90 : value >= ok ? 60 : 30;
    out.push({ label, score });
  };
  add("Marge EBITDA", kpis.marge_ebitda, 15, 5); // marge stockée en % (ex. 12.5)
  add("Solvabilité", kpis.solvabilite, 30, 15);
  add("Liquidité générale", kpis.liq_gen, 2, 1);
  add("ROE", kpis.roe, 15, 5);
  add("ROCE", kpis.roce, 12, 5);
  add("DSO", kpis.dso, 30, 60, true);
  add("DPO", kpis.dpo, 60, 30);
  add("Gearing", kpis.gearing, 0.5, 1, true);
  add("Capacité de remboursement", kpis.capacite_remboursement_annees, 2, 5, true);
  return out;
}

// ─── Périphériques d'agrégation des items KPI ──────────────────────────────

function buildHeroKpis(kpis: CalculatedKpis, dailyTotals: Record<PnlVariableCode, number> | null): ReportPayload["heroKpis"] {
  // Hero CA priorise le total agrégé du daily (cohérent avec le dashboard temporality).
  const ca = dailyTotals
    ? (dailyTotals.ventes_march + dailyTotals.prod_vendue)
    : kpis.ca;
  return [
    { label: "Chiffre d'affaires", valueLabel: fmtMoney(ca), description: "Volume total d'activité de la période." },
    { label: "EBE", valueLabel: fmtMoney(kpis.ebe), description: "Excédent brut d'exploitation." },
    { label: "Trésorerie disponible", valueLabel: fmtMoney(kpis.disponibilites), description: "Liquidités à un instant T." },
  ];
}

function buildSummaryRows(
  kpis: CalculatedKpis,
  balance: ReturnType<typeof pickBalance>,
  ca: number | null,
): ReportPayload["summaryRows"] {
  return [
    { label: "Chiffre d'affaires", valueLabel: fmtMoney(ca) },
    { label: "Total bilan", valueLabel: fmtMoney(balance.total_actif) },
    { label: "Résultat net", valueLabel: fmtMoney(kpis.resultat_net) },
    { label: "Capitaux propres", valueLabel: fmtMoney(balance.total_cp) },
    { label: "Dettes totales", valueLabel: fmtMoney(balance.total_dettes) },
  ];
}

function buildValueCreationItems(kpis: CalculatedKpis): LabeledItem[] {
  return [
    { label: "Valeur Ajoutée (VA)",       valueLabel: fmtMoney(kpis.va),       description: "La VA mesure la richesse créée par l'entreprise après déduction des consommations intermédiaires." },
    { label: "EBITDA",                    valueLabel: fmtMoney(kpis.ebitda),   description: "L'EBITDA mesure la performance opérationnelle pure, indépendamment de la structure financière." },
    { label: "Marge EBITDA",              valueLabel: fmtPercent(kpis.marge_ebitda), description: "Une marge supérieure à 10% est généralement considérée comme saine." },
    { label: "Taux de Marge sur Coûts Variables (TMSCV)", valueLabel: fmtPercent(kpis.tmscv ? kpis.tmscv * 100 : null), description: "Part du chiffre d'affaires restant après couverture des charges variables." },
    { label: "Point mort",                valueLabel: fmtMoney(kpis.point_mort), description: "Chiffre d'affaires minimum pour couvrir toutes les charges fixes." },
    { label: "Résultat net",              valueLabel: fmtMoney(kpis.resultat_net), description: "Bénéfice final après toutes charges, impôts et éléments exceptionnels." },
  ];
}

function buildInvestmentItems(kpis: CalculatedKpis): LabeledItem[] {
  return [
    { label: "BFR",                       valueLabel: fmtMoney(kpis.bfr),       description: "Un BFR négatif signifie que vos fournisseurs vous financent — situation favorable." },
    { label: "Ratio d'immobilisation",    valueLabel: fmtPercent(kpis.ratio_immo ? kpis.ratio_immo * 100 : null), description: "Part des actifs immobilisés dans le total de l'actif — mesure l'intensité capitalistique." },
    { label: "DSO (Rotation clients)",    valueLabel: fmtDays(kpis.dso),        description: "Nombre de jours moyen pour encaisser vos créances clients." },
    { label: "DPO (Rotation fournisseurs)", valueLabel: fmtDays(kpis.dpo),     description: "Nombre de jours moyen pour régler vos fournisseurs." },
    { label: "Rotation des stocks",       valueLabel: fmtDays(kpis.rot_stocks), description: "Durée moyenne de détention des stocks avant vente ou utilisation." },
    { label: "Rotation BFR",              valueLabel: fmtDays(kpis.rot_bfr),    description: "Nombre de jours de chiffre d'affaires immobilisés dans le cycle d'exploitation." },
  ];
}

function buildFinancingItems(kpis: CalculatedKpis): LabeledItem[] {
  return [
    { label: "CAF",                       valueLabel: fmtMoney(kpis.caf),       description: "Capacité de l'entreprise à générer des liquidités par son activité." },
    { label: "Solvabilité",               valueLabel: fmtPercent(kpis.solvabilite ? kpis.solvabilite * 100 : null), description: "Part des actifs financés par les capitaux propres — idéalement > 20 %." },
    { label: "Ratio d'endettement (Gearing)", valueLabel: fmtRatio(kpis.gearing), description: "Rapport entre la dette nette et les capitaux propres." },
    { label: "Trésorerie nette",          valueLabel: fmtMoney(kpis.tn),        description: "Différence entre les disponibilités et les dettes financières court terme." },
    { label: "Liquidité générale",        valueLabel: fmtRatio(kpis.liq_gen),   description: "Capacité à faire face aux dettes court terme — idéalement > 1." },
    { label: "Liquidité réduite",         valueLabel: fmtRatio(kpis.liq_red),   description: "Comme la liquidité générale mais hors stocks — test plus strict." },
    { label: "Liquidité immédiate",       valueLabel: fmtRatio(kpis.liq_imm),   description: "Capacité à couvrir les dettes court terme uniquement avec la trésorerie." },
    { label: "Capacité de remboursement", valueLabel: fmtYears(kpis.capacite_remboursement_annees), description: "Nombre d'années nécessaires pour rembourser la dette avec la CAF." },
  ];
}

function buildProfitabilityItems(kpis: CalculatedKpis): LabeledItem[] {
  const roe = kpis.roe ?? null;
  const roce = kpis.roce ?? null;
  const spread = roe !== null && roce !== null ? roe - roce : null;
  return [
    { label: "ROE",                       valueLabel: fmtPercent(roe ? roe * 100 : null), description: "Rentabilité des capitaux propres — mesure l'efficacité du financement actionnaire." },
    { label: "ROCE",                      valueLabel: fmtPercent(roce ? roce * 100 : null), description: "Rentabilité du capital employé — mesure l'efficacité de l'outil industriel." },
    { label: "Effet de levier",           valueLabel: fmtRatio(kpis.effet_levier), description: "Amplification de la rentabilité des capitaux propres par l'endettement." },
    { label: "Spread (ROE - ROCE)",       valueLabel: fmtPercent(spread ? spread * 100 : null), description: "Un spread positif indique que l'endettement crée de la valeur pour les actionnaires." },
  ];
}

// ─── Construction du payload complet ───────────────────────────────────────

export type BuildPayloadOptions = {
  companyName: string;
  previousAnalysis?: AnalysisRecord | null;
};

function buildReportPayload(analysis: AnalysisRecord, options: BuildPayloadOptions): ReportPayload {
  const meta = analysis.sourceMetadata;
  const isDynamic = meta?.type === "dynamic" && Array.isArray(analysis.dailyAccounting);
  const daily = (analysis.dailyAccounting ?? []) as DailyAccountingEntry[];
  const dailyTotals = isDynamic ? sumDailyOverPeriod(daily) : null;
  const k = analysis.kpis;
  const balance = pickBalance(analysis);
  const monthlyChart = isDynamic ? buildMonthlyChart(daily) : [];

  // CA effectif : on privilégie l'agrégation daily (cohérent avec le dashboard
  // temporality) ; sinon repli sur le KPI annuel stocké.
  const ca = dailyTotals ? dailyTotals.ventes_march + dailyTotals.prod_vendue : k.ca;

  const heroKpis = buildHeroKpis(k, dailyTotals);
  const summaryRows = buildSummaryRows(k, balance, ca);

  // Score + piliers (cover).
  const score = analysis.quantisScore?.quantis_score ?? null;
  const pil = analysis.quantisScore?.piliers ?? null;
  const piliers = [
    { label: "Rentabilité",  value: pil?.rentabilite ?? null, valueLabel: pil?.rentabilite != null ? `${Math.round(pil.rentabilite)} / 100` : null },
    { label: "Solvabilité",  value: pil?.solvabilite ?? null, valueLabel: pil?.solvabilite != null ? `${Math.round(pil.solvabilite)} / 100` : null },
    { label: "Liquidité",    value: pil?.liquidite ?? null,   valueLabel: pil?.liquidite != null ? `${Math.round(pil.liquidite)} / 100` : null },
    { label: "Efficacité",   value: pil?.efficacite ?? null,  valueLabel: pil?.efficacite != null ? `${Math.round(pil.efficacite)} / 100` : null },
  ];

  // Alerts vs recommandations : on classe par sévérité.
  const recos = buildRecommendations(analysis);
  const alerts = recos
    .filter((r) => r.severity === "risk")
    .map((r) => ({ label: `${r.title} — ${r.detail}`, severity: "high" as const }));
  const recommendationsList = recos
    .filter((r) => r.severity !== "risk")
    .map((r) => `${r.title} — ${r.detail}`);

  // Strengths / improvements : on évite la duplication (un même KPI ne peut pas
  // figurer dans les deux colonnes). Seuils stricts — score >= 60 pour les forts,
  // < 60 pour les axes d'amélioration.
  const ratings = rateKpis(k);
  const strengths = [...ratings]
    .filter((r) => r.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.label);
  const improvements = [...ratings]
    .filter((r) => r.score < 60)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((r) => r.label);

  // Période lisible : si bornes ISO dispo → "MMM YYYY → MMM YYYY", sinon fiscalYear.
  let periodLabel = analysis.fiscalYear ? `Exercice ${analysis.fiscalYear}` : "—";
  if (meta?.periodStart && meta?.periodEnd) {
    const start = new Date(meta.periodStart);
    const end = new Date(meta.periodEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
      periodLabel = `${fmt(start)} → ${fmt(end)}`;
    }
  }

  const providerKey = meta?.provider ?? "upload";
  const providerLabel = PROVIDER_LABELS[providerKey] ?? "Source non identifiée";

  return {
    companyName: options.companyName,
    reportDate: formatDateFr(new Date().toISOString()),
    periodLabel,
    logoPath: LOGO_PATH,
    source: { kind: isDynamic ? "dynamic" : "static", providerLabel },
    quantisScore: { score, piliers },
    heroKpis,
    summaryRows,
    alerts,
    recommendations: recommendationsList,
    monthlyChart: monthlyChart.length >= 2 ? monthlyChart : undefined,
    valueCreationItems: buildValueCreationItems(k),
    investmentItems: buildInvestmentItems(k),
    financingItems: buildFinancingItems(k),
    profitabilityItems: buildProfitabilityItems(k),
    strengths: strengths.length > 0 ? strengths : ["Données insuffisantes pour identifier les points forts."],
    improvements: improvements.length > 0 ? improvements : ["Données insuffisantes pour identifier les axes d'amélioration."],
  };
}

// ─── Spawn Python ───────────────────────────────────────────────────────────

function runPython(payload: ReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [SCRIPT_PATH], { stdio: ["pipe", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Python report generation timed out after ${SUBPROCESS_TIMEOUT_MS}ms`));
    }, SUBPROCESS_TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn ${PYTHON_BIN}: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        reject(new Error(`Python report process exited with code ${code}. Stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      const buf = Buffer.concat(stdoutChunks);
      if (buf.length === 0) {
        reject(new Error("Python produced no output"));
        return;
      }
      if (buf.slice(0, 5).toString("ascii") !== "%PDF-") {
        reject(new Error(`Python output does not look like a PDF. Stderr: ${stderr.slice(0, 300)}`));
        return;
      }
      resolve(buf);
    });

    proc.stdin.write(JSON.stringify(payload), "utf8");
    proc.stdin.end();
  });
}

// ─── API publique ───────────────────────────────────────────────────────────

export async function generateFinancialReportPdf(
  analysis: AnalysisRecord,
  options: BuildPayloadOptions
): Promise<Buffer> {
  const payload = buildReportPayload(analysis, options);
  return runPython(payload);
}

/** Nom de fichier suggéré : rapport-financier-YYYY-MM.pdf basé sur la fin de période. */
export function suggestReportFilename(analysis: AnalysisRecord): string {
  const meta = analysis.sourceMetadata;
  const ref = meta?.periodEnd ?? analysis.createdAt;
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return "rapport-financier.pdf";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `rapport-financier-${yyyy}-${mm}.pdf`;
}
