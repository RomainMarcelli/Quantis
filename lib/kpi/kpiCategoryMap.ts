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

export type WidgetCategoryDefinition = {
  id: WidgetCategory;
  label: string;
  description: string;
};

// Forme uniforme pour le picker — accepte à la fois des KpiDefinition (du
// registre) et des SyntheseWidgetDefinition (catalogue synthétique). Le picker
// n'a besoin que de id + label + shortLabel.
export type PickerEntry = {
  id: string;
  label: string;
  shortLabel: string;
};

// Ordre = ordre d'affichage dans le picker. "Synthèse" en tête car les
// widgets contextuels (Recommandation, Alertes…) sont les plus utilisés.
export const WIDGET_CATEGORIES: WidgetCategoryDefinition[] = [
  {
    id: "synthese",
    label: "Synthèse",
    description: "Recommandation stratégique, alertes, plan d'action."
  },
  {
    id: "bilan",
    label: "Bilan",
    description: "Variables brutes du bilan : actif, passif, capitaux propres."
  },
  {
    id: "compte_resultat",
    label: "Compte de résultat",
    description: "Variables brutes du CDR : produits, charges, résultat."
  },
  {
    id: "creation_valeur",
    label: "Création de valeur",
    description: "Ce que l'activité produit : CA, VA, EBITDA, marges."
  },
  {
    id: "investissement",
    label: "Investissement & BFR",
    description: "Cycle d'exploitation : BFR, DSO, DPO, immobilisations."
  },
  {
    id: "financement",
    label: "Financement",
    description: "Structure financière : CAF, gearing, solvabilité, liquidité."
  },
  {
    id: "rentabilite",
    label: "Rentabilité",
    description: "Retour sur capitaux : ROE, ROCE, effet de levier."
  },
  {
    id: "tresorerie",
    label: "Trésorerie & Liquidité",
    description: "Cash disponible, runway, burn rate."
  }
];

// Catégories du registre KPI hors picker (Phase 1) : "score" reste invisible
// car healthScore est rendu dans son propre VyzorScoreCard, pas dans la grille.
const HIDDEN_CATEGORIES = new Set(["score"]);

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
  return Object.values(KPI_REGISTRY)
    .filter((def) => def.category === category && !HIDDEN_CATEGORIES.has(def.category))
    .map(toEntryFromKpi);
}

// Retourne tous les widgets visibles dans le picker, toutes catégories confondues.
// Sert à la recherche globale (search input qui traverse les catégories).
export function listAllPickerKpis(): PickerEntry[] {
  return [
    ...SYNTHESE_WIDGET_CATALOG.map(toEntryFromSynthese),
    ...RAW_VARIABLE_CATALOG.map(toEntryFromRaw),
    ...Object.values(KPI_REGISTRY)
      .filter((def) => !HIDDEN_CATEGORIES.has(def.category))
      .map(toEntryFromKpi)
  ];
}

// Compte le nombre de KPIs disponibles dans une catégorie — utilisé pour
// afficher le badge "12" à côté du nom de catégorie dans le picker.
export function countKpisInCategory(category: WidgetCategory): number {
  return listKpisByCategory(category).length;
}
