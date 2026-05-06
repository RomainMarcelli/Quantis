// File: components/ai/AiSparkline.test.tsx
// Role: vérifie le rendu SVG : couleur or pour tendance haussière, rouge
// pour baissière, retour `null` (pas de SVG dans la sortie) quand moins de
// 2 points sont fournis.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiSparkline } from "@/components/ai/AiSparkline";

describe("AiSparkline", () => {
  it("rend un SVG avec la couleur or pour une tendance haussière", () => {
    const html = renderToStaticMarkup(<AiSparkline points={[10, 20, 30, 40]} />);
    expect(html).toContain("<svg");
    expect(html).toContain("#C5A059");
    expect(html).toContain("Tendance haussière sur 4 points");
  });

  it("rend un SVG avec la couleur rouge pour une tendance baissière", () => {
    const html = renderToStaticMarkup(<AiSparkline points={[40, 30, 20, 10]} />);
    expect(html).toContain("<svg");
    expect(html).toContain("#EF4444");
    expect(html).toContain("Tendance baissière sur 4 points");
  });

  it("ne rend rien avec un seul point", () => {
    const html = renderToStaticMarkup(<AiSparkline points={[10]} />);
    expect(html).toBe("");
  });

  it("ne rend rien avec un tableau vide", () => {
    const html = renderToStaticMarkup(<AiSparkline points={[]} />);
    expect(html).toBe("");
  });

  it("respecte la largeur et la hauteur passées en props", () => {
    const html = renderToStaticMarkup(
      <AiSparkline points={[1, 2, 3]} width={200} height={50} />
    );
    expect(html).toContain('width="200"');
    expect(html).toContain('height="50"');
    expect(html).toContain('viewBox="0 0 200 50"');
  });

  it("contient une polyline et une aire sous la courbe (path)", () => {
    const html = renderToStaticMarkup(<AiSparkline points={[1, 2, 3, 4, 5, 6]} />);
    // Au moins 2 paths : ligne + aire
    const paths = html.match(/<path /g);
    expect(paths?.length).toBeGreaterThanOrEqual(2);
  });
});
