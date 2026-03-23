"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Eye, EyeOff, Info } from "lucide-react";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import {
  confirmPasswordResetFlow,
  verifyPasswordResetLink,
  validateResetPasswordInput
} from "@/lib/auth/passwordReset";
import { getPasswordRuleChecks } from "@/lib/auth/passwordPolicy";
import { firebaseAuthGateway } from "@/services/auth";
import { logClientSecurityEvent } from "@/services/securityAuditClient";

type ToastState = { type: "success" | "error" | "info"; message: string } | null;

type ResetPasswordFormProps = {
  oobCode?: string;
};

export function ResetPasswordForm({ oobCode = "" }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isCheckingCode, setIsCheckingCode] = useState(true);
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // Memoize la validation pour des retours UX immédiats sans logique dupliquée.
  const validation = useMemo(
    () => validateResetPasswordInput({ oobCode, password, confirmPassword }),
    [oobCode, password, confirmPassword]
  );
  const passwordRules = useMemo(() => getPasswordRuleChecks(password), [password]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let isMounted = true;

    async function checkResetCode() {
      setIsCheckingCode(true);
      const result = await verifyPasswordResetLink(firebaseAuthGateway, oobCode);
      if (!isMounted) {
        return;
      }

      if (!result.success) {
        setIsCodeValid(false);
        setCodeMessage(result.message);
        setIsCheckingCode(false);
        return;
      }

      setIsCodeValid(true);
      setCodeMessage(`Lien valide pour ${result.email}.`);
      setIsCheckingCode(false);
    }

    void checkResetCode();

    return () => {
      isMounted = false;
    };
  }, [oobCode]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasAttemptedSubmit(true);
    setFormError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const result = await confirmPasswordResetFlow(firebaseAuthGateway, {
      oobCode,
      password,
      confirmPassword
    });

    if (!result.success) {
      const message =
        result.errors.password ??
        result.errors.confirmPassword ??
        result.errors.general ??
        "Opération impossible pour le moment.";
      // Journalisation sécurité: échec de finalisation du reset mot de passe.
      void logClientSecurityEvent({
        eventType: "password_reset_completion_failed",
        statusCode: 400,
        userId: null,
        message,
        includeAuthToken: false
      });
      setFormError(message);
      setToast({
        type: "error",
        message
      });
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(result.message);
    // Journalisation sécurité: reset mot de passe finalisé.
    void logClientSecurityEvent({
      eventType: "password_reset_completed",
      statusCode: 200,
      userId: null,
      message: "Réinitialisation mot de passe terminée.",
      includeAuthToken: false
    });
    setToast({
      type: "success",
      message: result.message
    });
    setPassword("");
    setConfirmPassword("");
    setIsSubmitting(false);
  }

  if (isCheckingCode) {
    return (
      <section className="quantis-panel w-full max-w-xl p-8 text-center">
        <p className="text-sm text-quantis-slate">Vérification du lien de réinitialisation...</p>
      </section>
    );
  }

  if (!isCodeValid) {
    return (
      <section className="quantis-panel w-full max-w-xl p-8">
        {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}
        <QuantisLogo className="mb-1" />
        <h1 className="mt-2 text-2xl font-semibold text-quantis-carbon">Lien invalide</h1>
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {codeMessage ?? "Ce lien de réinitialisation est invalide ou expiré."}
        </p>
        <div className="mt-5">
          <Link href="/forgot-password" className="font-medium text-quantis-carbon underline underline-offset-2">
            Demander un nouveau lien
          </Link>
        </div>
      </section>
    );
  }

  const canSubmit =
    !isSubmitting &&
    !validation.password &&
    !validation.confirmPassword &&
    !validation.general &&
    password.length > 0 &&
    confirmPassword.length > 0;

  return (
    <section className="quantis-panel mesh-gradient relative w-full max-w-xl p-8">
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}
      <QuantisLogo className="mb-1" />
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-quantis-carbon">
        Nouveau mot de
        <span className="ml-2 text-quantis-gold">passe</span>
      </h1>
      <div className="quantis-accent-line mt-4" />
      <p className="mt-4 text-sm text-quantis-slate">
        Définissez un mot de passe sécurisé pour finaliser la réinitialisation.
      </p>
      {codeMessage ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {codeMessage}
        </p>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Nouveau mot de passe</span>
          <div className="quantis-input flex items-center gap-2 px-3 py-2">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Votre nouveau mot de passe"
              className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="rounded p-1 text-quantis-slate transition-colors hover:text-quantis-carbon"
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {hasAttemptedSubmit && validation.password ? (
            <span className="mt-1 block text-sm text-rose-700">{validation.password}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Confirmer le mot de passe</span>
          <div className="quantis-input flex items-center gap-2 px-3 py-2">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmez le mot de passe"
              className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              className="rounded p-1 text-quantis-slate transition-colors hover:text-quantis-carbon"
              aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {hasAttemptedSubmit && validation.confirmPassword ? (
            <span className="mt-1 block text-sm text-rose-700">{validation.confirmPassword}</span>
          ) : null}
        </label>

        <div className="rounded-xl border border-quantis-mist bg-white px-3 py-2">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-quantis-slate">
            <Info className="h-3.5 w-3.5" />
            Sécurité mot de passe
          </p>
          <ul className="grid grid-cols-3 gap-1.5">
            {passwordRules.map((rule) => (
              <li
                key={rule.key}
                className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                  rule.isValid
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
                title={rule.label}
              >
                {rule.isValid ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : (
                  <Circle className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{rule.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {formError ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
        ) : null}
        {successMessage ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="quantis-primary w-full py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Mise à jour..." : "Mettre à jour le mot de passe"}
        </button>
      </form>

      <div className="mt-5 text-sm text-quantis-slate">
        <Link href="/" className="font-medium text-quantis-carbon underline underline-offset-2">
          Retour a la connexion
        </Link>
      </div>
    </section>
  );
}
