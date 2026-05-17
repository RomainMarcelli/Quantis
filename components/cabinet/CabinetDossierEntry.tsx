// File: components/cabinet/CabinetDossierEntry.tsx
// Role: composant d'entrée d'un dossier cabinet. Définit activeCompanyId
// dans le store global puis redirige vers /analysis (cockpit existant).
//
// Affiche un breadcrumb "Portefeuille > [Nom du dossier]" pendant le
// chargement pour donner du contexte.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  ActiveCompanyProvider,
  useActiveCompany,
} from "@/lib/stores/activeCompanyStore";

export function CabinetDossierEntry({ companyId }: { companyId: string }) {
  return (
    <ActiveCompanyProvider>
      <Inner companyId={companyId} />
    </ActiveCompanyProvider>
  );
}

function Inner({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { setActiveCompanyId } = useActiveCompany();
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Set la company active dans le store puis redirige vers le cockpit.
  // Délai court pour permettre au breadcrumb d'apparaître et à
  // localStorage de persister avant la navigation.
  useEffect(() => {
    if (!companyId) return;
    setActiveCompanyId(companyId);
    // Fetch le nom de la company pour le breadcrumb (best effort).
    void (async () => {
      try {
        const { firebaseAuthGateway } = await import("@/services/auth");
        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) return;
        const res = await fetch("/api/cabinet/portefeuille", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          dossiers: Array<{ companyId: string; name: string; externalCompanyName: string | null }>;
        };
        const match = data.dossiers.find((d) => d.companyId === companyId);
        if (match) {
          setCompanyName(match.externalCompanyName || match.name);
        }
      } catch {
        /* swallow */
      }
    })();

    const timer = window.setTimeout(() => {
      router.replace("/analysis");
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs">
        <Link
          href="/cabinet/portefeuille"
          className="transition hover:underline"
          style={{ color: "var(--app-brand-gold-deep)" }}
        >
          Portefeuille
        </Link>
        <ChevronRight className="h-3 w-3" style={{ color: "var(--app-text-tertiary)" }} />
        <span style={{ color: "var(--app-text-primary)" }}>
          {companyName ?? "Chargement du dossier…"}
        </span>
      </nav>
      <div
        className="flex items-center gap-3 rounded-xl p-6"
        style={{
          backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
          border: "1px solid var(--app-border)",
          backdropFilter: "blur(24px)",
        }}
      >
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--app-brand-gold-deep)" }} />
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Ouverture du cockpit pour ce dossier…
        </p>
      </div>
    </div>
  );
}
