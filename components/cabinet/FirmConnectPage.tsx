// File: components/cabinet/FirmConnectPage.tsx
// Role: page client de connexion OAuth Pennylane Firm (Sprint C Tâche 3).
// Bouton qui POST /api/cabinet/oauth/start → récupère authorizeUrl →
// window.location.href = authorizeUrl.
//
// Affiche aussi les erreurs renvoyées par le callback via query params
// (?error=oauth_failed&detail=...).
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

const ERROR_MESSAGES: Record<string, string> = {
  user_denied: "Vous avez refusé l'autorisation sur Pennylane.",
  missing_params: "Paramètres OAuth manquants côté Pennylane.",
  state_invalid: "Session OAuth invalide ou expirée. Réessayez.",
  state_expired: "Délai d'autorisation dépassé. Réessayez.",
  provider_mismatch: "Erreur OAuth (provider incohérent).",
  oauth_failed: "Échec de l'échange OAuth. Réessayez ou contactez le support.",
};

export function FirmConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const errorMessage = errorParam ? (ERROR_MESSAGES[errorParam] ?? `Erreur : ${errorParam}`) : null;

  async function startOAuth() {
    setError(null);
    setBusy(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée — reconnectez-vous.");
      const res = await fetch("/api/cabinet/oauth/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Initialisation OAuth échouée.");
      }
      const { authorizeUrl } = data as { authorizeUrl: string };
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <div
        className="rounded-2xl p-8"
        style={{
          backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
          border: "1px solid var(--app-border)",
          backdropFilter: "blur(24px)",
        }}
      >
        <span
          className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 14%)",
            color: "var(--app-brand-gold-deep)",
          }}
        >
          <Building2 className="h-7 w-7" />
        </span>
        <h1
          className="mt-5 text-2xl font-semibold"
          style={{ color: "var(--app-text-primary)" }}
        >
          Connecter votre cabinet Pennylane
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
          Nous allons vous rediriger vers Pennylane pour vous identifier en tant qu'expert-comptable.
          Vous accorderez à Vyzor un accès <strong>lecture seule</strong> à vos dossiers clients
          (écritures, comptes, factures). Aucune écriture côté Pennylane.
        </p>

        <div className="mt-5 rounded-xl p-4" style={{ backgroundColor: "var(--app-surface-soft)" }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--app-text-tertiary)" }}>
            Étapes
          </p>
          <ol className="mt-2 space-y-1.5 text-sm" style={{ color: "var(--app-text-secondary)" }}>
            <li>1. Authentification sur Pennylane</li>
            <li>2. Autorisation des 11 scopes lecture seule</li>
            <li>3. Sélection des dossiers à activer dans Vyzor</li>
            <li>4. Accès à votre portefeuille de cabinets</li>
          </ol>
        </div>

        {errorMessage ? (
          <p
            className="mt-4 rounded-lg p-3 text-xs"
            style={{
              backgroundColor: "rgb(var(--app-danger-rgb, 239 68 68) / 10%)",
              color: "var(--app-danger, #EF4444)",
              border: "1px solid rgb(var(--app-danger-rgb, 239 68 68) / 30%)",
            }}
          >
            {errorMessage}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-xs" style={{ color: "var(--app-danger, #EF4444)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs transition disabled:opacity-50"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-secondary)",
            }}
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => void startOAuth()}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirection…
              </>
            ) : (
              "Connecter Pennylane →"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
