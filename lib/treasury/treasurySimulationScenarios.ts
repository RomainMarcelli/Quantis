// File: lib/treasury/treasurySimulationScenarios.ts
// Role: scénarios de simulation TRÉSORERIE — branchés sur le moteur Bridge,
// pas sur computeKpis. Volontairement séparés de `lib/simulation/simulationEngine.ts`
// (qui consomme `MappedFinancialData` comptable et applique des deltas sur
// les variables 2033-SD).
//
// Les scénarios trésorerie sont consommés directement par les widgets front
// qui appellent `treasuryEngine.stressTest()` ou `projectBalance()` avec
// les paramètres saisis par l'utilisateur. Pas de réutilisation possible
// avec le moteur comptable — les pipelines sont disjoints.

import type { RecurringTransaction } from "@/types/treasury";

export type TreasuryLeverType = "percent" | "absolute" | "select_recurring";

export type TreasuryLever = {
  /** Identifiant interne du levier (sert de clé dans le widget). */
  id: string;
  /** Libellé affiché. */
  label: string;
  type: TreasuryLeverType;
  /** Pour percent/absolute. */
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  /** Pour select_recurring : filtre les récurrences candidates. */
  recurringFilter?: (r: RecurringTransaction) => boolean;
};

export type TreasurySimulationScenario = {
  id: string;
  label: string;
  description: string;
  /** Icône emoji ou lucide identifier (libre côté front). */
  icon: string;
  /** Type de scénario — pilote la fonction du moteur appelée côté front :
   *   - "stress_test"        → treasuryEngine.stressTest avec incomeReduction
   *   - "fixed_charges_cut"  → applique un % de réduction sur les récurrences
   *                            détectées comme expense (ratio ajusté)
   *   - "lost_client"        → soustraction d'un montant mensuel des recurring
   */
  type: "stress_test" | "fixed_charges_cut" | "lost_client";
  levers: TreasuryLever[];
};

export const TREASURY_SIMULATION_SCENARIOS: TreasurySimulationScenario[] = [
  {
    id: "stress_test_treasury",
    label: "💸 Stress test trésorerie",
    description:
      "Et si vos encaissements baissaient brutalement ? Simule une chute de revenus sur N mois et observe l'impact sur le runway, la date de passage à zéro et le solde minimum.",
    icon: "AlertTriangle",
    type: "stress_test",
    levers: [
      {
        id: "incomeReduction",
        label: "Baisse des encaissements",
        type: "percent",
        min: -50,
        max: 0,
        step: 5,
        defaultValue: -20,
      },
      {
        id: "durationMonths",
        label: "Durée du stress (mois)",
        type: "absolute",
        min: 1,
        max: 12,
        step: 1,
        defaultValue: 6,
      },
    ],
  },

  {
    id: "renegotiate_fixed_charges",
    label: "🏢 Renégociation des charges fixes",
    description:
      "Identifie automatiquement vos charges récurrentes (loyer, abonnements, prélèvements) et chiffre l'économie d'une renégociation à -X %. Affiche l'impact sur le burn et le runway.",
    icon: "TrendingDown",
    type: "fixed_charges_cut",
    levers: [
      {
        id: "reductionPct",
        label: "Réduction des charges fixes",
        type: "percent",
        min: -30,
        max: 0,
        step: 1,
        defaultValue: -10,
      },
    ],
  },

  {
    id: "lost_recurring_client",
    label: "👤 Perte d'un client récurrent",
    description:
      "Sélectionne un revenu récurrent détecté (ou saisis un montant manuellement) et observe comment sa disparition décale le burn rate net, le runway et la date critique.",
    icon: "UserMinus",
    type: "lost_client",
    levers: [
      {
        id: "lostClient",
        label: "Client récurrent perdu",
        type: "select_recurring",
        recurringFilter: (r) => r.type === "income" && r.frequency === "monthly",
      },
      {
        id: "manualAmount",
        label: "Ou montant mensuel manuel (€)",
        type: "absolute",
        min: 0,
        max: 50000,
        step: 100,
        defaultValue: 0,
      },
    ],
  },
];

export function getTreasuryScenario(id: string): TreasurySimulationScenario | null {
  return TREASURY_SIMULATION_SCENARIOS.find((s) => s.id === id) ?? null;
}
