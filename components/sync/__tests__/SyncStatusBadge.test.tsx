// Tests du badge de statut sync — couvre les 5 états et le formatage relatif.
//
// Pourquoi ces tests :
//   - Le badge est affiché sur toutes les pages où une source est active
//     (Documents, panneaux d'analyse, etc.). Une régression sur le rendu
//     visuel ou le wording impacte directement les bêta-testeurs.
//   - L'arbre de décision (état+âge → couleur+wording) est non trivial
//     (5 cas + l'état "never"). Sans tests on risque de silently casser
//     un cas en éditant les seuils.
//
// On teste le rendu HTML via renderToStaticMarkup (pattern existant dans
// le repo cf. SyntheseDashboard.test.tsx) et le helper formatAge isolément.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SyncStatusBadge, formatAge } from "@/components/sync/SyncStatusBadge";

const NOW = new Date("2026-05-08T12:00:00Z");

function isoMinutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}
function isoHoursAgo(hours: number): string {
  return isoMinutesAgo(hours * 60);
}
function isoDaysAgo(days: number): string {
  return isoHoursAgo(days * 24);
}

describe("formatAge", () => {
  it("retourne 'à l'instant' pour < 1 minute", () => {
    expect(formatAge(30 * 1000)).toBe("à l'instant");
  });
  it("formate les minutes (singulier vs pluriel)", () => {
    expect(formatAge(1 * 60 * 1000)).toBe("il y a 1 minute");
    expect(formatAge(15 * 60 * 1000)).toBe("il y a 15 minutes");
  });
  it("formate les heures (singulier vs pluriel)", () => {
    expect(formatAge(1 * 60 * 60 * 1000)).toBe("il y a 1 heure");
    expect(formatAge(14 * 60 * 60 * 1000)).toBe("il y a 14 heures");
  });
  it("formate les jours (singulier vs pluriel)", () => {
    expect(formatAge(1 * 24 * 60 * 60 * 1000)).toBe("il y a 1 jour");
    expect(formatAge(6 * 24 * 60 * 60 * 1000)).toBe("il y a 6 jours");
    // ≥ 7 jours → toujours formaté en jours (le warning visuel est porté
    // par le composant, pas par le helper).
    expect(formatAge(30 * 24 * 60 * 60 * 1000)).toBe("il y a 30 jours");
  });
});

describe("SyncStatusBadge — 5 états visuels", () => {
  it("état 'récent' (< 1h) : data-sync-state='fresh' ou 'recent'", () => {
    const html = renderToStaticMarkup(
      <SyncStatusBadge
        lastSyncedAt={isoMinutesAgo(15)}
        lastSyncStatus="success"
        now={NOW}
      />
    );
    expect(html).toContain('data-sync-state="fresh"');
    expect(html).toContain("Synchronisé il y a 15 minutes");
  });

  it("état 'quelques heures' (< 24h, > 1h) : data-sync-state='recent'", () => {
    const html = renderToStaticMarkup(
      <SyncStatusBadge
        lastSyncedAt={isoHoursAgo(14)}
        lastSyncStatus="success"
        now={NOW}
      />
    );
    expect(html).toContain('data-sync-state="recent"');
    expect(html).toContain("Synchronisé il y a 14 heures");
  });

  it("état 'quelques jours' (< 7j, ≥ 24h) : data-sync-state='ok'", () => {
    const html = renderToStaticMarkup(
      <SyncStatusBadge
        lastSyncedAt={isoDaysAgo(3)}
        lastSyncStatus="success"
        now={NOW}
      />
    );
    expect(html).toContain('data-sync-state="ok"');
    expect(html).toContain("Synchronisé il y a 3 jours");
  });

  it("état 'stale' (≥ 7j) : data-sync-state='stale' + warning color", () => {
    // Régression visuelle critique : ce cas signale à l'utilisateur que
    // ses données sont potentiellement périmées. Sans le warning visuel,
    // il pourrait piloter sa boîte sur des chiffres d'il y a 3 semaines.
    const html = renderToStaticMarkup(
      <SyncStatusBadge
        lastSyncedAt={isoDaysAgo(10)}
        lastSyncStatus="success"
        now={NOW}
      />
    );
    expect(html).toContain('data-sync-state="stale"');
    expect(html).toContain("Synchronisé il y a 10 jours");
    expect(html).toContain("var(--app-warning)");
  });

  it("état 'failed' : data-sync-state='failed' + tooltip d'erreur", () => {
    const html = renderToStaticMarkup(
      <SyncStatusBadge
        lastSyncedAt={isoHoursAgo(2)}
        lastSyncStatus="failed"
        lastSyncError="Token JWT expiré"
        now={NOW}
      />
    );
    expect(html).toContain('data-sync-state="failed"');
    expect(html).toContain("Échec de la dernière synchronisation");
    expect(html).toContain("Token JWT expiré");
    expect(html).toContain("var(--app-danger)");
  });

  it("état 'in_progress' : data-sync-state='in_progress' + spinner accessible", () => {
    const html = renderToStaticMarkup(
      <SyncStatusBadge lastSyncedAt={null} lastSyncStatus="in_progress" now={NOW} />
    );
    expect(html).toContain('data-sync-state="in_progress"');
    expect(html).toContain("Synchronisation en cours");
    expect(html).toContain("animate-spin");
    expect(html).toContain('aria-live="polite"');
  });

  it("état 'never' : 'Jamais synchronisé' (text-tertiary)", () => {
    const html = renderToStaticMarkup(
      <SyncStatusBadge lastSyncedAt={null} lastSyncStatus="never" now={NOW} />
    );
    expect(html).toContain('data-sync-state="never"');
    expect(html).toContain("Jamais synchronisé");
  });

  it("tronque les messages d'erreur trop longs (DoS / log injection)", () => {
    // Si l'erreur fait 5kb (cas réel d'un body API qui leak), on ne veut
    // pas l'injecter en entier dans le DOM. 200 chars max suffisent.
    const longError = "x".repeat(5000);
    const html = renderToStaticMarkup(
      <SyncStatusBadge
        lastSyncedAt={isoHoursAgo(1)}
        lastSyncStatus="failed"
        lastSyncError={longError}
        now={NOW}
      />
    );
    // Le title doit contenir la version tronquée — on cherche 200 'x'.
    expect(html).toContain("x".repeat(200));
    expect(html).not.toContain("x".repeat(201));
  });
});
