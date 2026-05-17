// File: components/auth/EntryRedirect.tsx
// Role: composant client unique consommé par `app/page.tsx` (route `/`).
// Détermine vers où envoyer le visiteur :
//   - non authentifié                      → /onboarding (picker pré-auth)
//   - authentifié firm_member              → /cabinet/portefeuille
//   - authentifié company_owner (ou null)  → /synthese (ou ?next= si fourni)
//
// Pendant la résolution Firestore (≤ 1s), affiche un loader minimal.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuth, firestoreDb } from "@/lib/firebase";
import { ROUTES } from "@/lib/config/routes";
import { ACCOUNT_TYPES } from "@/lib/config/account-types";

type EntryRedirectProps = {
  nextRedirect: string | null;
};

export function EntryRedirect({ nextRedirect }: EntryRedirectProps) {
  const router = useRouter();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      if (cancelled) return;
      if (!user) {
        router.replace(ROUTES.ONBOARDING);
        return;
      }
      try {
        const snap = await getDoc(doc(firestoreDb, "users", user.uid));
        if (cancelled) return;
        const accountType =
          (snap.data()?.accountType as string | undefined) ?? ACCOUNT_TYPES.COMPANY_OWNER;
        if (accountType === ACCOUNT_TYPES.FIRM_MEMBER) {
          router.replace(ROUTES.CABINET_PORTFOLIO);
        } else if (nextRedirect) {
          router.replace(nextRedirect);
        } else {
          router.replace(ROUTES.SYNTHESE);
        }
      } catch {
        router.replace(nextRedirect ?? ROUTES.SYNTHESE);
      } finally {
        if (!cancelled) setResolving(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router, nextRedirect]);

  return (
    <main
      className="grid min-h-screen w-full place-items-center"
      style={{ backgroundColor: "#09090b" }}
    >
      {resolving ? (
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: "var(--app-text-tertiary)" }}
        />
      ) : null}
    </main>
  );
}
