// File: services/reports/buildSyntheseReportPayload.ts
// Role: construit le payload JSON envoyé au script Python pour le mode
// "synthese" (8 pages fixes : cover, sommaire, synthèse, bilan actif/passif,
// CdR, analyse value/invest, analyse financement/renta).
//
// Doctrine non-négociable :
//   - Tous les chiffres viennent de mappedData / kpis / quantisScore.
//   - Aucune génération LLM. Les textes (résumé exécutif, constats) sont
//     soit templatés ici, soit produits par le module Python `templates.py`.
//   - Les valeurs manquantes → "N/D" pour ne JAMAIS halluciner.

import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type { DashboardLayout } from "@/types/dashboard";
import { calculateVyzorScore } from "@/lib/vyzorScore";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { isKpiAvailable } from "@/lib/kpi/kpiAvailability";

// ─── Types du payload ──────────────────────────────────────────────────────

export type CompanyInfo = {
  legalForm?: string;
  capital?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  rcs?: string;
  nafCode?: string;
  nafLabel?: string;
  effectif?: number;
  effectifBracket?: string;
};

type BilanRow = {
  label: string;
  indent?: number;
  kind?: "section" | "total" | "grand_total";
  brut?: string;
  amort?: string;
  net?: string;
  netN1?: string;
};

type CdrRow = {
  label: string;
  indent?: number;
  kind?: "section" | "total" | "grand_total";
  montant?: string;
  pctCa?: string;
};

type LabeledItem = {
  label: string;
  valueLabel: string | null;
  description: string;
  signal?: "positive" | "risk" | "warning" | "neutral";
};

type Constat = { severity: "risk" | "warning" | "positive" | "info"; message: string };

export type SyntheseReportPayload = {
  mode: "synthese";
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

  score: {
    value: number | null;
    label: string;
    verdict: string;
    piliers: Array<{ label: string; value: number | null; valueLabel: string | null }>;
    variation: { text: string; severity: "positive" | "risk" | "neutral" };
  };

  breakeven: {
    ca: number | null;
    pointMort: number | null;
    ratio: number | null;
    caLabel: string | null;
    pointMortLabel: string | null;
    ecartLabel: string | null;
  };

  executiveSummary: string;
  keyKpis: Array<{ label: string; valueLabel: string | null; signal?: "positive" | "risk" }>;
  constats: Constat[];
  constatsValueCreation: Constat[];
  constatsFinancing: Constat[];

  bilanActif: BilanRow[];
  bilanPassif: BilanRow[];
  compteResultat: CdrRow[];

  valueCreationItems: LabeledItem[];
  investmentItems: LabeledItem[];
  financingItems: LabeledItem[];
  profitabilityItems: LabeledItem[];
};

// ─── Formatters ────────────────────────────────────────────────────────────

export function fmtMoney(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(Math.round(value));
  return `${sign}${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

export function fmtPercent(value: number | null | undefined, decimals = 2): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${value.toFixed(decimals).replace(".", ",")} %`;
}

export function fmtRatio(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${value.toFixed(2).replace(".", ",")}x`;
}

export function fmtDays(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${Math.round(value)} jours`;
}

export function fmtYears(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${value.toFixed(1).replace(".", ",")} ans`;
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Score helpers ─────────────────────────────────────────────────────────

function scoreLabel(score: number | null): string {
  if (score === null) return "N/D";
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Bon";
  if (score >= 40) return "Fragile";
  return "Critique";
}

// ─── Templates de texte (côté TS pour visibilité, mais Python a aussi templates.py) ──

function buildExecutiveSummary(facts: {
  companyName: string;
  ca: number | null;
  rn: number | null;
  ebe: number | null;
  tn: number | null;
  solvaPct: number | null;
}): string {
  const sentences: string[] = [];
  const { companyName, ca, rn, ebe, tn, solvaPct } = facts;

  if (ca !== null && rn !== null) {
    if (rn < 0) {
      sentences.push(`${companyName} affiche un chiffre d'affaires de ${fmtMoney(ca)} sur la période avec un résultat net déficitaire de ${fmtMoney(rn)}.`);
    } else {
      sentences.push(`${companyName} affiche un chiffre d'affaires de ${fmtMoney(ca)} sur la période avec un résultat net de ${fmtMoney(rn)}.`);
    }
  }
  if (ebe !== null) {
    if (ebe < 0) {
      sentences.push(`L'excédent brut d'exploitation est négatif (${fmtMoney(ebe)}) traduisant une structure de charges d'exploitation supérieure aux revenus.`);
    } else {
      sentences.push(`L'excédent brut d'exploitation s'établit à ${fmtMoney(ebe)}, signe d'une exploitation opérationnellement rentable.`);
    }
  }
  if (tn !== null) {
    if (tn >= 0) {
      sentences.push(`La trésorerie nette reste positive à ${fmtMoney(tn)} ce qui préserve la liquidité à court terme.`);
    } else {
      sentences.push(`La trésorerie nette est négative à ${fmtMoney(tn)} — un besoin de financement court terme s'impose.`);
    }
  }
  if (solvaPct !== null) {
    if (solvaPct < 20) {
      sentences.push(`Le ratio de solvabilité à ${fmtPercent(solvaPct)} (seuil de vigilance : 20 %) indique une couverture très faible des engagements par les capitaux propres.`);
    } else {
      sentences.push(`Le ratio de solvabilité à ${fmtPercent(solvaPct)} reste supérieur au seuil de vigilance de 20 %.`);
    }
  }
  // Doctrine "zéro N/D" : on n'invente pas de phrase de fallback. Si aucune
  // donnée n'est exploitable, on retourne une chaîne vide → la section
  // entière "Résumé exécutif" sera omise par le rendu Python.
  return sentences.length > 0 ? sentences.join(" ") : "";
}

