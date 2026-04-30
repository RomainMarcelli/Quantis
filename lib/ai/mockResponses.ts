// File: lib/ai/mockResponses.ts
// Role: réponses pré-générées renvoyées par `MockAiService` tant qu'aucune
// clé Anthropic n'est configurée. Le but : pouvoir développer/démontrer
// l'UX de bout en bout sans appel réseau ni coût API.
//
// ─── Choix d'architecture ────────────────────────────────────────────────
//
// Plutôt que d'écrire à la main 35 paragraphes (un par KPI × 2 diagnostics),
// on s'appuie sur le `kpiRegistry` qui contient déjà la définition, le
// `goodSign`, le `badSign` et le benchmark. La fonction `getMockResponse`
// assemble dynamiquement un texte réaliste à partir de ces briques + la
// valeur courante du KPI. Avantages :
//   - aucune duplication avec le registre (single source of truth)
//   - tout nouveau KPI ajouté au registre est couvert automatiquement
//   - on garde un contenu spécifique au KPI (pas un texte générique)
//
// Pour les 5 KPIs les plus consultés (CA, EBITDA, BFR, DSO, runway), on
// surcharge avec un paragraphe écrit à la main, plus chaleureux et nuancé,
// pour donner l'impression d'un vrai analyste.

import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { getKpiDiagnostic, type KpiDiagnostic } from "@/lib/kpi/kpiDiagnostic";
import { formatCurrency, formatPercent, formatNumber } from "@/components/dashboard/formatting";
import type { UserLevel } from "@/lib/ai/types";

type MockContext = {
  kpiId: string | null;
  question: string;
  value: number | null | undefined;
  userLevel: UserLevel;
};

/** Formatte une valeur numérique selon l'unité du KPI. */
function formatKpiValue(unit: string, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "non disponible";
  }
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

/**
 * Tonalité d'introduction selon le niveau utilisateur. Permet de visualiser
 * concrètement l'effet du `userLevel` dans la réponse, même en mock.
 */
function intro(level: UserLevel, label: string): string {
  switch (level) {
    case "beginner":
      return `Reprenons votre **${label}** simplement.`;
    case "expert":
      return `Analyse rapide sur votre **${label}**.`;
    default:
      return `Voici ce que dit votre **${label}**.`;
  }
}

/**
 * Texte conclusif selon le diagnostic. Court, actionnable, vouvoiement.
 */
function actionLine(diagnostic: KpiDiagnostic): string {
  switch (diagnostic) {
    case "good":
      return "Continuez sur cette dynamique — surveillez juste que rien ne se dégrade côté charges.";
    case "warning":
      return "Pas d'alerte rouge, mais il y a de la marge à reprendre — un point mensuel suffit pour ne pas dériver.";
    case "danger":
      return "C'est le moment d'agir : isolez le poste qui pèse le plus et fixez-vous une cible à 90 jours.";
    default:
      return "On manque de recul pour trancher — observez l'évolution sur les 3 prochains mois.";
  }
}

/**
 * Construit le corps de réponse depuis le registre. Utilisé par défaut pour
 * tous les KPIs sauf ceux surchargés ci-dessous.
 */
