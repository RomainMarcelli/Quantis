// File: lib/banking/disponibilitesOverride.ts
// Role: helpers purs pour piloter la cohérence du widget "Disponibilités"
// sur /synthese et la visibilité de l'onglet Trésorerie sur /analysis.
//
// Contrat (cf. brief data-sources de l'équipe produit) :
//   - Le solde Bridge ne remplace `disponibilites` QUE si l'utilisateur a
//     explicitement activé Bridge via le toggle de /documents
//     (`activeBankingSource === "bridge"`).
//   - L'onglet Trésorerie n'est rendu QUE si la même condition est vraie ;
//     un bankingSummary historique attaché à une analyse passée n'est plus
//     exploité quand l'utilisateur a désactivé Bridge.
//
// Extraire ces deux décisions dans des fonctions pures permet :
//   - de garantir leur cohérence (même règle des deux côtés)
//   - de les tester sans monter de composant React (≠ KpiTooltip qui dépend
//     de Next/router et casse en SSR)

import type { BankingSource } from "@/types/dataSources";

/**
 * Détermine la valeur de `disponibilites` à afficher sur la Synthèse.
 *
 * Renvoie le solde Bridge live UNIQUEMENT si :
 *   - l'utilisateur a activé Bridge via le toggle (activeBankingSource === "bridge")
 *   - ET une connexion Bridge fournit un solde finite (liveBalance non null)
 *
 * Sinon : renvoie null pour signaler "pas d'override" — l'appelant doit
 * conserver `currentKpis.disponibilites` (qui respecte la TemporalityBar
 * via `recomputeKpisForPeriod`).
 */
export function resolveDisponibilitesOverride(params: {
  activeBankingSource: BankingSource | null;
  liveBalance: number | null;
}): number | null {
  if (params.activeBankingSource !== "bridge") return null;
  if (params.liveBalance === null) return null;
  if (!Number.isFinite(params.liveBalance)) return null;
  return params.liveBalance;
}

/**
 * Détermine si l'onglet Trésorerie doit apparaître sur /analysis.
 *
 * Visible UNIQUEMENT si :
 *   - l'utilisateur a activé Bridge via le toggle (activeBankingSource === "bridge")
 *   - ET (Bridge est connecté côté API OU une analyse antérieure porte un
 *     bankingSummary qui peut alimenter la vue)
 *
 * Sans toggle ON, on retourne false même si Bridge est techniquement connecté
 * — c'est l'engagement du brief "désactiver Bridge masque l'onglet".
 */
export function computeShowTresorerie(params: {
  activeBankingSource: BankingSource | null;
  bridgeConnected: boolean;
  hasBankingSummary: boolean;
}): boolean {
  if (params.activeBankingSource !== "bridge") return false;
  return params.bridgeConnected || params.hasBankingSummary;
}
