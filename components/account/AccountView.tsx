"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { deleteAccountCompletely, deleteAccountData, updateAccountProfile } from "@/lib/account/account";
import { clearLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { clearActiveFolderName } from "@/lib/folders/activeFolder";
import { COMPANY_SIZE_OPTIONS, SECTOR_OPTIONS } from "@/lib/onboarding/options";
import type { CompanySizeValue, SectorValue } from "@/lib/onboarding/options";
import {
  loadAccountProfile,
  purgeAccountData,
  saveAccountProfile
} from "@/services/accountService";
import { firebaseAuthGateway } from "@/services/auth";
import type { AuthenticatedUser } from "@/types/auth";
import type { UserProfileUpdateInput } from "@/types/profile";

type ToastState = { type: "success" | "error" | "info"; message: string } | null;
type DeleteMode = "data" | "account" | null;

type AccountViewProps = {
  fromAnalysis?: boolean;
};

export function AccountView({ fromAnalysis = false }: AccountViewProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [siren, setSiren] = useState("");
  const [companySize, setCompanySize] = useState<CompanySizeValue | "">("");
  const [sector, setSector] = useState<SectorValue | "">("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }
      setUser(nextUser);
    });

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void (async () => {
      setLoading(true);
      try {
        const profile = await loadAccountProfile(user);
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setCompanyName(profile.companyName);
        setSiren(profile.siren);
        setCompanySize(profile.companySize);
        setSector(profile.sector);
        setEmail(profile.email || user.email || "");
      } catch {
        setToast({
          type: "error",
          message: "Impossible de charger le profil."
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function onSaveProfile() {
    if (!user) {
      return;
    }

    setSubmitting(true);
    setErrors({});

    const input: UserProfileUpdateInput = {
      firstName,
      lastName,
      companyName,
      siren,
      companySize,
      sector
    };

    const result = await updateAccountProfile(
      {
        updateProfile: saveAccountProfile
      },
      user.uid,
      input
    );

    if (!result.success) {
      setErrors(result.errors);
      setToast({
        type: "error",
        message: "Le formulaire contient des erreurs."
      });
      setSubmitting(false);
      return;
    }

    setToast({
      type: "success",
      message: "Profil mis a jour avec succes."
    });
    setSubmitting(false);
  }

  async function onDeleteData() {
    if (!user) {
      return;
    }

    const result = await deleteAccountData(
      {
        deleteUserData: purgeAccountData
      },
      user.uid
    );

    if (!result.success) {
      setToast({ type: "error", message: result.message });
      return;
    }

    setDeleteMode(null);
    setDeleteConfirmation("");
    setFirstName("");
    setLastName("");
    setCompanyName("");
    setSiren("");
    setCompanySize("");
    setSector("");
    // Les dossiers visibles dans l'UI derivent des analyses + du dossier actif local.
    // On purge aussi le dossier actif local pour repartir sur une session propre.
    clearActiveFolderName();
    // Les analyses etant supprimees, on retire aussi l'indicateur local
    // utilise pour afficher le bouton d'acces dashboard sur /dashboard.
    clearLocalAnalysisHint();
    setToast({
      type: "success",
      message: `Donnees supprimees: profil + dossiers + ${result.deletedAnalysesCount ?? 0} analyses.`
    });

    // Apres purge des donnees, on renvoie l'utilisateur vers l'espace de depot
    // pour repartir directement sur un nouveau flux d'import.
    router.replace("/dashboard");
  }

  async function onDeleteAccount() {
    if (!user) {
      return;
    }

    const result = await deleteAccountCompletely(
      {
        deleteUserData: purgeAccountData,
        deleteAuthAccount: firebaseAuthGateway.deleteCurrentUser
      },
      user.uid
    );

    if (!result.success) {
      setToast({ type: "error", message: result.message });
      return;
    }

    // Le compte est detruit: on nettoie aussi le dossier actif local.
    clearActiveFolderName();
    clearLocalAnalysisHint();
    router.replace("/");
  }

  async function handleLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  const accountDeletionPhrase = "SUPPRIMER MON COMPTE";
  const accountDeletionReady = deleteConfirmation.trim() === accountDeletionPhrase;

  if (loading) {
    return (
      <section className="quantis-panel p-8 text-center">
        <p className="text-sm text-quantis-slate">Chargement du compte...</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}

      <header className="quantis-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <QuantisLogo withText={false} size={24} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(fromAnalysis ? "/analysis" : "/dashboard")}
              className="rounded-xl border border-quantis-mist bg-white px-3 py-1.5 text-xs font-medium text-quantis-carbon hover:bg-quantis-paper"
            >
              {fromAnalysis ? "Retour au dashboard" : "Retour a l&apos;espace de depot"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="quantis-primary px-3 py-1.5 text-xs font-medium"
            >
              Se deconnecter
            </button>
          </div>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-quantis-carbon">Profil utilisateur</h1>
        <p className="mt-2 text-sm text-quantis-slate">
          Mettre a jour vos informations entreprise et personnelles.
        </p>
      </header>

      <section className="quantis-panel p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            disabled
            hint="L'email est gere par Firebase Auth."
          />
          <Field
            label="SIREN"
            value={siren}
            onChange={(value) => setSiren(value.replace(/\D/g, "").slice(0, 9))}
            error={errors.siren}
          />
          <Field label="Nom" value={lastName} onChange={setLastName} error={errors.lastName} />
          <Field label="Prenom" value={firstName} onChange={setFirstName} error={errors.firstName} />
          <Field
            label="Nom entreprise"
            value={companyName}
            onChange={setCompanyName}
            error={errors.companyName}
          />

          <SelectField
            label="Taille entreprise"
            value={companySize}
            onChange={(value) => setCompanySize(value as CompanySizeValue | "")}
            options={COMPANY_SIZE_OPTIONS.map((item) => ({
              value: item.value,
              label: `${item.label} - ${item.range}`
            }))}
            error={errors.companySize}
          />

          <SelectField
            label="Secteur"
            value={sector}
            onChange={(value) => setSector(value as SectorValue | "")}
            options={SECTOR_OPTIONS.map((item) => ({ value: item, label: item }))}
            error={errors.sector}
          />
        </div>

        <div className="mt-5">
          <button
            type="button"
            disabled={submitting}
            onClick={onSaveProfile}
            className="quantis-primary px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Enregistrement..." : "Mettre a jour le profil"}
          </button>
        </div>
      </section>

      <section className="quantis-panel p-5">
        <h2 className="text-lg font-semibold text-quantis-carbon">Zone sensible</h2>
        <p className="mt-1 text-sm text-quantis-slate">
          Vous pouvez supprimer uniquement vos donnees ou supprimer totalement le compte.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
            onClick={() => setDeleteMode("data")}
          >
            Supprimer mes donnees
          </button>
          <button
            type="button"
            className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
            onClick={() => setDeleteMode("account")}
          >
            Supprimer mon compte
          </button>
        </div>
      </section>

      {deleteMode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <div className="quantis-panel w-full max-w-lg p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />
              <div>
                <h3 className="text-lg font-semibold text-quantis-carbon">
                  {deleteMode === "data" ? "Supprimer les donnees" : "Supprimer le compte"}
                </h3>
                {deleteMode === "data" ? (
                  <div className="mt-1 text-sm text-quantis-slate">
                    <p>Cette action supprime definitivement:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Votre profil entreprise (nom, SIREN, taille, secteur)</li>
                      <li>Vos dossiers d&apos;analyse</li>
                      <li>Toutes vos analyses (rawData, mappedData, kpis, historique)</li>
                    </ul>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-quantis-slate">
                    <p>Cette action supprime definitivement:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Votre profil entreprise (nom, SIREN, taille, secteur)</li>
                      <li>Vos dossiers d&apos;analyse</li>
                      <li>Toutes vos analyses (rawData, mappedData, kpis, historique)</li>
                      <li>Votre compte Firebase Auth (connexion impossible ensuite)</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {deleteMode === "account" ? (
              <div className="mt-4">
                <p className="text-sm text-quantis-slate">
                  Tapez <strong>{accountDeletionPhrase}</strong> pour confirmer.
                </p>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  className="quantis-input mt-2 w-full px-3 py-2 text-sm outline-none"
                />
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteMode(null);
                  setDeleteConfirmation("");
                }}
                className="rounded-xl border border-quantis-mist bg-white px-3 py-2 text-sm text-quantis-carbon"
              >
                Annuler
              </button>

              {deleteMode === "data" ? (
                <button
                  type="button"
                  onClick={onDeleteData}
                  className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Confirmer suppression donnees
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  disabled={!accountDeletionReady}
                  className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer mon compte
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  disabled,
  hint
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">{label}</span>
      <div className="quantis-input px-3 py-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none disabled:text-quantis-slate"
        />
      </div>
      {hint ? <p className="mt-1 text-xs text-quantis-slate">{hint}</p> : null}
      {error ? <span className="mt-1 block text-sm text-rose-700">{error}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  error
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">{label}</span>
      <div className="quantis-input px-3 py-2">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
        >
          <option value="">Choisir</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <span className="mt-1 block text-sm text-rose-700">{error}</span> : null}
    </label>
  );
}