function buildGenericResponse(ctx: MockContext): string {
  const def = ctx.kpiId ? getKpiDefinition(ctx.kpiId) : null;
  if (!def) {
    return [
      "Je peux vous aider à analyser un de vos indicateurs financiers : EBITDA, BFR, DSO, trésorerie, score de santé...",
      "",
      "Cliquez sur l'icône ✨ d'un KPI pour démarrer une discussion contextualisée.",
    ].join("\n");
  }

  const diagnostic = getKpiDiagnostic(ctx.value, def.thresholds);
  const valueStr = formatKpiValue(def.unit, ctx.value);
  const signal =
    diagnostic === "good"
      ? def.tooltip.goodSign
      : diagnostic === "warning" || diagnostic === "danger"
        ? def.tooltip.badSign
        : def.tooltip.explanation;

  const benchmarkLine = def.tooltip.benchmark
    ? `\n\n*Repère sectoriel* : ${def.tooltip.benchmark}`
    : "";

  return [
    intro(ctx.userLevel, def.label),
    "",
    `Valeur actuelle : **${valueStr}**.`,
    "",
    signal,
    benchmarkLine,
    "",
    actionLine(diagnostic),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

/**
 * Surcharges manuelles pour les KPIs les plus consultés.
 * Reçoivent le contexte complet et peuvent produire du markdown plus riche.
 */
const MANUAL_OVERRIDES: Record<string, (ctx: MockContext) => string> = {
  ca: (ctx) => {
    const valueStr = formatKpiValue("currency", ctx.value);
    return [
      intro(ctx.userLevel, "Chiffre d'affaires"),
      "",
      `Votre CA s'établit à **${valueStr}** sur la période. C'est le point de départ de toute analyse — il dit combien votre entreprise a facturé, pas encore combien elle a gardé.`,
      "",
      "Trois questions à se poser pour interpréter cette valeur :",
      "",
      "1. **Tendance** : en croissance vs. l'exercice précédent ? Quel rythme ?",
      "2. **Concentration** : top 3 clients = quelle part du total ?",
      "3. **Saisonnalité** : la période choisie est-elle représentative ?",
      "",
      "Pour aller plus loin, demandez-moi *\"Quels leviers pour relancer mon CA ?\"* ou *\"Comment ma marge se compare au secteur ?\"*.",
    ].join("\n");
  },

  ebitda: (ctx) => {
    const valueStr = formatKpiValue("currency", ctx.value);
    const isPositive = typeof ctx.value === "number" && ctx.value > 0;
    if (isPositive) {
      return [
        intro(ctx.userLevel, "EBITDA"),
        "",
        `Votre EBITDA s'élève à **${valueStr}** — l'activité dégage donc du cash avant amortissements et impôts. C'est le signal qu'on attend d'une entreprise saine sur son cœur de métier.`,
        "",
        "**Pour amplifier ce résultat sans gonfler les charges**, regardez d'abord :",
        "- Le mix produit/service : les marges sont-elles homogènes, ou un segment porte-t-il l'autre ?",
        "- La masse salariale rapportée à la VA (idéalement < 70%).",
        "- Les autres charges externes : sous-traitance, marketing, conseils — postes typiquement compressibles de 5 à 15%.",
        "",
        "Question à creuser : *\"Mon EBITDA croît-il aussi vite que mon CA ?\"* Si non, la marge s'érode.",
      ].join("\n");
    }
    return [
      intro(ctx.userLevel, "EBITDA"),
      "",
      `Votre EBITDA est négatif à **${valueStr}**. L'activité courante consomme plus qu'elle ne produit — ce n'est pas tenable longtemps.`,
      "",
      "**Par où commencer pour redresser ?** Trois pistes par ordre d'impact :",
      "",
      "1. **Marge brute** : vos achats représentent quelle part du CA ? Toute renégociation fournisseur ou hausse tarifaire de 2-3% peut suffire à basculer.",
      "2. **Charges fixes** : identifiez les postes non-essentiels (déplacements, prestations, abonnements logiciels) — souvent 10-15% compressibles à court terme.",
      "3. **Mix client** : un ou deux clients à très faible marge peuvent suffire à plomber le résultat global. Refacturez ou écartez.",
      "",
      "Cible réaliste : repasser au-dessus de 0 sous 6-9 mois, en ciblant 5-8% de marge EBITDA dans 12-18 mois.",
    ].join("\n");
  },

  bfr: (ctx) => {
    const valueStr = formatKpiValue("currency", ctx.value);
    return [
      intro(ctx.userLevel, "BFR"),
      "",
      `Votre besoin en fonds de roulement est de **${valueStr}**. Concrètement, c'est le cash immobilisé par votre cycle d'exploitation : argent payé d'avance aux fournisseurs ou en attente d'encaissement chez les clients.`,
      "",
      "**Trois leviers immédiats pour le faire baisser** :",
      "",
      "- **Accélérer le DSO** : relances automatiques à J+5, J+15, J+30. Un acompte de 30% à la commande sur les nouveaux contrats change radicalement le profil.",
      "- **Étaler le DPO** : négociez 60 jours net sur vos plus gros postes (logiciels, transport, sous-traitants). Beaucoup acceptent en échange d'un volume garanti.",
      "- **Rationaliser le stock** : la moitié des stocks d'une PME pèse 80% du cash bloqué. Identifiez les SKU qui dorment depuis > 6 mois.",
      "",
      "Une baisse de 10 jours de rotation libère environ 3% du CA en trésorerie.",
    ].join("\n");
  },

  dso: (ctx) => {
    const valueStr = formatKpiValue("days", ctx.value);
    const days = typeof ctx.value === "number" ? ctx.value : 0;
    const tone = days > 90 ? "alerte" : days > 60 ? "vigilance" : "sain";
    return [
      intro(ctx.userLevel, "DSO"),
      "",
      `Vos clients paient en moyenne à **${valueStr}**. Diagnostic : ${tone}.`,
      "",
      "**Comment relancer sans casser la relation** :",
      "",
      "- **Automatiser** : un mail de rappel à J+5 (avant échéance) puis J+15 (après) — la grande majorité des retards sont involontaires.",
      "- **Segmenter** : isolez les 3-5 clients qui pèsent le plus dans votre encours. Ce sont eux qu'il faut traiter en priorité, par téléphone, pas par mail.",
      "- **Conditionner** : pour les nouveaux contrats, exigez un acompte ou une caution. C'est devenu standard, personne ne le refusera.",
      "",
      "Cible : revenir sous 45 jours en BtoB, sous 30 jours pour le service pur. Chaque tranche de 10 jours regagnée = ~3% du CA en cash libéré.",
    ].join("\n");
  },

  cashRunwayMonths: (ctx) => {
    const months = typeof ctx.value === "number" ? ctx.value : 0;
    const valueStr = formatKpiValue("ratio", ctx.value);
    if (months <= 0 || !Number.isFinite(months)) {
      return [
        intro(ctx.userLevel, "Runway"),
        "",
        "Votre runway n'est pas calculable — soit votre activité est rentable (pas de burn), soit les données manquent. Vérifiez d'abord votre **résultat net mensuel** et vos **disponibilités**.",
      ].join("\n");
    }
    const tone = months >= 18 ? "très confortable" : months >= 12 ? "confortable" : months >= 6 ? "acceptable" : "tendu";
    return [
      intro(ctx.userLevel, "Runway"),
      "",
      `À votre rythme actuel de consommation de cash, vous avez **${valueStr} mois** de visibilité — situation ${tone}.`,
      "",
      months < 12
        ? "**Trois questions à trancher dans les 90 jours** :"
        : "**Trois pistes d'allocation à explorer** :",
      "",
      months < 12
        ? "1. **Lever** : un seed bridge / dette bancaire est-il accessible ? Préparez un dossier maintenant, pas dans 4 mois.\n2. **Vendre plus** : le levier le plus rapide est la hausse de prix sur les nouveaux clients (5-10% passent généralement sans churn).\n3. **Réduire les coûts** : ciblez 15-20% de baisse sur les 3 plus gros postes hors masse salariale."
        : "1. **Croissance** : embauche commerciale, marketing, R&D — ROI à 12-18 mois.\n2. **Sécurité** : conserver 12 mois minimum quoi qu'il arrive, placer l'excédent sur un compte rémunéré court terme.\n3. **Distribution** : remontée partielle aux actionnaires si la trajectoire est prouvée.",
      "",
      "Demandez-moi de *simuler une embauche* ou *une hausse de prix* pour voir l'impact direct sur ce runway.",
    ].join("\n");
  },
};

/**
 * Point d'entrée principal : retourne la réponse mock pour un contexte donné.
 * Si le `kpiId` n'a pas de surcharge manuelle, on tombe sur la version
 * générique construite depuis le registre.
 */
export function getMockResponse(ctx: MockContext): string {
  if (ctx.kpiId && MANUAL_OVERRIDES[ctx.kpiId]) {
    return MANUAL_OVERRIDES[ctx.kpiId]!(ctx);
  }
  return buildGenericResponse(ctx);
}

/**
 * Latence simulée (ms). Exporté pour permettre aux tests d'imposer 0 ms
 * et ne pas allonger inutilement la suite de tests.
 */
export const MOCK_LATENCY_MS = 1500;
