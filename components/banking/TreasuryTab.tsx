// File: components/banking/TreasuryTab.tsx
// Role: onglet Trésorerie du dashboard. Consomme `BankingSummary` (issu du
// pipeline Bridge) et présente :
//   1. Hero card : solde total + sparkline 6 mois + 3 mini-stats (burn /
//      cashflow / runway)
//   2. Vue d'ensemble : grille comptes + flux mensuels + top dépenses
//   3. Vue Transactions : liste filtrable par compte
//
// Pas de fetch — toutes les données arrivent en props depuis le parent
// (AnalysisDetailView lit `analysis.bankingSummary`). Pas de duplication
// avec computeKpis : Bridge est une couche complémentaire, pas une source
// pour les KPI 2033-SD.
"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  LayoutGrid,
  List,
  PiggyBank,
  Radio,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AiSparkline } from "@/components/ai/AiSparkline";
import { formatCurrency } from "@/components/dashboard/formatting";
import { useTemporality } from "@/lib/temporality/temporalityContext";
import type {
  BankAccount,
  BankAccountType,
  BankingRunwayStatus,
  BankingSummary,
  BankTransaction,
  CategoryAggregate,
  MonthlyFlow,
} from "@/types/banking";

// ─── Tokens ─────────────────────────────────────────────────────────────

const COLOR_GOLD = "#C5A059";
const COLOR_SUCCESS = "#22C55E";
const COLOR_DANGER = "#EF4444";
const COLOR_WARNING = "#F59E0B";

const RUNWAY_STYLES: Record<BankingRunwayStatus, { fg: string; label: string }> = {
  safe: { fg: COLOR_SUCCESS, label: "confortable" },
  warning: { fg: COLOR_WARNING, label: "à surveiller" },
  critical: { fg: COLOR_DANGER, label: "critique" },
};

const ACCOUNT_TYPE_META: Record<BankAccountType, { label: string; Icon: typeof Wallet }> = {
  checking: { label: "Compte courant", Icon: Banknote },
  savings: { label: "Épargne", Icon: PiggyBank },
  loan: { label: "Emprunt", Icon: Landmark },
  card: { label: "Carte", Icon: CreditCard },
  other: { label: "Autre", Icon: Wallet },
};

type TreasuryTabProps = {
  summary: BankingSummary;
};

type ViewMode = "overview" | "transactions";

export function TreasuryTab({ summary }: TreasuryTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  // ─── Filtrage par la barre temporelle globale ───────────────────────
  // La TemporalityBar pilote `periodStart`/`periodEnd` (ISO YYYY-MM-DD).
  // On dérive un summary "filtré" sur cette fenêtre :
  //   - monthlyFlows : on ne garde que les mois qui chevauchent la période
  //   - recentTransactions : filtrées par date (limitées aux 90j stockés
  //     dans le summary — au-delà la donnée n'a pas été persistée)
  //   - burn / runway / cashflow : recalculés depuis les flux filtrés
  //   - top dépenses : recalculées depuis les transactions filtrées
  // Les soldes des comptes (point-in-time) restent inchangés — ils
  // représentent toujours l'instant T (= dernière sync Bridge).
  const temporality = useTemporality();
  const periodSummary = useMemo(
    () => buildPeriodSummary(summary, temporality.periodStart, temporality.periodEnd),
    [summary, temporality.periodStart, temporality.periodEnd]
  );

  const cashflowNet = useMemo(
    () =>
      periodSummary.monthlyFlows.reduce(
        (acc, m) => acc + (m.totalIn - m.totalOut),
        0
      ),
    [periodSummary.monthlyFlows]
  );

  function handleAccountClick(accountId: string) {
    setAccountFilter(accountId);
    setViewMode("transactions");
  }

  return (
    <section className="space-y-5">
      <HeroCard
        summary={periodSummary}
        cashflowNet={cashflowNet}
      />

      <ViewToggle
        active={viewMode}
        onChange={setViewMode}
        accountFilter={accountFilter}
        accounts={periodSummary.accounts}
        onResetFilter={() => setAccountFilter(null)}
      />

      {viewMode === "overview" ? (
        <OverviewView
          summary={periodSummary}
          onAccountClick={handleAccountClick}
        />
      ) : (
        <TransactionsView
          transactions={periodSummary.recentTransactions}
          accounts={periodSummary.accounts}
          accountFilter={accountFilter}
        />
      )}
    </section>
  );
}

