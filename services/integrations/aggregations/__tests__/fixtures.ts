// Fixtures réalistes pour les tests des aggregators et builders.
// Couvre des cas tordus du quotidien comptable.

import type {
  AccountingEntry,
  AccountingEntryLine,
  Contact,
  Invoice,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const TEST_USER = "test-user";
const TEST_CONN = "test-connection";

let nextId = 1;
const id = (prefix: string) => `${prefix}-${nextId++}`;

function entry(
  date: string,
  journalCode: string,
  label: string,
  lines: Array<Omit<AccountingEntryLine, "currency" | "vatRate" | "description" | "analyticalCodes" | "contactExternalId" | "externalId" | "accountLabel">>
): AccountingEntry {
  const fullLines: AccountingEntryLine[] = lines.map((l) => ({
    externalId: null,
    accountLabel: null,
    currency: "EUR",
    vatRate: null,
    description: null,
    analyticalCodes: [],
    contactExternalId: null,
    ...l,
  }));
  const totalDebit = fullLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = fullLines.reduce((s, l) => s + l.credit, 0);
  return {
    id: id("entry"),
    userId: TEST_USER,
    connectionId: TEST_CONN,
    externalId: id("ext-entry"),
    source: "pennylane",
    providerSub: "pennylane_company",
    syncedAt: new Date().toISOString(),
    rawData: {},
    journalCode,
    date,
    label,
    reference: null,
    status: "posted",
    totalDebit,
    totalCredit,
    currency: "EUR",
    lines: fullLines,
  };
}

function invoice(args: {
  type: "customer" | "supplier";
  contactId: string;
  contactName: string;
  date: string;
  dueDate?: string | null;
  paidDate?: string | null;
  totalExclVat: number;
  totalVat?: number;
  status?: Invoice["status"];
  number?: string;
}): Invoice {
  const totalVat = args.totalVat ?? args.totalExclVat * 0.2;
  return {
    id: id("invoice"),
    userId: TEST_USER,
    connectionId: TEST_CONN,
    externalId: id("ext-inv"),
    source: "pennylane",
    providerSub: "pennylane_company",
    syncedAt: new Date().toISOString(),
    rawData: {},
    type: args.type,
    number: args.number ?? id("F"),
    date: args.date,
    dueDate: args.dueDate ?? null,
    paidDate: args.paidDate ?? null,
    totalExclVat: args.totalExclVat,
    totalInclVat: args.totalExclVat + totalVat,
    totalVat,
    currency: "EUR",
    status: args.status ?? "finalized",
    contactExternalId: args.contactId,
    contactName: args.contactName,
    lines: [],
  };
}

function contact(externalId: string, name: string, type: "customer" | "supplier", sector: string | null = null): Contact {
  return {
    id: id("contact"),
    userId: TEST_USER,
    connectionId: TEST_CONN,
    externalId,
    source: "pennylane",
    providerSub: "pennylane_company",
    syncedAt: new Date().toISOString(),
    rawData: {},
    type,
    name,
    legalName: null,
    siret: null,
    vatNumber: null,
    email: null,
    sector,
    countryCode: "FR",
    createdAtExternal: null,
  };
}

// ─── Fixture 1 : compta réaliste sur 2 exercices, 500+ écritures ──────────────
// - 2025 : exercice complet (12 mois)
// - 2026 : 4 mois
// - Journal AN (à-nouveau) en début de 2025 puis 2026
// - Journal VE (ventes) ~30 par mois
// - Journal HA (achats) ~20 par mois
// - Comptes numérotés à 6 chiffres (601100, 411001, etc.) au lieu des préfixes courts
export function fixtureLargeMultiYear(): {
  entries: AccountingEntry[];
  contacts: Contact[];
  invoices: Invoice[];
} {
  nextId = 1; // reset pour stabilité du snapshot
  const entries: AccountingEntry[] = [];

  // À-nouveau 2025 : capital initial + emprunt + trésorerie d'ouverture
  entries.push(
    entry("2025-01-01", "AN", "À-nouveaux 2025", [
      { accountNumber: "101000", debit: 0, credit: 50000 }, // capital
      { accountNumber: "164000", debit: 0, credit: 30000 }, // emprunt
      { accountNumber: "512100", debit: 75000, credit: 0 }, // banque
      { accountNumber: "211000", debit: 5000, credit: 0 }, // immo corporelles
    ])
  );

  // 12 mois × 30 ventes + 20 achats = 600 entries
  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    for (let i = 0; i < 30; i++) {
      const day = String(Math.min(28, 1 + (i % 27))).padStart(2, "0");
      const ht = 100 + (i * 13) % 800;
      const tva = ht * 0.2;
      entries.push(
        entry(`2025-${mm}-${day}`, "VE", `Vente ${mm}/${i}`, [
          { accountNumber: "411001", debit: ht + tva, credit: 0 },
          { accountNumber: "701100", debit: 0, credit: ht },
          { accountNumber: "445710", debit: 0, credit: tva },
        ])
      );
    }
    for (let i = 0; i < 20; i++) {
      const day = String(Math.min(28, 1 + (i % 27))).padStart(2, "0");
      const ht = 50 + (i * 7) % 400;
      const tva = ht * 0.2;
      entries.push(
        entry(`2025-${mm}-${day}`, "HA", `Achat ${mm}/${i}`, [
          { accountNumber: "601100", debit: ht, credit: 0 },
          { accountNumber: "445660", debit: tva, credit: 0 },
          { accountNumber: "401001", debit: 0, credit: ht + tva },
        ])
      );
    }
  }

  // À-nouveau 2026
  entries.push(
    entry("2026-01-01", "AN", "À-nouveaux 2026", [
      { accountNumber: "101000", debit: 0, credit: 50000 },
      { accountNumber: "120000", debit: 0, credit: 12000 }, // résultat 2025 reporté
      { accountNumber: "164000", debit: 0, credit: 25000 }, // emprunt restant
      { accountNumber: "512100", debit: 87000, credit: 0 },
    ])
  );

  // 4 mois × 30 + 20 = 200 entries pour 2026
  for (let month = 1; month <= 4; month++) {
    const mm = String(month).padStart(2, "0");
    for (let i = 0; i < 30; i++) {
      const day = String(Math.min(28, 1 + (i % 27))).padStart(2, "0");
      const ht = 150 + (i * 11) % 700;
      const tva = ht * 0.2;
      entries.push(
        entry(`2026-${mm}-${day}`, "VE", `Vente 2026 ${mm}/${i}`, [
          { accountNumber: "411001", debit: ht + tva, credit: 0 },
          { accountNumber: "701100", debit: 0, credit: ht },
          { accountNumber: "445710", debit: 0, credit: tva },
        ])
      );
    }
    for (let i = 0; i < 20; i++) {
      const day = String(Math.min(28, 1 + (i % 27))).padStart(2, "0");
      const ht = 80 + (i * 5) % 350;
      const tva = ht * 0.2;
      entries.push(
        entry(`2026-${mm}-${day}`, "HA", `Achat 2026 ${mm}/${i}`, [
          { accountNumber: "601100", debit: ht, credit: 0 },
          { accountNumber: "445660", debit: tva, credit: 0 },
          { accountNumber: "401001", debit: 0, credit: ht + tva },
        ])
      );
    }
  }

  return { entries, contacts: [], invoices: [] };
}

