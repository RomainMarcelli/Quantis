// File: lib/ai/aiService.test.ts
// Role: tests unitaires du MockAiService et de la factory `getAiService`.
// On ne teste PAS le ClaudeAiService de bout en bout (ça nécessiterait un
// mock du SDK Anthropic — overkill pour ce premier MVP).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MockAiService,
  getAiService,
  setAiServiceOverride,
  type AiService,
} from "@/lib/ai/aiService";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";

function emptyKpis(): CalculatedKpis {
  return {
    tcam: null, va: null, ebitda: null, ebe: null, marge_ebitda: null,
    charges_var: null, mscv: null, tmscv: null, ca: null,
    charges_fixes: null, point_mort: null, ratio_immo: null,
    bfr: null, rot_bfr: null, dso: null, dpo: null, rot_stocks: null,
    caf: null, fte: null, tn: null, solvabilite: null, gearing: null,
    liq_gen: null, liq_red: null, liq_imm: null, disponibilites: null,
    roce: null, roe: null, effet_levier: null, resultat_net: null,
    grossMarginRate: null, netProfit: null, workingCapital: null,
    monthlyBurnRate: null, cashRunwayMonths: null,
    capacite_remboursement_annees: null, etat_materiel_indice: null,
    healthScore: null,
  };
}

function fakeAnalysis(kpis: Partial<CalculatedKpis>): AnalysisRecord {
  return {
    id: "an-1",
    userId: "user-1",
    folderName: "Test",
    createdAt: "2026-04-30T00:00:00.000Z",
    fiscalYear: 2025,
    sourceFiles: [],
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData: {} as AnalysisRecord["mappedData"],
    financialFacts: {
      revenue: null, expenses: null, payroll: null,
      treasury: null, receivables: null, payables: null, inventory: null,
    },
    kpis: { ...emptyKpis(), ...kpis },
    quantisScore: null,
    uploadContext: null,
  };
}

describe("MockAiService", () => {
  it("retourne une réponse non vide en mode 'mock'", async () => {
    const svc = new MockAiService(0); // pas de latence en test
    const r = await svc.ask({
      question: "Pourquoi mon EBITDA ?",
      kpiId: "ebitda",
      analysis: fakeAnalysis({ ebitda: -50_000 }),
      userLevel: "intermediate",
    });
    expect(r.mode).toBe("mock");
    expect(r.answer.length).toBeGreaterThan(50);
  });

  it("différencie EBITDA positif vs négatif (overrides manuels)", async () => {
    const svc = new MockAiService(0);
    const negative = await svc.ask({
      question: "x",
      kpiId: "ebitda",
      analysis: fakeAnalysis({ ebitda: -50_000 }),
      userLevel: "intermediate",
    });
    const positive = await svc.ask({
      question: "x",
      kpiId: "ebitda",
      analysis: fakeAnalysis({ ebitda: 100_000 }),
      userLevel: "intermediate",
    });
    expect(negative.answer).not.toBe(positive.answer);
    expect(negative.answer.toLowerCase()).toMatch(/n[ée]gatif|consomme/);
  });

  it("adapte le ton selon le niveau utilisateur", async () => {
    const svc = new MockAiService(0);
    const beginner = await svc.ask({
      question: "x", kpiId: "ca",
      analysis: fakeAnalysis({ ca: 1_200_000 }),
      userLevel: "beginner",
    });
    const expert = await svc.ask({
      question: "x", kpiId: "ca",
      analysis: fakeAnalysis({ ca: 1_200_000 }),
      userLevel: "expert",
    });
    expect(beginner.answer).not.toBe(expert.answer);
    // Le mock pour CA inclut un intro qui change selon le niveau
    expect(beginner.answer.toLowerCase()).toMatch(/simplement|reprenons/);
    expect(expert.answer.toLowerCase()).toMatch(/analyse rapide/);
  });

  it("utilise le builder générique pour un KPI sans override manuel", async () => {
    const svc = new MockAiService(0);
    const r = await svc.ask({
      question: "x",
      kpiId: "solvabilite",
      analysis: fakeAnalysis({ solvabilite: 0.4 }),
      userLevel: "intermediate",
    });
    // Label du KPI — comparaison case-insensitive car le label peut s'écrire
    // "Ratio de solvabilité" (s minuscule) selon la version du builder.
    expect(r.answer.toLowerCase()).toContain("solvabilité");
    expect(r.answer).toMatch(/0,4(?!\d)/); // formaté en français (formatNumber → "0,4")
  });

  it("dégrade proprement quand l'analyse est null (pas de KPI focus)", async () => {
    const svc = new MockAiService(0);
    const r = await svc.ask({
      question: "Bonjour",
      kpiId: null,
      analysis: null,
      userLevel: "intermediate",
    });
    expect(r.mode).toBe("mock");
    expect(r.answer.length).toBeGreaterThan(20);
  });

  it("askStream() yield la même réponse que ask() en fragments", async () => {
    const svc = new MockAiService(0);
    const params = {
      question: "Pourquoi mon EBITDA ?",
      kpiId: "ebitda" as const,
      analysis: fakeAnalysis({ ebitda: -50_000 }),
      userLevel: "intermediate" as const,
    };
    const full = await svc.ask(params);
    let streamed = "";
    let chunkCount = 0;
    for await (const chunk of svc.askStream(params)) {
      streamed += chunk;
      chunkCount += 1;
    }
    expect(streamed).toBe(full.answer);
    // Le mock split par espaces — au moins quelques chunks pour un mock typique.
    expect(chunkCount).toBeGreaterThan(5);
  });

  it("respecte la latence configurée", async () => {
    const svc = new MockAiService(50);
    const start = Date.now();
    await svc.ask({
      question: "x", kpiId: null, analysis: null, userLevel: "intermediate",
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});

describe("getAiService factory", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    setAiServiceOverride(null);
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("retourne MockAiService quand aucune clé n'est configurée", () => {
    const svc = getAiService();
    expect(svc).toBeInstanceOf(MockAiService);
  });

  it("respecte l'override pour les tests", () => {
    const fake: AiService = {
      ask: vi.fn().mockResolvedValue({ answer: "x", mode: "mock" }),
      askStream: async function* () {
        yield "x";
      },
    };
    setAiServiceOverride(fake);
    expect(getAiService()).toBe(fake);
  });

  it("instancie ClaudeAiService quand une clé est présente", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-fake";
    const svc = getAiService();
    expect(svc).not.toBeInstanceOf(MockAiService);
  });
});
