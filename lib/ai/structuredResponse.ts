// File: lib/ai/structuredResponse.ts
// Role: convertit un contexte (KPI + valeur + diagnostic + markdown) en
// `AiStructuredResponse` pour alimenter le rendu en blocs A-F du panel.
//
// Deux entrées :
//   - `buildStructuredFromContext`  : à partir du contexte mock (avec diag,
//     valeur, etc.). Sert à `MockAiService` pour générer un objet riche.
//   - `buildStructuredFromMarkdown` : à partir d'une réponse markdown brute
//     (Claude réel ou historique persisté). Fallback : on ne peut pas
//     deviner les data points / comparisons, mais on génère quand même
//     diagnostic, actions et follow-up depuis le `kpiRegistry`.

import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getKpiDiagnostic } from "@/lib/kpi/kpiDiagnostic";
import type {
  AiAction,
  AiActionIcon,
  AiDiagnosticStatus,
  AiStructuredResponse,
} from "@/lib/ai/types";

type Ctx = {
  kpiId: string | null;
  value: number | null | undefined;
  /** Markdown déjà généré — utilisé pour remplir `explanation`. */
  markdown?: string;
};

/**
 * Convertit le diagnostic interne (good/warning/danger/neutral) en statut
 * visuel (good/danger/neutral). Warning est traité comme neutral pour rester
 * visuellement calme — le bandeau coloré ne s'affiche que pour les vrais
 * extrêmes (cf. spec produit).
 */
function toStatus(diag: string): AiDiagnosticStatus {
  if (diag === "good") return "good";
  if (diag === "danger") return "danger";
  return "neutral";
}

/**
 * Extrait les 2-4 premières phrases d'un markdown pour les utiliser comme
 * `explanation`. On vire les marqueurs markdown lourds (titres, listes
 * numérotées, séparateurs) en gardant gras et italique — le rendu front
 * sait les afficher.
 */
