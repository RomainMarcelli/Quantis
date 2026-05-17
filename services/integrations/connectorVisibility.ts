// File: services/integrations/connectorVisibility.ts
// Role: source unique de vérité pour la visibilité des connecteurs côté UI.
//
// Brief 14/05/2026 (Tâche 1.3 étendue) — le wizard /documents ne doit
// afficher QUE ce qui marche bout-en-bout pour un dirigeant TPE/PME dans
// le MVP Phase 1. Les connecteurs hors scope (Bridge, Odoo, Tiime, OAuth
// Firm/Company) sont masqués via flags d'env, le code reste dans le repo
// pour réactivation conditionnelle.
//
// Convention : "visible" = la tuile est rendue et cliquable. Si non
// visible, elle n'apparaît pas du tout dans l'UI. Pas de mode "grisé /
// Bientôt disponible" (cf. brief).
//
// Module SERVEUR uniquement (lit process.env). Le front consomme cette
// config via /api/integrations/connectors/visibility puis le hook
// `useConnectorVisibility`.

import {
  isCompanyOAuthEnabled,
  isFirmOAuthVisible,
} from "@/services/integrations/adapters/pennylane/auth";

export type ConnectorId =
  | "pennylane_manual"
  | "pennylane_firm"
  | "pennylane_company"
  | "myu_manual"
  | "fec_upload"
  | "bridge"
  | "odoo"
  | "tiime";

export type ConnectorVisibilityMap = Record<ConnectorId, { visible: boolean }>;

/**
 * Résout la visibilité de chaque connecteur depuis les env vars du serveur.
 *
 * Par défaut MVP Phase 1 :
 *   - pennylane_manual, myu_manual, fec_upload → toujours visibles
 *   - tout le reste → masqué (flag à `true` pour activer sur preview)
 *
 * Pattern d'activation : `BRIDGE_VISIBLE=true`, `ODOO_VISIBLE=true`,
 * `TIIME_VISIBLE=true`. Aligné sur `PENNYLANE_FIRM_VISIBLE` /
 * `PENNYLANE_COMPANY_ENABLED` déjà câblés.
 */
export function getConnectorVisibility(): ConnectorVisibilityMap {
  return {
    // ─── Connecteurs MVP Phase 1 (toujours visibles) ─────────────────────
    pennylane_manual: { visible: true },
    myu_manual: { visible: true },
    fec_upload: { visible: true },

    // ─── Pennylane OAuth (gaté par les helpers existants) ────────────────
    pennylane_firm: { visible: isFirmOAuthVisible() },
    pennylane_company: { visible: isCompanyOAuthEnabled() },

    // ─── Hors scope MVP (flags d'env, off par défaut) ────────────────────
    bridge: { visible: parseBooleanFlag(process.env.BRIDGE_VISIBLE) },
    odoo: { visible: parseBooleanFlag(process.env.ODOO_VISIBLE) },
    tiime: { visible: parseBooleanFlag(process.env.TIIME_VISIBLE) },
  };
}

/**
 * Parsing strict aligné sur isCompanyOAuthEnabled / isFirmOAuthVisible :
 * seul "true" (case-insensitive) active le flag. Toute autre valeur
 * (vide, "false", "1", "yes", ...) reste à false. Évite les surprises
 * sur des configs Vercel mal typées.
 */
function parseBooleanFlag(raw: string | undefined): boolean {
  return (raw ?? "false").toLowerCase() === "true";
}
