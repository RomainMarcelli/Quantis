// File: components/ai/AiResponseCard.test.tsx
// Role: vérifie le câblage des callbacks `onAskFollowUp` et `onViewDetail`
// pour les boutons de la carte de réponse :
//   - bouton follow-up (bloc F)
//   - action "Comparer avec N-1" (bloc E, type "compare")
//   - action "Voir le détail" (bloc E, type "navigate")
//
// Stratégie : `AiResponseCard` est un composant pur (aucun hook). On l'appelle
// comme une fonction, on récupère l'arbre React renvoyé et on retrouve les
// `<button>` par leur `aria-label` puis on invoque `onClick` directement. Pas
// besoin de jsdom ni de @testing-library — non installés dans ce projet.

import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { AiResponseCard, COMPARE_PREVIOUS_PERIOD_PROMPT } from "@/components/ai/AiResponseCard";
import type { AiStructuredResponse } from "@/lib/ai/types";

// ── Helpers de traversée d'arbre React (sans DOM) ──────────────────────

type ReactNodeWithProps = ReactElement<{
  children?: ReactNode;
  onClick?: (e: unknown) => void;
  "aria-label"?: string;
  type?: string;
}>;

function isElement(node: unknown): node is ReactNodeWithProps {
  return typeof node === "object" && node !== null && "type" in (node as object);
}

/** Walk récursif d'un noeud React, applique `visit` sur chaque ReactElement. */
function walk(node: ReactNode, visit: (el: ReactNodeWithProps) => void): void {
  if (Array.isArray(node)) {
    node.forEach((c) => walk(c, visit));
    return;
  }
  if (!isElement(node)) return;
  visit(node);
  const children = node.props?.children;
  if (children !== undefined) walk(children as ReactNode, visit);
  // Composants fonction : on les exécute pour traverser leur output. Tous les
  // sous-composants de AiResponseCard sont stateless → safe à appeler ici.
  if (typeof node.type === "function") {
    const rendered = (node.type as (p: unknown) => ReactNode)(node.props);
    walk(rendered, visit);
  }
}

/** Trouve un bouton par son aria-label (ou son texte enfant) dans un arbre. */
function findButtonByLabel(root: ReactNode, label: string): ReactNodeWithProps | null {
  let found: ReactNodeWithProps | null = null;
  walk(root, (el) => {
    if (found) return;
    if (el.type !== "button") return;
    const aria = el.props["aria-label"];
    if (aria === label || aria?.includes(label)) {
      found = el;
    }
  });
  return found;
}

