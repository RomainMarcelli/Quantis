// Mappers Odoo (modèles ORM) → modèle interne unifié.
//
// Particularités Odoo :
//  - Les champs Many2one sont retournés sous forme de TUPLE [id, "display_name"]
//    OU `false` si non renseigné. Helper `unpackMany2one` pour normaliser.
//  - Les codes de compte Odoo (`account.account.code`) sont des strings courts
//    (ex. "601000", "411100", "44566"). Pas de format 10-chars comme MyUnisoft.
//    → `accountPrefix(code)` = slice(0,3) ou prefix 4 chars TVA → fonctionne tel quel.
//  - account.move.state : "draft" | "posted" | "cancel". On ne sync que les "posted"
//    par défaut (filtrable côté fetcher).

import type {
  AccountingEntry,
  AccountingEntryLine,
  AccountingEntryStatus,
  Contact,
  Journal,
  LedgerAccount,
  LedgerAccountType,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const PROVIDER = "odoo" as const;
const PROVIDER_SUB = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Odoo Many2one : `[id, "display_name"]` ou `false` si non lié.
 * Renvoie `[id, name] | null` normalisé.
 */
export function unpackMany2one(
  value: unknown
): { id: number; name: string } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const id = typeof value[0] === "number" ? value[0] : Number(value[0]);
    const name = typeof value[1] === "string" ? value[1] : String(value[1] ?? "");
    if (Number.isFinite(id)) return { id, name };
  }
  return null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toIsoDate(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value.length === 10 ? `${value}T00:00:00.000Z` : value;
  }
  return new Date().toISOString();
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Classification Odoo → notre LedgerAccountType.
// Odoo expose `account_type` qui est une enum riche : "asset_receivable",
// "liability_payable", "income", "expense", "equity", "asset_cash", etc.
// On utilise ça en priorité, fallback sur le préfixe PCG.
const ODOO_ACCOUNT_TYPE_MAP: Record<string, LedgerAccountType> = {
  asset_receivable: "asset",
  asset_cash: "asset",
  asset_current: "asset",
  asset_non_current: "asset",
  asset_prepayments: "asset",
  asset_fixed: "asset",
  liability_payable: "liability",
  liability_current: "liability",
  liability_non_current: "liability",
  liability_credit_card: "liability",
  equity: "equity",
  equity_unaffected: "equity",
  income: "revenue",
  income_other: "revenue",
  expense: "expense",
  expense_depreciation: "expense",
  expense_direct_cost: "expense",
};

function classifyLedgerAccountType(
  accountType: string | null,
  number: string
): LedgerAccountType {
  if (accountType && ODOO_ACCOUNT_TYPE_MAP[accountType]) {
    return ODOO_ACCOUNT_TYPE_MAP[accountType]!;
  }
  // Fallback PCG (cohérent avec mappers Pennylane/MyUnisoft)
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

// Status Odoo → notre AccountingEntryStatus.
function classifyEntryStatus(state: string | null | undefined): AccountingEntryStatus {
  switch (state) {
    case "posted":
      return "posted";
    case "draft":
      return "draft";
    case "cancel":
      return "cancelled";
    default:
      return "unknown";
  }
}

// ─── Types attendus côté Odoo ──────────────────────────────────────────────

export type OdooMany2one = [number, string] | false;

export type OdooJournal = {
  id: number;
  name: string;
  code: string;
  type: string; // "sale" | "purchase" | "bank" | "cash" | "general" | "situation"
  active?: boolean;
};

export type OdooAccount = {
  id: number;
  code: string;
  name: string;
  account_type?: string; // ex: "asset_receivable", "income", "expense", …
  active?: boolean;
};

export type OdooPartner = {
  id: number;
  name: string;
  email?: string | false;
  vat?: string | false;
  is_company?: boolean;
  customer_rank?: number;
  supplier_rank?: number;
  country_id?: OdooMany2one;
  industry_id?: OdooMany2one;
  street?: string | false;
  city?: string | false;
  zip?: string | false;
  create_date?: string;
};

export type OdooMoveLine = {
  id: number;
  move_id: OdooMany2one; // [moveId, "INV/2026/001"]
  account_id: OdooMany2one; // [accountId, "601000 Achats"]
  partner_id?: OdooMany2one;
  name?: string | false;
  debit: number;
  credit: number;
  date?: string;
};

export type OdooMove = {
  id: number;
  name: string; // numéro pièce
  ref?: string | false;
  date: string;
  journal_id: OdooMany2one;
  state?: string;
  move_type?: string; // "entry" | "out_invoice" | "in_invoice" | …
  amount_total?: number;
  currency_id?: OdooMany2one;
  line_ids?: number[];
  partner_id?: OdooMany2one;
};

// Pour la trial balance reconstruite via read_group.
export type OdooMoveLineGroup = {
  account_id: OdooMany2one;
  "debit:sum"?: number;
  "credit:sum"?: number;
  // read_group renvoie aussi __domain et __count, qu'on ignore.
};

// ─── Mappers ───────────────────────────────────────────────────────────────

export function mapJournal(
  raw: OdooJournal,
  ctx: { userId: string; connectionId: string }
): Journal {
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    code: raw.code ?? String(raw.id),
    label: raw.name ?? raw.code ?? String(raw.id),
    type: raw.type ?? "unknown",
  };
}

