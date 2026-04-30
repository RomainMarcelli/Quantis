// Conversion payloads Pennylane v2 → modèle interne unifié.
// Les noms de champs s'appuient sur la doc API Pennylane v2 :
// https://pennylane.readme.io/reference
//
// On reste défensif (undefined / null / champs manquants ne crashent pas).
// Le payload original est conservé tel quel dans `rawData` pour debug et migrations.

import type {
  AccountingEntry,
  AccountingEntryLine,
  AccountingEntryStatus,
  Contact,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Journal,
  LedgerAccount,
  LedgerAccountType,
} from "@/types/connectors";

const PROVIDER = "pennylane" as const;
const PROVIDER_SUB = "pennylane_company" as const;

// ─── Utilitaires ────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Pennylane stocke les montants en centimes pour certains endpoints (cents) et en EUR pour d'autres.
// On accepte les deux : si le champ s'appelle "_cents", on divise par 100.
function moneyFromCentsOrEuros(centsField: unknown, eurosField: unknown): number {
  if (centsField !== undefined && centsField !== null) {
    return toNumber(centsField) / 100;
  }
  return toNumber(eurosField);
}

function toIsoDate(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value.length === 10 ? `${value}T00:00:00.000Z` : value;
  }
  return new Date().toISOString();
}

// Renvoie une date ISO si la valeur est parsable, null sinon. Permet aux aggregators
// de skipper proprement les entités sans date plutôt que de leur attribuer "now".
function toNullableIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Map des types natifs Pennylane vers notre enum normalisé.
// Compléter au fil des découvertes via le smoke test.
const PENNYLANE_ACCOUNT_TYPE_MAP: Record<string, LedgerAccountType> = {
  customer: "asset",
  supplier: "liability",
  tax: "liability",
  social: "liability",
  bank: "asset",
  cash: "asset",
  // "general" est ambigu : on retombe sur la classification par préfixe ci-dessous.
};

function classifyLedgerAccountType(number: string, providerType?: string): LedgerAccountType {
  // 1. Type natif provider en priorité.
  if (providerType && PENNYLANE_ACCOUNT_TYPE_MAP[providerType]) {
    return PENNYLANE_ACCOUNT_TYPE_MAP[providerType]!;
  }
  // 2. Fallback : préfixes PCG (plus longs prioritaires pour la classe 4).
  if (number.startsWith("401") || number.startsWith("403") || number.startsWith("404"))
    return "liability";
  if (number.startsWith("411") || number.startsWith("413") || number.startsWith("416"))
    return "asset";
  if (number.startsWith("42") || number.startsWith("43") || number.startsWith("44"))
    return "liability";
  if (number.startsWith("455")) return "liability";
  if (number.startsWith("486")) return "asset";
  if (number.startsWith("487")) return "liability";
  const prefix = number.charAt(0);
  switch (prefix) {
    case "1":
      return "equity";
    case "2":
    case "3":
    case "5":
      return "asset";
    case "6":
      return "expense";
    case "7":
      return "revenue";
    default:
      return "unknown";
  }
}

function classifyJournalType(
  code: string,
  label: string | null,
  providerType?: string
): string {
  // Type natif du provider en priorité (Pennylane fournit "sales", "loans", "general"…).
  if (providerType?.trim()) return providerType;
  // Fallback heuristique sur code + label.
  const c = (code + " " + (label ?? "")).toLowerCase();
  if (c.includes("vente") || c.includes("sale")) return "sales";
  if (c.includes("achat") || c.includes("purchase")) return "purchases";
  if (c.includes("banque") || c.includes("bank")) return "bank";
  if (c.includes("caisse") || c.includes("cash")) return "cash";
  if (c.includes("emprunt") || c.includes("loan")) return "loans";
  if (c.includes("ouverture") || c.includes("opening") || c.includes("an ")) return "opening";
  if (c.includes("od") || c.includes("divers") || c.includes("misc")) return "miscellaneous";
  return "unknown";
}

