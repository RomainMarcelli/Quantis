// File: components/auth/AuthPage.tsx
// Role: page d'authentification (login / register / forgot) avec layout
// 2 colonnes :
//   - Gauche  : panneau branding centré verticalement, hiérarchie typo
//               claire (kicker → titre → sous-titre → grille de bénéfices),
//               glow radial discret en arrière-plan, footer en bas.
//   - Droite  : formulaire actif, modes basculables en crossfade.
//
// L'inscription est un wizard 3 étapes :
//   1. Identité           — prénom, nom, email, mot de passe
//   2. Entreprise         — raison sociale, SIREN, taille, secteur
//   3. Profil financier   — niveau, objectifs d'usage, CGU
//
// Toutes les données sont envoyées à `firebaseAuthGateway.register` en une
// seule fois à la dernière étape ; le niveau de littératie financière est
// persisté en `localStorage` (lu par l'AiChatPanel).
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { VyzorLogo } from "@/components/ui/VyzorLogo";
import { VyzorSelect } from "@/components/ui/VyzorSelect";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { firebaseAuthGateway } from "@/services/auth";
import {
  COMPANY_SIZE_OPTIONS,
  SECTOR_OPTIONS,
  OTHER_SECTOR_OPTION_VALUE,
  isCompanySizeValue,
  isSectorValue,
  type CompanySizeValue,
} from "@/lib/onboarding/options";
import {
  ONBOARDING_OBJECTIVE_OPTIONS,
  type OnboardingObjectiveValue,
} from "@/lib/onboarding/objectives";
import { setUserLevel, USER_LEVEL_META } from "@/lib/ai/userLevel";
import type { UserLevel } from "@/lib/ai/types";

type AuthMode = "login" | "register" | "forgot" | "forgot-sent";
type RegisterStep = 1 | 2 | 3;

type AuthPageProps = {
  /** Route de redirection après connexion réussie (défaut /synthese). */
  postLoginRedirect?: string;
  /** Mode initial. Défaut "login". */
  initialMode?: AuthMode;
};

