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
import { ArrowLeft, Lock, LogOut, Settings, UserCircle2 } from "lucide-react";
import { listUserAnalyses } from "@/services/analysisStore";
import { getUserProfile } from "@/services/userProfileStore";
import { resolveActiveAnalysis } from "@/lib/source/activeSource";
import { useActiveAnalysisId } from "@/lib/source/useActiveAnalysisId";
import { ActiveSourceBadge } from "@/components/source/ActiveSourceBadge";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { buildIncomeStatement } from "@/lib/financials/buildIncomeStatement";
import { buildBalanceSheet } from "@/lib/financials/buildBalanceSheet";
import { buildCoherenceChecks } from "@/lib/financials/coherenceChecks";
import { IncomeStatement } from "@/components/financials/IncomeStatement";
import { BalanceSheet } from "@/components/financials/BalanceSheet";
import { CoherenceChecksCard } from "@/components/financials/CoherenceChecksCard";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type FetchState = "idle" | "loading" | "ready" | "error";

export function FinancialStatementsView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  // Loader visible uniquement si la requête dépasse 400 ms.
  const showSlowLoader = useDelayedFlag(fetchState === "loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Quantis");
  const [greetingName, setGreetingName] = useState("Utilisateur");

  const activeAnalysisId = useActiveAnalysisId();

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
      setCompanyName(profile?.companyName?.trim() || "Quantis");
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
    if (!analyses.length) return null;
    return resolveActiveAnalysis(analyses, activeAnalysisId);
  }, [analyses, activeAnalysisId]);

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
  const checks = useMemo(
    () =>
      activeAnalysis && incomeStatement && balanceSheet
        ? buildCoherenceChecks({
            analysis: activeAnalysis,
            incomeStatement,
            balanceSheet,
          })
        : [],
    [activeAnalysis, incomeStatement, balanceSheet]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
      <AppSidebar activeRoute="etats-financiers" accountFirstName={greetingName} />

      <section className="space-y-5">
        <header className="precision-card flex flex-wrap items-baseline justify-between gap-3 rounded-2xl px-5 py-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
              États financiers
            </p>
            <h1 className="mt-0.5 text-xl font-semibold text-white">{companyName}</h1>
            {activeAnalysis ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
                <span>
                  Exercice{" "}
                  <span className="font-mono text-white/85">
                    {activeAnalysis.fiscalYear ?? "—"}
                  </span>
                </span>
                <span className="text-white/25">·</span>
                <ActiveSourceBadge analysis={activeAnalysis} />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {/* Boutons utilitaires alignés sur Synthèse / Tableau de bord :
                Réglages, Premium, Mon compte, Déconnexion. La sidebar reste
                dédiée à la navigation entre pages. */}
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
              aria-label="Paramètres"
              title="Paramètres"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/pricing")}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
              aria-label="Offres"
              title="Offre Premium"
            >
              <Lock className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/account?from=app")}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
              aria-label="Compte"
              title="Mon compte"
            >
              <UserCircle2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                const { firebaseAuthGateway } = await import("@/services/auth");
                await firebaseAuthGateway.signOut();
                router.replace("/");
              }}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour
            </button>
          </div>
        </header>

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
            <IncomeStatement statement={incomeStatement} />
            <BalanceSheet sheet={balanceSheet} />
            {/* La carte de cohérence est volontairement placée APRÈS le compte
                de résultat et le bilan : un expert-comptable lit d'abord les
                états chiffrés, puis vérifie la réconciliation avec les KPIs
                calculés. */}
            <CoherenceChecksCard checks={checks} />
            <p className="text-center text-[10px] italic text-white/35">
              Codes 2033-SD entre crochets sur chaque ligne · survolez pour la
              définition · postes à zéro masqués pour la lisibilité.
            </p>
          </>
        )}
      </section>
    </div>
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
