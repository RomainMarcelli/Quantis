// File: components/banking/TreasuryEmptyState.tsx
// Role: empty state de l'onglet Trésorerie quand l'analyse courante n'a pas
// (encore) de `bankingSummary`. Distingue 2 cas pour éviter le message
// trompeur "Connectez votre banque" alors que la connexion existe déjà :
//   1. Pas de connexion Bridge → CTA "Connecter ma banque" (renvoie vers
//      /documents où vit la card)
//   2. Connexion Bridge active mais aucun summary → CTA "Synchroniser
//      maintenant" qui appelle directement /api/integrations/bridge/sync
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Landmark, Loader2, RefreshCcw } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";

export function TreasuryEmptyState() {
  const router = useRouter();
  const { status, loading, refresh } = useBridgeStatus();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!status?.connected;

  async function handleSync() {
    setError(null);
    setSyncing(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Vous devez être connecté.");
      const res = await fetch("/api/integrations/bridge/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Synchronisation impossible.");
      await refresh();
      // Au prochain render, le parent (AnalysisDetailView) relira
      // analysis.bankingSummary — le summary standalone vient d'être créé
      // mais il n'est pas encore attaché à l'analyse. On force un reload
      // pour que l'AnalysisDetailView aille rechercher.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="precision-card rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.1)",
            border: "1px solid rgba(197, 160, 89, 0.3)",
            color: "#C5A059",
          }}
        >
          <Landmark className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: "rgba(197,160,89,0.8)" }}>
            Trésorerie
          </p>
          {loading ? (
            <h3 className="mt-2 text-xl font-semibold text-white">Vérification du statut…</h3>
          ) : isConnected ? (
            <>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Synchronisation requise
              </h3>
              <p className="mt-2 max-w-[60ch] text-sm text-white/70">
                Votre banque est connectée, mais les comptes et transactions
                n'ont pas encore été récupérés. Lancez la synchronisation pour
                afficher le solde temps réel et les flux.
              </p>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
                style={{
                  backgroundColor: "rgba(197, 160, 89, 0.15)",
                  border: "1px solid rgba(197, 160, 89, 0.5)",
                  color: "#C5A059",
                }}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Synchroniser maintenant
              </button>
              {error ? (
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-[12px]"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#FCA5A5",
                  }}
                >
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Connectez votre banque
              </h3>
              <p className="mt-2 max-w-[60ch] text-sm text-white/70">
                Cette section affiche votre cash temps réel, vos flux et votre
                runway depuis votre banque. La connexion se fait depuis l'onglet
                Documents (Open Banking sécurisé via Bridge).
              </p>
              <button
                type="button"
                onClick={() => router.push("/documents")}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
                style={{
                  backgroundColor: "rgba(197, 160, 89, 0.15)",
                  border: "1px solid rgba(197, 160, 89, 0.5)",
                  color: "#C5A059",
                }}
              >
                Aller à Documents
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