export function AuthPage({
  postLoginRedirect = "/synthese",
  initialMode = "login",
}: AuthPageProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Champs partagés (login / register / forgot).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Wizard d'inscription.
  const [registerStep, setRegisterStep] = useState<RegisterStep>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [siren, setSiren] = useState("");
  const [companySize, setCompanySize] = useState<CompanySizeValue | "">("");
  const [sector, setSector] = useState<string>("");
  const [customSector, setCustomSector] = useState("");
  const [userLevel, setUserLevelState] = useState<UserLevel | "">("");
  const [usageObjectives, setUsageObjectives] = useState<OnboardingObjectiveValue[]>([]);
  const [acceptedCgu, setAcceptedCgu] = useState(false);

  // Erreurs par champ + bandeau global.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirige si déjà connecté.
  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((user) => {
      if (user?.emailVerified) {
        router.replace(postLoginRedirect);
      }
    });
    return unsubscribe;
  }, [router, postLoginRedirect]);

  function switchMode(next: AuthMode) {
    setMode(next);
    setGlobalError(null);
    setFieldErrors({});
    if (next === "register") setRegisterStep(1);
  }

  function setError(key: string, message: string | null) {
    setFieldErrors((prev) => ({ ...prev, [key]: message }));
  }

  function clearErrors() {
    setFieldErrors({});
    setGlobalError(null);
  }

  // ─── Validations ────────────────────────────────────────────────────
  function validateEmail(value: string): string | null {
    const v = value.trim();
    if (!v) return "Adresse email requise";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Adresse email invalide";
    return null;
  }
  function validatePassword(value: string): string | null {
    if (!value) return "Mot de passe requis";
    if (value.length < 8) return "8 caractères minimum";
    return null;
  }
  function validateSiren(value: string): string | null {
    const v = value.replace(/\s/g, "");
    if (!v) return "SIREN requis";
    if (!/^\d{9}$/.test(v)) return "SIREN à 9 chiffres";
    return null;
  }

  function mapFirebaseError(err: unknown): {
    global?: string;
    field?: { key: string; message: string };
  } {
    const code = (err as { code?: string }).code ?? "";
    if (
      code === "auth/invalid-credential" ||
      code === "auth/wrong-password" ||
      code === "auth/user-not-found"
    ) {
      return { global: "Email ou mot de passe incorrect" };
    }
    if (code === "auth/email-already-in-use") {
      return { field: { key: "email", message: "Un compte existe déjà avec cette adresse" } };
    }
    if (code === "auth/weak-password") {
      return { field: { key: "password", message: "Mot de passe trop faible" } };
    }
    if (code === "auth/email-not-verified") {
      return {
        global:
          "Email non vérifié. Consultez votre boîte mail pour le lien de validation.",
      };
    }
    if (code === "auth/network-request-failed") {
      return { global: "Erreur de connexion. Réessayez." };
    }
    return { global: "Erreur de connexion. Réessayez." };
  }

  // ─── Submits ────────────────────────────────────────────────────────
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    const ee = validateEmail(email);
    const pe = validatePassword(password);
    setError("email", ee);
    setError("password", pe);
    if (ee || pe) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      await firebaseAuthGateway.signIn({ email, password });
      router.replace(postLoginRedirect);
    } catch (err) {
      const mapped = mapFirebaseError(err);
      if (mapped.field) setError(mapped.field.key, mapped.field.message);
      else setGlobalError(mapped.global ?? "Erreur de connexion. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNextStep() {
    if (registerStep === 1) {
      const errs: Record<string, string | null> = {
        firstName: firstName.trim() ? null : "Prénom requis",
        lastName: lastName.trim() ? null : "Nom requis",
        email: validateEmail(email),
        password: validatePassword(password),
      };
      setFieldErrors(errs);
      if (Object.values(errs).some(Boolean)) return;
      setRegisterStep(2);
      return;
    }
    if (registerStep === 2) {
      const errs: Record<string, string | null> = {
        companyName: companyName.trim() ? null : "Raison sociale requise",
        siren: validateSiren(siren),
        companySize: companySize ? null : "Taille d'entreprise requise",
        sector:
          sector === ""
            ? "Secteur requis"
            : sector === OTHER_SECTOR_OPTION_VALUE && !customSector.trim()
              ? "Précisez votre secteur"
              : null,
      };
      setFieldErrors(errs);
      if (Object.values(errs).some(Boolean)) return;
      setRegisterStep(3);
      return;
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string | null> = {
      userLevel: userLevel ? null : "Sélectionnez votre niveau",
      usageObjectives:
        usageObjectives.length === 0 ? "Choisissez au moins un objectif" : null,
      cgu: acceptedCgu ? null : "Acceptez les CGU pour continuer",
    };
    setFieldErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      const finalSector =
        sector === OTHER_SECTOR_OPTION_VALUE ? customSector.trim() : sector;
      await firebaseAuthGateway.register({
        email,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName.trim(),
        siren: siren.replace(/\s/g, ""),
        companySize,
        sector: finalSector,
        usageObjectives,
      });
      if (userLevel) setUserLevel(userLevel);
      switchMode("forgot-sent");
    } catch (err) {
      const mapped = mapFirebaseError(err);
      if (mapped.field) {
        setError(mapped.field.key, mapped.field.message);
        // Si l'erreur concerne un champ d'une étape précédente, y revenir.
        if (mapped.field.key === "email" || mapped.field.key === "password") {
          setRegisterStep(1);
        }
      } else {
        setGlobalError(mapped.global ?? "Erreur de connexion. Réessayez.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    const ee = validateEmail(email);
    setError("email", ee);
    if (ee) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      await firebaseAuthGateway.sendPasswordReset(email);
      switchMode("forgot-sent");
    } catch (err) {
      const mapped = mapFirebaseError(err);
      setGlobalError(mapped.global ?? "Erreur de connexion. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="grid min-h-screen w-full"
      style={{ backgroundColor: "#09090b" }}
    >
      <div className="lg:grid lg:min-h-screen lg:grid-cols-2">
        <BrandingPanel />
        <FormPanel>
          <div key={`${mode}-${registerStep}`} className="vyzor-fade-up w-full">
            {/* Logo mobile : la colonne branding est masquée → on remet un
                logo en haut du form pour ne pas laisser l'écran nu. */}
            <div className="mb-8 flex justify-center lg:hidden">
              <VyzorLogo withText size={28} />
            </div>

            {mode === "login" && (
              <LoginFormBody
                email={email}
                password={password}
                showPassword={showPassword}
                emailError={fieldErrors.email ?? null}
                passwordError={fieldErrors.password ?? null}
                globalError={globalError}
                submitting={submitting}
                onEmailChange={(v) => {
                  setEmail(v);
                  if (fieldErrors.email) setError("email", null);
                }}
                onPasswordChange={(v) => {
                  setPassword(v);
                  if (fieldErrors.password) setError("password", null);
                }}
                onTogglePassword={() => setShowPassword((v) => !v)}
                onEmailBlur={() => setError("email", validateEmail(email))}
                onPasswordBlur={() => setError("password", validatePassword(password))}
                onSubmit={handleLogin}
                onSwitchMode={(m) => {
                  clearErrors();
                  switchMode(m);
                }}
              />
            )}

            {mode === "register" && (
              <RegisterWizard
                step={registerStep}
                firstName={firstName}
                lastName={lastName}
                email={email}
                password={password}
                showPassword={showPassword}
                companyName={companyName}
                siren={siren}
                companySize={companySize}
                sector={sector}
                customSector={customSector}
                userLevel={userLevel}
                usageObjectives={usageObjectives}
                acceptedCgu={acceptedCgu}
                fieldErrors={fieldErrors}
                globalError={globalError}
                submitting={submitting}
                onFirstNameChange={(v) => setFirstName(v)}
                onLastNameChange={(v) => setLastName(v)}
                onEmailChange={(v) => setEmail(v)}
                onPasswordChange={(v) => setPassword(v)}
                onTogglePassword={() => setShowPassword((v) => !v)}
                onCompanyNameChange={(v) => setCompanyName(v)}
                onSirenChange={(v) => setSiren(v.replace(/[^\d]/g, "").slice(0, 9))}
                onCompanySizeChange={(v) =>
                  setCompanySize(isCompanySizeValue(v) ? v : "")
                }
                onSectorChange={(v) => {
                  setSector(v);
                  if (v !== OTHER_SECTOR_OPTION_VALUE) setCustomSector("");
                }}
                onCustomSectorChange={setCustomSector}
                onUserLevelChange={(v) => setUserLevelState(v)}
                onObjectivesChange={setUsageObjectives}
                onAcceptedCguChange={setAcceptedCgu}
                onPrev={() =>
                  setRegisterStep((s) => (s > 1 ? ((s - 1) as RegisterStep) : s))
                }
                onNext={handleNextStep}
                onSubmit={handleRegisterSubmit}
                onSwitchMode={(m) => {
                  clearErrors();
                  switchMode(m);
                }}
              />
            )}

            {mode === "forgot" && (
              <ForgotFormBody
                email={email}
                emailError={fieldErrors.email ?? null}
                globalError={globalError}
                submitting={submitting}
                onEmailChange={(v) => {
                  setEmail(v);
                  if (fieldErrors.email) setError("email", null);
                }}
                onEmailBlur={() => setError("email", validateEmail(email))}
                onSubmit={handleForgot}
                onSwitchMode={(m) => {
                  clearErrors();
                  switchMode(m);
                }}
              />
            )}

            {mode === "forgot-sent" && (
              <ForgotSentBody
                onSwitchMode={(m) => {
                  clearErrors();
                  switchMode(m);
                }}
              />
            )}
          </div>
        </FormPanel>
      </div>
    </main>
  );
}

// ─── Branding panel (gauche) ──────────────────────────────────────────────

function BrandingPanel() {
  return (
    <aside
      className="relative hidden flex-col overflow-hidden p-10 lg:flex"
      style={{ backgroundColor: "#09090b" }}
    >
      {/* Glow radial discret derrière le contenu pour casser le noir uniforme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 30% 35%, rgba(197, 160, 89, 0.10), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 80% 90%, rgba(197, 160, 89, 0.05), transparent 70%)",
        }}
      />

      {/* Header : logo centré. */}
      <div className="relative z-10 flex justify-center">
        <VyzorLogo withText size={32} />
      </div>

      {/* Contenu central — centré horizontalement et verticalement. */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
        <div className="w-full max-w-[480px]">
          <p
            className="mb-5"
            style={{
              color: "#C5A059",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Vyzor · Cockpit financier
          </p>

          <h2
            className="text-white"
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            Pilotez votre entreprise
            <br />
            <span style={{ color: "#C5A059" }}>en confiance.</span>
          </h2>

          <p
            className="mx-auto mt-5"
            style={{
              color: "#C8CACE",
              fontSize: 16,
              lineHeight: 1.65,
              maxWidth: 440,
            }}
          >
            Vos données comptables et bancaires réunies en un seul endroit,
            avec un assistant qui transforme vos chiffres en décisions.
          </p>

          <div className="mx-auto mt-10 grid grid-cols-1 gap-3">
            <BenefitTile
              title="Vos comptes & votre banque, toujours à jour"
              subtitle="Connectez votre logiciel comptable et votre banque, on synchronise tout pour vous."
            />
            <BenefitTile
              title="Un tableau de bord clair, sans jargon"
              subtitle="Trésorerie, rentabilité, créances clients : vos chiffres expliqués au quotidien."
            />
            <BenefitTile
              title="Un assistant qui répond à vos questions"
              subtitle="Demandez « pourquoi ma trésorerie baisse ? » et recevez une réponse argumentée."
            />
          </div>
        </div>
      </div>

      {/* Footer : trust pills + liens légaux + © (centré). */}
      <div className="relative z-10 mt-10 flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <FooterPill icon="🔒" label="AES-256" />
          <FooterPill icon="🇫🇷" label="Hébergé en France" />
          <FooterPill icon="✓" label="RGPD" />
        </div>
        <LegalFooter />
      </div>
    </aside>
  );
}

function BenefitTile({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3.5 text-center"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.025)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <p
        className="text-white"
        style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}
      >
        {title}
      </p>
      <p
        className="mx-auto mt-1"
        style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 1.5, maxWidth: 380 }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function FooterPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden style={{ fontSize: 12 }}>
        {icon}
      </span>
      <span style={{ color: "#9CA3AF", fontSize: 11, letterSpacing: "0.02em" }}>
        {label}
      </span>
    </span>
  );
}

// ─── Form panel (droite) ──────────────────────────────────────────────────

function FormPanel({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center px-6 py-10 md:px-10"
      style={{ backgroundColor: "#0F0F12" }}
    >
      <div className="w-full max-w-[440px]">{children}</div>
      {/* Footer légal en mobile uniquement — la colonne branding (qui porte
          déjà ces liens) est cachée sous la breakpoint lg. */}
      <div className="mt-10 lg:hidden">
        <LegalFooter />
      </div>
    </section>
  );
}

// ─── Mode Login ───────────────────────────────────────────────────────────

type LoginBodyProps = {
  email: string;
  password: string;
  showPassword: boolean;
  emailError: string | null;
  passwordError: string | null;
  globalError: string | null;
  submitting: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onTogglePassword: () => void;
  onEmailBlur: () => void;
  onPasswordBlur: () => void;
  onSubmit: (e: FormEvent) => void;
  onSwitchMode: (m: AuthMode) => void;
};

function LoginFormBody(props: LoginBodyProps) {
  return (
    <form onSubmit={props.onSubmit} noValidate>
      <h1 className="text-white" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
        Connexion
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 28 }}>
        Accédez à votre tableau de bord
      </p>

      <ErrorBanner message={props.globalError} />

      <Field label="Email" error={props.emailError}>
        <Input
          type="email"
          value={props.email}
          onChange={props.onEmailChange}
          onBlur={props.onEmailBlur}
          placeholder="nom@entreprise.com"
          autoComplete="email"
          hasError={!!props.emailError}
        />
      </Field>

      <div className="mt-4">
        <FieldHeader>
          <span style={fieldLabelStyle}>Mot de passe</span>
          <button
            type="button"
            onClick={() => props.onSwitchMode("forgot")}
            style={{ color: "#C5A059", fontSize: 12 }}
            className="hover:underline"
          >
            Oublié ?
          </button>
        </FieldHeader>
        <PasswordInput
          value={props.password}
          onChange={props.onPasswordChange}
          onBlur={props.onPasswordBlur}
          show={props.showPassword}
          onToggle={props.onTogglePassword}
          autoComplete="current-password"
          hasError={!!props.passwordError}
        />
        {props.passwordError ? <FieldError message={props.passwordError} /> : null}
      </div>

      <SubmitButton
        label="Se connecter"
        loadingLabel="Connexion…"
        disabled={!props.email || !props.password}
        submitting={props.submitting}
      />

      <SwitchLink
        text="Pas encore de compte ?"
        action="Créer un compte"
        onClick={() => props.onSwitchMode("register")}
      />
    </form>
  );
}

// ─── Mode Register : wizard 3 étapes ──────────────────────────────────────

type RegisterWizardProps = {
  step: RegisterStep;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  showPassword: boolean;
  companyName: string;
  siren: string;
  companySize: CompanySizeValue | "";
  sector: string;
  customSector: string;
  userLevel: UserLevel | "";
  usageObjectives: OnboardingObjectiveValue[];
  acceptedCgu: boolean;
  fieldErrors: Record<string, string | null>;
  globalError: string | null;
  submitting: boolean;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onTogglePassword: () => void;
  onCompanyNameChange: (v: string) => void;
  onSirenChange: (v: string) => void;
  onCompanySizeChange: (v: string) => void;
  onSectorChange: (v: string) => void;
  onCustomSectorChange: (v: string) => void;
  onUserLevelChange: (v: UserLevel | "") => void;
  onObjectivesChange: (vs: OnboardingObjectiveValue[]) => void;
  onAcceptedCguChange: (v: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: (e: FormEvent) => void;
  onSwitchMode: (m: AuthMode) => void;
};

function RegisterWizard(p: RegisterWizardProps) {
  const strength = useMemo(() => computePasswordStrength(p.password), [p.password]);

  function onFormSubmit(e: FormEvent) {
    if (p.step < 3) {
      e.preventDefault();
      p.onNext();
      return;
    }
    p.onSubmit(e);
  }

  return (
    <form onSubmit={onFormSubmit} noValidate>
      <h1
        className="text-white"
        style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}
      >
        Créer un compte
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 20 }}>
        {p.step === 1
          ? "Étape 1 sur 3 · Identité"
          : p.step === 2
            ? "Étape 2 sur 3 · Votre entreprise"
            : "Étape 3 sur 3 · Profil financier"}
      </p>

      <Stepper step={p.step} />

      <div className="mt-6">
        <ErrorBanner message={p.globalError} />

        {p.step === 1 && (
          <RegisterStep1
            firstName={p.firstName}
            lastName={p.lastName}
            email={p.email}
            password={p.password}
            showPassword={p.showPassword}
            strength={strength}
            firstNameError={p.fieldErrors.firstName ?? null}
            lastNameError={p.fieldErrors.lastName ?? null}
            emailError={p.fieldErrors.email ?? null}
            passwordError={p.fieldErrors.password ?? null}
            onFirstNameChange={p.onFirstNameChange}
            onLastNameChange={p.onLastNameChange}
            onEmailChange={p.onEmailChange}
            onPasswordChange={p.onPasswordChange}
            onTogglePassword={p.onTogglePassword}
          />
        )}

        {p.step === 2 && (
          <RegisterStep2
            companyName={p.companyName}
            siren={p.siren}
            companySize={p.companySize}
            sector={p.sector}
            customSector={p.customSector}
            companyNameError={p.fieldErrors.companyName ?? null}
            sirenError={p.fieldErrors.siren ?? null}
            companySizeError={p.fieldErrors.companySize ?? null}
            sectorError={p.fieldErrors.sector ?? null}
            onCompanyNameChange={p.onCompanyNameChange}
            onSirenChange={p.onSirenChange}
            onCompanySizeChange={p.onCompanySizeChange}
            onSectorChange={p.onSectorChange}
            onCustomSectorChange={p.onCustomSectorChange}
          />
        )}

        {p.step === 3 && (
          <RegisterStep3
            userLevel={p.userLevel}
            usageObjectives={p.usageObjectives}
            acceptedCgu={p.acceptedCgu}
            userLevelError={p.fieldErrors.userLevel ?? null}
            objectivesError={p.fieldErrors.usageObjectives ?? null}
            cguError={p.fieldErrors.cgu ?? null}
            onUserLevelChange={p.onUserLevelChange}
            onObjectivesChange={p.onObjectivesChange}
            onAcceptedCguChange={p.onAcceptedCguChange}
          />
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        {p.step > 1 ? (
          <button
            type="button"
            onClick={p.onPrev}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-4"
            style={{
              color: "#C5A059",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid rgba(197, 160, 89, 0.25)",
              backgroundColor: "rgba(197, 160, 89, 0.05)",
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </button>
        ) : null}

        <SubmitButton
          label={p.step < 3 ? "Continuer" : "Créer mon compte"}
          loadingLabel={p.step < 3 ? "" : "Création…"}
          disabled={false}
          submitting={p.step === 3 ? p.submitting : false}
          inline
        />
      </div>

      <SwitchLink
        text="Déjà un compte ?"
        action="Se connecter"
        onClick={() => p.onSwitchMode("login")}
      />
    </form>
  );
}

function Stepper({ step }: { step: RegisterStep }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((s) => {
        const active = s === step;
        const done = s < step;
        return (
          <div
            key={s}
            className="flex-1 rounded-full transition-colors"
            style={{
              height: 3,
              backgroundColor:
                done || active ? "#C5A059" : "rgba(255, 255, 255, 0.08)",
              opacity: done ? 0.6 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

type Step1Props = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  showPassword: boolean;
  strength: { score: number; label: string; color: string };
  firstNameError: string | null;
  lastNameError: string | null;
  emailError: string | null;
  passwordError: string | null;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onTogglePassword: () => void;
};

function RegisterStep1(p: Step1Props) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" error={p.firstNameError}>
          <Input
            type="text"
            value={p.firstName}
            onChange={p.onFirstNameChange}
            placeholder="Marie"
            autoComplete="given-name"
            hasError={!!p.firstNameError}
          />
        </Field>
        <Field label="Nom" error={p.lastNameError}>
          <Input
            type="text"
            value={p.lastName}
            onChange={p.onLastNameChange}
            placeholder="Dupont"
            autoComplete="family-name"
            hasError={!!p.lastNameError}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Email professionnel" error={p.emailError}>
          <Input
            type="email"
            value={p.email}
            onChange={p.onEmailChange}
            placeholder="marie@entreprise.com"
            autoComplete="email"
            hasError={!!p.emailError}
          />
        </Field>
      </div>

      <div className="mt-4">
        <FieldHeader>
          <span style={fieldLabelStyle}>Mot de passe</span>
        </FieldHeader>
        <PasswordInput
          value={p.password}
          onChange={p.onPasswordChange}
          show={p.showPassword}
          onToggle={p.onTogglePassword}
          autoComplete="new-password"
          hasError={!!p.passwordError}
        />
        {p.passwordError ? <FieldError message={p.passwordError} /> : null}
        {p.password ? <PasswordStrength strength={p.strength} /> : null}
      </div>
    </div>
  );
}

type Step2Props = {
  companyName: string;
  siren: string;
  companySize: CompanySizeValue | "";
  sector: string;
  customSector: string;
  companyNameError: string | null;
  sirenError: string | null;
  companySizeError: string | null;
  sectorError: string | null;
  onCompanyNameChange: (v: string) => void;
  onSirenChange: (v: string) => void;
  onCompanySizeChange: (v: string) => void;
  onSectorChange: (v: string) => void;
  onCustomSectorChange: (v: string) => void;
};

function RegisterStep2(p: Step2Props) {
  return (
    <div>
      <Field label="Raison sociale" error={p.companyNameError}>
        <Input
          type="text"
          value={p.companyName}
          onChange={p.onCompanyNameChange}
          placeholder="Acme SAS"
          autoComplete="organization"
          hasError={!!p.companyNameError}
        />
      </Field>

      <div className="mt-4">
        <Field label="SIREN" error={p.sirenError}>
          <Input
            type="text"
            value={p.siren}
            onChange={p.onSirenChange}
            placeholder="123 456 789"
            hasError={!!p.sirenError}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Taille de l'entreprise" error={p.companySizeError}>
          <NativeSelect
            value={p.companySize}
            onChange={p.onCompanySizeChange}
            placeholder="Sélectionner…"
            hasError={!!p.companySizeError}
            options={COMPANY_SIZE_OPTIONS.map((o) => ({
              value: o.value,
              label: `${o.label} · ${o.range}`,
            }))}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Secteur d'activité" error={p.sectorError}>
          <NativeSelect
            value={p.sector}
            onChange={p.onSectorChange}
            placeholder="Sélectionner…"
            hasError={!!p.sectorError}
            options={[
              ...SECTOR_OPTIONS.map((s) => ({ value: s, label: s })),
              { value: OTHER_SECTOR_OPTION_VALUE, label: "Autre…" },
            ]}
          />
        </Field>
      </div>

      {p.sector === OTHER_SECTOR_OPTION_VALUE ? (
        <div className="mt-3">
          <Input
            type="text"
            value={p.customSector}
            onChange={p.onCustomSectorChange}
            placeholder="Précisez votre secteur"
          />
        </div>
      ) : null}
    </div>
  );
}

type Step3Props = {
  userLevel: UserLevel | "";
  usageObjectives: OnboardingObjectiveValue[];
  acceptedCgu: boolean;
  userLevelError: string | null;
  objectivesError: string | null;
  cguError: string | null;
  onUserLevelChange: (v: UserLevel | "") => void;
  onObjectivesChange: (vs: OnboardingObjectiveValue[]) => void;
  onAcceptedCguChange: (v: boolean) => void;
};

function RegisterStep3(p: Step3Props) {
  function toggleObjective(value: OnboardingObjectiveValue) {
    if (p.usageObjectives.includes(value)) {
      p.onObjectivesChange(p.usageObjectives.filter((v) => v !== value));
    } else {
      p.onObjectivesChange([...p.usageObjectives, value]);
    }
  }

  return (
    <div>
      <FieldHeader>
        <span style={fieldLabelStyle}>Niveau de connaissance financière</span>
      </FieldHeader>
      <div className="space-y-2">
        {(["beginner", "intermediate", "expert"] as UserLevel[]).map((lv) => {
          const meta = USER_LEVEL_META[lv];
          const active = p.userLevel === lv;
          return (
            <button
              key={lv}
              type="button"
              onClick={() => p.onUserLevelChange(lv)}
              className="block w-full rounded-lg px-3.5 py-3 text-left transition-colors"
              style={{
                backgroundColor: active
                  ? "rgba(197, 160, 89, 0.08)"
                  : "rgba(255, 255, 255, 0.03)",
                border: active
                  ? "1px solid rgba(197, 160, 89, 0.4)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <span
                className="text-white"
                style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}
              >
                {meta.label}
              </span>
              <span
                className="mt-0.5 block"
                style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.45 }}
              >
                {meta.description}
              </span>
            </button>
          );
        })}
      </div>
      {p.userLevelError ? <FieldError message={p.userLevelError} /> : null}

      <div className="mt-5">
        <FieldHeader>
          <span style={fieldLabelStyle}>Vos objectifs</span>
          <span style={{ color: "#6B7280", fontSize: 11 }}>
            (1 ou plusieurs)
          </span>
        </FieldHeader>
        <div className="flex flex-wrap gap-2">
          {ONBOARDING_OBJECTIVE_OPTIONS.map((o) => {
            const active = p.usageObjectives.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleObjective(o.value)}
                className="rounded-full px-3 py-1.5 transition-colors"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: active
                    ? "rgba(197, 160, 89, 0.12)"
                    : "rgba(255, 255, 255, 0.03)",
                  color: active ? "#C5A059" : "#9CA3AF",
                  border: active
                    ? "1px solid rgba(197, 160, 89, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {p.objectivesError ? <FieldError message={p.objectivesError} /> : null}
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-2.5">
        <CguCheckbox checked={p.acceptedCgu} onChange={p.onAcceptedCguChange} />
        <span style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.5 }}>
          J&apos;accepte les{" "}
          <a href="/cgu" target="_blank" rel="noreferrer" className="text-white hover:underline">
            conditions d&apos;utilisation
          </a>{" "}
          et la{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-white hover:underline">
            politique de confidentialité
          </a>
          .
        </span>
      </label>
      {p.cguError ? <FieldError message={p.cguError} /> : null}
    </div>
  );
}

// ─── Mode Forgot ──────────────────────────────────────────────────────────

type ForgotBodyProps = {
  email: string;
  emailError: string | null;
  globalError: string | null;
  submitting: boolean;
  onEmailChange: (v: string) => void;
  onEmailBlur: () => void;
  onSubmit: (e: FormEvent) => void;
  onSwitchMode: (m: AuthMode) => void;
};

function ForgotFormBody(p: ForgotBodyProps) {
  return (
    <form onSubmit={p.onSubmit} noValidate>
      <h1 className="text-white" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
        Réinitialisation
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 28 }}>
        Entrez votre email, on vous envoie un lien
      </p>

      <ErrorBanner message={p.globalError} />

      <Field label="Email" error={p.emailError}>
        <Input
          type="email"
          value={p.email}
          onChange={p.onEmailChange}
          onBlur={p.onEmailBlur}
          placeholder="nom@entreprise.com"
          autoComplete="email"
          hasError={!!p.emailError}
        />
      </Field>

      <SubmitButton
        label="Envoyer le lien"
        loadingLabel="Envoi…"
        disabled={!p.email}
        submitting={p.submitting}
      />

      <BackLink onClick={() => p.onSwitchMode("login")} />
    </form>
  );
}

function ForgotSentBody({ onSwitchMode }: { onSwitchMode: (m: AuthMode) => void }) {
  return (
    <div className="text-center">
      <div
        className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          backgroundColor: "rgba(197, 160, 89, 0.1)",
          border: "1px solid rgba(197, 160, 89, 0.4)",
          color: "#C5A059",
        }}
      >
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h1 className="text-white" style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        Email envoyé !
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.5 }}>
        Vérifiez votre boîte mail et suivez le lien pour finaliser.
      </p>
      <div className="mt-6">
        <BackLink onClick={() => onSwitchMode("login")} />
      </div>
    </div>
  );
}

// ─── Champs réutilisables ─────────────────────────────────────────────────

const fieldLabelStyle = {
  color: "#9CA3AF",
  fontSize: 13,
  fontWeight: 500,
} as const;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FieldHeader>
        <span style={fieldLabelStyle}>{label}</span>
      </FieldHeader>
      {children}
      {error ? <FieldError message={error} /> : null}
    </div>
  );
}

function FieldHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 flex items-center justify-between">{children}</div>;
}

function FieldError({ message }: { message: string }) {
  return (
    <p
      className="vyzor-fade-up mt-1"
      style={{ color: "#EF4444", fontSize: 12 }}
    >
      {message}
    </p>
  );
}

function Input({
  type,
  value,
  onChange,
  onBlur,
  placeholder,
  autoComplete,
  hasError,
}: {
  type: "email" | "text" | "password";
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoComplete?: string;
  hasError?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="block w-full rounded-lg px-3 text-white placeholder:text-[color:#6B7280]"
      style={{
        height: 44,
        fontSize: 14,
        backgroundColor: "rgba(255, 255, 255, 0.04)",
        border: hasError
          ? "1px solid rgba(239, 68, 68, 0.5)"
          : "1px solid rgba(255, 255, 255, 0.08)",
        outline: "none",
        transition: "border-color 200ms, box-shadow 200ms",
      }}
      onFocus={(e) => {
        if (!hasError) {
          e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(197, 160, 89, 0.08)";
        }
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.boxShadow = "none";
        if (!hasError) {
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
        }
      }}
    />
  );
}

// Wrapper du select dark utilisé dans le wizard (étapes 2 et 3). Délègue à
// VyzorSelect (dropdown custom rendu via portal) au lieu d'un `<select>`
// natif : les `<option>` natifs s'affichaient en blanc avec highlight bleu
// par défaut du navigateur, ce qui cassait la DA dark de l'AuthPage.
// Signature publique inchangée — les appelants ne changent pas.
function NativeSelect({
  value,
  onChange,
  placeholder,
  options,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  hasError?: boolean;
}) {
  return (
    <VyzorSelect
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
      buttonClassName={`h-11 px-3 text-sm ${hasError ? "has-error" : ""}`}
    />
  );
}

