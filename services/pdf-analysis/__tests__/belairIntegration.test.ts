import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, type DocumentAIResponse } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";
import { detectCdrLayout } from "@/services/pdf-analysis/rowReconstruction";

// Test d'intégration BEL AIR — référence de non-régression pour le parser.
//
// Source : fixture JSON générée depuis la réponse Document AI réelle sur
// "BEL AIR FASHION B. AIR - Comptes sociaux 2024réduis.pdf" (voir
// belair-cdr-diagnostic.test.ts avec SAVE_BELAIR_FIXTURE=true).
//
// Ce test N'APPELLE PAS l'API Document AI — il rejoue la fixture locale.
// Tout futur fix du parser doit faire passer ce test.
//
// Limites connues (DBG-008) :
//   autres_creances et dispo sont bloqués par le layout column-major du bilan
//   actif BEL AIR (pas de signal de cohésion exploitable). Les valeurs attendues
//   ci-dessous reflètent l'état actuel fragile du parser sur ces champs, pas la
//   réalité comptable. À débloquer quand DBG-008 sera résolu.

function loadBelairFixture(): DocumentAIResponse {
  const fixturePath = join(process.cwd(), "services/pdf-analysis/fixtures/belair-docai.json");
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as DocumentAIResponse;
}

describe("BEL AIR integration — fixture replay", () => {
  const document = loadBelairFixture();
  const analysis = analyzeFinancialDocument(document);
  const parsed = analysis.parsedFinancialData;
  const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);
  const kpis = computeKpis(mapped);

  it("détecte le layout CDR standard depuis les ancres rawText", () => {
    const layout = detectCdrLayout(analysis.rows);
    expect(layout).toBe("standard");
  });

  it("extrait les 6 critiques (CDR + bilan)", () => {
    expect(parsed.incomeStatement.netTurnover).toBe(3370595);
    expect(parsed.incomeStatement.totalOperatingCharges).toBe(7736512);
    expect(parsed.incomeStatement.netResult).toBe(-2657615);
    expect(parsed.balanceSheet.totalAssets).toBe(9808846);
    expect(parsed.balanceSheet.equity).toBe(4002315);
    expect(parsed.balanceSheet.debts).toBe(5806530);
  });

  it("extrait les champs CDR en layout standard (col1 = N)", () => {
    expect(mapped.ace).toBe(2021227);
    expect(mapped.salaires).toBe(1322825);
    expect(mapped.charges_soc).toBe(333335);
    expect(mapped.dap).toBe(39108);
    expect(mapped.prod_excep).toBe(29082);
    expect(mapped.charges_excep).toBe(944845);
    expect(mapped.total_prod_expl).toBe(6008761);
  });

  it("extrait les champs bilan avec netPriority fix Brut−Amort", () => {
    expect(mapped.stocks_march).toBe(1925516);
    expect(mapped.avances_vers_actif).toBe(9307);
    expect(mapped.clients).toBe(9307);
  });

  it("débloque dettes_fisc_soc via sublineSum raw-text (CIBLE 1 Lot 5)", () => {
    expect(mapped.dettes_fisc_soc).toBe(1031944);
  });

  it("débloque prod_vendue via allowSmallValues sur lookahead (CIBLE 3 Lot 5)", () => {
    expect(parsed.incomeStatement.productionSoldServices).toBe(74);
    expect(mapped.prod_vendue).toBe(-7031);
  });

  it("KPIs de référence sur BEL AIR (post Lot 5)", () => {
    expect(kpis.ca).toBe(3377626);
    expect(kpis.resultat_net).toBe(-2657615);
    expect(kpis.ebitda).toBe(1763741);
    expect(kpis.va).toBe(3497498);
  });

  // DBG-008 — snapshots de l'état actuel fragile du bilan actif column-major.
  // Ces valeurs sont INCORRECTES mais stables. Elles ne doivent pas régresser
  // en attendant la résolution de DBG-008 (table structurée Document AI requise).
  it("DBG-008 : snapshot des champs fragiles du bilan actif", () => {
    expect(mapped.autres_creances).toBe(30768);
    expect(mapped.dispo).toBe(16458);
  });
});
