"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPasswordRuleChecks } from "@/lib/auth/passwordPolicy";
import { COMPANY_SIZE_OPTIONS, SECTOR_OPTIONS } from "@/lib/onboarding/options";
import type { CompanySizeValue, SectorValue } from "@/lib/onboarding/options";
import { loginWithEmailPassword } from "@/lib/auth/login";
import { registerWithEmailPassword } from "@/lib/auth/register";
import { FeedbackToast } from "@/components/ui/FeedbackToast";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { firebaseAuthGateway } from "@/services/auth";
import { markUserEmailAsVerified, saveUserProfile } from "@/services/userProfileStore";
import type { LoginValidationErrors, RegisterValidationErrors } from "@/types/auth";

type AuthMode = "login" | "register";

const EMPTY_LOGIN_ERRORS: LoginValidationErrors = {};
const EMPTY_REGISTER_ERRORS: RegisterValidationErrors = {};
type ToastState = { type: "success" | "error" | "info"; message: string } | null;

export function LoginForm() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [siren, setSiren] = useState("");
  const [companySize, setCompanySize] = useState<CompanySizeValue | "">("");
  const [sector, setSector] = useState<SectorValue | "">("");
  const [showPassword, setShowPassword] = useState(false);

  const [loginErrors, setLoginErrors] = useState<LoginValidationErrors>(EMPTY_LOGIN_ERRORS);
  const [registerErrors, setRegisterErrors] = useState<RegisterValidationErrors>(EMPTY_REGISTER_ERRORS);

  const [isCheckingSession] = useState(() => {
    const currentUser = firebaseAuthGateway.getCurrentUser();
    return Boolean(currentUser?.emailVerified);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [authInfoMessage, setAuthInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = firebaseAuthGateway.getCurrentUser();

    if (currentUser?.emailVerified) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginErrors(EMPTY_LOGIN_ERRORS);
    setRegisterErrors(EMPTY_REGISTER_ERRORS);
    setIsSubmitting(true);

    if (mode === "login") {
      setAuthInfoMessage(null);
      const result = await loginWithEmailPassword(firebaseAuthGateway, {
        email,
        password
      });

      if (!result.success) {
        setLoginErrors(result.errors);
        setToast({
          type: "error",
          message: result.errors.general ?? "Connexion impossible. Verifiez vos informations."
        });
        setIsSubmitting(false);
        return;
      }

      try {
        await markUserEmailAsVerified(result.user.uid);
      } catch {
        // User profile document may not exist for legacy accounts.
      }
      router.push("/dashboard");
      return;
    }

    const result = await registerWithEmailPassword(
      {
        register: firebaseAuthGateway.register,
        saveProfile: saveUserProfile
      },
      {
        lastName,
        firstName,
        email,
        password,
        companyName,
        siren,
        companySize,
        sector
      }
    );

    if (!result.success) {
      setRegisterErrors(result.errors);
      setToast({
        type: "error",
        message: result.errors.general ?? "Inscription invalide. Verifiez le formulaire."
      });
      setIsSubmitting(false);
      return;
    }

    await firebaseAuthGateway.signOut();
    setIsSubmitting(false);
    setMode("login");
    setLoginErrors(EMPTY_LOGIN_ERRORS);
    setAuthInfoMessage("Compte cree. Verifiez votre email et votre dossier spam avant de vous connecter.");
    setToast({
      type: "success",
      message: "Compte cree avec succes. Verifiez votre boite email et vos spams."
    });
  }

  if (isCheckingSession) {
    return (
      <section className="quantis-panel w-full max-w-xl p-8 text-center">
        <p className="text-sm text-quantis-slate">Verification de session...</p>
      </section>
    );
  }

  const currentErrors = mode === "login" ? loginErrors : registerErrors;
  const passwordRules = getPasswordRuleChecks(password);

  return (
    <section className="quantis-panel mesh-gradient relative w-full max-w-xl p-8">
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}
      <QuantisLogo className="mb-1" />
      <h1 className="mt-2 text-3xl font-semibold leading-tight text-quantis-carbon">
        Espace financier
        <span className="ml-2 text-quantis-gold">securise</span>
      </h1>
      <div className="quantis-accent-line mt-4" />
      <p className="mt-4 text-sm text-quantis-slate">
        {mode === "login"
          ? "Connectez-vous avec votre compte Firebase."
          : "Inscrivez-vous pour activer votre espace entreprise."}
      </p>
      {mode === "login" && authInfoMessage ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {authInfoMessage}
        </p>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        {mode === "register" ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Nom</span>
              <div className="quantis-input px-3 py-2">
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Votre nom"
                  className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
                  autoComplete="family-name"
                  title="Nom de famille de la personne responsable"
                />
              </div>
              {registerErrors.lastName ? <span className="mt-1 block text-sm text-rose-700">{registerErrors.lastName}</span> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Prenom</span>
              <div className="quantis-input px-3 py-2">
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Votre prenom"
                  className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
                  autoComplete="given-name"
                  title="Prenom de la personne responsable"
                />
              </div>
              {registerErrors.firstName ? <span className="mt-1 block text-sm text-rose-700">{registerErrors.firstName}</span> : null}
            </label>
          </>
        ) : null}

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
              title="Adresse email professionnelle"
            />
          </div>
          {currentErrors.email ? <span className="mt-1 block text-sm text-rose-700">{currentErrors.email}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Mot de passe</span>
          <div className="quantis-input flex items-center gap-2 px-3 py-2">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Votre mot de passe"
              className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="rounded p-1 text-quantis-slate transition-colors hover:text-quantis-carbon"
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {currentErrors.password ? <span className="mt-1 block text-sm text-rose-700">{currentErrors.password}</span> : null}
          {mode === "login" ? (
            <div className="mt-2 text-right">
              {/* Lien discret et accessible vers le flow de recuperation de mot de passe. */}
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-quantis-carbon underline underline-offset-2 hover:text-quantis-gold"
              >
                Mot de passe oublie ?
              </Link>
            </div>
          ) : null}
        </label>

        {mode === "register" ? (
          <>
            <div className="rounded-xl border border-quantis-mist bg-white px-3 py-2">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-quantis-slate">
                <Info className="h-3.5 w-3.5" />
                Securite mot de passe
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

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Nom entreprise</span>
              <div className="quantis-input px-3 py-2">
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Nom legal de l'entreprise"
                  className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
                  autoComplete="organization"
                  title="Raison sociale / nom legal de l'entreprise"
                />
              </div>
              {registerErrors.companyName ? <span className="mt-1 block text-sm text-rose-700">{registerErrors.companyName}</span> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Numero SIREN</span>
              <div className="quantis-input px-3 py-2">
                <input
                  type="text"
                  value={siren}
                  onChange={(event) => setSiren(event.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="9 chiffres"
                  className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
                  inputMode="numeric"
                  autoComplete="off"
                  title="SIREN (9 chiffres)"
                />
              </div>
              {registerErrors.siren ? <span className="mt-1 block text-sm text-rose-700">{registerErrors.siren}</span> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Taille d&apos;entreprise</span>
              <div className="quantis-input px-3 py-2">
                <select
                  value={companySize}
                  onChange={(event) => setCompanySize(event.target.value as CompanySizeValue | "")}
                  className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
                >
                  <option value="">Choisir une taille</option>
                  {COMPANY_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.range}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-quantis-slate">Selectionnez la categorie de taille correspondant a votre entreprise.</p>
              {registerErrors.companySize ? <span className="mt-1 block text-sm text-rose-700">{registerErrors.companySize}</span> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-quantis-carbon">Secteur</span>
              <div className="quantis-input px-3 py-2">
                <select
                  value={sector}
                  onChange={(event) => setSector(event.target.value as SectorValue | "")}
                  className="w-full border-0 bg-transparent text-sm text-quantis-carbon outline-none"
                >
                  <option value="">Choisir un secteur</option>
                  {SECTOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-quantis-slate">Choisissez votre secteur principal d&apos;activite.</p>
              {registerErrors.sector ? <span className="mt-1 block text-sm text-rose-700">{registerErrors.sector}</span> : null}
            </label>
          </>
        ) : null}

        {currentErrors.general ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{currentErrors.general}</p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="quantis-primary w-full py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? mode === "login"
              ? "Connexion..."
              : "Inscription..."
            : mode === "login"
              ? "Se connecter"
              : "Creer mon compte"}
        </button>
      </form>

      <div className="mt-5 text-sm text-quantis-slate">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <button
              type="button"
              className="font-medium text-quantis-carbon underline underline-offset-2"
              onClick={() => {
                setMode("register");
                setLoginErrors(EMPTY_LOGIN_ERRORS);
                setAuthInfoMessage(null);
                setPassword("");
              }}
            >
              S&apos;inscrire
            </button>
          </>
        ) : (
          <>
            Vous avez deja un compte ?{" "}
            <button
              type="button"
              className="font-medium text-quantis-carbon underline underline-offset-2"
              onClick={() => {
                setMode("login");
                setRegisterErrors(EMPTY_REGISTER_ERRORS);
                setAuthInfoMessage(null);
                setPassword("");
              }}
            >
              Se connecter
            </button>
          </>
        )}
      </div>
    </section>
  );
}
