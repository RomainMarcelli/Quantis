import { describe, expect, it } from "vitest";
import {
  KPI_REGISTRY,
  getKpiDefinition,
  listKpisByCategory,
  listKpisByPhase,
  type KpiDefinition,
} from "@/lib/kpi/kpiRegistry";
import { KPI_FORMULA_CATALOG } from "@/lib/kpi/kpiFormulaCatalog";
import type { CalculatedKpis } from "@/types/analysis";

// Liste des champs de CalculatedKpis qu'on ne couvre pas dans le registre.
// Vide aujourd'hui — toute nouvelle entrée ajoutée à `CalculatedKpis` doit
// soit être enregistrée, soit explicitement listée ici.
const ALLOWED_MISSING: ReadonlyArray<keyof CalculatedKpis> = ["ratio_immo_usure"];

function expectedKpiKeys(): Array<keyof CalculatedKpis> {
  return KPI_FORMULA_CATALOG.map((entry) => entry.key);
}

describe("KPI_REGISTRY — couverture", () => {
  it("couvre tous les KPIs listés dans KPI_FORMULA_CATALOG", () => {
    const missing = expectedKpiKeys()
      .filter((key) => !KPI_REGISTRY[key])
      .filter((key) => !ALLOWED_MISSING.includes(key));
    expect(missing, `KPIs absents du registre : ${missing.join(", ")}`).toEqual([]);
  });

  it("chaque entrée a un id qui matche sa clé dans le registre", () => {
    for (const [key, def] of Object.entries(KPI_REGISTRY)) {
      expect(def.id, `id ≠ key pour ${key}`).toBe(key);
    }
  });

  it("chaque KPI a un tooltip non vide (explanation/goodSign/badSign)", () => {
    for (const def of Object.values(KPI_REGISTRY)) {
      expect(def.tooltip.explanation.length, `${def.id} explanation vide`).toBeGreaterThan(20);
      expect(def.tooltip.goodSign.length, `${def.id} goodSign vide`).toBeGreaterThan(0);
      expect(def.tooltip.badSign.length, `${def.id} badSign vide`).toBeGreaterThan(0);
    }
  });

  it("chaque KPI a au moins une dépendance déclarée", () => {
    for (const def of Object.values(KPI_REGISTRY)) {
      expect(def.dependencies.length, `${def.id} sans dépendance`).toBeGreaterThan(0);
    }
  });

  it("chaque KPI a une catégorie valide", () => {
    const valid = new Set([
      "creation_valeur",
      "investissement",
      "financement",
      "rentabilite",
      "tresorerie",
      "score",
    ]);
    for (const def of Object.values(KPI_REGISTRY)) {
      expect(valid.has(def.category), `${def.id} catégorie invalide`).toBe(true);
    }
  });

  it("chaque KPI a une phase valide (CT/MT/LT)", () => {
    for (const def of Object.values(KPI_REGISTRY)) {
      expect(["CT", "MT", "LT"]).toContain(def.phase);
    }
  });

  it("les seuils, quand présents, sont cohérents (danger ≤ warning ≤ good)", () => {
    for (const def of Object.values(KPI_REGISTRY)) {
      const t = def.thresholds;
      if (!t) continue;
      // Logique : danger = pire, good = meilleur. Selon le KPI, l'ordre peut être
      // ascendant (CA, EBITDA) ou descendant (DSO, gearing) — on vérifie juste
      // qu'il n'y a pas de chevauchement contradictoire (3 valeurs égales OK).
      if (t.danger !== undefined && t.warning !== undefined && t.good !== undefined) {
        const sorted = [t.danger, t.warning, t.good].slice().sort((a, b) => a - b);
        const reverse = [t.good, t.warning, t.danger].slice().sort((a, b) => a - b);
        // Les 3 valeurs doivent être triables dans un sens ou l'autre.
        const ascOk =
          sorted[0] === t.danger && sorted[1] === t.warning && sorted[2] === t.good;
        const descOk =
          reverse[0] === t.good && reverse[1] === t.warning && reverse[2] === t.danger;
        expect(ascOk || descOk, `${def.id} thresholds non monotones`).toBe(true);
      }
    }
  });
});

describe("KPI_REGISTRY — helpers", () => {
  it("getKpiDefinition retourne la def existante", () => {
    expect(getKpiDefinition("ca")?.label).toBe("Chiffre d'affaires");
  });

  it("getKpiDefinition retourne null pour un id inconnu", () => {
    expect(getKpiDefinition("xyz_inexistant")).toBeNull();
  });

  it("listKpisByCategory filtre par catégorie", () => {
    const treso = listKpisByCategory("tresorerie");
    expect(treso.length).toBeGreaterThan(0);
    expect(treso.every((k: KpiDefinition) => k.category === "tresorerie")).toBe(true);
  });

  it("listKpisByPhase('CT') contient au moins les KPIs cœur", () => {
    const ct = listKpisByPhase("CT").map((k) => k.id);
    for (const must of ["ca", "ebitda", "bfr", "dso", "solvabilite", "healthScore"]) {
      expect(ct, `${must} doit être en phase CT`).toContain(must);
    }
  });
});
