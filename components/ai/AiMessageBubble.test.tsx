// File: components/ai/AiMessageBubble.test.tsx
// Role: vérifie le rendu minimaliste du message utilisateur (pas de fond,
// alignement à droite, opacity 0.6, timestamp en dessous) et que le mode
// assistant délègue à `AiResponseCard` (présence des blocs structurés A/B).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiMessageBubble } from "@/components/ai/AiMessageBubble";

describe("AiMessageBubble", () => {
  it("rend un message utilisateur sans bulle, aligné à droite, opacité 0.6", () => {
    const ts = new Date("2026-01-15T14:30:00Z").getTime();
    const html = renderToStaticMarkup(
      <AiMessageBubble
        message={{ role: "user", content: "Pourquoi mon CA baisse ?", timestamp: ts }}
        onAskFollowUp={() => {}}
      />
    );
    expect(html).toContain("Pourquoi mon CA baisse ?");
    // Pas de background-color sur le bloc texte (text-align right + color 0.6)
    expect(html).toContain("text-align:right");
    expect(html).toContain("rgba(255, 255, 255, 0.6)");
    // Pas de classe de fond type bg-[#2D2D3A] ni bulle arrondie
    expect(html).not.toContain("bg-[#2D2D3A]");
    expect(html).not.toContain("rounded-2xl");
  });

  it("affiche un timestamp discret (opacité 0.3) sous le message user", () => {
    const ts = new Date("2026-01-15T14:30:00Z").getTime();
    const html = renderToStaticMarkup(
      <AiMessageBubble
        message={{ role: "user", content: "Test", timestamp: ts }}
        onAskFollowUp={() => {}}
      />
    );
    expect(html).toContain("rgba(255, 255, 255, 0.3)");
    // Format hh:mm — n'importe quelle paire de chiffres + ':' + paire
    expect(html).toMatch(/\d{2}:\d{2}/);
  });

  it("rend un message assistant avec les blocs structurés A (diagnostic) et B (explication)", () => {
    const html = renderToStaticMarkup(
      <AiMessageBubble
        message={{
          role: "assistant",
          content: "Votre activité est saine.",
          timestamp: Date.now(),
          structured: {
            diagnostic: { status: "good", message: "Tout va bien." },
            explanation: "Votre EBE reste positif.",
            actions: [],
            followUpQuestions: [],
          },
        }}
        onAskFollowUp={() => {}}
      />
    );
    expect(html).toContain("Tout va bien.");
    expect(html).toContain("Votre EBE reste positif.");
  });
});
