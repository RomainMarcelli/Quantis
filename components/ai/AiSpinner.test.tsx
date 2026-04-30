// File: components/ai/AiSpinner.test.tsx
// Role: vérifie que le spinner rend 3 cercles concentriques avec la classe
// d'animation `vyzor-heart-circle` et 3 délais staggered (0/300/600 ms),
// et que le texte de chargement est en italique.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiSpinner } from "@/components/ai/AiSpinner";

describe("AiSpinner", () => {
  it("rend 3 cercles avec la classe d'animation et délais staggered", () => {
    const html = renderToStaticMarkup(<AiSpinner />);
    // 3 cercles avec la classe d'animation pulsante
    const matches = html.match(/vyzor-heart-circle/g);
    expect(matches?.length).toBe(3);
    // Délais staggered 0 / 300 / 600 ms
    expect(html).toContain("animation-delay:0ms");
    expect(html).toContain("animation-delay:300ms");
    expect(html).toContain("animation-delay:600ms");
  });

  it("affiche le texte de chargement en italique avec opacité 0.4", () => {
    const html = renderToStaticMarkup(<AiSpinner />);
    expect(html).toContain("italic");
    expect(html).toContain("Analyse en cours");
    expect(html).toContain("rgba(255, 255, 255, 0.4)");
  });

  it("expose role=status pour les lecteurs d'écran", () => {
    const html = renderToStaticMarkup(<AiSpinner label="Test" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Test…"');
  });
});
