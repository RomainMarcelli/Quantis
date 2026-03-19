import type { FinancialFacts, ParsedMetric } from "@/types/analysis";

type MetricKeywordConfig = {
  key: keyof FinancialFacts;
  label: string;
  keywords: string[];
};

const KEYWORD_MAP: MetricKeywordConfig[] = [
  { key: "revenue", label: "Chiffre d'affaires", keywords: ["chiffre d'affaires", "ca", "revenu", "ventes"] },
  { key: "expenses", label: "Charges", keywords: ["charges", "depenses", "frais", "expenses"] },
  { key: "payroll", label: "Masse salariale", keywords: ["salaire", "personnel", "paie", "payroll"] },
  { key: "treasury", label: "Tresorerie", keywords: ["tresorerie", "disponibilites", "banque", "cash"] },
  { key: "receivables", label: "Creances clients", keywords: ["creances", "clients", "receivables"] },
  { key: "payables", label: "Dettes fournisseurs", keywords: ["fournisseurs", "dettes", "payables"] },
  { key: "inventory", label: "Stocks", keywords: ["stock", "inventaire", "inventory"] }
];

export function extractFinancialFactsFromRows(
  rows: Record<string, unknown>[]
): { facts: FinancialFacts; metrics: ParsedMetric[] } {
  const accumulator = initFactsAccumulator();

  rows.forEach((row) => {
    const values = Object.values(row);
    const text = values
      .map((value) => String(value ?? ""))
      .join(" ")
      .toLowerCase();

    const numberCandidates = values
      .map((value) => parseAmount(value))
      .filter((value): value is number => value !== null && Number.isFinite(value));

    if (!numberCandidates.length) {
      return;
    }

    const representativeAmount = numberCandidates
      .map((candidate) => Math.abs(candidate))
      .sort((a, b) => b - a)[0];

    KEYWORD_MAP.forEach((metric) => {
      if (metric.keywords.some((keyword) => text.includes(keyword))) {
        accumulator[metric.key] = (accumulator[metric.key] ?? 0) + representativeAmount;
      }
    });
  });

  return toFactsAndMetrics(accumulator);
}

export function extractFinancialFactsFromText(
  text: string
): { facts: FinancialFacts; metrics: ParsedMetric[] } {
  const normalizedText = normalizeText(text);
  const accumulator = initFactsAccumulator();

  KEYWORD_MAP.forEach((metric) => {
    const pattern = new RegExp(`(?:${metric.keywords.join("|")})[^\\d-]{0,40}(-?[\\d\\s.,]+)`, "i");
    const match = normalizedText.match(pattern);
    if (!match?.[1]) {
      return;
    }

    const amount = parseAmount(match[1]);
    if (amount === null) {
      return;
    }

    accumulator[metric.key] = Math.abs(amount);
  });

  return toFactsAndMetrics(accumulator);
}

export function mergeFinancialFacts(items: FinancialFacts[]): FinancialFacts {
  const merged = initFactsAccumulator();

  items.forEach((item) => {
    (Object.keys(item) as Array<keyof FinancialFacts>).forEach((key) => {
      if (item[key] === null) {
        return;
      }
      merged[key] = (merged[key] ?? 0) + (item[key] as number);
    });
  });

  return toFinancialFacts(merged);
}

function toFactsAndMetrics(accumulator: Partial<Record<keyof FinancialFacts, number>>): {
  facts: FinancialFacts;
  metrics: ParsedMetric[];
} {
  const metrics: ParsedMetric[] = [];

  KEYWORD_MAP.forEach((metric) => {
    const value = accumulator[metric.key];
    if (typeof value !== "number") {
      return;
    }

    metrics.push({
      key: metric.key,
      label: metric.label,
      value,
      confidence: "medium"
    });
  });

  return {
    facts: toFinancialFacts(accumulator),
    metrics
  };
}

function toFinancialFacts(accumulator: Partial<Record<keyof FinancialFacts, number>>): FinancialFacts {
  return {
    revenue: accumulator.revenue ?? null,
    expenses: accumulator.expenses ?? null,
    payroll: accumulator.payroll ?? null,
    treasury: accumulator.treasury ?? null,
    receivables: accumulator.receivables ?? null,
    payables: accumulator.payables ?? null,
    inventory: accumulator.inventory ?? null
  };
}

function initFactsAccumulator(): Partial<Record<keyof FinancialFacts, number>> {
  return {
    revenue: 0,
    expenses: 0,
    payroll: 0,
    treasury: 0,
    receivables: 0,
    payables: 0,
    inventory: 0
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!cleaned) {
    return null;
  }

  if (cleaned.includes(",") && cleaned.includes(".")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = cleaned.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

