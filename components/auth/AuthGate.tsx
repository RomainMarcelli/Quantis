"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { firebaseAuthGateway } from "@/services/auth";
import type { AuthenticatedUser } from "@/types/auth";

type Status = "loading" | "authenticated" | "unauthenticated";

const AuthContext = createContext<{ user: AuthenticatedUser } | null>(null);

export function useAuthenticatedUser(): { user: AuthenticatedUser } {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthenticatedUser must be used inside <AuthGate>");
  }
  return ctx;
}

interface AuthGateProps {
  children: ReactNode;
  requireVerified?: boolean;
  loadingFallback?: ReactNode;
}

export function AuthGate({ children, requireVerified = true, loadingFallback }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        setUser(null);
        setStatus("unauthenticated");
        const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
        return;
      }
      if (requireVerified && !nextUser.emailVerified) {
        void firebaseAuthGateway.signOut();
        setUser(null);
        setStatus("unauthenticated");
        router.replace("/login");
        return;
      }
      setUser(nextUser);
      setStatus("authenticated");
    });
    return unsubscribe;
  }, [router, pathname, requireVerified]);

  if (status === "loading") {
    return (
      loadingFallback ?? (
        <section className="precision-card mx-auto mt-8 max-w-md rounded-2xl p-8 text-center">
          <p className="text-sm text-white/70">Chargement de la session…</p>
        </section>
      )
    );
  }

  if (status === "unauthenticated" || !user) {
    return null;
  }

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}
