// File: components/ui/ThemeProvider.test.ts
// Tests des helpers PURS de ThemeProvider — ne montent PAS le composant
// React (l'environnement vitest est node, pas jsdom). Vérifie juste que
// `applyTheme` et `readStoredTheme` produisent les bons effets sur le
// document/localStorage. Garantie minimale : le bascule data-theme +
// class fonctionne, donc les overrides CSS du mode clair s'appliquent.

import { describe, expect, it, beforeEach, vi } from "vitest";

// Mocks avant import — le module ThemeProvider.tsx importe Firebase
// (sync Firestore du thème côté provider). On stubbe pour pouvoir tester
// les helpers PURS `applyTheme` / `readStoredTheme` sans env vars.
vi.mock("@/services/auth", () => ({
  firebaseAuthGateway: {
    subscribe: () => () => undefined,
    getCurrentUser: () => null,
  },
}));
vi.mock("@/lib/firebase", () => ({ firestoreDb: { __mock: true } }));
vi.mock("@/services/userProfileStore", () => ({
  getUserProfile: vi.fn(async () => null),
  saveUserThemePreference: vi.fn(async () => undefined),
}));

import { applyTheme, readStoredTheme } from "@/components/ui/ThemeProvider";

// Stub minimal de document + window pour exécuter applyTheme / readStoredTheme
// sans dépendre de jsdom. On ne teste pas le rendu, juste les effets.
function setupDom() {
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();
  const storage: Record<string, string> = {};

  globalThis.document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attrs[name] = value;
      },
      classList: {
        add: (...names: string[]) => names.forEach((n) => classes.add(n)),
        remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
        contains: (n: string) => classes.has(n),
      },
    },
  } as unknown as Document;

  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
    },
  } as unknown as Window & typeof globalThis;

  return { attrs, classes, storage };
}

describe("applyTheme", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pose data-theme=\"dark\" + class \"dark\" sur <html> en mode sombre", () => {
    const { attrs, classes } = setupDom();
    applyTheme("dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(classes.has("dark")).toBe(true);
    expect(classes.has("light")).toBe(false);
  });

  it("pose data-theme=\"light\" + class \"light\" sur <html> en mode clair", () => {
    const { attrs, classes } = setupDom();
    applyTheme("light");
    expect(attrs["data-theme"]).toBe("light");
    expect(classes.has("light")).toBe(true);
    expect(classes.has("dark")).toBe(false);
  });

  it("alterne proprement : remplace dark par light sans laisser les 2", () => {
    const { classes } = setupDom();
    applyTheme("dark");
    applyTheme("light");
    expect(classes.has("dark")).toBe(false);
    expect(classes.has("light")).toBe(true);
  });

  it("persiste le choix dans localStorage sous quantis.theme", () => {
    const { storage } = setupDom();
    applyTheme("light");
    expect(storage["quantis.theme"]).toBe("light");
    applyTheme("dark");
    expect(storage["quantis.theme"]).toBe("dark");
  });
});

describe("readStoredTheme", () => {
  it("retourne le theme stocké quand valide", () => {
    const { storage } = setupDom();
    storage["quantis.theme"] = "light";
    expect(readStoredTheme()).toBe("light");
  });

  it("retourne dark (défaut) quand rien n'est stocké", () => {
    setupDom();
    expect(readStoredTheme()).toBe("dark");
  });

  it("retourne dark (défaut) quand la valeur stockée est invalide", () => {
    const { storage } = setupDom();
    storage["quantis.theme"] = "auto"; // pas une AppTheme valide
    expect(readStoredTheme()).toBe("dark");
  });
});
