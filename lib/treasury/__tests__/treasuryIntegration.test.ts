// File: lib/treasury/__tests__/treasuryIntegration.test.ts
// Role: tests d'intégration entre treasuryEngine, kpiRegistry, scénarios
// simulation et le pipeline BankingSummary réel.

import { describe, expect, it } from "vitest";
import {
  analyzeTreasury,
  detectRecurringTransactions,
  stressTest,
} from "@/lib/treasury/treasuryEngine";
import {
  generateMockAccounts,
  generateMockTransactions,
} from "@/lib/treasury/__tests__/fixtures/generateBridgeData";
import {
  TREASURY_SIMULATION_SCENARIOS,
  getTreasuryScenario,
} from "@/lib/treasury/treasurySimulationScenarios";
import { getKpiDefinition } from "@/lib/kpi/kpiRegistry";
import { buildBankingSummary } from "@/services/integrations/adapters/bridge";
import type { BankingSummary } from "@/types/banking";

const ASOF = new Date("2026-05-01T00:00:00Z");

describe("Intégration pipeline BankingSummary", () => {
  it("analyzeTreasury fonctionne sur le format BankingSummary réel", () => {
    const accounts = generateMockAccounts(3, 100);
    const transactions = generateMockTransactions({ count: 200, months: 5, endDate: ASOF, seed: 100 });
    // Construit un vrai BankingSummary via le builder Bridge
    const summary: BankingSummary = buildBankingSummary({
      accounts,
      transactions,
      categories: [],
      asOf: ASOF,
    });
    const analysis = analyzeTreasury(summary, { asOf: ASOF });
    expect(analysis.totalBalance).toBe(summary.totalBalance);
    expect(analysis.recurring).toBeDefined();
    expect(analysis.cashFlow).toBeDefined();
    expect(analysis.healthScore).toBeGreaterThanOrEqual(0);
    expect(analysis.healthScore).toBeLessThanOrEqual(100);
  });

  it("évolution monotone : ajouter des transactions ne fait pas plonger artificiellement le healthScore", () => {
    const accounts = generateMockAccounts(2, 200);
    const txs1 = generateMockTransactions({ count: 100, months: 4, endDate: ASOF, seed: 200 });
    const txs2 = [
      ...txs1,
      ...generateMockTransactions({ count: 100, months: 4, endDate: ASOF, seed: 201 }),
    ];
    const a1 = analyzeTreasury({ accounts, transactions: txs1 } as never, { asOf: ASOF });
    const a2 = analyzeTreasury({ accounts, transactions: txs2 } as never, { asOf: ASOF });
    // Pas de saut absurde : le score ne doit pas varier de plus de 60 points
    // pour un doublement du dataset (les métriques agrégées doivent rester
    // dans le même ordre de grandeur).
    expect(Math.abs(a1.healthScore - a2.healthScore)).toBeLessThanOrEqual(60);
  });
});