function classifyInvoiceStatus(raw: unknown): InvoiceStatus {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.includes("paid") && value.includes("partial")) return "partially_paid";
  if (value.includes("paid")) return "paid";
  if (value.includes("overdue")) return "overdue";
  if (value.includes("sent")) return "sent";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("draft")) return "draft";
  if (value.includes("final")) return "finalized";
  return "unknown";
}

function classifyEntryStatus(raw: unknown): AccountingEntryStatus {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.includes("post")) return "posted";
  if (value.includes("draft")) return "draft";
  if (value.includes("cancel")) return "cancelled";
  return "unknown";
}

// ─── Types Pennylane (forme attendue, défensifs) ────────────────────────────
// On définit ce qu'on lit ; le reste passe via rawData.

export type PennylaneJournal = {
  id: string | number;
  code?: string;
  label?: string;
  name?: string;
  type?: string; // valeur native Pennylane : "sales", "loans", "general"…
};

export type PennylaneLedgerAccount = {
  id: string | number;
  number: string;
  label?: string;
  name?: string;
  // type natif Pennylane : "supplier" | "customer" | "tax" | "general" | …
  // Plus fiable que ma classification par préfixe, on l'utilise en priorité.
  type?: string;
  vat_rate?: string;
  country_alpha2?: string;
  enabled?: boolean;
};

export type PennylaneCustomer = {
  id: string | number;
  name?: string;
  legal_name?: string;
  reg_no?: string; // SIRET (nouveau format API 2026)
  registration_number?: string; // ancien nom — fallback
  establishment_no?: string; // numéro d'établissement (extension SIRET)
  vat_number?: string;
  emails?: string[]; // tableau d'emails (Pennylane v2)
  email?: string; // ancien format — fallback
  country_alpha2?: string;
  business_sector?: string;
  created_at?: string;
};

export type PennylaneSupplier = PennylaneCustomer;

export type PennylaneInvoiceLine = {
  id?: string | number;
  product_id?: string | number;
  label?: string;
  description?: string;
  quantity?: number | string;
  unit_price?: number | string;
  unit_price_cents?: number | string;
  amount?: number | string;
  amount_cents?: number | string;
  amount_excl_tax?: number | string;
  amount_excl_tax_cents?: number | string;
  amount_incl_tax?: number | string;
  amount_incl_tax_cents?: number | string;
  vat_rate?: number | string;
};

export type PennylaneCustomerInvoice = {
  id: string | number;
  invoice_number?: string;
  number?: string;
  label?: string;
  date?: string;
  deadline?: string;
  paid_at?: string;
  paid?: boolean;
  // Pennylane v2 réelle : `customer` est un objet imbriqué (pas customer_id).
  customer?: { id?: string | number; name?: string; url?: string };
  customer_id?: string | number; // fallback ancien format
  status?: string;
  currency?: string;
  // Champs réels Pennylane v2 (strings).
  amount?: string | number;
  currency_amount?: string | number;
  currency_amount_before_tax?: string | number;
  tax?: string | number;
  currency_tax?: string | number;
  // Anciens noms gardés en fallback.
  amount_cents?: number | string;
  amount_excl_tax?: number | string;
  amount_excl_tax_cents?: number | string;
  amount_incl_tax?: number | string;
  amount_incl_tax_cents?: number | string;
  tax_amount?: number | string;
  tax_amount_cents?: number | string;
  // Lignes : Pennylane v2 ne les expose pas dans /customer_invoices.
  line_items?: PennylaneInvoiceLine[];
  invoice_lines?: PennylaneInvoiceLine[];
};

export type PennylaneSupplierInvoice = PennylaneCustomerInvoice & {
  supplier_id?: string | number;
  supplier?: { id?: string | number; name?: string };
};

// Pennylane v2 réelle (vue détail) : ledger_account est un objet imbriqué.
export type PennylaneLedgerEntryLine = {
  id?: string | number;
  // Format réel v2 : ledger_account: { id, number, url }
  ledger_account?: { id?: string | number; number?: string; label?: string; url?: string };
  // Anciens noms fallback.
  ledger_account_id?: string | number;
  ledger_account_number?: string;
  ledger_account_label?: string;
  debit?: number | string;
  debit_cents?: number | string;
  credit?: number | string;
  credit_cents?: number | string;
  label?: string;
  description?: string;
  vat_rate?: number | string;
  customer_id?: string | number;
  supplier_id?: string | number;
  analytical_codes?: string[];
};

