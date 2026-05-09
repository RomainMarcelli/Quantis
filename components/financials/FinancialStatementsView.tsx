// File: components/financials/FinancialStatementsView.tsx
// Role: page /etats-financiers — assemble compte de résultat + bilan +
// vérifications de cohérence à partir de l'analyse active.
//
// Cible UX : expert-comptable / dirigeant rigoureux. Le rendu est
// volontairement sobre (peu de couleurs, beaucoup de typographie
// monospace pour les montants, alignement strict). On affiche une
// photo comptable, pas un dashboard de growth.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { listUserAnalyses } from "@/services/analysisStore";
import { getUserProfile } from "@/services/userProfileStore";
import { useActiveDataSource } from "@/hooks/useActiveDataSource";
import { resolveCurrentAnalysisForSource } from "@/lib/source/resolveSourceAnalyses";
import { ActiveSourceBadge } from "@/components/source/ActiveSourceBadge";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { buildIncomeStatement } from "@/lib/financials/buildIncomeStatement";
import { buildBalanceSheet } from "@/lib/financials/buildBalanceSheet";
import { IncomeStatement } from "@/components/financials/IncomeStatement";
import { BalanceSheet } from "@/components/financials/BalanceSheet";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type FetchState = "idle" | "loading" | "ready" | "error";

/**
 * Mode d'affichage de la page États financiers. Brief 09/06/2026 : la
 * page unifiée (bilan + CDR + cohérence) est scindée en deux pages
 * dédiées accessibles via sous-menu sidebar. La carte de cohérence est
 * affichée sur les deux pages — l'utilisateur veut la réconciliation
 * KPI/comptable quel que soit le document consulté.
 */
export type FinancialStatementsMode = "bilan" | "cdr";

type FinancialStatementsViewProps = {
  mode: FinancialStatementsMode;
};

export function FinancialStatementsView({ mode }: FinancialStatementsViewProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  // Loader visible uniquement si la requête dépasse 400 ms.
  const showSlowLoader = useDelayedFlag(fetchState === "loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Vyzor");
  const [greetingName, setGreetingName] = useState("Utilisateur");

  const { activeAccountingSource, activeFecFolderName } = useActiveDataSource({
    analyses,
  });

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const { firebaseAuthGateway } = await import("@/services/auth");
      unsub = firebaseAuthGateway.subscribe((nextUser) => {
        if (!nextUser) {
          router.replace("/login");
          return;
        }
        if (!nextUser.emailVerified) {
          void firebaseAuthGateway.signOut();
          router.replace("/login");
          return;
        }
        setUser(nextUser);
      });
    })();
    return () => unsub?.();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void loadAnalyses(user);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAnalyses(currentUser: AuthenticatedUser) {
    setFetchState("loading");
    setErrorMessage(null);
    try {
      const [history, profile] = await Promise.all([
        listUserAnalyses(currentUser.uid),
        getUserProfile(currentUser.uid),
      ]);
      setAnalyses(history);
      setCompanyName(profile?.companyName?.trim() || "Vyzor");
      // Prénom affiché dans le bloc Compte de la sidebar — même règle de
      // résolution que les autres pages (profile.firstName en priorité,
      // puis displayName, puis email).
      setGreetingName(resolveFirstName(currentUser, profile?.firstName));
      setFetchState("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur de chargement");
      setFetchState("error");
    }
  }

  const activeAnalysis = useMemo<AnalysisRecord | null>(() => {
    return resolveCurrentAnalysisForSource(
      analyses,
      activeAccountingSource,
      activeFecFolderName
    );
  }, [analyses, activeAccountingSource, activeFecFolderName]);

  const incomeStatement = useMemo(
    () =>
      activeAnalysis
        ? buildIncomeStatement(activeAnalysis.mappedData, activeAnalysis.fiscalYear)
        : null,
    [activeAnalysis]
  );
  const balanceSheet = useMemo(
    () =>
      activeAnalysis
        ? buildBalanceSheet(activeAnalysis.mappedData, activeAnalysis.fiscalYear)
        : null,
    [activeAnalysis]
  );

  const documentLabel = mode === "bilan" ? "Bilan" : "Compte de résultat";
  const subtitle = activeAnalysis
    ? `${documentLabel} · Exercice ${activeAnalysis.fiscalYear ?? "—"}`
    : documentLabel;

  return (
    <section className="w-full space-y-4">
      {/* Phase 3 brief Header unifié 09/05/2026 :
          variant="data" pour exposer la ligne 2 (TemporalityBar +
          actions). Bouton Retour supprimé (la sidebar suffit pour
          la navigation). Pas de TemporalityBar ici car les états
          financiers sont des snapshots à un instant T (clôture). */}
      <AppHeader
        variant="data"
        companyName={companyName}
        subtitle={subtitle}
        contextBadge={activeAnalysis ? <ActiveSourceBadge analysis={activeAnalysis} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar activeRoute="etats-financiers" accountFirstName={greetingName} />

        <section className="space-y-5">

        {fetchState === "loading" && showSlowLoader && (
          <p className="precision-card rounded-2xl px-5 py-4 text-sm text-white/55">
            Chargement de votre analyse…
          </p>
        )}

        {fetchState === "error" && errorMessage && (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-5 py-4 text-sm text-rose-300">
            {errorMessage}
          </p>
        )}

        {fetchState === "ready" && !activeAnalysis && (
          <div className="precision-card rounded-2xl px-5 py-6">
            <p className="text-sm font-medium text-white">Aucune analyse disponible.</p>
            <p className="mt-1 text-xs text-white/60">
              Importez une liasse Excel/PDF ou connectez Pennylane / MyUnisoft / Odoo depuis{" "}
              <button
                type="button"
                onClick={() => router.push("/documents")}
                className="text-quantis-gold underline hover:no-underline"
              >
                Documents
              </button>
              .
            </p>
          </div>
        )}

        {fetchState === "ready" && activeAnalysis && incomeStatement && balanceSheet && (
          <>
            {/* Brief 09/06/2026 : un seul document affiché par page —
                Bilan (comptes 1 à 5) ou Compte de résultat (6 à 7).
                Section cohérence retirée (demande user). */}
            {mode === "bilan" ? (
              <BalanceSheet sheet={balanceSheet} />
            ) : (
              <IncomeStatement statement={incomeStatement} />
            )}
            <p className="text-center text-[10px] italic text-white/35">
              Codes 2033-SD entre crochets sur chaque ligne · survolez pour la
              définition · postes à zéro masqués pour la lisibilité.
            </p>
          </>
        )}
        </section>
      </div>
    </section>
  );
}

/**
 * Prénom à afficher dans le bloc Compte. Aligné sur les règles utilisées
 * par les autres vues (Synthèse, Tableau de bord, Documents) pour rester
 * cohérent d'une page à l'autre.
 */
function resolveFirstName(user: AuthenticatedUser, profileFirstName?: string): string {
  if (profileFirstName && profileFirstName.trim()) return profileFirstName.trim();
  if (user.displayName?.trim()) return user.displayName.trim().split(" ")[0] || "Utilisateur";
  if (user.email) return user.email.split("@")[0] || "Utilisateur";
  return "Utilisateur";
}
