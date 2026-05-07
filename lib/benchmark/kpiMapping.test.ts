// File: lib/benchmark/kpiMapping.test.ts
import { describe, expect, it } from "vitest";
import { KPI_BENCHMARK_MAPPING, getMappingFor } from "@/lib/benchmark/kpiMapping";

describe("KPI_BENCHMARK_MAPPING", () => {
  it("couvre les KPIs principaux du cockpit synthese", () => {
    expect(KPI_BENCHMARK_MAPPING.ca).toBeDefined();
    expect(KPI_BENCHMARK_MAPPING.ebe).toBeDefined();
    expect(KPI_BENCHMARK_MAPPING.disponibilites).toBeDefined();
  });

  it("nomme chaque colonne avec le suffixe attendu (_bas/_median/_haut)", () => {
    for (const [, mapping] of Object.entries(KPI_BENCHMARK_MAPPING)) {
      if (!mapping) continue;
      expect(mapping.columns.bas).toBe(`${mapping.prefix}_bas`);
      expect(mapping.columns.median).toBe(`${mapping.prefix}_median`);
      expect(mapping.columns.haut).toBe(`${mapping.prefix}_haut`);
    }
  });

  it("inverse le sentiment pour les KPIs où plus c'est haut, plus c'est mauvais", () => {
    // BFR, DSO, gearing, capacité de remboursement : être au-dessus du marché est défavorable.
    expect(KPI_BENCHMARK_MAPPING.bfr?.invertSentiment).toBe(true);
    expect(KPI_BENCHMARK_MAPPING.dso?.invertSentiment).toBe(true);
    expect(KPI_BENCHMARK_MAPPING.gearing?.invertSentiment).toBe(true);
    expect(KPI_BENCHMARK_MAPPING.capacite_remboursement_annees?.invertSentiment).toBe(true);
  });

  it("ne ré-utilise jamais le même triplet de colonnes deux fois (sauf alias délibérés)", () => {
    // ebe et ebitda partagent volontairement le même mapping ebitda_*.
    const seen = new Map<string, string[]>();
    for (const [kpiKey, mapping] of Object.entries(KPI_BENCHMARK_MAPPING)) {
      if (!mapping) continue;
      const list = seen.get(mapping.prefix) ?? [];
      list.push(kpiKey);
      seen.set(mapping.prefix, list);
    }
    for (const [prefix, keys] of seen) {
      if (keys.length > 1 && prefix !== "ebitda") {
        throw new Error(`Doublon non documenté sur le préfixe ${prefix}: ${keys.join(", ")}`);
      }
    }
  });
});

describe("getMappingFor", () => {
  it("retourne le mapping quand il existe", () => {
    expect(getMappingFor("ca")?.prefix).toBe("ca");
  });

  it("retourne null pour les KPIs Vyzor sans équivalent dans la vue Vyzor", () => {
    expect(getMappingFor("healthScore")).toBeNull();
    expect(getMappingFor("point_mort")).toBeNull();
    expect(getMappingFor("etat_materiel_indice")).toBeNull();
  });
});
