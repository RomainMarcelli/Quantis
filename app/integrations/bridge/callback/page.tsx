// File: app/integrations/bridge/callback/page.tsx
// Role: page de retour après la session Connect Bridge. Bridge redirige
// l'utilisateur ici une fois la SCA validée. On lance automatiquement le
// sync pour matérialiser le BankingSummary, puis on redirige vers
// /documents où l'utilisateur retrouve la card « Connecter ma banque »
// avec le statut mis à jour + l'onglet Trésorerie nouvellement disponible
// dans /analysis.
//
// Note : Bridge n'envoie pas de query params utiles côté success — la
// connexion est nominative (liée au user_email + access_token côté serveur).
// On peut donc déclencher le sync sans rien attendre.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

type Phase = "syncing" | "success" | "error";

export default function BridgeCallbackPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("syncing");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ accounts: number; balance: number | null } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) throw new Error("Vous devez être connecté à Vyzor.");
        const res = await fetch("/api/integrations/bridge/sync", {
          method: "POST",
          headers: {
            authorization: `Bearer ${idToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const json = (await res.json()) as {
          accountsCount?: number;
          totalBalance?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Synchronisation impossible.");
        if (cancelled) return;
        setStats({ accounts: json.accountsCount ?? 0, balance: json.totalBalance ?? null });
        setPhase("success");
        // Redirection auto vers documents au bout de ~1.6 s pour laisser le
        // temps de lire le message de succès.
        setTimeout(() => {
          if (!cancelled) router.replace("/documents");
        }, 1600);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
        setPhase("error");
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className="w-full max-w-md rounded-2xl p-6 text-center"
        style={{
          backgroundColor: "rgba(15, 15, 18, 0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(197, 160, 89, 0.3)",
          boxShadow: "0 0 24px rgba(197, 160, 89, 0.08)",
        }}
      >
        {phase === "syncing" ? (
          <>
            <Loader2
              className="mx-auto h-10 w-10 animate-spin"
              style={{ color: "#C5A059" }}
            />
            <h1 className="mt-4 text-xl font-semibold text-white">
              Synchronisation en cours…
            </h1>
            <p className="mt-2 text-sm text-white/65">
              On récupère vos comptes et transactions Bridge.
            </p>
          </>
        ) : null}

        {phase === "success" ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: "#22C55E" }} />
            <h1 className="mt-4 text-xl font-semibold text-white">Banque connectée !</h1>
            <p className="mt-2 text-sm text-white/65">
              {stats
                ? `${stats.accounts} compte${stats.accounts > 1 ? "s" : ""} synchronisé${stats.accounts > 1 ? "s" : ""}.`
                : "Vos données sont prêtes."}
            </p>
            <p className="mt-1 text-xs text-white/40">Redirection vers vos documents…</p>
          </>
        ) : null}

        {phase === "error" ? (
          <>
            <AlertCircle className="mx-auto h-10 w-10" style={{ color: "#EF4444" }} />
            <h1 className="mt-4 text-xl font-semibold text-white">Synchronisation échouée</h1>
            <p
              className="mt-2 rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#FCA5A5",
              }}
            >
              {error}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/documents")}
              className="mt-4 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{
                backgroundColor: "rgba(197, 160, 89, 0.15)",
                border: "1px solid rgba(197, 160, 89, 0.5)",
                color: "#C5A059",
              }}
            >
              Retour aux documents
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