export type PennylaneLedgerEntry = {
  id: string | number;
  // Format réel v2 : journal: { id, url } (pas de code dans la vue détail).
  journal?: { id?: string | number; url?: string; code?: string };
  journal_id?: string | number;
  journal_code?: string;
  date: string;
  due_date?: string | null;
  label?: string;
  reference?: string;
  piece_number?: string;
  invoice_number?: string;
  status?: string;
  currency?: string;
  // Format réel v2 : ledger_entry_lines[] (vue détail uniquement).
  ledger_entry_lines?: PennylaneLedgerEntryLine[];
  lines?: PennylaneLedgerEntryLine[];
  raw_lines?: PennylaneLedgerEntryLine[];
};

// ─── Mappers ────────────────────────────────────────────────────────────────

export function mapJournal(
  raw: PennylaneJournal,
  ctx: { userId: string; connectionId: string }
): Journal {
  const code = raw.code ?? String(raw.id);
  const label = raw.label ?? raw.name ?? code;
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    code,
    label,
    type: classifyJournalType(code, label, raw.type),
  };
}

export function mapLedgerAccount(
  raw: PennylaneLedgerAccount,
  ctx: { userId: string; connectionId: string }
): LedgerAccount {
  const number = String(raw.number);
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    number,
    label: raw.label ?? raw.name ?? number,
    type: classifyLedgerAccountType(number, raw.type),
  };
}

export function mapContact(
  raw: PennylaneCustomer,
  type: "customer" | "supplier",
  ctx: { userId: string; connectionId: string }
): Contact {
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    type,
    // Fallback "Inconnu" si tout est vide — évite d'avoir des cards vides côté front.
    name:
      raw.name?.trim() ||
      raw.legal_name?.trim() ||
      (raw.id !== undefined ? `Contact ${raw.id}` : "Inconnu"),
    legalName: toNullableString(raw.legal_name),
    siret: toNullableString(raw.reg_no ?? raw.registration_number),
    vatNumber: toNullableString(raw.vat_number),
    email: toNullableString(raw.emails?.[0] ?? raw.email),
    sector: toNullableString(raw.business_sector),
    countryCode: toNullableString(raw.country_alpha2),
    createdAtExternal: toNullableString(raw.created_at),
  };
}

function mapInvoiceLine(raw: PennylaneInvoiceLine): InvoiceLine {
  const amountExclVat = moneyFromCentsOrEuros(
    raw.amount_excl_tax_cents,
    raw.amount_excl_tax ?? raw.amount
  );
  const amountInclVat = moneyFromCentsOrEuros(
    raw.amount_incl_tax_cents,
    raw.amount_incl_tax ?? raw.amount_cents !== undefined ? raw.amount_cents : raw.amount
  );
  return {
    externalId: raw.id !== undefined ? String(raw.id) : null,
    productExternalId: raw.product_id !== undefined ? String(raw.product_id) : null,
    label: raw.label ?? raw.description ?? "Ligne",
    quantity: toNumber(raw.quantity, 1),
    unitPriceExclVat: moneyFromCentsOrEuros(raw.unit_price_cents, raw.unit_price),
    amountExclVat,
    amountInclVat,
    vatRate: raw.vat_rate !== undefined ? toNumber(raw.vat_rate, 0) : null,
  };
}

