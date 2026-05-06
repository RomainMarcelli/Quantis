// File: components/ai/AiDataCard.test.tsx
// Role: vérifie que la micro-card affiche label/valeur/variation, qu'elle
// devient un bouton cliquable quand `kpiId` ou `onClick` est fourni, et que
// l'aria-label combine la valeur et la variation pour la lecture vocale.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiDataCard } from "@/components/ai/AiDataCard";

describe("AiDataCard", () => {
  it("affiche label, valeur et variation positive avec la flèche ↗", () => {
    const html = renderToStaticMarkup(
      <AiDataCard label="CA" value="43 894 €" variationPct={12.3} />
    );
    expect(html).toContain("CA");
    expect(html).toContain("43 894 €");
    expect(html).toContain("↗");
    expect(html).toContain("+12.3%");
    // Vert pour les hausses
    expect(html).toContain("#22C55E");
  });

  it("affiche la variation négative avec la flèche ↘ en rouge", () => {
    const html = renderToStaticMarkup(
      <AiDataCard label="CA" value="43 894 €" variationPct={-75.4} />
    );
    expect(html).toContain("↘");
    expect(html).toContain("-75.4%");
    expect(html).toContain("#EF4444");
  });

  it("est cliquable quand kpiId est fourni (rend un <button>)", () => {
    const html = renderToStaticMarkup(
      <AiDataCard label="CA" value="43 894 €" kpiId="ca" />
    );
    expect(html).toMatch(/<button/);
    expect(html).toContain('aria-label="CA : 43 894 €"');
  });

  it("rend un <div> non cliquable quand ni kpiId ni onClick ne sont fournis", () => {
    const html = renderToStaticMarkup(<AiDataCard label="Cible" value="≤ 45 j" />);
    expect(html).not.toMatch(/<button/);
  });

  it("inclut la variation dans l'aria-label", () => {
    const html = renderToStaticMarkup(
      <AiDataCard label="CA" value="43 894 €" variationPct={-75.4} kpiId="ca" />
    );
    expect(html).toContain("variation ↘ -75.4%");
  });

  it("rend un sparkline quand au moins 2 points sont fournis", () => {
    const html = renderToStaticMarkup(
      <AiDataCard label="CA" value="43 894 €" sparklinePoints={[100, 110, 120, 130]} />
    );
    expect(html).toContain("<svg");
  });

  it("ne rend pas de sparkline avec moins de 2 points", () => {
    const html = renderToStaticMarkup(
      <AiDataCard label="CA" value="43 894 €" sparklinePoints={[100]} />
    );
    expect(html).not.toContain("<svg");
  });
});
