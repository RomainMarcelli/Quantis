// File: lib/ai/promptBuilder.ts
// Role: construit le `system prompt` complet pour Claude à partir d'une
// analyse Vyzor + d'un KPI focus + du niveau utilisateur.
//
// Suit le format décrit dans docs/AI_ARCHITECTURE.md §"Format du system
// prompt" : <role>, <entreprise>, <donnees_kpi>, <contexte_focus>,
// <garde_fous>, <format_reponse>.
//
// Aucune dépendance front — utilisable côté serveur (route API) comme côté
// test (vitest pur). Ne fait pas d'appel réseau, pure fonction.

import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getKpiDiagnostic } from "@/lib/kpi/kpiDiagnostic";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
} from "@/components/dashboard/formatting";
import type { AnalysisRecord } from "@/types/analysis";
import type { UserLevel } from "@/lib/ai/types";

export type BuildSystemPromptParams = {
  /** Analyse complète (peut être null si l'utilisateur n'en a pas — chat libre). */
  analysis: AnalysisRecord | null;
  /** KPI sur lequel on focalise la conversation, ou null si question libre. */
  kpiId: string | null;
  /**
   * Valeur courante du KPI focus, envoyée par le front quand la question est
   * posée depuis une carte KPI cliquée hors page d'analyse (URL contient
   * `?kpiId=...&kpiValue=...` sans `analysisId`). Permet d'injecter la valeur
   * dans le system prompt même en l'absence d'analyse complète chargée.
   */
  kpiValue?: number | null;
  /** Niveau utilisateur — détermine le ton et la profondeur des explications. */
  userLevel: UserLevel;
};

const ROLE_BY_LEVEL: Record<UserLevel, string> = {
  beginner:
    "Tu es Vyzor, le CFO digital d'un dirigeant de PME française qui découvre la finance. Vulgarise sans simplifier abusivement : explique chaque terme technique en une phrase, puis donne ta lecture. Ton ton : pédagogue, patient, factuel, en français. Vouvoiement systématique.",
  intermediate:
    "Tu es Vyzor, le CFO digital d'un dirigeant de PME française à l'aise avec les notions financières de base. Va à l'essentiel, cite les chiffres précis, propose 1-2 actions concrètes. Ton ton : direct, sans jargon inutile, en français. Vouvoiement systématique.",
  expert:
    "Tu es Vyzor, l'analyste financier de poche d'un dirigeant de PME française avec un fort background financier. Sois technique, précis sur les ratios et les conventions comptables, propose des arbitrages et des comparaisons sectorielles. Ton ton : factuel, structuré, en français. Vouvoiement systématique.",
};

/**
 * Construit le system prompt complet. C'est un texte multi-bloc en pseudo-XML
 * pour rester lisible côté audit (les blocs `<entreprise>`, `<donnees_kpi>`
 * et `<contexte_focus>` apparaissent dans la conversation Firestore via le
 * champ `systemPromptHash`).
 */
export function buildSystemPrompt(params: BuildSystemPromptParams): string {
  const { analysis, kpiId, userLevel } = params;
  const kpiValue =
    typeof params.kpiValue === "number" && Number.isFinite(params.kpiValue)
      ? params.kpiValue
      : null;

  const sections = [
    section("role", ROLE_BY_LEVEL[userLevel]),
    section("entreprise", buildCompanySection(analysis, kpiId, kpiValue)),
    section("donnees_kpi", buildKpiSection(analysis, kpiId, kpiValue)),
  ];

  const focusSection = buildFocusSection(analysis, kpiId, kpiValue);
  if (focusSection) {
    sections.push(section("contexte_focus", focusSection));
  }

  sections.push(section("garde_fous", buildGuardrailsSection()));
  sections.push(section("multi_questions", buildMultiQuestionsSection()));
  sections.push(section("format_reponse", buildOutputFormatSection(userLevel)));

  return sections.join("\n\n");
}

// ─── Helpers de section ──────────────────────────────────────────────────

function section(tag: string, body: string): string {
  return `<${tag}>\n${body.trim()}\n</${tag}>`;
}

