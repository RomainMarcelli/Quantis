// File: components/account/AccountView.tsx
// Role: page de gestion compte (profil, suppression data stats, suppression compte) avec DA premium cohérente.
"use client";

import { type FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { QuantisSelect } from "@/components/ui/QuantisSelect";
import { useTheme } from "@/hooks/useTheme";
import { deleteAccountData, updateAccountProfile } from "@/lib/account/account";
import { clearLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { clearActiveFolderName } from "@/lib/folders/activeFolder";
import {
  COMPANY_SIZE_OPTIONS,
  OTHER_SECTOR_OPTION_VALUE,
  SECTOR_OPTIONS,
  isSectorValue
} from "@/lib/onboarding/options";
import type { CompanySizeValue } from "@/lib/onboarding/options";
import { deleteAccountEverywhere } from "@/services/accountDeletionApi";
import {
  loadAccountProfile,
  purgeAnalysisData,
  saveAccountProfile
} from "@/services/accountService";
import { firebaseAuthGateway } from "@/services/auth";
import { logClientSecurityEvent } from "@/services/securityAuditClient";
import { useAuthenticatedUser } from "@/components/auth/AuthGate";
import type { UserProfileUpdateInput } from "@/types/profile";

type ToastState = { type: "success" | "error" | "info"; message: string } | null;
type DeleteMode = "data" | "account" | null;

type AccountViewProps = {
  fromAnalysis?: boolean;
};

export function AccountView({ fromAnalysis = false }: AccountViewProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const { user } = useAuthenticatedUser();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // État UX: confirmation inline de sauvegarde pour rassurer l'utilisateur sans dépendre uniquement du toast.
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [siren, setSiren] = useState("");
  const [companySize, setCompanySize] = useState<CompanySizeValue | "">("");
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const profile = await loadAccountProfile(user);
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setCompanyName(profile.companyName);
        setSiren(profile.siren);
        setCompanySize(profile.companySize);
        if (profile.sector && !isSectorValue(profile.sector)) {
          setSector(OTHER_SECTOR_OPTION_VALUE);
          setCustomSector(profile.sector);
        } else {
          setSector(profile.sector);
          setCustomSector("");
        }
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
    setProfileSavedAt(null);

    const input: UserProfileUpdateInput = {
      firstName,
      lastName,
      companyName,
      siren,
      companySize,
      sector:
        sector === OTHER_SECTOR_OPTION_VALUE ? customSector.trim() : sector.trim()
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
      message: "Profil mis à jour avec succès."
    });
    setProfileSavedAt(new Date().toISOString());
    setSubmitting(false);
  }

  async function onDeleteData() {
    if (!user) {
      return;
    }

    const result = await deleteAccountData(
      {
        deleteUserData: purgeAnalysisData
      },
      user.uid
    );

    if (!result.success) {
      // Journalisation sécurité: échec de purge des données statistiques.
      void logClientSecurityEvent({
        eventType: "analysis_data_delete_failed",
        statusCode: 500,
        userId: user.uid,
        message: result.message
      });
      setToast({ type: "error", message: result.message });
      return;
    }

    setDeleteMode(null);
    setDeleteConfirmation("");

    // Les dossiers visibles dans l'UI dérivent des analyses + du dossier actif local.
    // On purge aussi le dossier actif local pour repartir sur une session propre.
    clearActiveFolderName();

    // Les analyses étant supprimées, on retire aussi l'indicateur local utilisé sur /dashboard.
    clearLocalAnalysisHint();

    setToast({
      type: "success",
      message: `Données statistiques supprimées: ${result.deletedAnalysesCount ?? 0} analyses. Votre profil est conservé.`
    });

    // Journalisation sécurité: purge des données statistiques réalisée.
    void logClientSecurityEvent({
      eventType: "analysis_data_deleted",
      statusCode: 200,
      userId: user.uid,
      message: "Suppression des données statistiques confirmée.",
      metadata: {
        deletedAnalysesCount: result.deletedAnalysesCount ?? 0
      }
    });

    // Après purge des données, on renvoie l'utilisateur vers l'upload guidé.
    router.replace("/upload");
  }

  async function onDeleteAccount() {
    if (!user) {
      return;
    }

    try {
      const idToken = await firebaseAuthGateway.getIdToken(true);
      if (!idToken) {
        setToast({
          type: "error",
          message: "Session expirée. Reconnectez-vous pour supprimer le compte."
        });
        return;
      }

      const result = await deleteAccountEverywhere(idToken);

      // Journalisation sécurité: suppression complète de compte validée.
      void logClientSecurityEvent({
        eventType: "account_deleted",
        statusCode: 200,
        userId: user.uid,
        message: "Suppression complète du compte validée.",
        metadata: {
          deletedAnalysesCount: result.deletedAnalysesCount ?? 0,
          deletedFoldersCount: result.deletedFoldersCount ?? 0
        }
      });

      // Le compte est détruit: on nettoie aussi les traces locales.
      clearActiveFolderName();
      clearLocalAnalysisHint();
      try {
        await firebaseAuthGateway.signOut();
      } catch {
        // Non bloquant: le compte est déjà supprimé côté serveur.
      }
      router.replace("/");
    } catch (error) {
      // Journalisation sécurité: échec de suppression complète de compte.
      void logClientSecurityEvent({
        eventType: "account_delete_failed",
        statusCode: 500,
        userId: user.uid,
        message:
          error instanceof Error ? error.message : "Suppression complète du compte impossible pour le moment."
      });
      setToast({
        type: "error",
        message:
          error instanceof Error ? error.message : "Suppression complète du compte impossible pour le moment."
      });
    }
  }

  function onDeleteDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteMode === "data") {
      void onDeleteData();
      return;
    }
    if (deleteMode === "account") {
      void onDeleteAccount();
    }
  }

  async function handleLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  const accountDeletionPhrase = "SUPPRIMER MON COMPTE";
  const accountDeletionReady = deleteConfirmation.trim() === accountDeletionPhrase;

  if (loading) {
    return (
      <section className="precision-card rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Chargement du compte...</p>
      </section>
    );
  }

  return (
    <section className="premium-analysis-root relative space-y-6 overflow-hidden rounded-2xl p-4 md:p-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}

      <header className="precision-card relative z-10 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Branding: logo agrandi et mieux encadré pour un rendu net dans le header compte. */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-black/30 shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
              <QuantisLogo withText={false} size={40} imageClassName="h-9 w-9 object-contain" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Quantis</p>
              <p className="text-xs text-white/70">Espace compte</p>
            </div>
          </div>

          {/* Hiérarchie d'actions: retour (primaire) puis déconnexion (secondaire risque). */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(fromAnalysis ? "/analysis" : "/upload")}
              className="btn-gold-premium rounded-xl px-3.5 py-1.5 text-xs font-semibold transition"
            >
              {fromAnalysis ? "Retour à l’analyse" : "Aller à l’upload"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium transition ${
                isDark
                  ? "border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                  : "border-rose-700/50 bg-rose-100 text-rose-900 hover:bg-rose-200"
              }`}
            >
              Se déconnecter
            </button>
          </div>
        </div>

        <h1 className="mt-1 text-2xl font-semibold text-white">Profil utilisateur</h1>
        <p className="mt-2 text-sm text-white/75">Mettez à jour vos informations entreprise et personnelles.</p>
      </header>

      <section className="precision-card relative z-10 rounded-2xl p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            disabled
            hint="L’email est géré par Firebase Auth."
          />
          <Field
            label="SIREN"
            value={siren}
            onChange={(value) => setSiren(value.replace(/\D/g, "").slice(0, 9))}
            error={errors.siren}
          />
          <Field label="Nom" value={lastName} onChange={setLastName} error={errors.lastName} />
          <Field label="Prénom" value={firstName} onChange={setFirstName} error={errors.firstName} />
          <Field
            label="Nom de l’entreprise"
            value={companyName}
            onChange={setCompanyName}
            error={errors.companyName}
          />

          <SelectField
            label="Taille de l’entreprise"
            value={companySize}
            onChange={(value) => setCompanySize(value as CompanySizeValue | "")}
            options={COMPANY_SIZE_OPTIONS.map((item) => ({
              value: item.value,
              label: `${item.label} - ${item.range}`
            }))}
            placeholder="Choisir une taille"
            error={errors.companySize}
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white/85">Secteur</span>
            <QuantisSelect
              value={sector}
              onChange={(value) => {
                setSector(value);
                if (value !== OTHER_SECTOR_OPTION_VALUE) {
                  setCustomSector("");
                }
              }}
              placeholder="Choisir un secteur"
              options={[
                ...SECTOR_OPTIONS.map((item) => ({ value: item, label: item })),
                { value: OTHER_SECTOR_OPTION_VALUE, label: OTHER_SECTOR_OPTION_VALUE }
              ]}
            />
            {sector === OTHER_SECTOR_OPTION_VALUE ? (
              <div className="quantis-input relative mt-2 px-3 py-2">
                <input
                  value={customSector}
                  onChange={(event) => setCustomSector(event.target.value)}
                  className="w-full border-0 bg-transparent pr-8 text-sm text-white outline-none"
                  placeholder="Précisez votre secteur d'activité"
                />
                {customSector ? (
                  <button
                    type="button"
                    onClick={() => setCustomSector("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
                    aria-label="Effacer le secteur"
                    title="Effacer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {errors.sector ? <span className="mt-1 block text-sm text-rose-300">{errors.sector}</span> : null}
          </label>
        </div>

        <div className="mt-5">
          <button
            type="button"
            disabled={submitting}
            onClick={onSaveProfile}
            className="btn-gold-premium rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Enregistrement..." : "Mettre à jour le profil"}
          </button>

          {/* Confirmation inline persistante quelques secondes pour augmenter la confiance utilisateur. */}
          {profileSavedAt ? (
            <p className="mt-2 inline-flex items-center rounded-lg border border-emerald-400/35 bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-200">
              Profil enregistré avec succès.
            </p>
          ) : null}
        </div>
      </section>

      <section className="precision-card relative z-10 rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-white">Zone sensible</h2>
        <p className="mt-1 text-sm text-white/70">
          Vous pouvez supprimer uniquement vos statistiques d&apos;analyse ou supprimer totalement le compte.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              isDark
                ? "border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                : "border-rose-700/50 bg-rose-100 text-rose-900 hover:bg-rose-200"
            }`}
            onClick={() => setDeleteMode("data")}
          >
            Supprimer mes statistiques
          </button>
          <button
            type="button"
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              isDark
                ? "border-rose-500/40 bg-black/20 text-rose-200 hover:bg-rose-500/20"
                : "border-rose-800/60 bg-rose-100 text-rose-900 hover:bg-rose-200"
            }`}
            onClick={() => setDeleteMode("account")}
          >
            Supprimer mon compte
          </button>
        </div>
      </section>

      {deleteMode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <form className="precision-card w-full max-w-lg rounded-2xl p-5" onSubmit={onDeleteDialogSubmit}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {deleteMode === "data" ? "Supprimer les statistiques" : "Supprimer le compte"}
                </h3>
                {deleteMode === "data" ? (
                  <div className="mt-1 text-sm text-white/70">
                    <p>Cette action supprime définitivement:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Vos dossiers d&apos;analyse</li>
                      <li>Toutes vos analyses (rawData, mappedData, kpis, historique)</li>
                      <li>Les résultats et tableaux issus de vos fichiers Excel/PDF</li>
                    </ul>
                    <p className="mt-2 font-medium text-white/85">
                      Votre profil (nom, prénom, entreprise, SIREN, taille, secteur) sera conservé.
                    </p>
                    <p className="mt-1 text-white/65">
                      Risque: cette suppression est irréversible, vos KPI et historiques ne pourront pas être récupérés.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-white/70">
                    <p>Cette action supprime définitivement:</p>
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
                <p className="text-sm text-white/70">
                  Tapez <strong>{accountDeletionPhrase}</strong> pour confirmer.
                </p>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none"
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
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10"
              >
                Annuler
              </button>

              {deleteMode === "data" ? (
                <button
                  type="submit"
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isDark ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-rose-700 text-white hover:bg-rose-800"
                  }`}
                  autoFocus
                >
                  <Trash2 className="h-4 w-4" />
                  Confirmer la suppression des statistiques
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!accountDeletionReady}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isDark ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-700 hover:bg-rose-800"
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer mon compte
                </button>
              )}
            </div>
          </form>
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
      <span className="mb-1.5 block text-sm font-medium text-white/85">{label}</span>
      <div className="quantis-input px-3 py-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="w-full border-0 bg-transparent text-sm text-white outline-none disabled:text-white/45"
        />
      </div>
      {/* Contraste légèrement renforcé pour les textes d'aide secondaires. */}
      {hint ? <p className="mt-1 text-xs text-white/65">{hint}</p> : null}
      {error ? <span className="mt-1 block text-sm text-rose-300">{error}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Choisir",
  error
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white/85">{label}</span>
      <QuantisSelect value={value} onChange={onChange} options={options} placeholder={placeholder} />
      {error ? <span className="mt-1 block text-sm text-rose-300">{error}</span> : null}
    </label>
  );
}
