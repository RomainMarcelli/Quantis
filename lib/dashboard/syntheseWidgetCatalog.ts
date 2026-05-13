// File: lib/dashboard/syntheseWidgetCatalog.ts
// Role: catalogue des "widgets synthétiques" — sections cockpit (Recommandation
// stratégique, Alertes, Plan d'action) qui ne sont pas des KPIs du registre
// mais des blocs contextuels qui consomment le SyntheseViewModel.
//
// Le picker les liste dans la catégorie "synthese" comme s'ils étaient des
// KPIs ; le `kpiId` est préfixé `synthese:` pour les distinguer côté
// renderer (CustomizableDashboard.renderWidget).

import type { WidgetVizType } from "@/types/dashboard";

export type SyntheseWidgetDefinition = {
  /** id préfixé `synthese:` pour être routable par le renderer. */
  id: string;
  /** Nom long affiché dans le picker (équivalent KpiDefinition.label). */
  label: string;
  /** Nom court (équivalent KpiDefinition.shortLabel). */
  shortLabel: string;
  /** Description courte affichée dans le détail du picker. */
  description: string;
  /** Type de viz forcé — un seul valide pour ces widgets contextuels. */
  vizType: WidgetVizType;
};

export const SYNTHESE_WIDGET_CATALOG: SyntheseWidgetDefinition[] = [
  {
    id: "synthese:score",
    label: "Vyzor Score",
    shortLabel: "Score",
    description:
      "Indicateur synthétique de santé financière : rentabilité, solvabilité, liquidité, efficacité.",
    vizType: "quantisScore"
  },
  {
    id: "synthese:evolution",
    label: "Performance financière",
    shortLabel: "Évolution",
    description:
      "Courbe d'évolution multi-séries : Chiffre d'affaires, EBE et Résultat net sur la période.",
    vizType: "evolutionChart"
  },
  {
    id: "synthese:recommendation",
    label: "Recommandation stratégique",
    shortLabel: "Reco IA",
    description:
      "Bandeau d'agent Vyzor : action prioritaire suggérée à partir de votre santé financière.",
    vizType: "aiInsight"
  },
  {
    id: "synthese:alerts",
    label: "Alertes",
    shortLabel: "Alertes",
    description:
      "Liste des points de vigilance détectés (BFR élevé, EBE négatif, alerte investissement…).",
    vizType: "alertList"
  },
  {
    id: "synthese:actions",
    label: "Plan d'action détaillé",
    shortLabel: "Plan d'action",
    description:
      "Actions concrètes recommandées par Vyzor cette période (recouvrement, relance, BFR…).",
    vizType: "actionList"
  }
];

const ID_TO_DEF = new Map(SYNTHESE_WIDGET_CATALOG.map((d) => [d.id, d]));

export function getSyntheseWidgetDefinition(id: string): SyntheseWidgetDefinition | null {
  return ID_TO_DEF.get(id) ?? null;
}

export function isSyntheseWidgetId(id: string): boolean {
  return id.startsWith("synthese:");
}