/**
 * Constats page synthèse — règles déterministes ciblées sur les SIGNAUX FORTS
 * uniquement. Doctrine "0 fluff" : on n'écrit pas pour écrire. Si rien de
 * notable ne ressort, la liste est vide et la section "Constats" est masquée.
 */
function buildSyntheseConstats(facts: {
  rn: number | null;
  ca: number | null;
  ebe: number | null;
  margeEbitda: number | null;
  solvaPct: number | null;
  totalCp: number | null;
  totalDettes: number | null;
  tn: number | null;
  liqImm: number | null;
  liqGen: number | null;
  caPointMortRatio: number | null;
}): Constat[] {
  const out: Constat[] = [];
  const {
    rn, ca, ebe, margeEbitda, solvaPct, totalCp, totalDettes,
    tn, liqImm, liqGen, caPointMortRatio,
  } = facts;

  // ── Pertes structurelles (résultat ET EBE négatifs) ──
  if (rn !== null && rn < 0 && ebe !== null && ebe < 0) {
    out.push({
      severity: "risk",
      message: `Pertes structurelles : EBE et résultat net tous deux négatifs (${fmtMoney(ebe)} et ${fmtMoney(rn)}). L'exploitation ne couvre pas ses charges courantes.`,
    });
  } else if (rn !== null && rn < 0 && ca !== null && ca > 0) {
    const lossRatio = Math.abs(rn) / ca;
    if (lossRatio > 0.15) {
      out.push({
        severity: "risk",
        message: `Perte significative : ${fmtMoney(rn)} soit ${(lossRatio * 100).toFixed(1).replace(".", ",")} % du CA. Au-delà de 10 %, redressement à structurer rapidement.`,
      });
    }
  }

  // ── Marge EBITDA hors normes ──
  if (margeEbitda !== null) {
    if (margeEbitda >= 20) {
      out.push({
        severity: "positive",
        message: `Marge EBITDA à ${fmtPercent(margeEbitda)} — performance opérationnelle largement au-dessus du seuil de santé (10 %).`,
      });
    } else if (margeEbitda < 5 && margeEbitda >= 0 && rn !== null && rn >= 0) {
      out.push({
        severity: "warning",
        message: `Marge EBITDA faible à ${fmtPercent(margeEbitda)} — peu de marge de manœuvre face à un choc de coûts ou de revenus.`,
      });
    }
  }

  // ── Sous-capitalisation critique ──
  if (solvaPct !== null && solvaPct < 10) {
    out.push({
      severity: "risk",
      message: `Sous-capitalisation : solvabilité à ${fmtPercent(solvaPct)} (seuil de vigilance 20 %). Capitaux propres de ${fmtMoney(totalCp)} face à ${fmtMoney(totalDettes)} de dettes — fragilité bilancielle marquée.`,
    });
  } else if (solvaPct !== null && solvaPct >= 50) {
    out.push({
      severity: "positive",
      message: `Structure financière solide : ${fmtPercent(solvaPct)} de solvabilité — capitaux propres majoritaires dans le bilan.`,
    });
  }

  // ── Tension de trésorerie immédiate ──
  if (tn !== null && tn < 0 && liqImm !== null && liqImm < 0.5) {
    out.push({
      severity: "risk",
      message: `Tension de trésorerie : trésorerie nette à ${fmtMoney(tn)} et liquidité immédiate à ${fmtRatio(liqImm)} (seuil 0,5x). Risque de défaut de paiement court terme.`,
    });
  }

  // ── Point mort dépassé largement (effet de levier opérationnel exploité) ──
  if (caPointMortRatio !== null && caPointMortRatio >= 1.3) {
    const above = (caPointMortRatio - 1) * 100;
    out.push({
      severity: "positive",
      message: `Point mort dépassé de ${above.toFixed(0)} % — l'activité génère une marge confortable au-delà du seuil de rentabilité.`,
    });
  } else if (caPointMortRatio !== null && caPointMortRatio < 0.85) {
    const below = (1 - caPointMortRatio) * 100;
    out.push({
      severity: "warning",
      message: `Point mort non atteint : il manque ${below.toFixed(0)} % de CA pour couvrir les charges fixes.`,
    });
  }

  // ── Liquidité générale insuffisante ──
  if (liqGen !== null && liqGen < 1 && tn !== null && tn >= 0) {
    out.push({
      severity: "warning",
      message: `Liquidité générale à ${fmtRatio(liqGen)} (seuil 1x) — l'actif circulant ne couvre pas les dettes court terme malgré une trésorerie positive.`,
    });
  }

  return out;
}