// ─── Fixture 2 : avoirs (factures négatives) ──────────────────────────────────
export function fixtureRefunds(): { entries: AccountingEntry[]; invoices: Invoice[] } {
  nextId = 5000;
  return {
    entries: [
      // Vente normale puis avoir partiel
      entry("2026-03-01", "VE", "Vente Acme", [
        { accountNumber: "411", debit: 1200, credit: 0 },
        { accountNumber: "707", debit: 0, credit: 1000 },
        { accountNumber: "44571", debit: 0, credit: 200 },
      ]),
      entry("2026-03-15", "VE", "Avoir Acme (partiel)", [
        { accountNumber: "411", debit: 0, credit: 360 },
        { accountNumber: "707", debit: 300, credit: 0 },
        { accountNumber: "44571", debit: 60, credit: 0 },
      ]),
    ],
    invoices: [
      invoice({
        type: "customer",
        contactId: "ext-cust-1",
        contactName: "Acme",
        date: "2026-03-01",
        totalExclVat: 1000,
        status: "finalized",
      }),
      invoice({
        type: "customer",
        contactId: "ext-cust-1",
        contactName: "Acme",
        date: "2026-03-15",
        totalExclVat: -300, // avoir
        status: "finalized",
      }),
    ],
  };
}

// ─── Fixture 3 : multi-devises ────────────────────────────────────────────────
// On stocke toujours en EUR — le test vérifie qu'une ligne USD
// (currency != EUR) n'est pas re-convertie côté aggregator (montant en EUR déjà fourni).
export function fixtureMultiCurrency(): { entries: AccountingEntry[] } {
  nextId = 6000;
  const eur: AccountingEntry = entry("2026-02-10", "VE", "Vente France EUR", [
    { accountNumber: "411", debit: 1200, credit: 0 },
    { accountNumber: "707", debit: 0, credit: 1000 },
    { accountNumber: "44571", debit: 0, credit: 200 },
  ]);
  // Ligne libellée USD avec montants déjà convertis en EUR.
  const mixed = entry("2026-02-15", "VE", "Vente USA (USD converti)", [
    { accountNumber: "411", debit: 850, credit: 0 },
    { accountNumber: "707", debit: 0, credit: 850 },
  ]);
  mixed.lines[0]!.currency = "USD";
  mixed.lines[1]!.currency = "USD";
  return { entries: [eur, mixed] };
}

