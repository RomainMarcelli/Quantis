// File: components/auth/AuthPage.tsx
// Role: page de connexion / inscription épurée — layout 2 colonnes :
//   - Gauche : branding sobre (logo, accroche, points de réassurance)
//   - Droite : formulaire actif (login / register / forgot)
//
// Pas de hero marketing, pas de parcours — l'utilisateur arrive ici avec
// l'intention de se connecter (depuis la landing publique).
//
// Stack auth : `firebaseAuthGateway` (signIn / register / sendPasswordReset).
// Google Auth n'est pas configuré → pas de bouton Google (cf. spec : ne pas
// laisser un bouton non fonctionnel).
//
// State local : pas de librairie de form. 3 modes via state, transitions
// crossfade via opacity + translateY (vyzor-fade-up keyframe existant).
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { firebaseAuthGateway } from "@/services/auth";

type AuthMode = "login" | "register" | "forgot" | "forgot-sent";

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

  // Champs formulaire — partagés entre les modes pour ne pas reset l'email
  // quand l'utilisateur switche connexion ↔ inscription.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [acceptedCgu, setAcceptedCgu] = useState(false);

  // États validation par champ — affichés au blur ou après submit.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // État global (bandeau erreur en haut du form, ex. mauvais identifiants).
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirige si déjà connecté (même comportement que l'ancienne page).
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
    setEmailError(null);
    setPasswordError(null);
  }

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

  function mapFirebaseError(err: unknown, mode: AuthMode): {
    global?: string;
    field?: { key: "email" | "password"; message: string };
  } {
    const code = (err as { code?: string }).code ?? "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
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
    if (mode === "forgot" && code === "auth/user-not-found") {
      return { global: "Aucun compte n'existe avec cette adresse" };
    }
    return { global: "Erreur de connexion. Réessayez." };
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    const ee = validateEmail(email);
    const pe = validatePassword(password);
    setEmailError(ee);
    setPasswordError(pe);
    if (ee || pe) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      await firebaseAuthGateway.signIn({ email, password });
      router.replace(postLoginRedirect);
    } catch (err) {
      const mapped = mapFirebaseError(err, "login");
      if (mapped.field?.key === "email") setEmailError(mapped.field.message);
      else if (mapped.field?.key === "password") setPasswordError(mapped.field.message);
      else setGlobalError(mapped.global ?? "Erreur de connexion. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    const ee = validateEmail(email);
    const pe = validatePassword(password);
    setEmailError(ee);
    setPasswordError(pe);
    if (ee || pe) return;
    if (!acceptedCgu) return;
    const trimmed = fullName.trim();
    const [firstName, ...rest] = trimmed.split(/\s+/);
    setSubmitting(true);
    setGlobalError(null);
    try {
      await firebaseAuthGateway.register({
        email,
        password,
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        // Champs onboarding désormais collectés en aval (post-signup) — on
        // crée le compte minimal puis le wizard onboarding complète le profil.
        companyName: "",
        siren: "",
        companySize: "",
        sector: "",
        usageObjectives: [],
      });
      // Le compte est créé, l'email de vérification est envoyé par Firebase.
      // On bascule vers un état "compte créé" via le message global success.
      setGlobalError(null);
      switchMode("forgot-sent"); // réutilise l'écran "email envoyé" — message adapté
    } catch (err) {
      const mapped = mapFirebaseError(err, "register");
      if (mapped.field?.key === "email") setEmailError(mapped.field.message);
      else if (mapped.field?.key === "password") setPasswordError(mapped.field.message);
      else setGlobalError(mapped.global ?? "Erreur de connexion. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    const ee = validateEmail(email);
    setEmailError(ee);
    if (ee) return;
    setSubmitting(true);
    setGlobalError(null);
    try {
      await firebaseAuthGateway.sendPasswordReset(email);
      switchMode("forgot-sent");
    } catch (err) {
      const mapped = mapFirebaseError(err, "forgot");
      setGlobalError(mapped.global ?? "Erreur de connexion. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="grid min-h-screen w-full"
      style={{
        backgroundColor: "#09090b",
        gridTemplateColumns: "minmax(0, 1fr)",
      }}
    >
      <div className="lg:grid lg:min-h-screen lg:grid-cols-2">
        <BrandingPanel />
        <FormPanel>
          <FormShell
            mode={mode}
            email={email}
            password={password}
            showPassword={showPassword}
            fullName={fullName}
            acceptedCgu={acceptedCgu}
            emailError={emailError}
            passwordError={passwordError}
            globalError={globalError}
            submitting={submitting}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
            onFullNameChange={setFullName}
            onAcceptedCguChange={setAcceptedCgu}
            onEmailBlur={() => setEmailError(validateEmail(email))}
            onPasswordBlur={() => setPasswordError(validatePassword(password))}
            onSubmit={
              mode === "login"
                ? handleLogin
                : mode === "register"
                  ? handleRegister
                  : mode === "forgot"
                    ? handleForgot
                    : undefined
            }
            onSwitchMode={switchMode}
          />
        </FormPanel>
      </div>
    </main>
  );
}

// ─── Branding panel (gauche) ────────────────────────────────────────────

function BrandingPanel() {
  return (
    <aside
      className="relative hidden flex-col justify-between p-8 lg:flex"
      style={{ backgroundColor: "#09090b" }}
    >
      <div>
        <QuantisLogo withText size={32} />
      </div>

      <div className="max-w-[440px]">
        <h2
          className="text-white"
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          Votre cockpit financier
        </h2>
        <p
          className="mt-3"
          style={{
            color: "#9CA3AF",
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: 380,
          }}
        >
          Pilotez votre entreprise avec des données claires, des alertes
          intelligentes et un assistant IA à vos côtés.
        </p>

        <ul className="mt-10 space-y-5">
          <ReassuranceItem icon="🔒" label="Données chiffrées AES-256" />
          <ReassuranceItem icon="⚡" label="Synchronisation automatique" />
          <ReassuranceItem icon="🇫🇷" label="Hébergé en France · RGPD" />
        </ul>
      </div>

      <p
        className="absolute bottom-8 left-8"
        style={{ color: "#6B7280", fontSize: 12 }}
      >
        © 2026 Vyzor
      </p>
    </aside>
  );
}

function ReassuranceItem({ icon, label }: { icon: string; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className="text-base leading-none">
        {icon}
      </span>
      <span style={{ color: "#6B7280", fontSize: 13 }}>{label}</span>
    </li>
  );
}

// ─── Form panel (droite) ────────────────────────────────────────────────

function FormPanel({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex min-h-screen items-center justify-center px-6 py-10 md:px-10"
      style={{ backgroundColor: "#0F0F12" }}
    >
      <div className="w-full max-w-[400px]">{children}</div>
    </section>
  );
}

type FormShellProps = {
  mode: AuthMode;
  email: string;
  password: string;
  showPassword: boolean;
  fullName: string;
  acceptedCgu: boolean;
  emailError: string | null;
  passwordError: string | null;
  globalError: string | null;
  submitting: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onTogglePassword: () => void;
  onFullNameChange: (v: string) => void;
  onAcceptedCguChange: (v: boolean) => void;
  onEmailBlur: () => void;
  onPasswordBlur: () => void;
  onSubmit: ((e: FormEvent) => void) | undefined;
  onSwitchMode: (m: AuthMode) => void;
};

function FormShell(props: FormShellProps) {
  const {
    mode,
    email,
    password,
    showPassword,
    fullName,
    acceptedCgu,
    emailError,
    passwordError,
    globalError,
    submitting,
    onEmailChange,
    onPasswordChange,
    onTogglePassword,
    onFullNameChange,
    onAcceptedCguChange,
    onEmailBlur,
    onPasswordBlur,
    onSubmit,
    onSwitchMode,
  } = props;

  return (
    <div key={mode} className="vyzor-fade-up">
      {/* Logo affiché en haut du formulaire en mobile (la colonne gauche
       *  est masquée → on compense pour garder le branding visible). */}
      <div className="mb-8 flex justify-center lg:hidden">
        <QuantisLogo withText size={28} />
      </div>

      {mode === "login" && (
        <LoginFormBody
          email={email}
          password={password}
          showPassword={showPassword}
          emailError={emailError}
          passwordError={passwordError}
          globalError={globalError}
          submitting={submitting}
          onEmailChange={onEmailChange}
          onPasswordChange={onPasswordChange}
          onTogglePassword={onTogglePassword}
          onEmailBlur={onEmailBlur}
          onPasswordBlur={onPasswordBlur}
          onSubmit={onSubmit!}
          onSwitchMode={onSwitchMode}
        />
      )}

      {mode === "register" && (
        <RegisterFormBody
          email={email}
          password={password}
          showPassword={showPassword}
          fullName={fullName}
          acceptedCgu={acceptedCgu}
          emailError={emailError}
          passwordError={passwordError}
          globalError={globalError}
          submitting={submitting}
          onEmailChange={onEmailChange}
          onPasswordChange={onPasswordChange}
          onTogglePassword={onTogglePassword}
          onFullNameChange={onFullNameChange}
          onAcceptedCguChange={onAcceptedCguChange}
          onEmailBlur={onEmailBlur}
          onPasswordBlur={onPasswordBlur}
          onSubmit={onSubmit!}
          onSwitchMode={onSwitchMode}
        />
      )}

      {mode === "forgot" && (
        <ForgotFormBody
          email={email}
          emailError={emailError}
          globalError={globalError}
          submitting={submitting}
          onEmailChange={onEmailChange}
          onEmailBlur={onEmailBlur}
          onSubmit={onSubmit!}
          onSwitchMode={onSwitchMode}
        />
      )}

      {mode === "forgot-sent" && <ForgotSentBody onSwitchMode={onSwitchMode} />}
    </div>
  );
}

// ─── Mode Login ─────────────────────────────────────────────────────────

function LoginFormBody({
  email,
  password,
  showPassword,
  emailError,
  passwordError,
  globalError,
  submitting,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onEmailBlur,
  onPasswordBlur,
  onSubmit,
  onSwitchMode,
}: Omit<FormShellProps, "mode" | "fullName" | "acceptedCgu" | "onFullNameChange" | "onAcceptedCguChange">) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-white" style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Connexion
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 32 }}>
        Accédez à votre tableau de bord
      </p>

      <ErrorBanner message={globalError} />

      <Field label="Email" error={emailError}>
        <Input
          type="email"
          value={email}
          onChange={onEmailChange}
          onBlur={onEmailBlur}
          placeholder="nom@entreprise.com"
          autoComplete="email"
          hasError={!!emailError}
        />
      </Field>

      <div className="mt-4">
        <FieldHeader>
          <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 500 }}>Mot de passe</span>
          <button
            type="button"
            onClick={() => onSwitchMode("forgot")}
            style={{ color: "#C5A059", fontSize: 12 }}
            className="hover:underline"
          >
            Oublié ?
          </button>
        </FieldHeader>
        <PasswordInput
          value={password}
          onChange={onPasswordChange}
          onBlur={onPasswordBlur}
          show={showPassword}
          onToggle={onTogglePassword}
          autoComplete="current-password"
          hasError={!!passwordError}
        />
        {passwordError ? <FieldError message={passwordError} /> : null}
      </div>

      <SubmitButton
        label="Se connecter"
        loadingLabel="Connexion…"
        disabled={!email || !password}
        submitting={submitting}
      />

      <SwitchLink
        text="Pas encore de compte ?"
        action="Créer un compte"
        onClick={() => onSwitchMode("register")}
      />
    </form>
  );
}

