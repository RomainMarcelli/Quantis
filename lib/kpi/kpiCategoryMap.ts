// File: lib/kpi/kpiCategoryMap.ts
// Role: regroupe les KPIs du registre par catégorie pour alimenter le picker
// du dashboard personnalisable. Lit `KpiDefinition.category` du registre
// central (lib/kpi/kpiRegistry.ts) et expose des helpers de listing/filtre.
//
// Phase 1 : 5 catégories d'analyse financière (registre existant).
// Phase 2 ajoutera : "bilan" + "compte_resultat" (variables MappedFinancialData
// brutes, hors registre KPI calculé).

import { KPI_REGISTRY, type KpiDefinition } from "@/lib/kpi/kpiRegistry";
import {
  SYNTHESE_WIDGET_CATALOG,
  type SyntheseWidgetDefinition
} from "@/lib/dashboard/syntheseWidgetCatalog";
import {
  listRawVariablesBySource,
  RAW_VARIABLE_CATALOG,
  type RawVariableDefinition
} from "@/lib/dashboard/rawVariableCatalog";
import type { WidgetCategory } from "@/types/dashboard";

/** Groupe visuel dans le picker — sépare les catégories en 4 macro-buckets
 *  (indicateurs métier, états financiers bruts, pilotage contextuel,
 *  personnalisé pour les widgets construits par l'utilisateur). */
export type WidgetCategoryGroup =
  | "indicateurs"
  | "etats_financiers"
  | "pilotage"
  | "personnalise";

export type WidgetCategoryDefinition = {
  id: WidgetCategory;
  label: string;
  description: string;
  group: WidgetCategoryGroup;
};

export const WIDGET_CATEGORY_GROUPS: Array<{ id: WidgetCategoryGroup; label: string }> = [
  { id: "indicateurs", label: "Indicateurs" },
  { id: "etats_financiers", label: "États financiers" },
  { id: "pilotage", label: "Pilotage" },
  { id: "personnalise", label: "Personnalisé" },
];

// Forme uniforme pour le picker — accepte à la fois des KpiDefinition (du
// registre) et des SyntheseWidgetDefinition (catalogue synthétique). Le picker
// n'a besoin que de id + label + shortLabel.
export type PickerEntry = {
  id: string;
  label: string;
  shortLabel: string;
};

// Ordre = ordre d'affichage dans le picker. Groupé en 3 macro-buckets :
// Indicateurs (KPIs métier) → États financiers (raw) → Pilotage (contextuel).
// L'id "synthese" est conservé en interne pour la rétro-compat Firestore —
// seul le label affiché bascule à "Pilotage".
export const WIDGET_CATEGORIES: WidgetCategoryDefinition[] = [
  // ── Indicateurs ──
  {
    id: "creation_valeur",
    group: "indicateurs",
    label: "Création de valeur",
    description: "Ce que l'activité produit : CA, VA, EBITDA, marges."
  },
  {
    id: "investissement",
    group: "indicateurs",
    label: "Investissement & BFR",
    description: "Cycle d'exploitation : BFR, DSO, DPO, immobilisations."
  },
  {
    id: "financement",
    group: "indicateurs",
    label: "Financement",
    description: "Structure financière : CAF, gearing, solvabilité, liquidité."
  },
  {
    id: "rentabilite",
    group: "indicateurs",
    label: "Rentabilité",
    description: "Retour sur capitaux : ROE, ROCE, effet de levier."
  },
  {
    id: "tresorerie",
    group: "indicateurs",
    label: "Trésorerie & Liquidité",
    description: "Cash disponible, runway, burn rate."
  },

  // ── États financiers (variables brutes) ──
  {
    id: "bilan",
    group: "etats_financiers",
    label: "Bilan",
    description: "Variables brutes du bilan : actif, passif, capitaux propres."
  },
  {
    id: "compte_resultat",
    group: "etats_financiers",
    label: "Compte de résultat",
    description: "Variables brutes du CDR : produits, charges, résultat."
  },

  // ── Pilotage (widgets contextuels Vyzor) ──
  {
    id: "synthese",
    group: "pilotage",
    label: "Pilotage",
    description: "Score Vyzor, recommandation, alertes, plan d'action."
  },

  // ── Personnalisé (builder libre — multi-séries) ──
  {
    id: "personnalise",
    group: "personnalise",
    label: "Personnalisé",
    description: "Composez vos propres widgets en combinant plusieurs KPIs."
  },
];

