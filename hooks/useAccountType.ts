// File: hooks/useAccountType.ts
// Role: hook centralisé pour lire users/{uid}.accountType en client.
// Utilisé par CompanySelector + AppSidebar + EntryRedirect — évite la
// duplication des reads Firestore par composant.
//
// Retourne :
//   - `accountType: "firm_member" | "company_owner" | null` (null = pas
//     encore résolu, ou pas d'user connecté)
//   - `firmId: string | null` (uniquement si firm_member)
//   - `loading: boolean`
"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuth, firestoreDb } from "@/lib/firebase";

export type AccountTypeValue = "firm_member" | "company_owner";

interface AccountTypeState {
  accountType: AccountTypeValue | null;
  firmId: string | null;
  loading: boolean;
}

export function useAccountType(): AccountTypeState {
  const [state, setState] = useState<AccountTypeState>({
    accountType: null,
    firmId: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      if (cancelled) return;
      if (!user) {
        setState({ accountType: null, firmId: null, loading: false });
        return;
      }
      try {
        const snap = await getDoc(doc(firestoreDb, "users", user.uid));
        if (cancelled) return;
        const data = snap.data() ?? {};
        const at =
          data.accountType === "firm_member" ? "firm_member" : "company_owner";
        const fid = typeof data.firmId === "string" ? data.firmId : null;
        setState({ accountType: at, firmId: fid, loading: false });
      } catch {
        if (!cancelled) {
          setState({ accountType: "company_owner", firmId: null, loading: false });
        }
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
