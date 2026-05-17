// File: lib/ai/structuredResponse.test.ts
// Role: garantir le contrat de `buildStructuredFromMarkdown` /
// `buildStructuredFromContext` après suppression du fallback générique
// "Vue d'ensemble de votre situation financière" :
//   - KPI inconnu du registre ET pas de markdown utile → `explanation: null`
//   - KPI connu du registre → `explanation` non vide (texte du tooltip ou
//     extrait du markdown fourni)
//   - markdown vide → `explanation: null`
//   - la constante `fallbackExplanation` reste exportée (rétro-compat) mais
//     ne sert plus de default automatique.

import { describe, expect, it } from "vitest";
import {
  buildStructuredFromContext,
  buildStructuredFromMarkdown,
  fallbackExplanation,
} from "@/lib/ai/structuredResponse";

describe("structuredResponse — explanation", () => {
  it("retourne explanation null pour un KPI inconnu du registre sans markdown", () => {
    const result = buildStructuredFromContext({
      kpiId: "kpi-inexistant",
      value: 1234,
    });
    expect(result.explanation).toBeNull();
  });

  it("retourne explanation null quand kpiId est null sans markdown", () => {
    const result = buildStructuredFromContext({ kpiId: null, value: null });
    expect(result.explanation).toBeNull();
  });

  it("retourne explanation null pour buildStructuredFromMarkdown avec markdown vide et KPI inconnu", () => {
    const result = buildStructuredFromMarkdown("", "kpi-inexistant", null);
    expect(result.explanation).toBeNull();
  });

  it("retourne une explanation non vide pour un KPI connu du registre (ebitda)", () => {
    const result = buildStructuredFromContext({ kpiId: "ebitda", value: 50000 });
    expect(result.explanation).not.toBeNull();
    expect(typeof result.explanation).toBe("string");
    expect((result.explanation as string).length).toBeGreaterThan(0);
  });

  it("extrait l'explanation depuis le markdown fourni quand il est non vide", () => {
    const markdown =
      "Votre EBITDA est en progression de **8%**. C'est un signal positif pour votre rentabilité opérationnelle.";
    const result = buildStructuredFromMarkdown(markdown, "ebitda", 50000);
    expect(result.explanation).not.toBeNull();
    expect((result.explanation as string)).toContain("EBITDA");
  });

  it("ne contient JAMAIS la string générique 'Vue d'ensemble' dans explanation", () => {
    const cases = [
      buildStructuredFromContext({ kpiId: null, value: null }),
      buildStructuredFromContext({ kpiId: "kpi-inexistant", value: 0 }),
      buildStructuredFromMarkdown("", null, null),
      buildStructuredFromMarkdown("Texte court.", "kpi-inexistant", null),
    ];
    for (const r of cases) {
      if (r.explanation) {
        expect(r.explanation).not.toContain("Vue d'ensemble");
      }
    }
  });

  it("génère une action 'chart' (Voir le graphique) en parallèle de 'navigate' quand un kpiId est fourni — Mission 2", () => {
    const result = buildStructuredFromContext({ kpiId: "ebitda", value: 50000 });
    const chartAction = result.actions.find((a) => a.type === "chart");
    const navigateAction = result.actions.find((a) => a.type === "navigate");
    expect(navigateAction).toBeDefined();
    expect(chartAction).toBeDefined();
    expect(chartAction?.target).toBe("ebitda");
    expect(chartAction?.label).toBe("Voir le graphique");
  });

  it("ne génère PAS d'action 'chart' quand kpiId est null — Mission 2", () => {
    const result = buildStructuredFromContext({ kpiId: null, value: null });
    const chartAction = result.actions.find((a) => a.type === "chart");
    expect(chartAction).toBeUndefined();
  });

  it("expose la constante fallbackExplanation pour rétro-compat (non utilisée comme default)", () => {
    // La constante reste exportée pour ne pas casser d'éventuels imports
    // externes, mais elle ne doit plus sortir automatiquement de
    // buildStructuredFromContext / buildStructuredFromMarkdown.
    expect(fallbackExplanation).toBe(
      "Vue d'ensemble de votre situation financière."
    );
  });
});