export function mapLedgerAccount(
  raw: OdooAccount,
  ctx: { userId: string; connectionId: string }
): LedgerAccount {
  const number = String(raw.code ?? "");
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
    label: raw.name ?? number,
    type: classifyLedgerAccountType(raw.account_type ?? null, number),
  };
}

export function mapPartner(
  raw: OdooPartner,
  ctx: { userId: string; connectionId: string }
): Contact | null {
  // Odoo distingue les rôles via `customer_rank` et `supplier_rank` (>0 = acteur).
  const isCustomer = (raw.customer_rank ?? 0) > 0;
  const isSupplier = (raw.supplier_rank ?? 0) > 0;
  if (!isCustomer && !isSupplier) return null;

  // Si un partenaire est à la fois client ET fournisseur, on le classe customer
  // par défaut (ordre de priorité ; Odoo permet les deux mais c'est rare).
  const type: "customer" | "supplier" = isCustomer ? "customer" : "supplier";

  const country = unpackMany2one(raw.country_id);
  const industry = unpackMany2one(raw.industry_id);

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
    name: raw.name?.trim() || `Partenaire ${raw.id}`,
    legalName: raw.is_company ? raw.name?.trim() || null : null,
    siret: null, // Odoo n'expose pas le SIRET directement (parfois dans `vat`)
    vatNumber: typeof raw.vat === "string" && raw.vat ? raw.vat : null,
    email: typeof raw.email === "string" && raw.email ? raw.email : null,
    sector: industry?.name ?? null,
    countryCode: country?.name ? country.name.slice(0, 2).toUpperCase() : null,
    createdAtExternal: typeof raw.create_date === "string" ? raw.create_date : null,
  };
}

function mapMoveLine(
  raw: OdooMoveLine,
  accountByExternalId: Map<string, OdooAccount>
): AccountingEntryLine {
  const accountTuple = unpackMany2one(raw.account_id);
  const partnerTuple = unpackMany2one(raw.partner_id);

  // On a besoin du `code` du compte (notre `accountNumber` pour les builders) ;
  // l'API Odoo renvoie [id, "code name"] dans la Many2one. On essaie de récupérer
  // le code soit via la map de comptes pré-fetchés, soit en parsant le name.
  let accountNumber = "";
  let accountLabel: string | null = null;
  if (accountTuple) {
    const fromMap = accountByExternalId.get(String(accountTuple.id));
    if (fromMap) {
      accountNumber = fromMap.code;
      accountLabel = fromMap.name;
    } else {
      // Fallback : parser le display_name "601000 ACHATS MATIERES" → code = "601000"
      const match = accountTuple.name.match(/^(\S+)\s+(.+)$/);
      if (match) {
        accountNumber = match[1]!;
        accountLabel = match[2]!;
      } else {
        accountNumber = accountTuple.name.split(" ")[0] ?? "";
        accountLabel = accountTuple.name;
      }
    }
  }

  return {
    externalId: String(raw.id),
    accountNumber,
    accountLabel,
    debit: toNumber(raw.debit),
    credit: toNumber(raw.credit),
    currency: "EUR",
    vatRate: null,
    description: typeof raw.name === "string" ? toNullableString(raw.name) : null,
    analyticalCodes: [],
    contactExternalId: partnerTuple ? String(partnerTuple.id) : null,
  };
}

export function mapMove(
  raw: OdooMove,
  lines: OdooMoveLine[],
  accountByExternalId: Map<string, OdooAccount>,
  ctx: { userId: string; connectionId: string }
): AccountingEntry {
  const journalTuple = unpackMany2one(raw.journal_id);
  const mappedLines = lines.map((l) => mapMoveLine(l, accountByExternalId));
  const totalDebit = mappedLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = mappedLines.reduce((s, l) => s + l.credit, 0);

  const currency = unpackMany2one(raw.currency_id);

  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.id),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    journalCode: journalTuple?.name?.split(" ")[0] ?? String(journalTuple?.id ?? ""),
    date: toIsoDate(raw.date),
    label: raw.name ?? `Move ${raw.id}`,
    reference: typeof raw.ref === "string" ? toNullableString(raw.ref) : null,
    status: classifyEntryStatus(raw.state),
    totalDebit,
    totalCredit,
    currency: currency?.name ?? "EUR",
    lines: mappedLines,
  };
}

// ─── Trial balance via read_group ──────────────────────────────────────────

export function mapTrialBalance(
  groups: OdooMoveLineGroup[],
  accountByExternalId: Map<string, OdooAccount>,
  periodStart: Date,
  periodEnd: Date
): NormalizedTrialBalanceEntry[] {
  const entries: NormalizedTrialBalanceEntry[] = [];
  for (const g of groups) {
    const tuple = unpackMany2one(g.account_id);
    if (!tuple) continue;
    const account = accountByExternalId.get(String(tuple.id));
    if (!account) continue;
    entries.push({
      accountNumber: account.code,
      accountLabel: account.name,
      formattedNumber: null,
      debit: toNumber(g["debit:sum"]),
      credit: toNumber(g["credit:sum"]),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  }
  return entries;
}
