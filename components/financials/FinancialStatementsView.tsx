// File: components/financials/FinancialStatementsView.tsx
// Role: page /etats-financiers — assemble compte de résultat + bilan +
// vérifications de cohérence à partir de l'analyse active.
//
// Source de l'analyse (priorités) :
//   1. Analyse marquée active dans localStorage (cf. lib/source/activeSource)
//   2. Fallback : la plus récente de l'historique
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { listUserAnalyses } from "@/services/analysisStore";
import { getUserProfile } from "@/services/userProfileStore";
import { resolveActiveAnalysis } from "@/lib/source/activeSource";
import { useActiveAnalysisId } from "@/lib/source/useActiveAnalysisId";
import { ActiveSourceBadge } from "@/components/source/ActiveSourceBadge";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference,
} from "@/lib/ui/sidebarPreference";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Quantis");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarPreferenceReady, setIsSidebarPreferenceReady] = useState(false);

  const activeAnalysisId = useActiveAnalysisId();

  // ── Auth + chargement initial ──────────────────────────────────────
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
    setIsSidebarCollapsed(readSidebarCollapsedPreference());
    setIsSidebarPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!isSidebarPreferenceReady) return;
    writeSidebarCollapsedPreference(isSidebarCollapsed);
  }, [isSidebarCollapsed, isSidebarPreferenceReady]);

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
      setFetchState("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur de chargement");
      setFetchState("error");
    }
  }

  // ── Analyse active + dérivation des états financiers ────────────────
  const activeAnalysis = useMemo<AnalysisRecord | null>(() => {
    if (!analyses.length) return null;
    return resolveActiveAnalysis(analyses, activeAnalysisId);
  }, [analyses, activeAnalysisId]);

  const incomeStatement = useMemo(
    () => (activeAnalysis ? buildIncomeStatement(activeAnalysis.mappedData, activeAnalysis.fiscalYear) : null),
    [activeAnalysis]
  );
  const balanceSheet = useMemo(
    () => (activeAnalysis ? buildBalanceSheet(activeAnalysis.mappedData, activeAnalysis.fiscalYear) : null),
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto,1fr]">
      {/* ─── Sidebar (alignée sur SyntheseView) ──────────────────── */}
      <aside
        className={`precision-card flex flex-col rounded-2xl p-4 ${
          isSidebarCollapsed ? "w-[68px]" : "w-[220px]"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          {!isSidebarCollapsed ? <QuantisLogo withText={false} size={28} /> : null}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            aria-label={isSidebarCollapsed ? "Déplier" : "Replier"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="space-y-1 text-sm">
          <NavRow
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => router.push("/synthese")}
            collapsed={isSidebarCollapsed}
          >
            Synthèse
          </NavRow>
          <NavRow
            icon={<LayoutDashboard className="h-4 w-4" />}
            onClick={() => router.push("/analysis")}
            collapsed={isSidebarCollapsed}
          >
            Tableau de bord
          </NavRow>
          <NavRow
            icon={<Receipt className="h-4 w-4" />}
            active
            collapsed={isSidebarCollapsed}
          >
            États financiers
          </NavRow>
          <NavRow
            icon={<FileText className="h-4 w-4" />}
            onClick={() => router.push("/documents")}
            collapsed={isSidebarCollapsed}
          >
            Documents
          </NavRow>
          <NavRow
            icon={<Bot className="h-4 w-4" />}
            onClick={() => router.push("/assistant-ia")}
            collapsed={isSidebarCollapsed}
          >
            Assistant IA
          </NavRow>
        </nav>

        <div className="mt-auto space-y-1 pt-4 text-sm">
          <NavRow
            icon={<Settings className="h-4 w-4" />}
            onClick={() => router.push("/settings")}
            collapsed={isSidebarCollapsed}
          >
            Réglages
          </NavRow>
          <NavRow
            icon={<Lock className="h-4 w-4" />}
            onClick={() => router.push("/pricing")}
            collapsed={isSidebarCollapsed}
          >
            Offre Premium
          </NavRow>
          <NavRow
            icon={<UserCircle2 className="h-4 w-4" />}
            onClick={() => router.push("/account?from=analysis")}
            collapsed={isSidebarCollapsed}
          >
            Mon compte
          </NavRow>
          <NavRow
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              const { firebaseAuthGateway } = await import("@/services/auth");
              await firebaseAuthGateway.signOut();
              router.replace("/");
            }}
            collapsed={isSidebarCollapsed}
          >
            Se déconnecter
          </NavRow>
        </div>
      </aside>

      {/* ─── Contenu ─────────────────────────────────────────────── */}
      <section className="space-y-5">
        <header className="precision-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">
              Bilan + compte de résultat
            </p>
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold text-white">États financiers</h1>
              {activeAnalysis ? (
                <ActiveSourceBadge analysis={activeAnalysis} />
              ) : null}
            </div>
            <p className="text-xs text-white/55">
              Photo comptable simple et complète de {companyName}, lue depuis votre source active.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </button>
        </header>

        {fetchState === "loading" && (
          <p className="text-center text-sm text-white/55">Chargement de votre analyse...</p>
        )}

        {fetchState === "error" && errorMessage && (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-300">
            {errorMessage}
          </p>
        )}

        {fetchState === "ready" && !activeAnalysis && (
          <div className="precision-card rounded-2xl border-l-4 border-l-quantis-gold/60 bg-[#1A1A2E] p-6">
            <p className="text-sm font-medium text-white">Aucune analyse disponible.</p>
            <p className="mt-1 text-xs text-white/60">
              Importez une liasse Excel/PDF ou connectez Pennylane / MyUnisoft / Odoo depuis{" "}
              <button
                type="button"
                onClick={() => router.push("/documents")}
                className="text-quantis-gold underline hover:no-underline"
              >
                /documents
              </button>{" "}
              pour générer vos états financiers.
            </p>
          </div>
        )}

        {fetchState === "ready" && activeAnalysis && incomeStatement && balanceSheet && (
          <>
            <CoherenceChecksCard checks={checks} />
            <IncomeStatement statement={incomeStatement} />
            <BalanceSheet sheet={balanceSheet} />
            <p className="text-center text-[10px] italic text-white/35">
              Codes PCG visibles entre crochets sur chaque ligne — survolez pour voir l'explication
              et la correspondance 2033-SD.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// ─── NavRow (réplique du composant SyntheseView pour cohérence visuelle) ─

function NavRow({
  icon,
  active = false,
  onClick,
  collapsed,
  children,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
        active
          ? "bg-quantis-gold/10 text-quantis-gold"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      {!collapsed && <span className="text-xs font-medium">{children}</span>}
    </button>
  );
}
