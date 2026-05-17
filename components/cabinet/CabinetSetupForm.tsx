// File: components/cabinet/CabinetSetupForm.tsx
// Role: formulaire PRÉ-signup pour le parcours cabinet — nom du cabinet +
// nombre estimé de dossiers. Stocke les valeurs en localStorage puis
// redirige vers /register?next=/cabinet/onboarding/connect.
// La création réelle de la Firm en Firestore est faite par AuthPage après
// signup, lecture des clés `vyzor_firm_name` / `vyzor_firm_expected_dossiers`.
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

const LS_KEYS = {
  firmName: "vyzor_firm_name",
  firmExpected: "vyzor_firm_expected_dossiers",
  accountType: "vyzor_account_type",
} as const;

export function CabinetSetupForm() {
  const router = useRouter();
  const [firmName, setFirmName] = useState("");
  const [expectedDossiers, setExpectedDossiers] = useState<number>(10);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = firmName.trim();
    if (!trimmed) {
      setError("Le nom du cabinet est obligatoire.");
      return;
    }
    if (trimmed.length > 120) {
      setError("Nom du cabinet trop long (max 120 caractères).");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_KEYS.accountType, "firm_member");
      window.localStorage.setItem(LS_KEYS.firmName, trimmed);
      window.localStorage.setItem(
        LS_KEYS.firmExpected,
        String(Math.max(1, Math.min(10_000, Math.round(expectedDossiers || 10))))
      );
    }
    router.push("/register?next=/cabinet/onboarding/connect");
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <button
        type="button"
        onClick={() => router.push("/onboarding")}
        className="mb-4 inline-flex items-center gap-1.5 text-xs"
        style={{ color: "var(--app-text-tertiary)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour
      </button>

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
          <Users className="h-6 w-6" />
        </span>

        <h1
          className="mt-4 text-xl font-semibold md:text-2xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          Configurer votre cabinet
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Ces informations alimentent votre portefeuille — modifiables plus tard.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="firmName"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Nom de votre cabinet *
            </label>
            <input
              id="firmName"
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="Ex : Cabinet Dupont & Associés"
              maxLength={120}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                border: "1px solid var(--app-border-strong)",
                backgroundColor: "var(--app-surface-soft)",
                color: "var(--app-text-primary)",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="expectedDossiers"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Nombre estimé de dossiers clients
            </label>
            <input
              id="expectedDossiers"
              type="number"
              min={1}
              max={10_000}
              value={expectedDossiers}
              onChange={(e) => setExpectedDossiers(Number(e.target.value))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                border: "1px solid var(--app-border-strong)",
                backgroundColor: "var(--app-surface-soft)",
                color: "var(--app-text-primary)",
              }}
            />
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              Aide à dimensionner votre interface — pas d'impact sur la facturation.
            </p>
          </div>

          {error ? (
            <p
              className="rounded-lg p-3 text-xs"
              style={{
                backgroundColor: "rgb(var(--app-danger-rgb, 239 68 68) / 10%)",
                color: "var(--app-danger, #EF4444)",
                border: "1px solid rgb(var(--app-danger-rgb, 239 68 68) / 30%)",
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            Continuer vers l'inscription →
          </button>
        </form>
      </div>
    </div>
  );
}