// Catégories du registre KPI hors picker (Phase 1) : "score" reste invisible
// car healthScore est rendu dans son propre VyzorScoreCard, pas dans la grille.
const HIDDEN_CATEGORIES = new Set(["score"]);

// IDs alias du registre — KPIs qui partagent label/valeur avec un autre id
// canonique mais existent pour des raisons historiques (tooling premium qui
// référençait des nomenclatures anglo-saxonnes ou françaises selon le call-site).
// On les masque du picker pour éviter les doublons visuels du type
// "Excédent brut d'exploitation / EBE" listé deux fois (ebitda + ebe).
//   - ebitda → ebe (alias français, même valeur)
//   - resultat_net → netProfit (alias EN, même valeur)
//   - bfr → workingCapital (alias EN, même valeur)
const ALIAS_KPI_IDS = new Set(["ebitda", "netProfit", "workingCapital"]);

// Convertit une SyntheseWidgetDefinition en PickerEntry uniforme.
function toEntryFromSynthese(def: SyntheseWidgetDefinition): PickerEntry {
  return { id: def.id, label: def.label, shortLabel: def.shortLabel };
}

// Convertit une KpiDefinition en PickerEntry uniforme.
function toEntryFromKpi(def: KpiDefinition): PickerEntry {
  return { id: def.id, label: def.label, shortLabel: def.shortLabel };
}

// Convertit une RawVariableDefinition en PickerEntry uniforme.
function toEntryFromRaw(def: RawVariableDefinition): PickerEntry {
  return { id: def.id, label: def.label, shortLabel: def.shortLabel };
}

// Liste les widgets disponibles pour une catégorie donnée. Le picker affiche
// la même UI quel que soit le type sous-jacent (KPI registre, widget synthèse
// ou variable brute MappedFinancialData).
export function listKpisByCategory(category: WidgetCategory): PickerEntry[] {
  if (category === "synthese") {
    return SYNTHESE_WIDGET_CATALOG.map(toEntryFromSynthese);
  }
  if (category === "bilan" || category === "compte_resultat") {
    return listRawVariablesBySource(category).map(toEntryFromRaw);
  }
  if (category === "personnalise") {
    // Catégorie spéciale : pas de liste pré-faite — le picker bascule
    // sur un BUILDER (constructeur libre). Voir KpiPickerDrawer.
    return [];
  }
  return Object.values(KPI_REGISTRY)
    .filter((def) =>
      def.category === category
      && !HIDDEN_CATEGORIES.has(def.category)
      && !ALIAS_KPI_IDS.has(def.id),
    )
    .map(toEntryFromKpi);
}

// Retourne tous les widgets visibles dans le picker, toutes catégories confondues.
// Sert à la recherche globale (search input qui traverse les catégories).
export function listAllPickerKpis(): PickerEntry[] {
  return [
    ...SYNTHESE_WIDGET_CATALOG.map(toEntryFromSynthese),
    ...RAW_VARIABLE_CATALOG.map(toEntryFromRaw),
    ...Object.values(KPI_REGISTRY)
      .filter((def) => !HIDDEN_CATEGORIES.has(def.category) && !ALIAS_KPI_IDS.has(def.id))
      .map(toEntryFromKpi)
  ];
}

// Compte le nombre de KPIs disponibles dans une catégorie — utilisé pour
// afficher le badge "12" à côté du nom de catégorie dans le picker.
export function countKpisInCategory(category: WidgetCategory): number {
  return listKpisByCategory(category).length;
}
