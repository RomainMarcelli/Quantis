// File: app/forgot-password/page.tsx
// Role: page mot de passe oublié — bascule vers `AuthPage` en mode "forgot".
import { AuthPage } from "@/components/auth/AuthPage";

export default function ForgotPasswordPage() {
  return <AuthPage initialMode="forgot" />;
}