/**
 * Construit un summary période-aware à partir du summary annuel + bornes
 * de la barre temporelle. Les sections période-dépendantes (flux mensuels,
 * burn, runway, top dépenses, transactions) sont recalculées ; les sections
 * point-in-time (soldes des comptes, totalBalance, lastSyncAt, balanceHistory)
 * restent intactes.
 *
 * Notes :
 *   - Les transactions stockées couvrent ~90j (cf. RECENT_TRANSACTIONS_LOOKBACK).
 *     Une période plus large fonctionne mais avec uniquement les flux mensuels
 *     pré-agrégés (jusqu'à 12 mois).
 *   - Si la période est entièrement HORS fenêtre des données stockées, on
 *     retourne des collections vides — la TreasuryTab affichera ses empty
 *     states naturellement (CashflowChart "Pas encore de flux", etc.).
 */
function buildPeriodSummary(
  source: BankingSummary,
  periodStart: string,
  periodEnd: string
): BankingSummary {
  const startMonth = periodStart.slice(0, 7); // YYYY-MM
  const endMonth = periodEnd.slice(0, 7);

  // Flux mensuels filtrés (chevauchement par YYYY-MM)
  const monthlyFlows = source.monthlyFlows.filter(
    (m) => m.month >= startMonth && m.month <= endMonth
  );

  // Transactions sur la période — borné par les 90j stockés.
  const recentTransactions = source.recentTransactions.filter(
    (tx) => tx.date >= periodStart && tx.date <= periodEnd
  );

  // Burn rate sur la période : sortie nette / nb jours
  const periodDays = Math.max(
    1,
    Math.round(
      (new Date(`${periodEnd}T00:00:00Z`).getTime() -
        new Date(`${periodStart}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1
  );
  let totalIn = 0;
  let totalOut = 0;
  for (const tx of recentTransactions) {
    if (tx.isFuture) continue;
    if (tx.amount >= 0) totalIn += tx.amount;
    else totalOut += Math.abs(tx.amount);
  }
  const netOut = totalOut - totalIn;
  const dailyBurn = netOut > 0 ? netOut / periodDays : 0;
  const monthlyBurn = dailyBurn * 30;
  const burnRate = {
    daily: round(dailyBurn),
    monthly: round(monthlyBurn),
  };

  // Runway recalculé avec le burn période — totalBalance reste celui du jour J
  const runway = computeRunwayFromBurn(source.totalBalance, monthlyBurn);

  // Top dépenses sur la période — on récupère les labels via le summary
  // annuel (qui les a résolus depuis les categories Bridge au moment du sync).
  const labelByCategoryId = new Map<number, string>();
  for (const cat of source.topExpenseCategories) {
    labelByCategoryId.set(cat.categoryId, cat.categoryLabel);
  }
  const topExpenseCategories = aggregateExpensesByCategory(
    recentTransactions,
    labelByCategoryId
  );

  return {
    ...source,
    monthlyFlows,
    recentTransactions,
    burnRate,
    runway,
    topExpenseCategories,
  };
}

function computeRunwayFromBurn(
  totalBalance: number,
  monthlyBurn: number
): BankingSummary["runway"] {
  if (!Number.isFinite(monthlyBurn) || monthlyBurn <= 0) {
    return { months: Number.MAX_SAFE_INTEGER, status: "safe" };
  }
  const months = totalBalance / monthlyBurn;
  let status: BankingRunwayStatus = "critical";
  if (months >= 12) status = "safe";
  else if (months >= 6) status = "warning";
  return { months: round(months), status };
}

function aggregateExpensesByCategory(
  transactions: BankTransaction[],
  labelByCategoryId: Map<number, string>
): CategoryAggregate[] {
  const buckets = new Map<number, { total: number; count: number }>();
  for (const tx of transactions) {
    if (tx.isFuture || tx.amount >= 0) continue;
    const cur = buckets.get(tx.categoryId) ?? { total: 0, count: 0 };
    cur.total += Math.abs(tx.amount);
    cur.count += 1;
    buckets.set(tx.categoryId, cur);
  }
  return [...buckets.entries()]
    .map(([categoryId, b]) => ({
      categoryId,
      categoryLabel: labelByCategoryId.get(categoryId) ?? `Catégorie #${categoryId}`,
      total: round(b.total),
      count: b.count,
    }))
    .sort((a, b) => b.total - a.total);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Hero card ──────────────────────────────────────────────────────────

function HeroCard({
  summary,
  cashflowNet,
}: {
  summary: BankingSummary;
  cashflowNet: number;
}) {
  const balancePoints = summary.balanceHistory.map((p) => p.totalBalance);
  const runwayStyle = RUNWAY_STYLES[summary.runway.status];
  const monthsDisplay =
    summary.runway.months >= Number.MAX_SAFE_INTEGER / 2
      ? "∞"
      : `${Math.round(summary.runway.months)} mois`;
  const lastSyncRel = formatRelativeDate(summary.lastSyncAt);
  const cashflowColor = cashflowNet >= 0 ? COLOR_SUCCESS : COLOR_DANGER;

  return (
    <article
      className="vyzor-fade-up relative overflow-hidden rounded-2xl p-5"
      style={{
        backgroundColor: "var(--app-card-glass-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(197, 160, 89, 0.18)",
        boxShadow: "0 0 24px rgba(197, 160, 89, 0.06)",
      }}
    >
      {/* Header : badge live + sync info */}
      <header className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.12)",
            color: "#86EFAC",
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: COLOR_SUCCESS, boxShadow: `0 0 6px ${COLOR_SUCCESS}` }}
          />
          Bridge
        </span>
        <span style={{ color: "rgba(255, 255, 255, 0.55)" }}>
          {summary.accounts.length} compte{summary.accounts.length > 1 ? "s" : ""} connecté{summary.accounts.length > 1 ? "s" : ""}
        </span>
        <span style={{ color: "rgba(255, 255, 255, 0.35)" }}>·</span>
        <span style={{ color: "rgba(255, 255, 255, 0.55)" }}>
          sync {lastSyncRel}
        </span>
        <Radio className="ml-auto h-3.5 w-3.5 animate-pulse" style={{ color: COLOR_GOLD }} />
      </header>

      {/* Solde principal + sparkline */}
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.55)" }}>
            Solde total
          </p>
          <p
            className="tnum mt-1 text-4xl font-bold leading-none tracking-tight text-white"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {formatCurrency(summary.totalBalance)}
          </p>
        </div>
        {balancePoints.length >= 2 ? (
          <div className="self-start md:self-end" title="Évolution du solde sur 6 mois">
            <AiSparkline points={balancePoints} width={160} height={40} />
          </div>
        ) : null}
      </div>

      {/* 3 mini-stats */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat
          label="Burn moyen mensuel"
          value={formatCurrency(summary.burnRate.monthly)}
          Icon={TrendingDown}
          color={summary.burnRate.monthly > 0 ? COLOR_DANGER : COLOR_SUCCESS}
          delayMs={80}
        />
        <MiniStat
          label="Cashflow net (12m)"
          value={formatCurrency(cashflowNet)}
          Icon={cashflowNet >= 0 ? TrendingUp : TrendingDown}
          color={cashflowColor}
          delayMs={120}
        />
        <MiniStat
          label="Runway"
          value={monthsDisplay}
          Icon={Wallet}
          color={runwayStyle.fg}
          subline={runwayStyle.label}
          delayMs={160}
        />
      </div>
    </article>
  );
}