// ─── Bilan / CdR row builders ──────────────────────────────────────────────

/**
 * Doctrine "zéro N/D" : on N'INCLUT QUE les lignes dont la valeur est non-null.
 * Si toutes les lignes-enfants d'une section sont absentes, la section et son
 * total sont également omis. Le `previousAnalysis` n'étant pas encore exposé
 * dans le payload, on n'émet pas la colonne N-1 — elle réapparaîtra quand le
 * data source sera branché.
 */
function row(label: string, value: number | null, indent = 1): BilanRow | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return { label, indent, net: fmtMoney(value) ?? undefined };
}

function pruneSection(
  sectionLabel: string,
  rows: Array<BilanRow | null>,
  total: { label: string; value: number | null },
): BilanRow[] {
  const visible = rows.filter((r): r is BilanRow => r !== null);
  if (visible.length === 0 && (total.value === null || !Number.isFinite(total.value))) {
    return [];
  }
  const out: BilanRow[] = [{ label: sectionLabel, kind: "section" }];
  out.push(...visible);
  if (total.value !== null && Number.isFinite(total.value)) {
    out.push({
      label: total.label, kind: "total",
      net: fmtMoney(total.value) ?? undefined,
    });
  }
  return out;
}

function buildBilanActif(m: MappedFinancialData): BilanRow[] {
  const out: BilanRow[] = [];
  out.push(...pruneSection("Actif immobilisé", [
    row("Immobilisations incorporelles", m.immob_incorp),
    row("Immobilisations corporelles", m.immob_corp),
    row("Immobilisations financières", m.immob_fin),
  ], { label: "Total actif immobilisé (I)", value: m.total_actif_immo }));

  out.push(...pruneSection("Actif circulant", [
    row("Stocks et en-cours", m.total_stocks),
    row("Créances clients", m.clients),
    row("Autres créances", m.autres_creances),
    row("Valeurs mobilières de placement", m.vmp),
    row("Disponibilités", m.dispo),
    row("Charges constatées d'avance", m.cca),
  ], { label: "Total actif circulant (II)", value: m.total_actif_circ }));

  if (m.total_actif !== null && Number.isFinite(m.total_actif)) {
    out.push({
      label: "TOTAL ACTIF (I + II)", kind: "grand_total",
      net: fmtMoney(m.total_actif) ?? undefined,
    });
  }
  return out;
}

function buildBilanPassif(m: MappedFinancialData): BilanRow[] {
  const out: BilanRow[] = [];
  out.push(...pruneSection("Capitaux propres", [
    row("Capital social", m.capital),
    row("Réserve légale", m.reserve_legale),
    row("Report à nouveau", m.ran),
    row("Résultat de l'exercice", m.res_net),
  ], { label: "Total capitaux propres (I)", value: m.total_cp }));

  if (m.total_prov !== null && Number.isFinite(m.total_prov) && m.total_prov !== 0) {
    out.push({ label: "Provisions pour risques et charges", kind: "section" });
    out.push({
      label: "Total provisions (II)", kind: "total",
      net: fmtMoney(m.total_prov) ?? undefined,
    });
  }

  out.push(...pruneSection("Dettes", [
    row("Emprunts et dettes financières", m.emprunts),
    row("Dettes fournisseurs et comptes rattachés", m.fournisseurs),
    row("Dettes fiscales et sociales", m.dettes_fisc_soc),
    row("Autres dettes", m.autres_dettes),
  ], { label: "Total dettes (III)", value: m.total_dettes }));

  if (m.total_passif !== null && Number.isFinite(m.total_passif)) {
    out.push({
      label: "TOTAL PASSIF (I + II + III)", kind: "grand_total",
      net: fmtMoney(m.total_passif) ?? undefined,
    });
  }
  return out;
}