function PasswordInput({
  value,
  onChange,
  onBlur,
  show,
  onToggle,
  autoComplete,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  hasError?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder="••••••••"
        autoComplete={autoComplete}
        hasError={hasError}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: "#6B7280" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#9CA3AF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#6B7280";
        }}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function PasswordStrength({
  strength,
}: {
  strength: { score: number; label: string; color: string };
}) {
  return (
    <div className="mt-2">
      <div className="flex gap-[3px]">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-[2px]"
            style={{
              height: 3,
              backgroundColor:
                i <= strength.score ? strength.color : "rgba(255,255,255,0.06)",
              transition: "background-color 150ms",
            }}
          />
        ))}
      </div>
      <p className="mt-1" style={{ fontSize: 11, color: strength.color }}>
        {strength.label}
      </p>
    </div>
  );
}

function CguCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 cursor-pointer items-center justify-center rounded"
      style={{
        backgroundColor: checked ? "#C5A059" : "transparent",
        border: checked ? "1px solid #C5A059" : "1px solid rgba(255, 255, 255, 0.15)",
        transition: "background-color 150ms, border-color 150ms",
      }}
    >
      {checked ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="white" strokeWidth="2.5">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="vyzor-fade-up mb-4 rounded-lg px-3 py-2.5"
      style={{
        backgroundColor: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.15)",
        color: "#FCA5A5",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function SubmitButton({
  label,
  loadingLabel,
  disabled,
  submitting,
  inline,
}: {
  label: string;
  loadingLabel: string;
  disabled: boolean;
  submitting: boolean;
  inline?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || submitting}
      className={`${
        inline ? "" : "mt-6"
      } inline-flex items-center justify-center rounded-lg transition disabled:cursor-not-allowed`}
      style={{
        height: 44,
        flex: inline ? 1 : undefined,
        width: inline ? undefined : "100%",
        backgroundColor: "#C5A059",
        color: "#09090b",
        fontSize: 14,
        fontWeight: 600,
        opacity: disabled ? 0.4 : submitting ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !submitting) {
          e.currentTarget.style.backgroundColor = "#D4B876";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !submitting) {
          e.currentTarget.style.backgroundColor = "#C5A059";
        }
      }}
    >
      {submitting && loadingLabel ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function SwitchLink({
  text,
  action,
  onClick,
}: {
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <p className="mt-6 text-center" style={{ color: "#9CA3AF", fontSize: 13 }}>
      {text}{" "}
      <button
        type="button"
        onClick={onClick}
        style={{ color: "#C5A059", fontWeight: 500 }}
        className="hover:underline"
      >
        {action}
      </button>
    </p>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 inline-flex w-full items-center justify-center hover:underline"
      style={{ color: "#C5A059", fontSize: 13 }}
    >
      ← Retour à la connexion
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function computePasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) return { score: 0, label: "", color: "rgba(255,255,255,0.06)" };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score === 1) return { score: 1, label: "Faible", color: "#EF4444" };
  if (score === 2) return { score: 2, label: "Moyen", color: "#EF4444" };
  if (score === 3) return { score: 3, label: "Fort", color: "#F59E0B" };
  return { score: 4, label: "Très fort", color: "#22C55E" };
}