function MiniStat({
  label,
  value,
  Icon,
  color,
  subline,
  delayMs,
}: {
  label: string;
  value: string;
  Icon: typeof Wallet;
  color: string;
  subline?: string;
  delayMs: number;
}) {
  return (
    <div
      className="vyzor-fade-up rounded-xl px-3.5 py-3"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        animationDelay: `${delayMs}ms`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3" style={{ color }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>
          {label}
        </span>
      </div>
      <p className="tnum mt-1 text-lg font-bold leading-tight" style={{ color }}>
        {value}
      </p>
      {subline ? (
        <p className="text-[11px]" style={{ color, opacity: 0.7 }}>
          {subline}
        </p>
      ) : null}
    </div>
  );
}

// ─── Toggle vues ────────────────────────────────────────────────────────

function ViewToggle({
  active,
  onChange,
  accountFilter,
  accounts,
  onResetFilter,
}: {
  active: ViewMode;
  onChange: (v: ViewMode) => void;
  accountFilter: string | null;
  accounts: BankAccount[];
  onResetFilter: () => void;
}) {
  const filteredAccount = accounts.find((a) => a.id === accountFilter);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div
        className="inline-flex rounded-full p-1"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
        }}
        role="tablist"
        aria-label="Vues Trésorerie"
      >
        <ToggleButton
          active={active === "overview"}
          onClick={() => onChange("overview")}
          Icon={LayoutGrid}
          label="Vue d'ensemble"
        />
        <ToggleButton
          active={active === "transactions"}
          onClick={() => onChange("transactions")}
          Icon={List}
          label="Transactions"
        />
      </div>

      {filteredAccount && active === "transactions" ? (
        <button
          type="button"
          onClick={onResetFilter}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.08)",
            border: "1px solid rgba(197, 160, 89, 0.3)",
            color: COLOR_GOLD,
          }}
        >
          <ArrowLeft className="h-3 w-3" />
          Tous les comptes
        </button>
      ) : null}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof LayoutGrid;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition"
      style={{
        backgroundColor: active ? "rgba(197, 160, 89, 0.15)" : "transparent",
        color: active ? COLOR_GOLD : "rgba(255, 255, 255, 0.65)",
      }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

// ─── Vue d'ensemble ─────────────────────────────────────────────────────

function OverviewView({
  summary,
  onAccountClick,
}: {
  summary: BankingSummary;
  onAccountClick: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <AccountsGrid accounts={summary.accounts} onAccountClick={onAccountClick} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <CashflowChart flows={summary.monthlyFlows} />
        <TopExpenses categories={summary.topExpenseCategories} />
      </div>
    </div>
  );
}

function AccountsGrid({
  accounts,
  onAccountClick,
}: {
  accounts: BankAccount[];
  onAccountClick: (id: string) => void;
}) {
  if (accounts.length === 0) {
    return (
      <article className="precision-card rounded-2xl p-5">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Aucun compte connecté pour l'instant.
        </p>
      </article>
    );
  }
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
    >
      {accounts.map((account, i) => (
        <AccountCard
          key={account.id}
          account={account}
          onClick={() => onAccountClick(account.id)}
          delayMs={i * 60}
        />
      ))}
    </div>
  );
}