function buildCompteResultat(m: MappedFinancialData): CdrRow[] {
  const ca = (m.ventes_march ?? 0) + (m.prod_vendue ?? 0);
  const caUsable = ca > 0 ? ca : null;
  const pct = (v: number | null | undefined): string | null => {
    if (v === null || v === undefined || !Number.isFinite(v) || caUsable === null) return null;
    return `${(v / caUsable * 100).toFixed(1).replace(".", ",")} %`;
  };

  /** Émet une ligne UNIQUEMENT si `montant` est un nombre fini.
   *  Si `signFlip` est true, on inverse le signe (charges affichées en négatif). */
  const cdrLine = (
    label: string,
    montant: number | null | undefined,
    opts: { indent?: number; kind?: CdrRow["kind"]; signFlip?: boolean } = {}
  ): CdrRow | null => {
    if (montant === null || montant === undefined || !Number.isFinite(montant)) return null;
    const value = opts.signFlip ? -montant : montant;
    return {
      label,
      indent: opts.indent ?? 0,
      kind: opts.kind,
      montant: fmtMoney(value) ?? undefined,
      pctCa: pct(value) ?? undefined,
    };
  };

  const rfin =
    (m.prod_fin !== null && Number.isFinite(m.prod_fin)) ||
    (m.charges_fin !== null && Number.isFinite(m.charges_fin))
      ? (m.prod_fin ?? 0) - (m.charges_fin ?? 0)
      : null;

  const rcourant = (m.ebit !== null && Number.isFinite(m.ebit)) || rfin !== null
    ? (m.ebit ?? 0) + (rfin ?? 0)
    : null;

  const rexcep =
    (m.prod_excep !== null && Number.isFinite(m.prod_excep)) ||
    (m.charges_excep !== null && Number.isFinite(m.charges_excep))
      ? (m.prod_excep ?? 0) - (m.charges_excep ?? 0)
      : null;

  const rows: Array<CdrRow | null> = [
    cdrLine("Chiffre d'affaires net", caUsable, { kind: "total" }),
    cdrLine("Production stockée", m.prod_stockee, { indent: 1 }),
    cdrLine("Reprises et transferts de charges", m.subv_expl, { indent: 1 }),
    cdrLine("Autres produits", m.autres_prod_expl, { indent: 1 }),
    cdrLine("Total produits d'exploitation (I)", m.total_prod_expl, { kind: "total" }),
    cdrLine("Achats et consommations", m.achats_march, { indent: 1, signFlip: true }),
    cdrLine("Autres achats et charges externes", m.ace, { indent: 1, signFlip: true }),
    cdrLine("Impôts, taxes et versements", m.impots_taxes, { indent: 1, signFlip: true }),
    cdrLine("Salaires et traitements", m.salaires, { indent: 1, signFlip: true }),
    cdrLine("Charges sociales", m.charges_soc, { indent: 1, signFlip: true }),
    cdrLine("Dotations aux amortissements", m.dap, { indent: 1, signFlip: true }),
    cdrLine("Autres charges", m.autres_charges_expl, { indent: 1, signFlip: true }),
    cdrLine("Total charges d'exploitation (II)", m.total_charges_expl, { kind: "total", signFlip: true }),
    cdrLine("RÉSULTAT D'EXPLOITATION (I - II)", m.ebit, { kind: "total" }),
    cdrLine("Produits financiers", m.prod_fin, { indent: 1 }),
    cdrLine("Charges financières", m.charges_fin, { indent: 1, signFlip: true }),
    cdrLine("RÉSULTAT FINANCIER", rfin, { kind: "total" }),
    cdrLine("RÉSULTAT COURANT AVANT IMPÔTS", rcourant, { kind: "total" }),
    cdrLine("Résultat exceptionnel", rexcep, { indent: 1 }),
    cdrLine("Impôts sur les bénéfices", m.is_impot, { indent: 1, signFlip: true }),
    cdrLine("RÉSULTAT NET", m.resultat_exercice, { kind: "grand_total" }),
  ];

  return rows.filter((r): r is CdrRow => r !== null);
}

