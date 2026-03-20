// components/LoginForm.tsx
// Formulaire unifie de connexion/inscription avec DA premium alignee sur le cockpit /analysis.
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

type ToastState = { type: "success" | "error" | "info"; message: string } | null;

const EMPTY_LOGIN_ERRORS: LoginValidationErrors = {};
const EMPTY_REGISTER_ERRORS: RegisterValidationErrors = {};

export function LoginForm() {
  const router = useRouter();
  // Reference de la carte pour recentrer la vue en haut apres une inscription reussie.
  const cardRef = useRef<HTMLElement | null>(null);

  // Etat principal du formulaire auth (connexion / inscription).
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

  // Verification immediate d'une session deja active.
  const [isCheckingSession] = useState(() => {
    const currentUser = firebaseAuthGateway.getCurrentUser();
    return Boolean(currentUser?.emailVerified);
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [authInfoMessage, setAuthInfoMessage] = useState<string | null>(null);

  const currentErrors = mode === "login" ? loginErrors : registerErrors;
  const passwordRules = useMemo(() => getPasswordRuleChecks(password), [password]);

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
        // Le profil peut manquer pour les comptes historiques; on ne bloque pas la navigation.
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

    // On recentre la vue en haut pour que le message de confirmation soit visible immediatement.
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  if (isCheckingSession) {
    return (
      <section className="precision-card relative z-10 w-full max-w-xl rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Verification de session...</p>
      </section>
    );
  }

  return (
    <section
      ref={cardRef}
      className="precision-card relative z-10 w-full max-w-2xl rounded-2xl border-white/10 p-6 md:p-8"
    >
      {toast ? <FeedbackToast type={toast.type} message={toast.message} /> : null}
      {mode === "login" && authInfoMessage ? (
        <p className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {authInfoMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <QuantisLogo withText={false} size={34} className="mb-3" />
          <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
            {mode === "login" ? "Connexion" : "Creation de compte"}
            <span className="ml-2 text-quantis-gold">Quantis</span>
          </h1>
          <p className="mt-3 text-sm text-white/60">
            {mode === "login"
              ? "Accedez a votre cockpit financier en quelques secondes."
              : "Configurez votre compte entreprise pour lancer vos analyses."}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setRegisterErrors(EMPTY_REGISTER_ERRORS);
              setAuthInfoMessage(null);
              setPassword("");
            }}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "login"
                ? "bg-quantis-gold text-black"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setLoginErrors(EMPTY_LOGIN_ERRORS);
              setAuthInfoMessage(null);
              setPassword("");
            }}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "register"
                ? "bg-quantis-gold text-black"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            Inscription
          </button>
        </div>
      </div>

      <div className="card-header mt-6" />

      <form className="space-y-4" onSubmit={onSubmit}>
        {mode === "register" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">Nom</span>
              <div className="quantis-input bg-white/5 px-3 py-2">
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Votre nom"
                  className="w-full border-0 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                  autoComplete="family-name"
                  title="Nom de famille de la personne responsable"
                />
              </div>
              {registerErrors.lastName ? <InlineError message={registerErrors.lastName} /> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white">Prenom</span>
              <div className="quantis-input bg-white/5 px-3 py-2">
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Votre prenom"
                  className="w-full border-0 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                  autoComplete="given-name"
                  title="Prenom de la personne responsable"
                />
              </div>
              {registerErrors.firstName ? <InlineError message={registerErrors.firstName} /> : null}
            </label>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">Email</span>
          <div className="quantis-input bg-white/5 px-3 py-2">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@entreprise.com"
              className="w-full border-0 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              autoComplete="email"
              title="Adresse email professionnelle"
            />
          </div>
          {currentErrors.email ? <InlineError message={currentErrors.email} /> : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">Mot de passe</span>
          <div className="quantis-input flex items-center gap-2 bg-white/5 px-3 py-2">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Votre mot de passe"
              className="w-full border-0 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="rounded p-1 text-white/60 transition-colors hover:text-white"
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {currentErrors.password ? <InlineError message={currentErrors.password} /> : null}

          {mode === "login" ? (
            <div className="mt-2 text-right">
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-quantis-gold underline underline-offset-2 hover:text-yellow-300"
              >
                Mot de passe oublie ?
              </Link>
            </div>
          ) : null}
        </label>

        {mode === "register" ? (
          <>
            {/* Bloc securite en chips pour un feedback lisible sans casser la mise en page. */}
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/75">
                <Info className="h-3.5 w-3.5" />
                Securite mot de passe
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {passwordRules.map((rule) => (
                  <li
                    key={rule.key}
                    className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                      rule.isValid
                        ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                        : "border-rose-400/35 bg-rose-500/15 text-rose-200"
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

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white">Nom entreprise</span>
                <div className="quantis-input bg-white/5 px-3 py-2">
                  <input
                    type="text"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="Nom legal de l'entreprise"
                    className="w-full border-0 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                    autoComplete="organization"
                    title="Raison sociale / nom legal de l'entreprise"
                  />
                </div>
                {registerErrors.companyName ? <InlineError message={registerErrors.companyName} /> : null}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white">Numero SIREN</span>
                <div className="quantis-input bg-white/5 px-3 py-2">
                  <input
                    type="text"
                    value={siren}
                    onChange={(event) => setSiren(event.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="9 chiffres"
                    className="w-full border-0 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                    inputMode="numeric"
                    autoComplete="off"
                    title="SIREN (9 chiffres)"
                  />
                </div>
                {registerErrors.siren ? <InlineError message={registerErrors.siren} /> : null}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white">Taille d&apos;entreprise</span>
                <div className="quantis-input bg-white/5 px-3 py-2">
                  <select
                    value={companySize}
                    onChange={(event) => setCompanySize(event.target.value as CompanySizeValue | "")}
                    className="w-full border-0 bg-transparent text-sm text-white outline-none"
                  >
                    <option value="">Choisir une taille</option>
                    {COMPANY_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.range}
                      </option>
                    ))}
                  </select>
                </div>
                {registerErrors.companySize ? <InlineError message={registerErrors.companySize} /> : null}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white">Secteur</span>
                <div className="quantis-input bg-white/5 px-3 py-2">
                  <select
                    value={sector}
                    onChange={(event) => setSector(event.target.value as SectorValue | "")}
                    className="w-full border-0 bg-transparent text-sm text-white outline-none"
                  >
                    <option value="">Choisir un secteur</option>
                    {SECTOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                {registerErrors.sector ? <InlineError message={registerErrors.sector} /> : null}
              </label>
            </div>
          </>
        ) : null}

        {currentErrors.general ? (
          <p className="rounded-lg border border-rose-400/35 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {currentErrors.general}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-quantis-gold py-2.5 text-sm font-semibold text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="mt-5 text-sm text-white/65">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <button
              type="button"
              className="font-medium text-quantis-gold underline underline-offset-2 hover:text-yellow-300"
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
              className="font-medium text-quantis-gold underline underline-offset-2 hover:text-yellow-300"
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

function InlineError({ message }: { message: string }) {
  return <span className="mt-1 block text-sm text-rose-300">{message}</span>;
}