function AccountCard({
  account,
  onClick,
  delayMs,
}: {
  account: BankAccount;
  onClick: () => void;
  delayMs: number;
}) {
  const meta = ACCOUNT_TYPE_META[account.type];
  const Icon = meta.Icon;
  const balanceColor =
    account.balance < 0 ? COLOR_DANGER : "rgba(255, 255, 255, 0.95)";
  const ibanMasked = maskIban(account.iban);

  return (
    <button
      type="button"
      onClick={onClick}
      className="vyzor-fade-up group flex flex-col gap-2 rounded-2xl p-4 text-left transition"
      style={{
        backgroundColor: "rgba(26, 26, 46, 0.55)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        animationDelay: `${delayMs}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(197, 160, 89, 0.4)";
        e.currentTarget.style.boxShadow = "0 0 18px rgba(197, 160, 89, 0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
        e.currentTarget.style.boxShadow = "none";
      }}
      aria-label={`${account.name} chez ${account.providerName}, solde ${formatCurrency(account.balance)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "rgba(197, 160, 89, 0.1)",
              border: "1px solid rgba(197, 160, 89, 0.25)",
              color: COLOR_GOLD,
            }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{account.name}</p>
            <p className="truncate text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
              {account.providerName} · {meta.label}
            </p>
          </div>
        </div>
      </div>

      <p
        className="tnum text-[1.5rem] font-bold leading-none tracking-tight"
        style={{ color: balanceColor }}
      >
        {formatCurrency(account.balance)}
      </p>

      {ibanMasked ? (
        <p
          className="font-mono text-[10px]"
          style={{
            color: "rgba(255, 255, 255, 0.4)",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          {ibanMasked}
        </p>
      ) : null}
    </button>
  );
}

function CashflowChart({ flows }: { flows: MonthlyFlow[] }) {
  if (flows.length === 0) {
    return (
      <article className="precision-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-white">Flux de trésorerie</h2>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Pas encore de flux mensuels exploitables.
        </p>
      </article>
    );
  }
  // Échelle commune entrées/sorties pour comparaison visuelle.
  const maxAbs = Math.max(
    ...flows.map((f) => Math.max(f.totalIn, f.totalOut)),
    1
  );
  return (
    <article
      className="vyzor-fade-up rounded-2xl p-5"
      style={{
        backgroundColor: "rgba(15, 15, 18, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        animationDelay: "120ms",
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Flux de trésorerie</h2>
        <Legend />
      </header>
      <div className="mt-4 space-y-3">
        {flows.map((flow, i) => (
          <FlowRow key={flow.month} flow={flow} maxAbs={maxAbs} delayMs={i * 40} />
        ))}
      </div>
    </article>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="inline-flex items-center gap-1" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span
          className="inline-block h-2 w-2 rounded"
          style={{ backgroundColor: COLOR_GOLD }}
        />
        Entrées
      </span>
      <span className="inline-flex items-center gap-1" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span
          className="inline-block h-2 w-2 rounded"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.25)" }}
        />
        Sorties
      </span>
    </div>
  );
}

function FlowRow({
  flow,
  maxAbs,
  delayMs,
}: {
  flow: MonthlyFlow;
  maxAbs: number;
  delayMs: number;
}) {
  const inPct = (flow.totalIn / maxAbs) * 100;
  const outPct = (flow.totalOut / maxAbs) * 100;
  return (
    <div className="vyzor-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
        <span style={{ color: "rgba(255,255,255,0.55)" }}>{formatMonthLabel(flow.month)}</span>
        <span className="tnum" style={{ color: flow.netFlow >= 0 ? COLOR_SUCCESS : COLOR_DANGER }}>
          {flow.netFlow >= 0 ? "+" : ""}
          {formatCurrency(flow.netFlow)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <div className="flex-1 h-2.5 overflow-hidden rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <div
            className="h-full rounded transition-all"
            style={{
              width: `${Math.max(inPct, 1.5)}%`,
              background: `linear-gradient(90deg, ${COLOR_GOLD}, rgba(197,160,89,0.4))`,
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDuration: "500ms",
            }}
          />
        </div>
        <div className="flex-1 h-2.5 overflow-hidden rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          <div
            className="h-full rounded transition-all"
            style={{
              width: `${Math.max(outPct, 1.5)}%`,
              backgroundColor: "rgba(255, 255, 255, 0.25)",
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDuration: "500ms",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TopExpenses({ categories }: { categories: CategoryAggregate[] }) {
  if (categories.length === 0) {
    return (
      <article className="precision-card rounded-2xl p-5">
        <h2 className="text-base font-semibold text-white">Top dépenses</h2>
        <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Pas de dépenses identifiées.
        </p>
      </article>
    );
  }
  const total = categories.reduce((sum, c) => sum + c.total, 0) || 1;
  const top = categories.slice(0, 5);
  return (
    <article
      className="vyzor-fade-up rounded-2xl p-5"
      style={{
        backgroundColor: "rgba(15, 15, 18, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        animationDelay: "160ms",
      }}
    >
      <h2 className="text-base font-semibold text-white">Top dépenses</h2>
      <ul className="mt-3 space-y-2.5">
        {top.map((cat, i) => {
          const pct = (cat.total / total) * 100;
          return (
            <li
              key={cat.categoryId}
              className="vyzor-fade-up"
              style={{ animationDelay: `${180 + i * 50}ms` }}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="truncate text-white">{cat.categoryLabel}</span>
                <span className="tnum flex-shrink-0" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {formatCurrency(cat.total)} · {pct.toFixed(0)}%
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded"
                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
              >
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    background: `linear-gradient(90deg, ${COLOR_GOLD}, rgba(197,160,89,0.5))`,
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDuration: "500ms",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

// ─── Vue Transactions ───────────────────────────────────────────────────

function TransactionsView({
  transactions,
  accounts,
  accountFilter,
}: {
  transactions: BankTransaction[];
  accounts: BankAccount[];
  accountFilter: string | null;
}) {
  const filtered = useMemo(() => {
    const list = accountFilter
      ? transactions.filter((tx) => tx.accountId === accountFilter)
      : transactions;
    return list.slice(0, 100); // borne raisonnable côté UI
  }, [transactions, accountFilter]);

  const accountById = useMemo(() => {
    const map = new Map<string, BankAccount>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  if (filtered.length === 0) {
    return (
      <article className="precision-card rounded-2xl p-5">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Aucune transaction sur les 90 derniers jours pour ce filtre.
        </p>
      </article>
    );
  }

  return (
    <article
      className="vyzor-fade-up rounded-2xl"
      style={{
        backgroundColor: "rgba(15, 15, 18, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        overflow: "hidden",
      }}
    >
      <ul>
        {filtered.map((tx, i) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            account={accountById.get(tx.accountId)}
            isLast={i === filtered.length - 1}
            delayMs={Math.min(i * 20, 600)}
          />
        ))}
      </ul>
    </article>
  );
}

function TransactionRow({
  tx,
  account,
  isLast,
  delayMs,
}: {
  tx: BankTransaction;
  account: BankAccount | undefined;
  isLast: boolean;
  delayMs: number;
}) {
  const isCredit = tx.amount >= 0;
  const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
  const iconColor = isCredit ? COLOR_SUCCESS : "rgba(255, 255, 255, 0.6)";
  const amountColor = isCredit ? COLOR_SUCCESS : "rgba(255, 255, 255, 0.95)";
  const description = tx.description || "Opération sans libellé";

  return (
    <li
      className="vyzor-fade-up flex items-center gap-3 px-4 py-2.5 transition"
      style={{
        borderBottom: isLast ? undefined : "1px solid rgba(255, 255, 255, 0.05)",
        animationDelay: `${delayMs}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(197, 160, 89, 0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: isCredit ? "rgba(34, 197, 94, 0.1)" : "rgba(255, 255, 255, 0.05)",
        }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-white">{description}</p>
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          {tx.date}
          {account ? ` · ${account.name}` : ""}
          {tx.isFuture ? " · à venir" : ""}
        </p>
      </div>
      <p className="tnum flex-shrink-0 text-[14px] font-semibold" style={{ color: amountColor }}>
        {isCredit ? "+" : ""}
        {formatCurrency(tx.amount)}
      </p>
    </li>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function maskIban(iban?: string): string | undefined {
  if (!iban) return undefined;
  const compact = iban.replace(/\s+/g, "");
  if (compact.length <= 8) return iban;
  return `${compact.slice(0, 4)} ···· ···· ${compact.slice(-4)}`;
}

function formatMonthLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split("-").map(Number);
  if (!year || !month) return yyyymm;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR");
}