// ─── KPI sections ──────────────────────────────────────────────────────────

// ─── Builders layout-aware ──────────────────────────────────────────────
// Avant : 4 listes hardcodées (Création valeur, Investissement, Financement,
// Rentabilité) → le rapport ignorait toute customisation utilisateur des
// onglets dashboard et affichait toujours les mêmes 18 KPIs.
//
// Après : on lit les widgets KpiCard du layout passé en option et on
// construit la liste à partir d'eux. Le rapport reflète exactement ce que
// l'utilisateur a placé sur ses dashboards. Si aucun layout n'est fourni
// (utilisateur n'a jamais customisé), fallback sur un set par défaut
// aligné sur DEFAULT_DASHBOARD_LAYOUTS.

const DEFAULT_VALUE_CREATION_KPIS = ["va", "ebitda", "marge_ebitda", "tmscv", "point_mort", "resultat_net"];
const DEFAULT_INVESTMENT_KPIS = ["bfr", "dso", "dpo", "rot_bfr"];
const DEFAULT_FINANCING_KPIS = ["caf", "solvabilite", "gearing", "tn", "liq_gen", "liq_red", "liq_imm", "disponibilites"];
const DEFAULT_PROFITABILITY_KPIS = ["roe", "roce"];

/**
 * Construit la liste des items "ligne par KPI" à partir d'un layout. On lit
 * uniquement les widgets `kpiCard` (les autres types — chart, custom — n'ont
 * pas de sens ligne à ligne). La description vient du tooltip.explanation
 * du registre, tronquée à ~180 caractères pour rester sur une ligne dans
 * le PDF. Si la valeur du KPI est indisponible, l'item est omis (zéro N/D).
 */
function buildItemsFromLayout(
  k: CalculatedKpis,
  layout: DashboardLayout | null,
  fallbackKpiIds: string[],
): LabeledItem[] {
  const ctx = { kpis: k, synthese: null, currentAnalysis: null };
  // KPIs à afficher : kpiCard du layout user (ordre préservé), ou fallback.
  const kpiIds = layout
    ? layout.widgets
        .filter((w) => w.vizType === "kpiCard")
        .map((w) => w.kpiId)
    : fallbackKpiIds;

  // Dédup tout en préservant l'ordre — un user pourrait avoir 2 widgets
  // sur le même KPI (ex. KpiCard + LineChart) → on n'imprime qu'une ligne.
  const seen = new Set<string>();
  const items: LabeledItem[] = [];
  for (const kpiId of kpiIds) {
    if (seen.has(kpiId)) continue;
    seen.add(kpiId);
    if (!isKpiAvailable(kpiId, ctx)) continue;
    const def = getKpiDefinition(kpiId);
    if (!def) continue;
    const value = (k as unknown as Record<string, number | null>)[kpiId];
    const valueLabel = formatKpiByUnit(kpiId, value ?? null);
    if (valueLabel === null) continue;
    items.push({
      label: def.label,
      valueLabel,
      description: truncateText(def.tooltip.explanation, 180),
      signal: signalForUnit(kpiId, value ?? null),
    });
  }
  return items;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).replace(/[,;.\s]+$/, "") + "…";
}

// ─── KPI clés (page synthèse — grille 3x3) ─────────────────────────────────

/**
 * Formate la valeur d'un KPI selon son unité (currency / percent / ratio /
 * days / score). Retourne null si la donnée est indisponible — la doctrine
 * "zéro N/D" garantit alors l'omission du tile.
 */
function formatKpiByUnit(kpiId: string, value: number | null): string | null {
  const def = getKpiDefinition(kpiId);
  const unit = def?.unit ?? "currency";
  if (value === null) return null;
  if (unit === "currency") return fmtMoney(value);
  if (unit === "percent") {
    // Certains KPIs stockent leur valeur en fraction (0-1), d'autres en %
    // direct (ex. marge_ebitda). On détecte par convention : `solvabilite`,
    // `tmscv`, `roe`, `roce`, `effet_levier`, `ratio_immo` sont en fraction.
    const fractionKeys = new Set([
      "solvabilite", "tmscv", "roe", "roce", "ratio_immo", "effet_levier",
    ]);
    return fmtPercent(fractionKeys.has(kpiId) ? value * 100 : value);
  }
  if (unit === "days") return fmtDays(value);
  if (unit === "ratio" || unit === "score") return fmtRatio(value);
  return fmtMoney(value);
}