describe("Intégration kpiRegistry", () => {
  const KPI_IDS = [
    "bank_runway",
    "bank_burn_net",
    "bank_cashflow_ratio",
    "bank_income_regularity",
    "bank_fixed_charges_ratio",
    "bank_treasury_health",
  ];

  it.each(KPI_IDS)("KPI %s est enregistré dans kpiRegistry", (id) => {
    const def = getKpiDefinition(id);
    expect(def).not.toBeNull();
    expect(def?.label).toBeTruthy();
    expect(def?.tooltip.explanation).toBeTruthy();
    expect(def?.suggestedQuestions.whenGood).toBeTruthy();
    expect(def?.suggestedQuestions.whenBad).toBeTruthy();
  });

  it("les KPIs banking ont la sourceLayer 'banking'", () => {
    for (const id of KPI_IDS) {
      const def = getKpiDefinition(id);
      expect(def?.sourceLayer).toBe("banking");
    }
  });

  it("seuils du runway alignés avec le moteur (3/6/12)", () => {
    const def = getKpiDefinition("bank_runway");
    expect(def?.thresholds?.danger).toBe(3);
    expect(def?.thresholds?.warning).toBe(6);
    expect(def?.thresholds?.good).toBe(12);
  });

  it("les KPIs banking sont calculables depuis TreasuryAnalysis", () => {
    // Boucle pédagogique : on prouve qu'on peut câbler chaque KPI déclaré dans
    // le registre vers une valeur dérivée de TreasuryAnalysis. Ce mapping vit
    // côté front (treasuryAdapter à venir) ; on documente la connexion ici.
    const accounts = generateMockAccounts(2, 300);
    const transactions = generateMockTransactions({ count: 200, months: 5, endDate: ASOF, seed: 300 });
    const analysis = analyzeTreasury({ accounts, transactions } as never, { asOf: ASOF });
    const mappingSpec: Array<{ kpi: string; value: number | null }> = [
      { kpi: "bank_runway", value: analysis.cashFlow.runwayMonths },
      { kpi: "bank_burn_net", value: analysis.cashFlow.burnRateNet },
      { kpi: "bank_cashflow_ratio", value: analysis.cashFlow.cashFlowRatio },
      { kpi: "bank_income_regularity", value: analysis.cashFlow.incomeRegularityIndex },
      { kpi: "bank_fixed_charges_ratio", value: analysis.expenses.fixedChargesRatio },
      { kpi: "bank_treasury_health", value: analysis.healthScore },
    ];
    for (const m of mappingSpec) {
      expect(getKpiDefinition(m.kpi)).not.toBeNull();
      // Tous les KPIs doivent être calculables (number ou null pour runway)
      if (m.value !== null) {
        expect(Number.isFinite(m.value)).toBe(true);
      }
    }
  });
});

describe("Intégration scénarios simulation", () => {
  it("3 scénarios trésorerie enregistrés", () => {
    expect(TREASURY_SIMULATION_SCENARIOS).toHaveLength(3);
    expect(TREASURY_SIMULATION_SCENARIOS.map((s) => s.id)).toEqual([
      "stress_test_treasury",
      "renegotiate_fixed_charges",
      "lost_recurring_client",
    ]);
  });

  it("getTreasuryScenario retourne null pour un id inconnu", () => {
    expect(getTreasuryScenario("unknown")).toBeNull();
    expect(getTreasuryScenario("stress_test_treasury")).not.toBeNull();
  });

  it("scénario stress_test branché sur treasuryEngine.stressTest", () => {
    const accounts = generateMockAccounts(2, 400);
    const txs = generateMockTransactions({ count: 100, months: 5, endDate: ASOF, seed: 400 });
    const recurring = detectRecurringTransactions(txs);
    const projections = stressTest({
      accounts,
      transactions: txs,
      recurring,
      scenario: { incomeReduction: 0.3, durationMonths: 6 },
      asOf: ASOF,
    });
    expect(projections.length).toBe(180); // 6 mois × 30 jours
    expect(projections[0]).toBeDefined();
    expect(typeof projections[0]?.projectedBalance).toBe("number");
  });

  it("scénario lost_client retire bien le montant des récurrences revenu", () => {
    const accounts = generateMockAccounts(1, 500);
    const txs = generateMockTransactions({
      count: 50,
      months: 6,
      endDate: ASOF,
      patterns: [
        { label: "CLIENT A", amount: 5000, dayOfMonth: 5, frequency: "monthly", categoryId: 200 },
        { label: "LOYER", amount: -2000, dayOfMonth: 10, frequency: "monthly", categoryId: 110 },
      ],
      seed: 500,
    });
    const recurring = detectRecurringTransactions(txs);
    const baseline = stressTest({
      accounts,
      transactions: txs,
      recurring,
      scenario: { incomeReduction: 0, durationMonths: 3 },
      asOf: ASOF,
    });
    const withLost = stressTest({
      accounts,
      transactions: txs,
      recurring,
      scenario: { incomeReduction: 0, durationMonths: 3, lostClientAmount: 5000 },
      asOf: ASOF,
    });
    // Le solde final doit être plus bas avec un client perdu
    const baselineEnd = baseline[baseline.length - 1]?.projectedBalance ?? 0;
    const withLostEnd = withLost[withLost.length - 1]?.projectedBalance ?? 0;
    expect(withLostEnd).toBeLessThan(baselineEnd);
  });
});