function buildCompanySection(
  analysis: AnalysisRecord | null,
  kpiId: string | null,
  kpiValue: number | null,
): string {
  if (!analysis) {
    // Si on a au moins le KPI focus + sa valeur (envoyé depuis une carte KPI
    // cliquée), on indique à Claude qu'il a un contexte partiel — éviter
    // qu'il refuse de répondre en disant "je n'ai aucune donnée".
    if (kpiId && kpiValue !== null) {
      return "L'utilisateur consulte un KPI isolé depuis une carte cliquée. L'analyse complète n'est pas chargée dans cette conversation, mais le KPI focus et sa valeur courante sont fournis ci-dessous.";
    }
    return "Aucune analyse disponible. L'utilisateur n'a pas encore importé de fichier.";
  }
  const sector = analysis.uploadContext?.sector ?? "non renseigné";
  const size = analysis.uploadContext?.companySize ?? "non renseigné";
  const fiscalYear =
    analysis.fiscalYear !== null && analysis.fiscalYear !== undefined
      ? String(analysis.fiscalYear)
      : "non renseigné";
  const folder = analysis.folderName || "Dossier principal";

  return [
    `Dossier d'analyse : ${folder}`,
    `Secteur : ${sector}`,
    `Taille : ${size}`,
    `Exercice analysé : ${fiscalYear}`,
  ].join("\n");
}

function buildKpiSection(
  analysis: AnalysisRecord | null,
  kpiId: string | null,
  kpiValue: number | null,
): string {
  if (!analysis) {
    // Pas d'analyse, mais le front a fourni kpiId + kpiValue (carte KPI
    // cliquée hors page d'analyse) → on les expose pour que Claude puisse
    // citer la vraie valeur au lieu de répondre "aucune donnée".
    if (kpiId && kpiValue !== null) {
      const def = getKpiDefinition(kpiId);
      if (def) {
        const valueStr = formatKpiValue(def.unit, kpiValue);
        const diagnostic = getKpiDiagnostic(kpiValue, def.thresholds);
        const tag = diagnostic !== "neutral" ? ` [${diagnostic}]` : "";
        return [
          "KPI fourni par le contexte UI (analyse complète non chargée) :",
          `- ${kpiId} (${def.label}) : ${valueStr}${tag}`,
        ].join("\n");
      }
    }
    return "Aucune donnée chiffrée disponible.";
  }

  const kpiLines: string[] = [];
  const kpis = analysis.kpis as Record<string, number | null | undefined>;
  for (const [id, value] of Object.entries(kpis)) {
    if (value === null || value === undefined || !Number.isFinite(value as number)) continue;
    const def = getKpiDefinition(id);
    if (!def) continue;
    const valueStr = formatKpiValue(def.unit, value as number);
    const diagnostic = getKpiDiagnostic(value as number, def.thresholds);
    const tag = diagnostic !== "neutral" ? ` [${diagnostic}]` : "";
    kpiLines.push(`- ${id} (${def.label}) : ${valueStr}${tag}`);
  }

  const mappedLines = buildMappedDataExtract(analysis);

  return [
    "KPIs calculés (les seules valeurs que tu peux citer) :",
    kpiLines.length > 0 ? kpiLines.join("\n") : "Aucun KPI calculé.",
    "",
    "Postes du compte de résultat / bilan (extrait) :",
    mappedLines,
  ].join("\n");
}

function buildMappedDataExtract(analysis: AnalysisRecord): string {
  const m = analysis.mappedData;
  // On expose un sous-ensemble pertinent pour la conversation : top-line +
  // structure de coûts + bilan agrégé. Pas tout l'objet — éviter le bruit.
  const entries: Array<[string, number | null]> = [
    ["Total production exploitation", m.total_prod_expl],
    ["Achats marchandises", m.achats_march],
    ["Achats matières", m.achats_mp],
    ["Autres charges externes", m.ace],
    ["Salaires", m.salaires],
    ["Charges sociales", m.charges_soc],
    ["Impôts et taxes", m.impots_taxes],
    ["Dotations amortissements", m.dap],
    ["Capitaux propres", m.total_cp],
    ["Dettes financières", m.emprunts],
    ["Disponibilités", m.dispo],
    ["Créances clients", m.clients],
    ["Dettes fournisseurs", m.fournisseurs],
    ["Stocks", m.total_stocks],
    ["Total actif", m.total_actif],
  ];

  const lines = entries
    .filter(([, v]) => v !== null && v !== undefined && Number.isFinite(v as number))
    .map(([label, v]) => `- ${label} : ${formatCurrency(v as number)}`);

  return lines.length > 0 ? lines.join("\n") : "Aucun poste mappé disponible.";
}