// ─── Mode Register ──────────────────────────────────────────────────────

function RegisterFormBody({
  email,
  password,
  showPassword,
  fullName,
  acceptedCgu,
  emailError,
  passwordError,
  globalError,
  submitting,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onFullNameChange,
  onAcceptedCguChange,
  onEmailBlur,
  onPasswordBlur,
  onSubmit,
  onSwitchMode,
}: Omit<FormShellProps, "mode">) {
  const strength = useMemo(() => computePasswordStrength(password), [password]);
  const canSubmit =
    fullName.trim().length > 0 && !!email && password.length >= 8 && acceptedCgu;

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-white" style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Créer un compte
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 32 }}>
        Gratuit · Prêt en 30 secondes
      </p>

      <ErrorBanner message={globalError} />

      <Field label="Nom complet">
        <Input
          type="text"
          value={fullName}
          onChange={onFullNameChange}
          placeholder="Prénom Nom"
          autoComplete="name"
        />
      </Field>

      <div className="mt-4">
        <Field label="Email" error={emailError}>
          <Input
            type="email"
            value={email}
            onChange={onEmailChange}
            onBlur={onEmailBlur}
            placeholder="nom@entreprise.com"
            autoComplete="email"
            hasError={!!emailError}
          />
        </Field>
      </div>

      <div className="mt-4">
        <FieldHeader>
          <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 500 }}>Mot de passe</span>
        </FieldHeader>
        <PasswordInput
          value={password}
          onChange={onPasswordChange}
          onBlur={onPasswordBlur}
          show={showPassword}
          onToggle={onTogglePassword}
          autoComplete="new-password"
          hasError={!!passwordError}
        />
        {passwordError ? <FieldError message={passwordError} /> : null}
        {password ? <PasswordStrength strength={strength} /> : null}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <CguCheckbox checked={acceptedCgu} onChange={onAcceptedCguChange} />
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

      <SubmitButton
        label="Créer mon compte"
        loadingLabel="Création…"
        disabled={!canSubmit}
        submitting={submitting}
      />

      <SwitchLink
        text="Déjà un compte ?"
        action="Se connecter"
        onClick={() => onSwitchMode("login")}
      />
    </form>
  );
}

