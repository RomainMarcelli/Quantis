// File: components/cabinet/FirmDossierPicker.tsx
// Role: picker de sélection des dossiers post-OAuth Firm (Sprint C Tâche 4).
//
// Affiche la liste des companies Pennylane retournées par /companies +
// permet à l'user de cocher/décocher. Par défaut, tous les mappings
// déjà actifs sont cochés (état post-import auto de Sprint B).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

type Mapping = {
  id: string;
  connectionId: string;
  companyId: string;
  externalCompanyId: string;
  externalCompanyName: string | null;
  isActive: boolean;
};

export function FirmDossierPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectionId = searchParams.get("connectionId");
  const importedCount = Number(searchParams.get("companies_imported") ?? "0");

  const [mappings, setMappings] = useState<Mapping[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionId) {
      setError("Paramètre connectionId manquant.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) throw new Error("Session expirée.");
        const res = await fetch(
          `/api/cabinet/connections/${encodeURIComponent(connectionId)}/mappings`,
          { headers: { Authorization: `Bearer ${idToken}` } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Chargement des dossiers échoué.");
        if (cancelled) return;
        const fetched = (data.mappings as Mapping[]) ?? [];
        setMappings(fetched);
        // Par défaut, on coche les mappings déjà actifs (import auto Sprint B).
        setSelectedIds(new Set(fetched.filter((m) => m.isActive).map((m) => m.id)));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const totalCount = mappings?.length ?? 0;
  const selectedCount = selectedIds.size;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function activateSelection() {
    if (!connectionId) return;
    setError(null);
    setBusy(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");
      const res = await fetch(
        `/api/cabinet/connections/${encodeURIComponent(connectionId)}/mappings`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ activatedMappingIds: Array.from(selectedIds) }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Activation échouée.");
      router.push("/cabinet/portefeuille");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setBusy(false);
    }
  }

  // Tri stable : actifs en haut, puis par nom.
  const sortedMappings = useMemo(() => {
    if (!mappings) return null;
    return [...mappings].sort((a, b) => {
      const an = a.externalCompanyName || a.externalCompanyId;
      const bn = b.externalCompanyName || b.externalCompanyId;
      return an.localeCompare(bn);
    });
  }, [mappings]);

  if (!connectionId) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-rose-400">connectionId manquant — retour à /cabinet/onboarding/connect</p>
      </div>
    );
  }

  if (mappings === null && !error) {
    return (
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 py-12">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-brand-gold-deep)" }} />
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Chargement des dossiers Pennylane…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--app-text-primary)" }}>
          Sélectionnez les dossiers à activer
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          {importedCount > 0
            ? `${importedCount} dossier${importedCount > 1 ? "s" : ""} importé${importedCount > 1 ? "s" : ""} depuis Pennylane.`
            : "Choisissez les dossiers à activer dans Vyzor."}
          {" Vous pourrez modifier ce choix plus tard."}
        </p>
      </div>

      <div
        className="mb-4 flex items-center justify-between rounded-xl px-4 py-3"
        style={{
          backgroundColor: "var(--app-surface-soft)",
          border: "1px solid var(--app-border)",
        }}
      >
        <span className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          <span style={{ color: "var(--app-brand-gold-deep)", fontWeight: 600 }}>
            {selectedCount}
          </span>{" "}
          dossier{selectedCount > 1 ? "s" : ""} sélectionné{selectedCount > 1 ? "s" : ""} sur {totalCount} disponible{totalCount > 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedIds(new Set((sortedMappings ?? []).map((m) => m.id)))}
            disabled={busy || totalCount === 0}
            className="rounded-md px-2 py-1 text-xs transition disabled:opacity-50"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            Tout cocher
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={busy || selectedCount === 0}
            className="rounded-md px-2 py-1 text-xs transition disabled:opacity-50"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sortedMappings?.map((m) => {
          const selected = selectedIds.has(m.id);
          const displayName = m.externalCompanyName || `Dossier ${m.externalCompanyId}`;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              disabled={busy}
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition disabled:opacity-50"
              style={{
                backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
                border: selected
                  ? "1px solid rgb(var(--app-brand-gold-deep-rgb) / 60%)"
                  : "1px solid var(--app-border)",
                boxShadow: selected
                  ? "0 4px 16px rgb(var(--app-brand-gold-deep-rgb) / 8%)"
                  : "none",
              }}
            >
              {selected ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color: "var(--app-brand-gold-deep)" }} />
              ) : (
                <Circle className="h-5 w-5 flex-shrink-0" style={{ color: "var(--app-text-tertiary)" }} />
              )}
              <Building2 className="h-4 w-4 flex-shrink-0" style={{ color: "var(--app-text-secondary)" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>
                  {displayName}
                </p>
                <p className="font-mono text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
                  ID Pennylane : {m.externalCompanyId}
                </p>
              </div>
            </button>
          );
        })}
        {sortedMappings?.length === 0 ? (
          <p
            className="rounded-xl p-6 text-center text-sm"
            style={{
              backgroundColor: "var(--app-surface-soft)",
              color: "var(--app-text-secondary)",
              border: "1px solid var(--app-border)",
            }}
          >
            Aucun dossier disponible. Reconnectez-vous à Pennylane si vous attendiez d'autres dossiers.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-xs" style={{ color: "var(--app-danger, #EF4444)" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/cabinet/onboarding/connect")}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-xs transition disabled:opacity-50"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-secondary)" }}
        >
          Retour
        </button>
        <button
          type="button"
          onClick={() => void activateSelection()}
          disabled={busy || selectedCount === 0}
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
              Activation…
            </>
          ) : (
            `Activer ${selectedCount} dossier${selectedCount > 1 ? "s" : ""} →`
          )}
        </button>
      </div>
    </div>
  );
}
