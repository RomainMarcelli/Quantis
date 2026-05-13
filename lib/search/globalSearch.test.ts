import { describe, expect, it } from "vitest";
import {
  normalizeSearchText,
  routeMatchesPath,
  searchGlobalItems
} from "@/lib/search/globalSearch";

describe("globalSearch", () => {
  it("normalise les accents et apostrophes", () => {
    expect(normalizeSearchText("Indépendance d’entreprise")).toBe("independance d entreprise");
  });

  it("retourne des suggestions pertinentes pour un KPI de financement", () => {
    const results = searchGlobalItems("Indépendance", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.route).toBe("/analysis");
    expect(results[0]?.section).toBe("financement");
  });

  it("retrouve les éléments de synthèse", () => {
    const results = searchGlobalItems("Vyzor Score", 5);
    const ids = results.map((item) => item.id);
    expect(ids).toContain("synthese-score");
  });

  it("gère les correspondances de route App Router", () => {
    expect(routeMatchesPath("/analysis/abc", "/analysis")).toBe(true);
    expect(routeMatchesPath("/documents", "/analysis")).toBe(false);
  });
});
