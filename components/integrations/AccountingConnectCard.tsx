// File: components/integrations/AccountingConnectCard.tsx
// Role: card unifiée "Logiciel comptable" sur la page Documents — même
// format compact que `BridgeConnectCard` (titre + badge statut), avec un
// bouton chevron qui DÉPLIE le détail (liste des connexions actives +
// assistant pas-à-pas pour en ajouter une).
//
// Avant ce composant : on rendait directement `<ConnectionsPanel />` +
// `<AccountingConnectionWizard />` dépliés dans Documents. Visuellement la
// hiérarchie était disparate (cards multi-niveaux avec encarts) — l'utilisateur
// ne percevait pas que "Logiciel comptable" et "Banque" sont deux sources
// au même niveau de granularité.
//
// Cette card masque la complexité par défaut. Le détail s'affiche au clic.
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { ConnectionsPanel } from "@/components/integrations/ConnectionsPanel";
import { AccountingConnectionWizard } from "@/components/integrations/AccountingConnectionWizard";
import type { ConnectionDto } from "@/app/api/integrations/connections/route";

const PROVIDER_LABELS: Record<string, string> = {
  pennylane: "Pennylane",
  myunisoft: "MyUnisoft",
  odoo: "Odoo",
  chift: "Chift",
};

type AccountingConnectCardProps = {
  /** Callback quand une connexion comptable change (sync / disconnect / new). */
  onChanged?: () => void;
};

export function AccountingConnectCard({ onChanged }: AccountingConnectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [accountingConnections, setAccountingConnections] = useState<ConnectionDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Charge les connexions et filtre les providers comptables (exclut Bridge,
  // qui a sa propre card).
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) {
        setAccountingConnections([]);
        return;
      }
      const res = await fetch("/api/integrations/connections", {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setAccountingConnections([]);
        return;
      }
      const data = (await res.json()) as { connections?: ConnectionDto[] };
      const all = data.connections ?? [];
      // Filtre : on garde uniquement les providers comptables (exclut bridge).
      setAccountingConnections(all.filter((c) => c.provider !== "bridge"));
    } catch {
      setAccountingConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleChanged() {
    void refresh();
    onChanged?.();
  }

  // État dérivé pour le badge.
  const activeConnections = accountingConnections.filter((c) => c.status === "active");
  const isConnected = activeConnections.length > 0;
  const providerNames = Array.from(
    new Set(
      activeConnections
        .map((c) => PROVIDER_LABELS[c.provider] ?? c.provider)
        .filter(Boolean)
    )
  );
  const headerTitle = isConnected
    ? providerNames.length === 1
      ? providerNames[0]!
      : providerNames.join(" · ")
    : "Logiciel comptable";

  return (
    <article className="precision-card rounded-2xl">
      {/* Header — toggleable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="accounting-card-detail"
        className="flex w-full items-start gap-3 rounded-2xl p-4 text-left transition md:p-5"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <span
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.1)",
            border: "1px solid rgba(197, 160, 89, 0.3)",
            color: "#C5A059",
          }}
        >
          <FileText className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">{headerTitle}</h2>
            {isConnected ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#86EFAC" }}
              >
                <CheckCircle2 className="h-3 w-3" />
                Connecté
              </span>
            ) : (
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Non connecté
              </span>
            )}
          </div>
          <p className="mt-1 max-w-[60ch] text-[13px] text-white/65">
            {isConnected ? (
              <>
                {activeConnections.length} connexion{activeConnections.length > 1 ? "s" : ""} active{activeConnections.length > 1 ? "s" : ""}.
                {" "}
                <span className="text-white/40">
                  {expanded ? "Cliquez pour replier." : "Cliquez pour gérer ou en ajouter une."}
                </span>
              </>
            ) : (
              <>
                Source <strong>principale</strong> de votre analyse — récupère
                automatiquement vos écritures comptables (compte de résultat,
                bilan) depuis Pennylane, MyUnisoft, Odoo, FEC ou un import
                Excel/PDF.
                {" "}
                <span className="text-white/40">
                  {expanded ? "Cliquez pour replier." : "Cliquez pour choisir un logiciel."}
                </span>
              </>
            )}
          </p>
        </div>

        <span
          className="mt-1 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            color: "rgba(255, 255, 255, 0.65)",
          }}
          aria-hidden
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Détail — déplié au clic */}
      {expanded ? (
        <div
          id="accounting-card-detail"
          className="space-y-4 px-4 pb-4 md:px-5 md:pb-5"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          <div className="pt-4">
            <ConnectionsPanel onChanged={handleChanged} excludeProviders={["bridge"]} />
          </div>
          <AccountingConnectionWizard onSyncCompleted={handleChanged} />
        </div>
      ) : null}
    </article>
  );
}