function signalForUnit(kpiId: string, value: number | null): "positive" | "risk" | undefined {
  if (value === null) return undefined;
  // Heuristique simple : pour les flux (EBE, RN, CAF, TN), positif = bon ;
  // pour les ratios de solvabilité/liquidité, on ne signale rien (juste la valeur).
  const positiveIfPositive = new Set([
    "ebe", "ebitda", "resultat_net", "tn", "caf", "marge_ebitda", "marge_brute",
  ]);
  if (positiveIfPositive.has(kpiId)) return value >= 0 ? "positive" : "risk";
  if (kpiId === "solvabilite") return value >= 0.2 ? "positive" : "risk";
  return undefined;
}

/**
 * Construit la grille "Indicateurs clés" à partir du layout synthèse de
 * l'utilisateur. On lit ses widgets KpiCard, on applique le formatage par
 * unité, on filtre les non-disponibles. Si aucun layout n'est fourni, on
 * retombe sur une sélection par défaut (aligned avec DEFAULT_SYNTHESE_LAYOUT).
 */
function buildKeyKpisFromLayout(
  k: CalculatedKpis,
  syntheseLayout: DashboardLayout | null,
): SyntheseReportPayload["keyKpis"] {
  const ctx = { kpis: k, synthese: null, currentAnalysis: null };
  const layout = syntheseLayout ?? null;

  // KPI ids à afficher : les widgets KpiCard du layout utilisateur, ou
  // un set par défaut.
  const kpiIds = layout
    ? layout.widgets
        .filter((w) => w.vizType === "kpiCard")
        .map((w) => w.kpiId)
    : ["ca", "ebe", "resultat_net", "tn", "solvabilite", "marge_ebitda"];

  const tiles: SyntheseReportPayload["keyKpis"] = [];
  for (const kpiId of kpiIds) {
    if (!isKpiAvailable(kpiId, ctx)) continue;
    const def = getKpiDefinition(kpiId);
    const value = (k as unknown as Record<string, number | null>)[kpiId];
    const valueLabel = formatKpiByUnit(kpiId, value ?? null);
    if (valueLabel === null) continue;
    tiles.push({
      label: def?.shortLabel ?? def?.label ?? kpiId,
      valueLabel,
      signal: signalForUnit(kpiId, value ?? null),
    });
  }
  return tiles;
}

// ─── Constats par page ─────────────────────────────────────────────────────

function buildValueCreationConstats(k: CalculatedKpis): Constat[] {
  const out: Constat[] = [];

  // BFR négatif significatif = vrai avantage cash, mention pertinente.
  if (k.bfr !== null && k.bfr < 0 && k.ca !== null && k.ca > 0) {
    const bfrJours = Math.abs(k.bfr) / k.ca * 365;
    if (bfrJours >= 15) {
      out.push({
        severity: "positive",
        message: `BFR négatif : ${fmtMoney(k.bfr)} (~${Math.round(bfrJours)} jours de CA). Les fournisseurs financent le cycle — levier cash structurel.`,
      });
    }
  }

  // DSO très élevé = vrai problème de recouvrement.
  if (k.dso !== null && k.dso > 75) {
    out.push({
      severity: "risk",
      message: `DSO à ${fmtDays(k.dso)} — délai client largement au-dessus de la norme PME (30-45 j). Risque de trésorerie immédiat à traiter.`,
    });
  } else if (k.dso !== null && k.dso > 50) {
    out.push({
      severity: "warning",
      message: `DSO à ${fmtDays(k.dso)} — au-dessus de la norme PME. Plan de relance à activer.`,
    });
  }

  // Marge EBITDA négative + masse salariale dominante = signal structurel.
  if (k.ebitda !== null && k.ebitda < 0 && k.ebe !== null && k.ebe < 0) {
    out.push({
      severity: "risk",
      message: `EBITDA et EBE négatifs — exploitation déficitaire avant prise en compte des éléments financiers et exceptionnels.`,
    });
  }

  // ROCE faible vs ROE — pas un constat utile dans le PDF V1, on l'omet.
  return out;
}

