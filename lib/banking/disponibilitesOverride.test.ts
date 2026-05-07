// Tests unitaires des helpers d'override Bridge (Synthèse + onglet Trésorerie).
//
// Ces helpers encodent la règle data-sources cruciale : "le toggle Bridge
// dans /documents l'emporte sur la connexion technique". Sans ces tests,
// rien ne garantirait qu'un futur changement ne ré-introduise le bug
// remonté le 07/05/2026 (Synthèse affichait 6 131 € depuis Bridge alors
// que Bridge était désactivé via toggle).

import { describe, expect, it } from "vitest";
import {
  computeShowTresorerie,
  resolveDisponibilitesOverride,
} from "@/lib/banking/disponibilitesOverride";

describe("resolveDisponibilitesOverride", () => {
  it("renvoie le solde Bridge quand toggle ON et liveBalance disponible (cas Bridge actif + MyUnisoft actif)", () => {
    const result = resolveDisponibilitesOverride({
      activeBankingSource: "bridge",
      liveBalance: 6131,
    });
    expect(result).toBe(6131);
  });

  it("renvoie null quand toggle OFF même si Bridge fournit un solde (cas Bridge désactivé + MyUnisoft actif)", () => {
    // Régression historique : ce cas faisait afficher 6 131 € au lieu de la
    // vraie valeur MyUnisoft. Avec ce fix, on retombe sur null → l'appelant
    // garde currentKpis.disponibilites (= 6 945 720 € côté MyUnisoft sandbox).
    const result = resolveDisponibilitesOverride({
      activeBankingSource: null,
      liveBalance: 6131,
    });
    expect(result).toBeNull();
  });

  it("renvoie null quand toggle ON mais liveBalance absent (Bridge connecté sans solde encore syncé)", () => {
    const result = resolveDisponibilitesOverride({
      activeBankingSource: "bridge",
      liveBalance: null,
    });
    expect(result).toBeNull();
  });

  it("ignore liveBalance non finite (NaN/Infinity) — protection contre données corrompues", () => {
    expect(
      resolveDisponibilitesOverride({
        activeBankingSource: "bridge",
        liveBalance: Number.NaN,
      })
    ).toBeNull();
    expect(
      resolveDisponibilitesOverride({
        activeBankingSource: "bridge",
        liveBalance: Number.POSITIVE_INFINITY,
      })
    ).toBeNull();
  });
});

describe("computeShowTresorerie", () => {
  it("affiche l'onglet quand Bridge actif (toggle ON) + connexion Bridge connectée", () => {
    const visible = computeShowTresorerie({
      activeBankingSource: "bridge",
      bridgeConnected: true,
      hasBankingSummary: false,
    });
    expect(visible).toBe(true);
  });

  it("affiche l'onglet quand Bridge actif (toggle ON) sans connexion mais avec bankingSummary historique", () => {
    // Cas d'une analyse passée qui porte un summary attaché — on continue
    // de l'afficher si l'utilisateur n'a pas désactivé Bridge.
    const visible = computeShowTresorerie({
      activeBankingSource: "bridge",
      bridgeConnected: false,
      hasBankingSummary: true,
    });
    expect(visible).toBe(true);
  });

  it("masque l'onglet quand Bridge désactivé (toggle OFF) malgré connexion + summary disponibles", () => {
    // C'est LA règle qui était violée : avant le fix, Bridge connecté =
    // onglet visible quoi qu'il arrive. Le toggle OFF doit primer.
    const visible = computeShowTresorerie({
      activeBankingSource: null,
      bridgeConnected: true,
      hasBankingSummary: true,
    });
    expect(visible).toBe(false);
  });

  it("masque l'onglet quand Bridge actif mais aucune source de données (ni connexion ni summary)", () => {
    const visible = computeShowTresorerie({
      activeBankingSource: "bridge",
      bridgeConnected: false,
      hasBankingSummary: false,
    });
    expect(visible).toBe(false);
  });
});
