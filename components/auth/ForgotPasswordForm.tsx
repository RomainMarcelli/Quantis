"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { requestPasswordReset, validateForgotPasswordInput } from "@/lib/auth/passwordReset";
import { firebaseAuthGateway } from "@/services/auth";

type ToastState = { type: "success" | "error" | "info"; message: string } | null;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const validation = useMemo(() => validateForgotPasswordInput({ email }), [email]);
  const canSubmit = !validation.email && !isSubmitting;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasAttemptedSubmit(true);
    setFormError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const result = await requestPasswordReset(firebaseAuthGateway, { email });
    if (!result.success) {
      const message = result.errors.email ?? result.errors.general ?? "Operation impossible pour le moment.";
      setFormError(message);
      setToast({
        type: "error",
        message
      });
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Un email de reinitialisation a ete envoye. Pensez a verifier vos spams.");
    setToast({
      type: "success",
      message: result.message
    });
    setIsSubmitting(false);
  }

  return (
    <section className="quantis-panel mesh-gradient relative w-full max-w-xl p-8">
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}
      <QuantisLogo className="mb-1" />
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-quantis-carbon">
        Mot de passe
        <span className="ml-2 text-quantis-gold">oublie</span>
      </h1>
      <div className="quantis-accent-line mt-4" />
      <p className="mt-4 text-sm text-quantis-slate">
        Saisissez votre email pour recevoir un lien de reinitialisation.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Email</span>
          <div className="quantis-input px-3 py-2">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@entreprise.com"
              className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
              autoComplete="email"
            />
          </div>
          {hasAttemptedSubmit && validation.email ? (
            <span className="mt-1 block text-sm text-rose-700">{validation.email}</span>
          ) : null}
        </label>

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
          {isSubmitting ? "Envoi..." : "Envoyer un lien de reinitialisation"}
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
