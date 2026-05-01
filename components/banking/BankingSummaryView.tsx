// File: components/banking/BankingSummaryView.tsx
// Role: structure d'affichage du `BankingSummary` Bridge — soldes par compte,
// flux du mois, burn rate / runway, top dépenses, transactions à venir.
//
// Volontairement minimaliste côté design : on cale sur la DA "precision-card"
// existante pour rester cohérent avec le reste de l'app, mais on n'a pas
// finalisé le design Banking — c'est un placeholder structurel pour valider
// le pipeline. Le passage en design final est explicitement repoussé en
// "second temps" par le PM.
"use client";

import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CreditCard,
  TrendingDown,
  Wallet,
} from "lucide-react";
import type { BankAccount, BankingRunwayStatus, BankingSummary, BankTransaction } from "@/types/banking";

const RUNWAY_COLORS: Record<BankingRunwayStatus, { fg: string; bg: string; label: string }> = {
  safe: { fg: "#22C55E", bg: "rgba(34, 197, 94, 0.10)", label: "confortable" },
  warning: { fg: "#F59E0B", bg: "rgba(245, 158, 11, 0.10)", label: "à surveiller" },
  critical: { fg: "#EF4444", bg: "rgba(239, 68, 68, 0.10)", label: "critique" },
};

const ACCOUNT_TYPE_LABEL: Record<BankAccount["type"], string> = {
  checking: "Compte courant",
  savings: "Épargne",
  loan: "Emprunt",
  card: "Carte",
  other: "Autre",
};

type BankingSummaryViewProps = {
  summary: BankingSummary;
};

export function BankingSummaryView({ summary }: BankingSummaryViewProps) {
  const currentMonth = summary.monthlyFlows[summary.monthlyFlows.length - 1] ?? null;
  const runwayStyle = RUNWAY_COLORS[summary.runway.status];

  return (
    <section className="space-y-5">
      <BalancesSection accounts={summary.accounts} totalBalance={summary.totalBalance} />

      {currentMonth ? <FlowsSection month={currentMonth} /> : null}

      <RunwaySection
        burnRate={summary.burnRate}
        runway={summary.runway}
        style={runwayStyle}
      />

      <TopExpensesSection categories={summary.topExpenseCategories} />

      <UpcomingSection transactions={summary.upcomingTransactions} />
    </section>
  );
}

// ─── Soldes bancaires ───────────────────────────────────────────────────

