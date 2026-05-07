// File: lib/source/resolveSourceAnalyses.test.ts
// Tests d'intégration de la résolution d'analyses par source active.
// Couvre le flux : changement de source dans /documents → bonne analyse
// retournée pour le dashboard.

import { describe, expect, it } from "vitest";
import {
  filterAnalysesBySource,
  resolveCurrentAnalysisForSource,
} from "@/lib/source/resolveSourceAnalyses";
import type { AnalysisRecord } from "@/types/analysis";

function makeAnalysis(overrides: Partial<AnalysisRecord> & { id: string }): AnalysisRecord {
  return {
    id: overrides.id,
    userId: "u",
    folderName: overrides.folderName ?? "Dossier principal",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    fiscalYear: 2025,
    sourceFiles: [],
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData: {} as never,
    financialFacts: {} as never,
    kpis: {} as never,
    ...overrides,
  } as AnalysisRecord;
}

const pennylane = makeAnalysis({
  id: "p1",
  createdAt: "2026-04-15T00:00:00.000Z",
  sourceMetadata: { type: "dynamic", provider: "pennylane" } as never,
});
const pennylanePrev = makeAnalysis({
  id: "p0",
  createdAt: "2026-01-15T00:00:00.000Z",
  sourceMetadata: { type: "dynamic", provider: "pennylane" } as never,
});
const myunisoft = makeAnalysis({
  id: "m1",
  createdAt: "2026-04-20T00:00:00.000Z",
  sourceMetadata: { type: "dynamic", provider: "myunisoft" } as never,
});
const odoo = makeAnalysis({
  id: "o1",
  createdAt: "2026-04-25T00:00:00.000Z",
  sourceMetadata: { type: "dynamic", provider: "odoo" } as never,
});
const fecCabinetA = makeAnalysis({
  id: "fa1",
  createdAt: "2026-03-10T00:00:00.000Z",
  folderName: "Cabinet A",
  sourceMetadata: { type: "dynamic", provider: "fec" } as never,
});
const fecCabinetB = makeAnalysis({
  id: "fb1",
  createdAt: "2026-04-30T00:00:00.000Z",
  folderName: "Cabinet B",
  sourceMetadata: { type: "dynamic", provider: "fec" } as never,
});
const upload = makeAnalysis({
  id: "u1",
  createdAt: "2026-04-10T00:00:00.000Z",
  folderName: "Cabinet A",
  sourceMetadata: { type: "static", provider: "upload" } as never,
});

const all = [pennylane, pennylanePrev, myunisoft, odoo, fecCabinetA, fecCabinetB, upload];

describe("filterAnalysesBySource", () => {
  it("source = null → tableau vide (pas de fallback implicite)", () => {
    expect(filterAnalysesBySource(all, null)).toEqual([]);
  });

  it("source = pennylane → garde uniquement les Pennylane", () => {
    const filtered = filterAnalysesBySource(all, "pennylane");
    expect(filtered.map((a) => a.id).sort()).toEqual(["p0", "p1"]);
  });

  it("source = myunisoft → garde uniquement MyUnisoft", () => {
    const filtered = filterAnalysesBySource(all, "myunisoft");
    expect(filtered.map((a) => a.id)).toEqual(["m1"]);
  });

  it("source = odoo → garde uniquement Odoo", () => {
    const filtered = filterAnalysesBySource(all, "odoo");
    expect(filtered.map((a) => a.id)).toEqual(["o1"]);
  });

  it("source = fec sans folder → garde tous les fec + uploads", () => {
    const filtered = filterAnalysesBySource(all, "fec");
    expect(filtered.map((a) => a.id).sort()).toEqual(["fa1", "fb1", "u1"]);
  });

  it("source = fec avec folder = Cabinet A → garde uniquement les analyses de Cabinet A", () => {
    const filtered = filterAnalysesBySource(all, "fec", "Cabinet A");
    expect(filtered.map((a) => a.id).sort()).toEqual(["fa1", "u1"]);
  });

  it("source = fec avec folder = Cabinet B → garde uniquement les analyses de Cabinet B", () => {
    const filtered = filterAnalysesBySource(all, "fec", "Cabinet B");
    expect(filtered.map((a) => a.id)).toEqual(["fb1"]);
  });

  it("matching de folder est case-insensitive (Cabinet A == cabinet a)", () => {
    const filtered = filterAnalysesBySource(all, "fec", "cabinet a");
    expect(filtered.map((a) => a.id).sort()).toEqual(["fa1", "u1"]);
  });

  it("source FEC mais folder inconnu → tableau vide (pas de fallback)", () => {
    const filtered = filterAnalysesBySource(all, "fec", "Cabinet Inexistant");
    expect(filtered).toEqual([]);
  });

  it("liste vide en entrée → tableau vide en sortie", () => {
    expect(filterAnalysesBySource([], "pennylane")).toEqual([]);
  });
});

describe("resolveCurrentAnalysisForSource", () => {
  it("retourne la plus récente par createdAt parmi les analyses matchantes", () => {
    const result = resolveCurrentAnalysisForSource(all, "pennylane");
    expect(result?.id).toBe("p1"); // p1 est plus récente que p0
  });

  it("retourne null quand aucune analyse ne matche", () => {
    const justFec = [fecCabinetA, fecCabinetB];
    const result = resolveCurrentAnalysisForSource(justFec, "pennylane");
    expect(result).toBeNull();
  });

  it("retourne null quand source est null", () => {
    expect(resolveCurrentAnalysisForSource(all, null)).toBeNull();
  });

  it("respecte le folder FEC : Cabinet A retourne fa1 ou u1 selon createdAt", () => {
    const result = resolveCurrentAnalysisForSource(all, "fec", "Cabinet A");
    // u1 (2026-04-10) plus récent que fa1 (2026-03-10) → u1 gagne
    expect(result?.id).toBe("u1");
  });

  it("scénario d'intégration : bascule Pennylane → FEC change la liasse résolue", () => {
    const beforeToggle = resolveCurrentAnalysisForSource(all, "pennylane");
    expect(beforeToggle?.id).toBe("p1");

    // L'utilisateur clique sur le toggle FEC d'un dossier dans /documents
    const afterToggle = resolveCurrentAnalysisForSource(all, "fec", "Cabinet B");
    expect(afterToggle?.id).toBe("fb1");

    // Aucune contamination entre les 2 résolutions
    expect(beforeToggle?.id).not.toBe(afterToggle?.id);
  });

  it("scénario d'intégration : désactiver toutes les sources → null partout", () => {
    expect(resolveCurrentAnalysisForSource(all, null)).toBeNull();
  });
});