// ─── Fixture 4 : factures partiellement payées + sans date ────────────────────
export function fixturePartialPayments(): { invoices: Invoice[]; contacts: Contact[] } {
  nextId = 7000;
  return {
    contacts: [
      contact("c1", "Client A", "customer", "industrie"),
      contact("c2", "Client B", "customer", null),
      contact("c3", "Client C", "customer", "services"),
    ],
    invoices: [
      invoice({
        type: "customer",
        contactId: "c1",
        contactName: "Client A",
        date: "2026-01-15",
        dueDate: "2026-02-14",
        paidDate: "2026-02-10",
        totalExclVat: 5000,
        status: "paid",
      }),
      invoice({
        type: "customer",
        contactId: "c2",
        contactName: "Client B",
        date: "2026-02-10",
        dueDate: "2026-03-12",
        paidDate: "2026-03-20",
        totalExclVat: 3000,
        status: "partially_paid", // 30% payé
      }),
      invoice({
        type: "customer",
        contactId: "c3",
        contactName: "Client C",
        date: "2026-03-05",
        dueDate: "2026-04-04",
        totalExclVat: 8000,
        status: "overdue",
      }),
      // Donnée pourrie : pas de date → doit être skippée
      invoice({
        type: "customer",
        contactId: "c1",
        contactName: "Client A",
        date: "",
        totalExclVat: 999,
        status: "draft",
      }),
    ],
  };
}

// ─── Fixture 5 : lignes sans taux de TVA + comptes hors PCG ──────────────────
export function fixtureEdgeCases(): { entries: AccountingEntry[]; trialBalance: NormalizedTrialBalanceEntry[] } {
  nextId = 8000;
  const e1 = entry("2026-04-01", "VE", "Vente sans TVA", [
    { accountNumber: "411", debit: 500, credit: 0 },
    { accountNumber: "707", debit: 0, credit: 500 },
  ]);
  e1.lines[0]!.vatRate = null;
  e1.lines[1]!.vatRate = null;

  // Compte exotique 999 (hors classe PCG standard)
  const e2 = entry("2026-04-02", "OD", "Écriture hors PCG", [
    { accountNumber: "999000", debit: 100, credit: 0 },
    { accountNumber: "411", debit: 0, credit: 100 },
  ]);

  // Donnée pourrie : ligne sans accountNumber
  const e3 = entry("2026-04-03", "OD", "Ligne pourrie", [
    { accountNumber: "", debit: 50, credit: 0 },
    { accountNumber: "411", debit: 0, credit: 50 },
  ]);

  // Donnée pourrie : montant NaN
  const e4 = entry("2026-04-04", "OD", "NaN amount", [
    { accountNumber: "411", debit: NaN, credit: 0 },
    { accountNumber: "707", debit: 0, credit: NaN },
  ]);

  return {
    entries: [e1, e2, e3, e4],
    trialBalance: [
      { accountNumber: "411", accountLabel: "Clients", formattedNumber: null, debit: 500, credit: 100, periodStart: "2026-01-01", periodEnd: "2026-12-31" },
      { accountNumber: "707", accountLabel: "Ventes", formattedNumber: null, debit: 0, credit: 500, periodStart: "2026-01-01", periodEnd: "2026-12-31" },
      // Donnée pourrie dans la trial balance
      { accountNumber: "", accountLabel: "Vide", formattedNumber: null, debit: 0, credit: 0, periodStart: "", periodEnd: "" },
      { accountNumber: "445710", accountLabel: "TVA", formattedNumber: null, debit: NaN, credit: 100, periodStart: "2026-01-01", periodEnd: "2026-12-31" },
    ],
  };
}