function BalancesSection({
  accounts,
  totalBalance,
}: {
  accounts: BankAccount[];
  totalBalance: number;
}) {
  return (
    <article className="precision-card rounded-2xl p-5">
      <div className="card-header flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-quantis-gold" />
          <h2 className="text-lg font-semibold text-white">Soldes bancaires</h2>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wider text-white/55">
          {formatMoney(totalBalance)} au total
        </span>
      </div>
      {accounts.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">Aucun compte connecté.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{a.name}</p>
                  <p className="truncate text-[11px] text-white/55">
                    {a.providerName} • {ACCOUNT_TYPE_LABEL[a.type]}
                  </p>
                </div>
                <p className="tnum text-right text-base font-semibold text-white">
                  {formatMoney(a.balance, a.currency)}
                </p>
              </div>
              <p className="mt-1 text-[10px] text-white/40">
                MAJ {formatRelativeDate(a.lastRefreshedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ─── Flux du mois ───────────────────────────────────────────────────────

function FlowsSection({
  month,
}: {
  month: { month: string; totalIn: number; totalOut: number; netFlow: number };
}) {
  return (
    <article className="precision-card rounded-2xl p-5">
      <div className="card-header flex items-center gap-2">
        <ArrowUp className="h-4 w-4 text-emerald-400" />
        <h2 className="text-lg font-semibold text-white">
          Flux — {formatMonthLabel(month.month)}
        </h2>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <FlowTile label="Entrées" value={month.totalIn} color="#22C55E" Icon={ArrowUp} />
        <FlowTile label="Sorties" value={month.totalOut} color="#EF4444" Icon={ArrowDown} />
        <FlowTile
          label="Flux net"
          value={month.netFlow}
          color={month.netFlow >= 0 ? "#22C55E" : "#EF4444"}
        />
      </div>
    </article>
  );
}

function FlowTile({
  label,
  value,
  color,
  Icon,
}: {
  label: string;
  value: number;
  color: string;
  Icon?: typeof ArrowUp;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="h-3 w-3" style={{ color }} /> : null}
        <span className="text-[10px] uppercase tracking-wider text-white/55">{label}</span>
      </div>
      <p className="tnum mt-1 text-lg font-semibold" style={{ color }}>
        {formatMoney(value)}
      </p>
    </div>
  );
}

// ─── Burn rate & Runway ─────────────────────────────────────────────────

function RunwaySection({
  burnRate,
  runway,
  style,
}: {
  burnRate: { daily: number; monthly: number };
  runway: { months: number; status: BankingRunwayStatus };
  style: { fg: string; bg: string; label: string };
}) {
  const monthsDisplay =
    runway.months >= Number.MAX_SAFE_INTEGER / 2 ? "∞" : `${Math.round(runway.months)} mois`;
  return (
    <article className="precision-card rounded-2xl p-5">
      <div className="card-header flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-quantis-gold" />
        <h2 className="text-lg font-semibold text-white">Burn rate & Runway</h2>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3">
          <span className="text-[10px] uppercase tracking-wider text-white/55">
            Burn rate mensuel
          </span>
          <p className="tnum mt-1 text-xl font-semibold text-white">
            {formatMoney(burnRate.monthly)}
          </p>
          <p className="text-[11px] text-white/45">
            ≈ {formatMoney(burnRate.daily)}/jour
          </p>
        </div>
        <div
          className="rounded-xl px-3 py-3"
          style={{ backgroundColor: style.bg, border: `1px solid ${style.fg}` }}
        >
          <span className="text-[10px] uppercase tracking-wider" style={{ color: style.fg }}>
            Runway
          </span>
          <p className="tnum mt-1 text-xl font-semibold" style={{ color: style.fg }}>
            {monthsDisplay}
          </p>
          <p className="text-[11px]" style={{ color: style.fg, opacity: 0.85 }}>
            Statut : {style.label}
          </p>
        </div>
      </div>
    </article>
  );
}

// ─── Top dépenses ───────────────────────────────────────────────────────

function TopExpensesSection({
  categories,
}: {
  categories: BankingSummary["topExpenseCategories"];
}) {
  return (
    <article className="precision-card rounded-2xl p-5">
      <div className="card-header flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-quantis-gold" />
        <h2 className="text-lg font-semibold text-white">Top dépenses</h2>
      </div>
      {categories.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">Pas de dépenses identifiées.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {categories.slice(0, 5).map((cat) => (
            <li
              key={cat.categoryId}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{cat.categoryLabel}</p>
                <p className="text-[10px] text-white/45">{cat.count} opération{cat.count > 1 ? "s" : ""}</p>
              </div>
              <p className="tnum text-sm font-semibold text-rose-300">{formatMoney(cat.total)}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ─── À venir ────────────────────────────────────────────────────────────

function UpcomingSection({ transactions }: { transactions: BankTransaction[] }) {
  return (
    <article className="precision-card rounded-2xl p-5">
      <div className="card-header flex items-center gap-2">
        <Calendar className="h-4 w-4 text-quantis-gold" />
        <h2 className="text-lg font-semibold text-white">À venir</h2>
      </div>
      {transactions.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">Aucune opération programmée.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {transactions.slice(0, 8).map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{tx.description || "Opération sans libellé"}</p>
                <p className="text-[10px] text-white/45">{tx.date}</p>
              </div>
              <p
                className="tnum text-sm font-semibold"
                style={{ color: tx.amount >= 0 ? "#86EFAC" : "#FCA5A5" }}
              >
                {tx.amount >= 0 ? "+" : ""}
                {formatMoney(tx.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatMoney(value: number, currency = "EUR"): string {
  return value.toLocaleString("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMonthLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split("-").map(Number);
  if (!year || !month) return yyyymm;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days}j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem`;
  return d.toLocaleDateString("fr-FR");
}
