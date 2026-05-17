// File: components/auth/InviteAcceptView.tsx
// Role: vue d'acceptation d'invitation. Fetch l'invitation via la route
// publique GET /api/invite/[token] (server-side, contourne les Firestore
// rules qui interdisent les reads non-authentifiés). Si valide, affiche
// le nom de l'entreprise + bouton "Créer mon compte" qui pose le token en
// localStorage et redirige vers /register. AuthPage POST /api/invite/accept
// après signup réussi.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { ROUTES } from "@/lib/config/routes";
import { PRE_AUTH_STORAGE_KEYS, ACCOUNT_TYPES } from "@/lib/config/account-types";

type InviteState =
  | { status: "loading" }
  | { status: "valid"; companyName: string; email: string }
  | { status: "expired"; companyName?: string }
  | { status: "used"; companyName?: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

type ApiResponse =
  | { status: "valid"; companyName: string; email: string }
  | { status: "expired" | "used" | "not_found"; companyName?: string };

export function InviteAcceptView({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<InviteState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/invite/${encodeURIComponent(token)}`);
        const payload = (await res.json().catch(() => ({}))) as ApiResponse & { error?: string };
        if (cancelled) return;
        if (payload.status === "valid") {
          setState({ status: "valid", companyName: payload.companyName, email: payload.email });
          return;
        }
        if (payload.status === "expired" || payload.status === "used" || payload.status === "not_found") {
          setState({ status: payload.status, companyName: payload.companyName });
          return;
        }
        setState({ status: "error", message: payload.error || "Réponse inattendue." });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Erreur inconnue.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function accept(): void {
    if (state.status !== "valid") return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRE_AUTH_STORAGE_KEYS.accountType, ACCOUNT_TYPES.COMPANY_OWNER);
      window.localStorage.setItem(PRE_AUTH_STORAGE_KEYS.inviteToken, token);
      window.localStorage.setItem(PRE_AUTH_STORAGE_KEYS.inviteEmail, state.email);
    }
    const url = `${ROUTES.SIGNUP}?email=${encodeURIComponent(state.email)}&next=${encodeURIComponent(ROUTES.SYNTHESE)}`;
    router.push(url);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        className="rounded-2xl p-7"
        style={{
          backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
          border: "1px solid var(--app-border)",
          backdropFilter: "blur(24px)",
        }}
      >
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 14%)",
            color: "var(--app-brand-gold-deep)",
          }}
        >
          <Building2 className="h-6 w-6" />
        </span>

        <h1
          className="mt-4 text-xl font-semibold md:text-2xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          Invitation Vyzor
        </h1>

        {state.status === "loading" ? (
          <div className="mt-4 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-text-tertiary)" }} />
            <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
              Chargement…
            </p>
          </div>
        ) : null}

        {state.status === "valid" ? (
          <>
            <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
              Votre expert-comptable vous invite à accéder au cockpit financier de
            </p>
            <div
              className="mt-3 rounded-lg p-3"
              style={{
                backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 10%)",
                border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 30%)",
              }}
            >
              <p className="text-base font-semibold" style={{ color: "var(--app-brand-gold-deep)" }}>
                {state.companyName}
              </p>
            </div>
            <button
              type="button"
              onClick={accept}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition"
              style={{
                border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
                color: "var(--app-brand-gold-deep)",
                backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
              }}
            >
              Créer mon compte et accéder à mon cockpit →
            </button>
          </>
        ) : null}

        {state.status === "expired" || state.status === "used" || state.status === "not_found" || state.status === "error" ? (
          <>
            <p
              className="mt-4 text-sm"
              style={{ color: "var(--app-danger, #EF4444)" }}
            >
              {state.status === "expired"
                ? "Cette invitation a expiré. Demandez à votre cabinet d'en envoyer une nouvelle."
                : state.status === "used"
                  ? "Cette invitation a déjà été utilisée. Connectez-vous directement."
                  : state.status === "not_found"
                    ? "Invitation introuvable. Vérifiez le lien."
                    : `Erreur : ${state.message}`}
            </p>
            <button
              type="button"
              onClick={() => router.push(ROUTES.LOGIN)}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm transition"
              style={{
                border: "1px solid var(--app-border)",
                color: "var(--app-text-secondary)",
              }}
            >
              Aller à la connexion
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