function buildFinancingConstats(k: CalculatedKpis, m: MappedFinancialData): Constat[] {
  const out: Constat[] = [];

  // CAF négative = signal majeur.
  if (k.caf !== null && k.caf < 0) {
    out.push({
      severity: "risk",
      message: `CAF négative (${fmtMoney(k.caf)}) — l'activité consomme du cash au lieu d'en générer. Capacité de remboursement compromise.`,
    });
  }

  // Solvabilité critique.
  if (k.solvabilite !== null && k.solvabilite * 100 < 10) {
    out.push({
      severity: "risk",
      message: `Solvabilité critique à ${fmtPercent(k.solvabilite * 100)} : capitaux propres de ${fmtMoney(m.total_cp)} face à ${fmtMoney(m.total_actif)} d'actif. Recapitalisation à envisager.`,
    });
  }

  // Gearing élevé = endettement net excessif.
  if (k.gearing !== null && k.gearing > 2) {
    out.push({
      severity: "warning",
      message: `Gearing à ${fmtRatio(k.gearing)} — dette nette > 2× capitaux propres. Marge de manœuvre financière limitée.`,
    });
  }

  // ROE très élevé sans levier = signal de profitabilité forte.
  if (k.roe !== null && k.roe * 100 >= 20 && k.gearing !== null && k.gearing < 0.5) {
    out.push({
      severity: "positive",
      message: `ROE à ${fmtPercent(k.roe * 100)} avec un gearing modéré (${fmtRatio(k.gearing)}) — rentabilité actionnaire sans dépendance excessive à la dette.`,
    });
  }

  return out;
}

// ─── Build entry point ─────────────────────────────────────────────────────

export type SyntheseReportOptions = {
  companyName: string;
  logoPath: string;
  reportDate?: string;
  reportTitle?: string;
  companyInfo?: CompanyInfo;
  /**
   * Layout synthèse de l'utilisateur — sert à reproduire dans le rapport
   * EXACTEMENT les KPIs qu'il a choisi d'afficher dans son dashboard
   * synthèse, plutôt qu'une liste figée. Optional : si null, fallback sur
   * un set par défaut (CA, EBE, RN, TN, Solva, Marge EBITDA).
   */
  syntheseLayout?: DashboardLayout | null;
  /**
   * Layouts des 4 onglets dashboard catégorisés. Servent à construire les
   * pages "Analyse — Création de valeur / Investissement / Financement /
   * Rentabilité" en reproduisant les KPIs effectivement placés par
   * l'utilisateur. Si un layout est null, fallback sur un set par défaut.
   */
  valueCreationLayout?: DashboardLayout | null;
  investmentLayout?: DashboardLayout | null;
  financingLayout?: DashboardLayout | null;
  rentabilityLayout?: DashboardLayout | null;
};