export function mapCustomerInvoice(
  raw: PennylaneCustomerInvoice,
  ctx: { userId: string; connectionId: string }
): Invoice {
  // Lignes : Pennylane v2 ne les expose pas dans la vue liste/détail des invoices.
  // Resteront vides en l'absence d'un endpoint dédié (TODO : explorer /commercial_documents
  // ou /customer_invoices/{id}/items si dispo).
  // Défensif : si line_items existe mais n'est pas un array (parfois un objet ou null), ignore.
  const rawLines = raw.line_items ?? raw.invoice_lines;
  const lines = Array.isArray(rawLines) ? rawLines.map(mapInvoiceLine) : [];

  // Champs Pennylane v2 actuels — fallback sur les anciens noms si jamais le format change.
  const totalExclVat =
    toNumber(raw.currency_amount_before_tax) ||
    moneyFromCentsOrEuros(raw.amount_excl_tax_cents, raw.amount_excl_tax);
  const totalInclVat =
    toNumber(raw.currency_amount ?? raw.amount) ||
    moneyFromCentsOrEuros(raw.amount_incl_tax_cents, raw.amount_incl_tax);
  const totalVat =
    toNumber(raw.currency_tax ?? raw.tax) ||
    moneyFromCentsOrEuros(raw.tax_amount_cents, raw.tax_amount);

  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    type: "customer",
    number: raw.invoice_number || raw.number || String(raw.id),
    date: toIsoDate(raw.date),
    dueDate: raw.deadline ? toIsoDate(raw.deadline) : null,
    paidDate: raw.paid_at ? toIsoDate(raw.paid_at) : raw.paid ? toIsoDate(raw.date) : null,
    totalExclVat,
    totalInclVat: totalInclVat || totalExclVat + totalVat,
    totalVat,
    currency: raw.currency ?? "EUR",
    status: classifyInvoiceStatus(raw.status),
    contactExternalId: String(raw.customer?.id ?? raw.customer_id ?? ""),
    contactName: raw.customer?.name ?? raw.label ?? "",
    lines,
  };
}

export function mapSupplierInvoice(
  raw: PennylaneSupplierInvoice,
  ctx: { userId: string; connectionId: string }
): Invoice {
  const customerInvoice = mapCustomerInvoice(raw, ctx);
  return {
    ...customerInvoice,
    type: "supplier",
    contactExternalId: String(raw.supplier_id ?? raw.supplier?.id ?? customerInvoice.contactExternalId),
    contactName: raw.supplier?.name ?? customerInvoice.contactName,
  };
}

function mapLedgerLine(raw: PennylaneLedgerEntryLine): AccountingEntryLine {
  return {
    externalId: raw.id !== undefined ? String(raw.id) : null,
    accountNumber:
      raw.ledger_account?.number ??
      raw.ledger_account_number ??
      String(raw.ledger_account?.id ?? raw.ledger_account_id ?? ""),
    accountLabel: toNullableString(raw.ledger_account?.label ?? raw.ledger_account_label),
    debit: toNumber(raw.debit) || moneyFromCentsOrEuros(raw.debit_cents, undefined),
    credit: toNumber(raw.credit) || moneyFromCentsOrEuros(raw.credit_cents, undefined),
    currency: "EUR",
    vatRate: raw.vat_rate !== undefined ? toNumber(raw.vat_rate, 0) : null,
    description: toNullableString(raw.label ?? raw.description),
    analyticalCodes: Array.isArray(raw.analytical_codes) ? raw.analytical_codes : [],
    contactExternalId:
      raw.customer_id !== undefined
        ? String(raw.customer_id)
        : raw.supplier_id !== undefined
          ? String(raw.supplier_id)
          : null,
  };
}

export function mapLedgerEntry(
  raw: PennylaneLedgerEntry,
  ctx: { userId: string; connectionId: string }
): AccountingEntry {
  const rawLines = raw.ledger_entry_lines ?? raw.lines ?? raw.raw_lines;
  const lines = Array.isArray(rawLines) ? rawLines.map(mapLedgerLine) : [];
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    // Pennylane v2 ne renvoie que journal.id ; le code sera résolu via les journals stockés
    // localement lors de l'agrégation. En attendant on préserve l'id pour traçabilité.
    journalCode: raw.journal_code ?? raw.journal?.code ?? String(raw.journal?.id ?? raw.journal_id ?? ""),
    date: toIsoDate(raw.date),
    label: raw.label ?? "",
    reference: toNullableString(raw.reference ?? raw.piece_number ?? raw.invoice_number),
    status: classifyEntryStatus(raw.status),
    totalDebit,
    totalCredit,
    currency: raw.currency ?? "EUR",
    lines,
  };
}