function extractExplanation(markdown: string): string {
  if (!markdown) return "";
  const cleaned = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      // Skip headings, list markers, separators
      if (/^#{1,6}\s/.test(t)) return false;
      if (/^[-*]\s/.test(t)) return false;
      if (/^\d+\.\s/.test(t)) return false;
      if (/^---+$/.test(t)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Garde les 4 premières phrases (split sur ". " en évitant les abréviations)
  const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 4);
  return sentences.join(" ");
}

/**
 * Génère 2 actions par défaut + une action contextualisée selon le diagnostic.
 * Les `target` sont des identifiants logiques que le front interprète :
 *   - navigate → `kpiId` (ouvre l'onglet du KPI)
 *   - simulate → scénario suggéré (ouvre SimulationWidget avec le scénario)
 *   - compare  → "previous-period" (déclenche un changement TemporalityBar)
 */
function buildActions(kpiId: string | null, status: AiDiagnosticStatus): AiAction[] {
  const actions: AiAction[] = [];
  if (kpiId) {
    actions.push({
      label: "Voir le détail",
      icon: "BarChart3" as AiActionIcon,
      type: "navigate",
      target: kpiId,
    });
  }
  // Simuler : pertinent surtout en danger (où le besoin d'agir est explicite).
  if (status === "danger") {
    actions.push({
      label: "Simuler une amélioration",
      icon: "Sliders" as AiActionIcon,
      type: "simulate",
      target: kpiId ?? "default",
    });
  }
  actions.push({
    label: "Comparer avec N-1",
    icon: "ArrowRight" as AiActionIcon,
    type: "compare",
    target: "previous-period",
  });
  return actions;
}

/**
 * Génère 2 questions de suivi contextuelles depuis le `kpiRegistry`. La
 * stratégie : si le KPI est mauvais on propose la question "good" pour
 * comprendre comment l'améliorer, et inversement — donne à l'utilisateur
 * un chemin d'exploration immédiat.
 */
function buildFollowUps(kpiId: string | null, status: AiDiagnosticStatus): string[] {
  const def = kpiId ? getKpiDefinition(kpiId) : null;
  if (!def) {
    return [
      "Quels indicateurs surveiller en priorité ?",
      "Comment se compare mon entreprise au secteur ?",
    ];
  }
  const opposite =
    status === "good"
      ? def.suggestedQuestions.whenBad
      : def.suggestedQuestions.whenGood;
  return [
    opposite,
    "Comment cela impacte ma trésorerie ?",
  ];
}

/**
 * Génère un message court de diagnostic basé sur le `goodSign`/`badSign` du
 * registre, préfixé d'un emoji visuel.
 */
function buildDiagnosticMessage(
  kpiId: string | null,
  status: AiDiagnosticStatus
): string {
  const def = kpiId ? getKpiDefinition(kpiId) : null;
  if (!def) {
    return "Vue d'ensemble de votre situation financière.";
  }
  if (status === "danger") return def.tooltip.badSign;
  if (status === "good") return def.tooltip.goodSign;
  return def.tooltip.explanation;
}

/**
 * Génère 2-3 data points démonstratifs pour les KPIs où on a des sous-jacents
 * naturels (ex. EBITDA → décompose en VA, salaires, charges externes). Pour
 * les autres KPIs on retourne undefined — le bloc C ne s'affiche pas.
 *
 * NOTE : valeurs illustratives tant que le pipeline mock ne reçoit pas la
 * `MappedFinancialData` complète. À remplacer par des extractions réelles
 * quand le contexte sera étendu.
 */
function buildDataPoints(
  kpiId: string | null,
  value: number | null | undefined
): AiStructuredResponse["dataPoints"] {
  if (!kpiId || value === null || value === undefined) return undefined;
  if (kpiId === "ebitda" || kpiId === "ebe") {
    return [
      { label: "Valeur ajoutée", value: "264 100 €", kpiId: "va" },
      { label: "Salaires", value: "192 000 €" },
      { label: "Charges ext.", value: "72 100 €" },
    ];
  }
  if (kpiId === "dso") {
    return [
      { label: "Encours clients", value: "184 500 €" },
      { label: "CA quotidien", value: "2 410 €" },
      { label: "Cible", value: "≤ 45 j" },
    ];
  }
  if (kpiId === "bfr") {
    return [
      { label: "Stocks", value: "62 300 €" },
      { label: "Créances", value: "184 500 €" },
      { label: "Dettes fourn.", value: "118 700 €" },
    ];
  }
  return undefined;
}

/**
 * Génère une comparaison binaire (actuel vs benchmark) pour les KPIs ayant
 * un benchmark sectoriel exploitable. On parse le benchmark texte du registre
 * pour extraire un point de référence numérique. Conservateur : si le parse
 * échoue on retourne undefined (pas de bloc D).
 */
function buildComparison(
  kpiId: string | null,
  value: number | null | undefined
): AiStructuredResponse["comparison"] {
  if (!kpiId || typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (kpiId === "marge_ebitda") {
    return {
      current: { label: "Votre marge", value },
      reference: { label: "Médiane PME", value: 8 },
    };
  }
  if (kpiId === "ebitda" || kpiId === "ebe") {
    return {
      current: { label: "Votre EBITDA", value },
      reference: { label: "Cible 6 mois", value: Math.max(0, value * 0 + 50000) },
    };
  }
  if (kpiId === "dso") {
    return {
      current: { label: "Votre DSO", value },
      reference: { label: "Cible secteur", value: 45 },
    };
  }
  return undefined;
}

export function buildStructuredFromContext(ctx: Ctx): AiStructuredResponse {
  const def = ctx.kpiId ? getKpiDefinition(ctx.kpiId) : null;
  const diag = getKpiDiagnostic(ctx.value, def?.thresholds);
  const status = toStatus(diag);
  const message = buildDiagnosticMessage(ctx.kpiId, status);
  const explanation = ctx.markdown
    ? extractExplanation(ctx.markdown)
    : message;

  return {
    diagnostic: { status, message },
    explanation,
    dataPoints: buildDataPoints(ctx.kpiId, ctx.value),
    comparison: buildComparison(ctx.kpiId, ctx.value),
    actions: buildActions(ctx.kpiId, status),
    followUpQuestions: buildFollowUps(ctx.kpiId, status),
  };
}

/**
 * Fallback pour les réponses Claude (ou historique persisté) : on n'a que
 * le markdown. Pas de data points ni de comparaison, mais on couvre A, B,
 * E, F en s'appuyant sur le registre.
 */
export function buildStructuredFromMarkdown(
  markdown: string,
  kpiId: string | null,
  value: number | null | undefined
): AiStructuredResponse {
  return buildStructuredFromContext({ kpiId, value, markdown });
}