function buildFocusSection(
  analysis: AnalysisRecord | null,
  kpiId: string | null,
  kpiValue: number | null,
): string | null {
  if (!kpiId) return null;
  const def = getKpiDefinition(kpiId);
  if (!def) return null;

  // Priorité 1 : la valeur depuis l'analyse en BDD (canonique).
  // Priorité 2 : la valeur envoyée par le front via `kpiValue` (carte KPI
  // cliquée hors page d'analyse) — sans elle, le focus était inutilisable.
  const valueFromAnalysis = analysis
    ? (analysis.kpis as Record<string, number | null | undefined>)[kpiId]
    : null;
  const resolvedValue: number | null =
    typeof valueFromAnalysis === "number" && Number.isFinite(valueFromAnalysis)
      ? valueFromAnalysis
      : kpiValue;
  const valueStr =
    resolvedValue !== null
      ? formatKpiValue(def.unit, resolvedValue)
      : "non disponible";
  const diagnostic = getKpiDiagnostic(resolvedValue, def.thresholds);

  return [
    `L'utilisateur a cliqué depuis le KPI "${kpiId}" (${def.label}).`,
    `Sa valeur actuelle : ${valueStr}.`,
    `Diagnostic vs. seuils : ${diagnostic}.`,
    `Formule : ${def.formula}.`,
    `Tooltip : ${def.tooltip.explanation}`,
  ].join("\n");
}

function buildGuardrailsSection(): string {
  return [
    "- Périmètre exclusivement financier : analyse comptable, trésorerie, marges, ratios. Pas de conseil juridique, fiscal ou patrimonial — redirige vers un expert-comptable ou un avocat.",
    "- Ne cite JAMAIS de chiffres absents de <donnees_kpi>. Si une valeur manque, dis-le explicitement plutôt que de l'inventer.",
    "- Si la question sort du périmètre financier (RH, marketing, légal pur), réponds que ce n'est pas ton domaine et redirige.",
    "- Vouvoiement systématique. Pas de tutoiement.",
    "- Pas de conseil d'investissement personnel ni de recommandation d'achat/vente d'actions.",
  ].join("\n");
}

function buildMultiQuestionsSection(): string {
  return [
    "Si l'utilisateur pose PLUSIEURS questions dans un même message (détectables",
    "par : présence de plusieurs \"?\", listes \"1) 2) 3)\", ou plusieurs sujets",
    "distincts) :",
    "",
    "- TRAITE TOUTES LES QUESTIONS — n'en ignore AUCUNE",
    "- Structure ta réponse avec un sous-titre par question (## Question 1,",
    "  ## Question 2, etc., ou ## EBITDA, ## BFR, ## Endettement... selon le",
    "  sujet)",
    "- Sois plus concis sur chaque question pour tenir dans la longueur (80-120",
    "  mots par question)",
    "- Termine par UNE seule action prioritaire commune (pas une par question)",
    "",
    "Si tu n'arrives vraiment pas à traiter toutes les questions correctement,",
    "réponds TRANSPARENT à l'utilisateur en début de message :",
    "\"Vous m'avez posé X questions à la fois. Pour vous donner une réponse de",
    "qualité, je vais traiter [LISTE DES QUESTIONS QUE TU TRAITES]. Pour",
    "approfondir [QUESTION RESTANTE], posez-la dans un message dédié.\"",
    "",
    "Puis traite les questions énumérées. N'ignore JAMAIS silencieusement une",
    "question.",
  ].join("\n");
}

function buildOutputFormatSection(userLevel: UserLevel): string {
  return [
    "Format : markdown structuré",
    "Longueur : adapte-toi à la complexité de la question",
    "",
    "- Question simple (1 KPI, demande de chiffre) : 100-200 mots maximum",
    "- Question analytique (causes, comparaison, synthèse) : 300-500 mots maximum",
    "- Question multi-points (3 actions, 2 leviers...) : COMPLÈTE TOUS LES POINTS",
    "  PROMIS, ne laisse JAMAIS une liste incomplète",
    "",
    "Structure pour les questions multi-points : utilise des sous-titres clairs",
    "(## 1. Titre / ## 2. Titre / ## 3. Titre) et chiffre chaque point.",
    "",
    "Cite toujours les chiffres réels avec leur unité (€, %, jours...).",
    "Termine TOUJOURS par 1 action concrète à l'impératif réalisable en moins de",
    "90 jours.",
    "",
    "Si tu manques de place, RACCOURCIS les détails de chaque point — ne supprime",
    "AUCUN point promis.",
    "",
    `Adapte la profondeur et le ton au niveau "${userLevel}" décrit dans <role>.`,
  ].join("\n");
}

function formatKpiValue(unit: string, value: number): string {
  switch (unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "days":
      return `${Math.round(value)} jours`;
    case "ratio":
      return formatNumber(value, 2);
    case "score":
      return `${Math.round(value)}/100`;
    default:
      return formatNumber(value, 2);
  }
}