export function buildSyntheseReportPayload(
  analysis: AnalysisRecord,
  options: SyntheseReportOptions,
): SyntheseReportPayload {
  const k = analysis.kpis;
  const m = analysis.mappedData;
  const meta = analysis.sourceMetadata;

  const reportDate = options.reportDate || formatDateFr(new Date().toISOString());
  const reportTitle = options.reportTitle || "Rapport d'analyse financière";

  // Période lisible.
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

  const PROVIDER_LABELS: Record<string, string> = {
    pennylane: "Pennylane (sync automatique)",
    myunisoft: "MyUnisoft (sync automatique)",
    odoo: "Odoo (sync automatique)",
    fec: "Import FEC",
    upload: "Upload PDF",
  };
  const providerKey = meta?.provider ?? "upload";
  const providerLabel = PROVIDER_LABELS[providerKey] ?? "Source non identifiée";

  // CA priorité daily si présent, sinon kpis.ca.
  const ca = k.ca;
  const totalActif = m.total_actif ?? null;
  const totalCp = m.total_cp ?? null;
  const totalDettes = m.total_dettes ?? null;
  const solvaPct = k.solvabilite !== null ? k.solvabilite * 100 : null;

  // Score Vyzor — recalcul LIVE à partir des kpis courants (cohérent avec
  // la synthèse). Le `analysis.quantisScore` stocké peut être obsolète si
  // les kpis ont été mis à jour (slider de temporalité, recalcul…). On
  // garantit ainsi que le score du PDF == score affiché à l'écran.
  const scoreResult = calculateVyzorScore(k);
  const score: number | null = Number.isFinite(scoreResult.vyzor_score)
    ? scoreResult.vyzor_score
    : null;
  const label = scoreLabel(score);
  const verdict = score !== null
    ? `Vyzor évalue la santé financière de ${options.companyName} à ${Math.round(score)}/100 — situation qualifiée de ${label}.`
    : `Vyzor n'a pas pu évaluer la santé financière de ${options.companyName} sur cette période — données insuffisantes.`;

  const pil = scoreResult.piliers;
  const piliers = [
    { label: "Rentabilité", value: pil.rentabilite, valueLabel: `${Math.round(pil.rentabilite)}` },
    { label: "Solvabilité", value: pil.solvabilite, valueLabel: `${Math.round(pil.solvabilite)}` },
    { label: "Liquidité", value: pil.liquidite, valueLabel: `${Math.round(pil.liquidite)}` },
    { label: "Efficacité", value: pil.efficacite, valueLabel: `${Math.round(pil.efficacite)}` },
  ];

  // Variation N-1 — non disponible côté payload pour l'instant.
  const variation: SyntheseReportPayload["score"]["variation"] = {
    text: "Premier exercice analysé — pas de comparaison disponible.",
    severity: "neutral",
  };

  // Seuil de rentabilité.
  const pointMort = k.point_mort ?? null;
  const ratio = (ca !== null && pointMort !== null && pointMort > 0) ? ca / pointMort : null;
  const ecart = (ca !== null && pointMort !== null) ? pointMort - ca : null;

  const breakeven = {
    ca,
    pointMort,
    ratio,
    caLabel: fmtMoney(ca),
    pointMortLabel: fmtMoney(pointMort),
    ecartLabel: fmtMoney(Math.abs(ecart ?? 0)),
  };

  // Résumé exécutif templaté.
  const executiveSummary = buildExecutiveSummary({
    companyName: options.companyName,
    ca,
    rn: k.resultat_net,
    ebe: k.ebe,
    tn: k.tn,
    solvaPct,
  });

  // KPI clés grille — DYNAMIQUE selon le layout synthèse de l'utilisateur.
  // S'il a personnalisé sa synthèse (ex. ajouté Provision IS, retiré Marge
  // EBITDA), le rapport reflète exactement ce qu'il voit à l'écran.
  const keyKpis = buildKeyKpisFromLayout(k, options.syntheseLayout ?? null);

  // Constats — uniquement les signaux forts. Liste vide → section masquée.
  const constats = buildSyntheseConstats({
    rn: k.resultat_net,
    ca,
    ebe: k.ebe,
    margeEbitda: k.marge_ebitda,
    solvaPct,
    totalCp,
    totalDettes,
    tn: k.tn,
    liqImm: k.liq_imm,
    liqGen: k.liq_gen,
    caPointMortRatio: ratio,
  });

  // TOC (sommaire).
  const toc = [
    { num: 1, title: "Synthèse Vyzor", description: "Score de santé financière et résumé exécutif", page: 3 },
    { num: 2, title: "Bilan — Actif", description: "Détail des emplois de l'entreprise", page: 4 },
    { num: 3, title: "Bilan — Passif", description: "Détail des ressources de l'entreprise", page: 5 },
    { num: 4, title: "Compte de résultat", description: "Formation du résultat sur la période", page: 6 },
    { num: 5, title: "Analyse — Création de valeur & Investissement", description: "Ratios opérationnels et gestion du BFR", page: 7 },
    { num: 6, title: "Analyse — Financement & Rentabilité", description: "Structure financière et performance des capitaux", page: 8 },
  ];
  const tocGroups = [
    { title: "Synthèse Vyzor", description: "Page 3 — Évaluation propriétaire Vyzor" },
    { title: "États financiers", description: "Pages 4 à 6 — Bilan et compte de résultat" },
    { title: "Analyse financière", description: "Pages 7 et 8 — Ratios et constats factuels" },
  ];

  return {
    mode: "synthese",
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
    score: { value: score, label, verdict, piliers, variation },
    breakeven,
    executiveSummary,
    keyKpis,
    constats,
    constatsValueCreation: buildValueCreationConstats(k),
    constatsFinancing: buildFinancingConstats(k, m),
    bilanActif: buildBilanActif(m),
    bilanPassif: buildBilanPassif(m),
    compteResultat: buildCompteResultat(m),
    valueCreationItems: buildItemsFromLayout(k, options.valueCreationLayout ?? null, DEFAULT_VALUE_CREATION_KPIS),
    investmentItems: buildItemsFromLayout(k, options.investmentLayout ?? null, DEFAULT_INVESTMENT_KPIS),
    financingItems: buildItemsFromLayout(k, options.financingLayout ?? null, DEFAULT_FINANCING_KPIS),
    profitabilityItems: buildItemsFromLayout(k, options.rentabilityLayout ?? null, DEFAULT_PROFITABILITY_KPIS),
  };
}
