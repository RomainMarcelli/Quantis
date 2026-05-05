// Construit les insights granulaires (top clients/fournisseurs, secteurs, DSO/DPO, retards)
// à partir des factures + contacts persistés en base.
//
// Pure logic : pas d'appel Firestore ni provider, rien que de l'agrégation. Testable seul.

import type {
  Contact,
  CustomerStat,
  GranularInsights,
  Invoice,
  OverdueInvoiceSummary,
  ProductStat,
  SectorBreakdownEntry,
  SupplierStat,
  ConcentrationStats,
} from "@/types/connectors";

const TOP_N_CUSTOMERS = 10;
const TOP_N_SUPPLIERS = 10;
const TOP_N_PRODUCTS = 10;
const TOP_N_OVERDUE = 10;

export type GranularInsightsBuilderOptions = {
  periodStart: Date;
  periodEnd: Date;
  // Date de référence pour calculer les jours de retard ; par défaut = periodEnd.
  asOf?: Date;
};

export function buildGranularInsights(params: {
  invoices: Invoice[];
  contacts: Contact[];
  options: GranularInsightsBuilderOptions;
}): GranularInsights {
  const { invoices, contacts, options } = params;
  const asOfMs = (options.asOf ?? options.periodEnd).getTime();
  const periodStartMs = options.periodStart.getTime();
  const periodEndMs = options.periodEnd.getTime();

  // Guard : ne traiter que les factures avec date et montants finis.
  const isValidInvoice = (inv: Invoice): boolean => {
    if (!inv.date) return false;
    if (Number.isNaN(new Date(inv.date).getTime())) return false;
    if (!Number.isFinite(inv.totalExclVat)) return false;
    if (!Number.isFinite(inv.totalInclVat)) return false;
    return true;
  };

  let skippedInvalidInvoices = 0;
  const validInvoices = invoices.filter((inv) => {
    const ok = isValidInvoice(inv);
    if (!ok) skippedInvalidInvoices++;
    return ok;
  });

  const customerInvoices = validInvoices.filter((inv) => inv.type === "customer");
  const supplierInvoices = validInvoices.filter((inv) => inv.type === "supplier");

  // Filtrer aux factures émises dans la période pour le CA & top clients.
  const periodCustomerInvoices = customerInvoices.filter((inv) =>
    isInPeriod(inv.date, periodStartMs, periodEndMs)
  );
  const periodSupplierInvoices = supplierInvoices.filter((inv) =>
    isInPeriod(inv.date, periodStartMs, periodEndMs)
  );

  if (skippedInvalidInvoices > 0) {
    console.warn(
      `[granularInsightsBuilder] skipped ${skippedInvalidInvoices} invoices with invalid date or amounts`
    );
  }

  const contactsByExternalId = new Map<string, Contact>();
  for (const c of contacts) {
    contactsByExternalId.set(c.externalId, c);
  }

  // ─── Customers ─────────────────────────────────────────────────────────
  const customerAggMap = new Map<
    string,
    { revenue: number; invoicesCount: number }
  >();
  for (const inv of periodCustomerInvoices) {
    if (!inv.contactExternalId) continue;
    const current = customerAggMap.get(inv.contactExternalId) ?? {
      revenue: 0,
      invoicesCount: 0,
    };
    current.revenue += inv.totalExclVat;
    current.invoicesCount += 1;
    customerAggMap.set(inv.contactExternalId, current);
  }
  const totalRevenue = sumMap(customerAggMap, (v) => v.revenue);
  const customerStats: CustomerStat[] = [...customerAggMap.entries()].map(
    ([externalId, agg]) => {
      const contact = contactsByExternalId.get(externalId);
      return {
        contactId: contact?.id ?? "",
        externalId,
        name: contact?.name ?? `Client ${externalId}`,
        siret: contact?.siret ?? null,
        sector: contact?.sector ?? null,
        revenue: roundMoney(agg.revenue),
        share: totalRevenue > 0 ? agg.revenue / totalRevenue : 0,
        invoicesCount: agg.invoicesCount,
      };
    }
  );
  customerStats.sort((a, b) => b.revenue - a.revenue);
  const topCustomers = customerStats.slice(0, TOP_N_CUSTOMERS);

  // ─── Suppliers ─────────────────────────────────────────────────────────
  const supplierAggMap = new Map<
    string,
    { totalPurchases: number; invoicesCount: number }
  >();
  for (const inv of periodSupplierInvoices) {
    if (!inv.contactExternalId) continue;
    const current = supplierAggMap.get(inv.contactExternalId) ?? {
      totalPurchases: 0,
      invoicesCount: 0,
    };
    current.totalPurchases += inv.totalExclVat;
    current.invoicesCount += 1;
    supplierAggMap.set(inv.contactExternalId, current);
  }
  const totalPurchases = sumMap(supplierAggMap, (v) => v.totalPurchases);
  const supplierStats: SupplierStat[] = [...supplierAggMap.entries()].map(
    ([externalId, agg]) => {
      const contact = contactsByExternalId.get(externalId);
      return {
        contactId: contact?.id ?? "",
        externalId,
        name: contact?.name ?? `Fournisseur ${externalId}`,
        totalPurchases: roundMoney(agg.totalPurchases),
        share: totalPurchases > 0 ? agg.totalPurchases / totalPurchases : 0,
        invoicesCount: agg.invoicesCount,
      };
    }
  );
  supplierStats.sort((a, b) => b.totalPurchases - a.totalPurchases);
  const topSuppliers = supplierStats.slice(0, TOP_N_SUPPLIERS);

  // ─── Sectors ───────────────────────────────────────────────────────────
  const sectorAggMap = new Map<
    string,
    { revenue: number; customers: Set<string> }
  >();
  for (const stat of customerStats) {
    const sector = stat.sector?.trim() || "Non renseigné";
    const current = sectorAggMap.get(sector) ?? {
      revenue: 0,
      customers: new Set<string>(),
    };
    current.revenue += stat.revenue;
    current.customers.add(stat.externalId);
    sectorAggMap.set(sector, current);
  }
  const sectorBreakdown: SectorBreakdownEntry[] = [...sectorAggMap.entries()]
    .map(([sector, agg]) => ({
      sector,
      revenue: roundMoney(agg.revenue),
      share: totalRevenue > 0 ? agg.revenue / totalRevenue : 0,
      customerCount: agg.customers.size,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Products ──────────────────────────────────────────────────────────
  const productAggMap = new Map<
    string,
    { label: string; revenue: number; quantity: number; category: string | null }
  >();
  for (const inv of periodCustomerInvoices) {
    for (const line of inv.lines) {
      const key = line.productExternalId ?? `__label__${line.label}`;
      const current = productAggMap.get(key) ?? {
        label: line.label,
        revenue: 0,
        quantity: 0,
        category: null,
      };
      current.revenue += line.amountExclVat;
      current.quantity += line.quantity;
      productAggMap.set(key, current);
    }
  }
  const productStats: ProductStat[] = [...productAggMap.entries()].map(
    ([key, agg]) => ({
      externalId: key.startsWith("__label__") ? "" : key,
      label: agg.label,
      category: agg.category,
      revenue: roundMoney(agg.revenue),
      share: totalRevenue > 0 ? agg.revenue / totalRevenue : 0,
      quantitySold: agg.quantity,
    })
  );
  productStats.sort((a, b) => b.revenue - a.revenue);
  const topProducts = productStats.slice(0, TOP_N_PRODUCTS);

  // Catégories : pas exposé par Pennylane direct sur les products → vide en Phase 1.
  const categoryBreakdown: { category: string; revenue: number; share: number }[] = [];

  // ─── Revenue timeline (mensuel) ────────────────────────────────────────
  const monthMap = new Map<string, { total: number; topRevenue: number }>();
  const topIds = new Set(topCustomers.map((c) => c.externalId));
  for (const inv of periodCustomerInvoices) {
    const month = toIsoMonth(inv.date);
    if (!month) continue;
    const current = monthMap.get(month) ?? { total: 0, topRevenue: 0 };
    current.total += inv.totalExclVat;
    if (topIds.has(inv.contactExternalId)) {
      current.topRevenue += inv.totalExclVat;
    }
    monthMap.set(month, current);
  }
  const revenueTimeline = enumerateMonths(options.periodStart, options.periodEnd).map((month) => {
    const agg = monthMap.get(month) ?? { total: 0, topRevenue: 0 };
    return {
      month,
      totalRevenue: roundMoney(agg.total),
      topCustomersShare: agg.total > 0 ? agg.topRevenue / agg.total : 0,
    };
  });

  // ─── Receivables (encours clients) ─────────────────────────────────────
  const outstandingCustomerInvoices = customerInvoices.filter(
    (inv) => inv.status !== "paid" && inv.status !== "cancelled"
  );
  const totalOutstandingReceivable = roundMoney(
    sumArray(outstandingCustomerInvoices, (inv) => inv.totalInclVat)
  );
  const overdueCustomerInvoices = outstandingCustomerInvoices.filter(
    (inv) => inv.dueDate && new Date(inv.dueDate).getTime() < asOfMs
  );
  const overdueReceivableAmount = roundMoney(
    sumArray(overdueCustomerInvoices, (inv) => inv.totalInclVat)
  );

  const topOverdue: OverdueInvoiceSummary[] = overdueCustomerInvoices
    .map((inv) => {
      const contact = contactsByExternalId.get(inv.contactExternalId);
      const daysOverdue = inv.dueDate
        ? Math.max(0, Math.floor((asOfMs - new Date(inv.dueDate).getTime()) / 86_400_000))
        : 0;
      return {
        invoiceId: inv.id,
        contactId: contact?.id ?? "",
        contactName: contact?.name ?? inv.contactName ?? `Client ${inv.contactExternalId}`,
        amount: roundMoney(inv.totalInclVat),
        daysOverdue,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_N_OVERDUE);

  const averageDSO = computeAverageDelayInDays(
    customerInvoices.filter((inv) => inv.paidDate),
    (inv) => inv.date,
    (inv) => inv.paidDate
  );

  // ─── Payables ──────────────────────────────────────────────────────────
  const outstandingSupplierInvoices = supplierInvoices.filter(
    (inv) => inv.status !== "paid" && inv.status !== "cancelled"
  );
  const totalOutstandingPayable = roundMoney(
    sumArray(outstandingSupplierInvoices, (inv) => inv.totalInclVat)
  );
  const overdueSupplierInvoices = outstandingSupplierInvoices.filter(
    (inv) => inv.dueDate && new Date(inv.dueDate).getTime() < asOfMs
  );
  const averageDPO = computeAverageDelayInDays(
    supplierInvoices.filter((inv) => inv.paidDate),
    (inv) => inv.date,
    (inv) => inv.paidDate
  );

  // ─── Customer churn / new ─────────────────────────────────────────────
  // "Nouveau" = premier facture au sein de la période (et createdAtExternal aussi si dispo).
  // "Churned" : nécessite l'historique période N-1, qu'on n'a pas en Phase 1 sans 2e sync.
  // On se contente du new ; le churned reste à 0 et sera affiné après stockage du dernier sync.
  const firstInvoiceByCustomer = new Map<string, number>();
  for (const inv of customerInvoices) {
    const t = new Date(inv.date).getTime();
    const prev = firstInvoiceByCustomer.get(inv.contactExternalId);
    if (prev === undefined || t < prev) {
      firstInvoiceByCustomer.set(inv.contactExternalId, t);
    }
  }
  let newCount = 0;
  for (const [, firstMs] of firstInvoiceByCustomer) {
    if (firstMs >= periodStartMs && firstMs <= periodEndMs) newCount++;
  }

  return {
    customers: {
      total: customerAggMap.size,
      topByRevenue: topCustomers,
      concentration: computeConcentration(customerStats.map((s) => s.revenue)),
      sectorBreakdown,
      newCount,
      churnedCount: 0,
    },
    products: {
      topByRevenue: topProducts,
      categoryBreakdown,
    },
    revenueTimeline,
    receivables: {
      totalOutstanding: totalOutstandingReceivable,
      overdueCount: overdueCustomerInvoices.length,
      overdueAmount: overdueReceivableAmount,
      averageDSO,
      topOverdue,
    },
    suppliers: {
      topByPurchase: topSuppliers,
      concentration: computeConcentration(supplierStats.map((s) => s.totalPurchases)),
    },
    payables: {
      totalOutstanding: totalOutstandingPayable,
      overdueCount: overdueSupplierInvoices.length,
      averageDPO,
    },
    cashflow: null, // Pas de banque côté Pennylane direct — Phase 3 (Bridge).
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isInPeriod(isoDate: string, startMs: number, endMs: number): boolean {
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startMs && t <= endMs;
}

function sumArray<T>(items: T[], get: (item: T) => number): number {
  let s = 0;
  for (const it of items) s += get(it);
  return s;
}

function sumMap<K, V>(map: Map<K, V>, get: (value: V) => number): number {
  let s = 0;
  for (const v of map.values()) s += get(v);
  return s;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIsoMonth(isoDate: string): string | null {
  if (typeof isoDate !== "string" || isoDate.length < 7) return null;
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function enumerateMonths(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endCursor) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    months.push(`${y}-${m}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function computeConcentration(revenues: number[]): ConcentrationStats {
  const total = revenues.reduce((a, b) => a + b, 0);
  if (total <= 0 || revenues.length === 0) {
    return { top5Share: 0, top10Share: 0, hhi: 0 };
  }
  const sorted = [...revenues].sort((a, b) => b - a);
  const top5 = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
  const top10 = sorted.slice(0, 10).reduce((a, b) => a + b, 0);
  const hhi = sorted.reduce((acc, r) => acc + Math.pow(r / total, 2), 0);
  return {
    top5Share: top5 / total,
    top10Share: top10 / total,
    hhi,
  };
}

function computeAverageDelayInDays<T>(
  items: T[],
  startGetter: (item: T) => string,
  endGetter: (item: T) => string | null
): number | null {
  if (items.length === 0) return null;
  let totalDays = 0;
  let count = 0;
  for (const item of items) {
    const startStr = startGetter(item);
    const endStr = endGetter(item);
    if (!endStr) continue;
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
    totalDays += (end - start) / 86_400_000;
    count++;
  }
  return count > 0 ? Math.round(totalDays / count) : null;
}
