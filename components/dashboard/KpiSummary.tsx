import type { CalculatedKpis } from "@/types/analysis";

type KpiSummaryProps = {
  kpis: CalculatedKpis | null;
};

export function KpiSummary({ kpis }: KpiSummaryProps) {
  if (!kpis) {
    return null;
  }

  const items = [
    {
      label: "Marge brute",
      value: formatPercent(kpis.grossMarginRate)
    },
    {
      label: "Résultat net",
      value: formatCurrency(kpis.netProfit)
    },
    {
      label: "BFR",
      value: formatCurrency(kpis.workingCapital)
    },
    {
      label: "Autonomie (mois)",
      value: formatNumber(kpis.cashRunwayMonths)
    },
    {
      label: "Consommation mensuelle",
      value: formatCurrency(kpis.monthlyBurnRate)
    },
    {
      label: "Score de santé",
      value: formatPercent(kpis.healthScore)
    }
  ];

  return (
    <section className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <article key={item.label} className="quantis-panel p-4">
          <p className="text-xs uppercase tracking-wide text-quantis-slate">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-quantis-carbon">{item.value}</p>
        </article>
      ))}
    </section>
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "N/D";
  }
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "N/D";
  }
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "N/D";
  }
  return value.toFixed(1);
}
