import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthGate, useAuthenticatedUser } from "@/components/auth/AuthGate";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/synthese"
}));

vi.mock("@/services/auth", () => ({
  firebaseAuthGateway: {
    subscribe: vi.fn(() => () => {})
  }
}));

describe("AuthGate", () => {
  it("rend le fallback loading par défaut au premier render", () => {
    const html = renderToStaticMarkup(
      <AuthGate>
        <p>Contenu protégé</p>
      </AuthGate>
    );
    expect(html).toContain("Chargement de la session");
    expect(html).not.toContain("Contenu protégé");
  });

  it("utilise le loadingFallback fourni si présent", () => {
    const html = renderToStaticMarkup(
      <AuthGate loadingFallback={<p>Custom loader</p>}>
        <p>Contenu protégé</p>
      </AuthGate>
    );
    expect(html).toContain("Custom loader");
    expect(html).not.toContain("Chargement de la session");
  });
});

describe("useAuthenticatedUser", () => {
  it("throw si utilisé hors AuthGate", () => {
    function Consumer() {
      useAuthenticatedUser();
      return <p>ok</p>;
    }
    expect(() => renderToStaticMarkup(<Consumer />)).toThrow(
      /useAuthenticatedUser must be used inside <AuthGate>/
    );
  });
});
