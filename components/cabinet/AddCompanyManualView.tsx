// File: components/cabinet/AddCompanyManualView.tsx
// Role: form d'ajout manuel d'une entreprise au cabinet.
//
// Champs : nom (obligatoire), SIREN (optionnel — auto-complétion désactivée
// pour l'instant, à câbler quand une route /api/pappers/company sera créée),
// fichier comptable optionnel (FEC ou Excel/PDF selon `?source=`).
//
// Comportement :
//   - POST /api/companies/create (à créer côté serveur) avec firmId + nom.
//     En attendant la route, on appelle une route stub /api/cabinet/companies/create.
//   - Si fichier présent, l'upload est délégué au pipeline existant
//     /api/analyses (parse → mappedData → kpis → score Vyzor).
//
// Réservé aux firm_member (garde via useAccountType + redirect).
"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { useAccountType } from "@/hooks/useAccountType";
import { ROUTES } from "@/lib/config/routes";
import { ACCOUNT_TYPES } from "@/lib/config/account-types";
import { getDataSourceByProvider } from "@/lib/config/data-sources";

export function AddCompanyManualView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceProvider = searchParams.get("source") || "fec";
  const source = getDataSourceByProvider(sourceProvider);

  const { accountType, firmId, loading: accountLoading } = useAccountType();

  const [companyName, setCompanyName] = useState("");
  const [siren, setSiren] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!accountLoading && accountType !== ACCOUNT_TYPES.FIRM_MEMBER) {
    router.replace(ROUTES.SYNTHESE);
    return null;
  }

  const isFec = sourceProvider === "fec";
  const fileAccept = isFec ? ".txt,.csv,.tsv" : ".xlsx,.xls,.pdf";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = companyName.trim();
    if (!trimmedName) {
      setError("Le nom de l'entreprise est obligatoire.");
      return;
    }
    if (!firmId) {
      setError("Aucun cabinet rattaché à votre compte.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");

      // Création de la Company côté serveur.
      const createRes = await fetch("/api/cabinet/companies/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          siren: siren.replace(/\D/g, "").slice(0, 9) || null,
          provider: sourceProvider,
        }),
      });
      const createPayload = (await createRes.json().catch(() => ({}))) as {
        companyId?: string;
        error?: string;
      };
      if (!createRes.ok || !createPayload.companyId) {
        throw new Error(createPayload.error || "Création de l'entreprise échouée.");
      }

      // Upload optionnel — pipeline existant /api/analyses. Si l'user n'a
      // pas joint de fichier, l'entreprise reste en `pending_upload` côté
      // server (la Company existe, l'analyse viendra plus tard).
      if (file) {
        const user = firebaseAuthGateway.getCurrentUser();
        if (user) {
          const formData = new FormData();
          formData.append("userId", user.uid);
          formData.append("folderName", trimmedName);
          formData.append("source", "upload");
          formData.append("companyId", createPayload.companyId);
          formData.append("files", file);
          await fetch("/api/analyses", { method: "POST", body: formData });
          // On ne block pas sur l'échec de l'upload — l'utilisateur pourra
          // ré-uploader depuis le cockpit Dossier.
        }
      }

      router.push(ROUTES.CABINET_PORTFOLIO);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <button
        type="button"
        onClick={() => router.push(ROUTES.CABINET_ADD_COMPANY)}
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
        <h1
          className="text-xl font-semibold md:text-2xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          Ajouter une entreprise
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--app-text-secondary)" }}
        >
          Source&nbsp;: {source?.name ?? sourceProvider}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <Field
            id="siren"
            label="SIREN (optionnel)"
            hint="Auto-complétion via Pappers à venir."
          >
            <input
              id="siren"
              type="text"
              value={siren}
              onChange={(e) => setSiren(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="123 456 789"
              inputMode="numeric"
              maxLength={9}
              className="w-full rounded-lg px-3 py-2 font-mono text-sm outline-none"
              style={{
                border: "1px solid var(--app-border-strong)",
                backgroundColor: "var(--app-surface-soft)",
                color: "var(--app-text-primary)",
              }}
            />
          </Field>

          <Field id="companyName" label="Nom de l'entreprise *">
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="SARL Martin & Fils"
              maxLength={200}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                border: "1px solid var(--app-border-strong)",
                backgroundColor: "var(--app-surface-soft)",
                color: "var(--app-text-primary)",
              }}
            />
          </Field>

          <Field
            id="file"
            label={isFec ? "Fichier FEC (.txt ou .csv)" : "Bilan / Compte de résultat (.xlsx, .pdf)"}
            hint="Optionnel — l'entreprise peut être créée vide, l'analyse peut venir plus tard."
          >
            <label
              className="flex h-28 cursor-pointer items-center justify-center rounded-lg text-center"
              style={{
                border: "2px dashed var(--app-border-strong)",
                backgroundColor: "var(--app-surface-soft)",
              }}
            >
              <input
                id="file"
                type="file"
                accept={fileAccept}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {file ? (
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--app-brand-gold-deep)" }}>
                    {file.name}
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
                    {(file.size / 1024).toFixed(0)} Ko
                  </p>
                </div>
              ) : (
                <div>
                  <Upload
                    className="mx-auto mb-1 h-4 w-4"
                    style={{ color: "var(--app-text-tertiary)" }}
                  />
                  <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                    Cliquez pour sélectionner un fichier
                  </p>
                </div>
              )}
            </label>
          </Field>

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
            disabled={busy || !companyName.trim()}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Création…" : "Ajouter l'entreprise"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium"
        style={{ color: "var(--app-text-secondary)" }}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
