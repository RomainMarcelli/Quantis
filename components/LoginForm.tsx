"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithEmailPassword } from "@/lib/auth/login";
import { firebaseAuthGateway } from "@/services/auth";
import type { LoginValidationErrors } from "@/types/auth";

const EMPTY_ERRORS: LoginValidationErrors = {};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginValidationErrors>(EMPTY_ERRORS);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const currentUser = firebaseAuthGateway.getCurrentUser();

    if (currentUser) {
      router.replace("/dashboard");
      return;
    }

    setIsCheckingSession(false);
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(EMPTY_ERRORS);
    setIsSubmitting(true);

    const result = await loginWithEmailPassword(firebaseAuthGateway, {
      email,
      password
    });

    if (!result.success) {
      setErrors(result.errors);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
  }

  if (isCheckingSession) {
    return (
      <section className="quantis-panel w-full max-w-md p-8 text-center">
        <p className="text-sm text-quantis-slate">Verification de session...</p>
      </section>
    );
  }

  return (
    <section className="quantis-panel mesh-gradient w-full max-w-md p-8">
      <p className="text-xs uppercase tracking-wide text-quantis-slate">Quantis</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-quantis-carbon">
        Secure financial
        <span className="ml-2 text-quantis-gold">workspace</span>
      </h1>
      <div className="quantis-accent-line mt-4" />
      <p className="mt-4 text-sm text-quantis-slate">Connectez-vous avec votre compte Firebase.</p>

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
          {errors.email ? <span className="mt-1 block text-sm text-rose-700">{errors.email}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Mot de passe</span>
          <div className="quantis-input px-3 py-2">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Votre mot de passe"
              className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
              autoComplete="current-password"
            />
          </div>
          {errors.password ? <span className="mt-1 block text-sm text-rose-700">{errors.password}</span> : null}
        </label>

        {errors.general ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{errors.general}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="quantis-primary w-full py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </section>
  );
}
