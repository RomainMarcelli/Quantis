// Test de volume : 5000 entries + 1296 ledger_accounts + 1500 invoices.
// Vérifie que les aggregators tiennent le coup en perf et mémoire.
//
// Rationale des seuils :
// - pcgAggregator : ~5000 entries × 3 lignes = 15k itérations → < 200ms acceptable
// - kpisTimeSeriesBuilder : 24 itérations × pcgAggregator → < 5s acceptable
// - Heap delta : on tolère jusqu'à 100 MB d'augmentation (généreux pour Node + V8 GC)

import { describe, expect, it } from "vitest";
import { aggregateEntriesToParsedFinancialData } from "@/services/integrations/aggregations/pcgAggregator";
import { aggregateTrialBalanceToParsedFinancialData } from "@/services/integrations/aggregations/trialBalanceAggregator";
import { buildGranularInsights } from "@/services/integrations/aggregations/granularInsightsBuilder";
import { buildKpisTimeSeries } from "@/services/integrations/aggregations/kpisTimeSeriesBuilder";
import { buildVatInsights } from "@/services/integrations/aggregations/vatInsightsBuilder";
import type {
  AccountingEntry,
  Contact,
  Invoice,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const N_ENTRIES = 5000;
const N_ACCOUNTS = 1296;
const N_INVOICES = 1500;
const N_CONTACTS = 200;

function memMB(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
}

function generateEntries(n: number): AccountingEntry[] {
  const entries: AccountingEntry[] = [];
  for (let i = 0; i < n; i++) {
    const month = 1 + (i % 24);
    const year = month <= 12 ? 2025 : 2026;
    const realMonth = ((month - 1) % 12) + 1;
    const day = 1 + (i % 28);
    const date = `${year}-${String(realMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const ht = 100 + (i * 7) % 5000;
    const tva = ht * 0.2;
    const isSale = i % 3 === 0;
    entries.push({
      id: `entry-${i}`,
      userId: "vol",
      connectionId: "vol",
      externalId: `ext-${i}`,
      source: "pennylane",
      providerSub: "pennylane_company",
      syncedAt: "2026-04-27T00:00:00.000Z",
      rawData: {},
      journalCode: isSale ? "VE" : "HA",
      date,
      label: `${isSale ? "Vente" : "Achat"} ${i}`,
      reference: null,
      status: "posted",
      totalDebit: ht + tva,
      totalCredit: ht + tva,
      currency: "EUR",
      lines: isSale
        ? [
            mkLine("411001", ht + tva, 0),
            mkLine("701100", 0, ht),
            mkLine("445710", 0, tva),
          ]
        : [
            mkLine("601100", ht, 0),
            mkLine("445660", tva, 0),
            mkLine("401001", 0, ht + tva),
          ],
    });
  }
  return entries;
}

function mkLine(accountNumber: string, debit: number, credit: number) {
  return {
    externalId: null,
    accountNumber,
    accountLabel: null,
    debit,
    credit,
    currency: "EUR",
    vatRate: 20,
    description: null,
    analyticalCodes: [],
    contactExternalId: null,
  };
}

function generateInvoicesAndContacts(
  nInvoices: number,
  nContacts: number
): { invoices: Invoice[]; contacts: Contact[] } {
  const sectors = ["industrie", "services", "commerce", "tech", "santé", null];
  const contacts: Contact[] = [];
  for (let i = 0; i < nContacts; i++) {
    contacts.push({
      id: `contact-${i}`,
      userId: "vol",
      connectionId: "vol",
      externalId: `ext-c-${i}`,
      source: "pennylane",
      providerSub: "pennylane_company",
      syncedAt: "2026-04-27T00:00:00.000Z",
      rawData: {},
      type: i % 4 === 0 ? "supplier" : "customer",
      name: `Contact ${i}`,
      legalName: null,
      siret: i % 5 === 0 ? `${10000000000000 + i}` : null,
      vatNumber: null,
      email: null,
      sector: sectors[i % sectors.length] ?? null,
      countryCode: "FR",
      createdAtExternal: null,
    });
  }
  const invoices: Invoice[] = [];
  for (let i = 0; i < nInvoices; i++) {
    const month = 1 + (i % 24);
    const year = month <= 12 ? 2025 : 2026;
    const realMonth = ((month - 1) % 12) + 1;
    const day = 1 + (i % 28);
    const date = `${year}-${String(realMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const ht = 200 + (i * 11) % 8000;
    const tva = ht * 0.2;
    const c = contacts[i % nContacts]!;
    invoices.push({
      id: `inv-${i}`,
      userId: "vol",
      connectionId: "vol",
      externalId: `ext-inv-${i}`,
      source: "pennylane",
      providerSub: "pennylane_company",
      syncedAt: "2026-04-27T00:00:00.000Z",
      rawData: {},
      type: c.type,
      number: `F${i}`,
      date,
      dueDate: date,
      paidDate: i % 3 === 0 ? date : null,
      totalExclVat: ht,
      totalInclVat: ht + tva,
      totalVat: tva,
      currency: "EUR",
      status: i % 3 === 0 ? "paid" : i % 5 === 0 ? "overdue" : "finalized",
      contactExternalId: c.externalId,
      contactName: c.name,
      lines: [],
    });
  }
  return { invoices, contacts };
}

function generateTrialBalance(n: number): NormalizedTrialBalanceEntry[] {
  const tb: NormalizedTrialBalanceEntry[] = [];
  for (let i = 0; i < n; i++) {
    const numClass = (i % 8) + 1;
    const number = `${numClass}${String(10000 + i).padStart(5, "0")}`.slice(0, 6);
    tb.push({
      accountNumber: number,
      accountLabel: `Compte ${number}`,
      formattedNumber: null,
      debit: i % 2 === 0 ? (i * 137) % 50000 : 0,
      credit: i % 2 === 1 ? (i * 137) % 50000 : 0,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
  }
  return tb;
}

describe("volume test", () => {
  const heapStart = memMB();
  const entries = generateEntries(N_ENTRIES);
  const { invoices, contacts } = generateInvoicesAndContacts(N_INVOICES, N_CONTACTS);
  const trialBalance = generateTrialBalance(N_ACCOUNTS);
  console.log(`\n[volume] heap après génération: ${memMB()} MB (start: ${heapStart} MB)`);

  it(`pcgAggregator: ${N_ENTRIES} entries en moins de 200ms`, () => {
    const t0 = Date.now();
    aggregateEntriesToParsedFinancialData(entries, {
      periodStart: new Date("2025-01-01"),
      periodEnd: new Date("2026-12-31"),
    });
    const dur = Date.now() - t0;
    console.log(`[volume] pcgAggregator: ${dur}ms`);
    expect(dur).toBeLessThan(200);
  });

  it(`trialBalanceAggregator: ${N_ACCOUNTS} accounts en moins de 50ms`, () => {
    const t0 = Date.now();
    aggregateTrialBalanceToParsedFinancialData(trialBalance);
    const dur = Date.now() - t0;
    console.log(`[volume] trialBalanceAggregator: ${dur}ms`);
    expect(dur).toBeLessThan(50);
  });

  it(`granularInsightsBuilder: ${N_INVOICES} invoices en moins de 200ms`, () => {
    const t0 = Date.now();
    buildGranularInsights({
      invoices,
      contacts,
      options: {
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2026-12-31"),
        asOf: new Date("2026-04-30"),
      },
    });
    const dur = Date.now() - t0;
    console.log(`[volume] granularInsightsBuilder: ${dur}ms`);
    expect(dur).toBeLessThan(200);
  });

  it(`kpisTimeSeriesBuilder: 24 mois × ${N_ENTRIES} entries en moins de 5s`, () => {
    const t0 = Date.now();
    const series = buildKpisTimeSeries({
      entries,
      options: {
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2026-12-31"),
      },
    });
    const dur = Date.now() - t0;
    console.log(`[volume] kpisTimeSeriesBuilder: ${dur}ms (${series.length} mois)`);
    expect(series).toHaveLength(24);
    expect(dur).toBeLessThan(5000);
  });

  it(`vatInsightsBuilder: ${N_ENTRIES} entries en moins de 100ms`, () => {
    const t0 = Date.now();
    buildVatInsights({
      entries,
      options: {
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2026-12-31"),
      },
    });
    const dur = Date.now() - t0;
    console.log(`[volume] vatInsightsBuilder: ${dur}ms`);
    expect(dur).toBeLessThan(100);
  });

  it("heap delta < 100 MB sur l'ensemble du test", () => {
    const delta = memMB() - heapStart;
    console.log(`[volume] heap final: ${memMB()} MB (delta ${delta.toFixed(1)} MB)`);
    expect(Math.abs(delta)).toBeLessThan(100);
  });
});