// ─── Mode Forgot ────────────────────────────────────────────────────────

function ForgotFormBody({
  email,
  emailError,
  globalError,
  submitting,
  onEmailChange,
  onEmailBlur,
  onSubmit,
  onSwitchMode,
}: Pick<FormShellProps, "email" | "emailError" | "globalError" | "submitting" | "onEmailChange" | "onEmailBlur" | "onSubmit" | "onSwitchMode">) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-white" style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Réinitialisation
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 32 }}>
        Entrez votre email, on vous envoie un lien
      </p>

      <ErrorBanner message={globalError} />

      <Field label="Email" error={emailError}>
        <Input
          type="email"
          value={email}
          onChange={onEmailChange}
          onBlur={onEmailBlur}
          placeholder="nom@entreprise.com"
          autoComplete="email"
          hasError={!!emailError}
        />
      </Field>

      <SubmitButton
        label="Envoyer le lien"
        loadingLabel="Envoi…"
        disabled={!email}
        submitting={submitting}
      />

      <BackLink onClick={() => onSwitchMode("login")} />
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
      <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Email envoyé !
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.5 }}>
        Vérifiez votre boîte mail et suivez le lien pour réinitialiser votre
        mot de passe.
      </p>
      <div className="mt-6">
        <BackLink onClick={() => onSwitchMode("login")} />
      </div>
    </div>
  );
}

// ─── Champs réutilisables ──────────────────────────────────────────────

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
        <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 500 }}>{label}</span>
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

function PasswordStrength({ strength }: { strength: { score: number; label: string; color: string } }) {
  return (
    <div className="mt-2">
      <div className="flex gap-[3px]">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-[2px]"
            style={{
              height: 3,
              backgroundColor: i <= strength.score ? strength.color : "rgba(255,255,255,0.06)",
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
}: {
  label: string;
  loadingLabel: string;
  disabled: boolean;
  submitting: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || submitting}
      className="mt-6 inline-flex w-full items-center justify-center rounded-lg transition disabled:cursor-not-allowed"
      style={{
        height: 44,
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
      {submitting ? (
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

// ─── Helpers ────────────────────────────────────────────────────────────

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