// ── Fixtures ────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<AiStructuredResponse> = {}): AiStructuredResponse {
  return {
    diagnostic: { status: "neutral", message: "Diagnostic." },
    explanation: "Une explication courte.",
    actions: [],
    followUpQuestions: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("AiResponseCard", () => {
  it("déclenche onAskFollowUp avec la question affichée au clic sur un follow-up", () => {
    const onAskFollowUp = vi.fn();
    const question = "Comment maintenir cette dynamique de croissance ?";
    const tree = AiResponseCard({
      response: makeResponse({ followUpQuestions: [question, "Autre question ?"] }),
      onAskFollowUp,
    });

    const button = findButtonByLabel(tree, `Poser la question : ${question}`);
    expect(button).not.toBeNull();
    button!.props.onClick!({} as unknown);
    expect(onAskFollowUp).toHaveBeenCalledWith(question);
  });

  it("déclenche onAskFollowUp avec le prompt 'Comparez avec N-1' au clic sur l'action compare", () => {
    const onAskFollowUp = vi.fn();
    const tree = AiResponseCard({
      response: makeResponse({
        actions: [
          {
            label: "Comparer avec N-1",
            icon: "ArrowRight",
            type: "compare",
            target: "previous-period",
          },
        ],
      }),
      onAskFollowUp,
    });

    const button = findButtonByLabel(tree, "Comparer avec N-1");
    expect(button).not.toBeNull();
    button!.props.onClick!({} as unknown);
    expect(onAskFollowUp).toHaveBeenCalledWith(COMPARE_PREVIOUS_PERIOD_PROMPT);
    expect(COMPARE_PREVIOUS_PERIOD_PROMPT).toMatch(/N-1/);
  });

  it("déclenche onViewDetail avec le bon kpiId au clic sur 'Voir le détail'", () => {
    const onViewDetail = vi.fn();
    const tree = AiResponseCard({
      response: makeResponse({
        actions: [
          { label: "Voir le détail", icon: "BarChart3", type: "navigate", target: "ebitda" },
        ],
      }),
      onViewDetail,
    });

    const button = findButtonByLabel(tree, "Voir le détail");
    expect(button).not.toBeNull();
    button!.props.onClick!({} as unknown);
    expect(onViewDetail).toHaveBeenCalledWith("ebitda");
  });

  it("rend le bouton 'Voir le détail' même sans target tant que onViewDetail est fourni", () => {
    // Bug 3 : le bouton doit rester actif. Si la réponse n'a pas de kpiId
    // cible, le handler côté parent gère le no-op (`if (!kpiId) return`).
    const onViewDetail = vi.fn();
    const tree = AiResponseCard({
      response: makeResponse({
        actions: [
          { label: "Voir le détail", icon: "BarChart3", type: "navigate", target: "" },
        ],
      }),
      onViewDetail,
    });

    const button = findButtonByLabel(tree, "Voir le détail");
    expect(button).not.toBeNull();
  });

  it("masque le bloc Explication si explanation est null", () => {
    // Mission 3 : suppression du fallback "Vue d'ensemble…". Quand
    // structuredResponse retourne explanation: null, AiResponseCard NE rend
    // PAS de bloc Explication (pas de <p> vide, pas de padding résiduel).
    const tree = AiResponseCard({
      response: makeResponse({ explanation: null }),
    });
    let foundExplanation = false;
    walk(tree, (el) => {
      if (el.type === "p") {
        const txt = JSON.stringify(el.props.children ?? "");
        if (txt.includes("Vue d'ensemble") || txt.includes("Une explication courte")) {
          foundExplanation = true;
        }
      }
    });
    expect(foundExplanation).toBe(false);
  });

  it("rend le bloc Explication quand explanation est une string non vide", () => {
    const tree = AiResponseCard({
      response: makeResponse({ explanation: "Mon explication contextuelle." }),
    });
    let found = false;
    walk(tree, (el) => {
      if (el.type === "p") {
        const txt = JSON.stringify(el.props.children ?? "");
        if (txt.includes("Mon explication contextuelle")) found = true;
      }
    });
    expect(found).toBe(true);
  });

  it("déclenche onViewChart avec le bon kpiId au clic sur 'Voir le graphique' (Mission 2)", () => {
    const onViewChart = vi.fn();
    const tree = AiResponseCard({
      response: makeResponse({
        actions: [
          { label: "Voir le graphique", icon: "BarChart3", type: "chart", target: "ebitda" },
        ],
      }),
      onViewChart,
    });

    const button = findButtonByLabel(tree, "Voir le graphique");
    expect(button).not.toBeNull();
    button!.props.onClick!({} as unknown);
    expect(onViewChart).toHaveBeenCalledWith("ebitda");
  });

  it("masque le bouton 'Voir le graphique' si onViewChart n'est pas fourni (Mission 2)", () => {
    const tree = AiResponseCard({
      response: makeResponse({
        actions: [
          { label: "Voir le graphique", icon: "BarChart3", type: "chart", target: "ebitda" },
        ],
      }),
      // pas de onViewChart
    });

    const button = findButtonByLabel(tree, "Voir le graphique");
    expect(button).toBeNull();
  });

  it("rend les boutons Copier + Régénérer quand onCopy/onRegenerate sont fournis", () => {
    const onCopy = vi.fn();
    const onRegenerate = vi.fn();
    const tree = AiResponseCard({
      response: makeResponse(),
      onCopy,
      onRegenerate,
    });

    const copyBtn = findButtonByLabel(tree, "Copier");
    expect(copyBtn).not.toBeNull();
    const regenBtn = findButtonByLabel(tree, "Régénérer");
    expect(regenBtn).not.toBeNull();

    // Click Copier — on simule un MouseEvent minimal avec un currentTarget qui
    // expose le sous-ensemble DOM utilisé par handleCopy (setAttribute,
    // querySelector). Évite l'install d'un jsdom complet.
    const fakeBtnEl = {
      setAttribute: () => {},
      removeAttribute: () => {},
      hasAttribute: () => false,
      querySelector: () => null,
      style: {} as Record<string, string>,
    };
    copyBtn!.props.onClick!({ currentTarget: fakeBtnEl } as unknown);
    expect(onCopy).toHaveBeenCalledTimes(1);

    // Click Régénérer → déclenche onRegenerate
    regenBtn!.props.onClick!({} as unknown);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("masque Copier + Régénérer si aucun callback n'est fourni", () => {
    const tree = AiResponseCard({ response: makeResponse() });
    expect(findButtonByLabel(tree, "Copier")).toBeNull();
    expect(findButtonByLabel(tree, "Régénérer")).toBeNull();
  });

  it("masque le bouton 'Voir le détail' si onViewDetail n'est pas fourni", () => {
    const tree = AiResponseCard({
      response: makeResponse({
        actions: [
          { label: "Voir le détail", icon: "BarChart3", type: "navigate", target: "ebitda" },
        ],
      }),
      // pas de onViewDetail
    });

    const button = findButtonByLabel(tree, "Voir le détail");
    expect(button).toBeNull();
  });
});
