// Mappers : format MyUnisoft Accounting Data (MAD) → modèle interne unifié.
//
// Source : https://github.com/MyUnisoft/api-partenaires/tree/main/docs/MAD/specs/v1.0.0
//
// Particularités MAD :
//  - Numéros de compte sur 10 caractères (ex. "6010000000"). Les 3-4 premiers
//    caractères correspondent à la racine PCG → notre `accountPrefix()` reste compatible
//    (`"6010000000".slice(0,3) === "601"`, `"4456000000".startsWith("4456") === true`).
//  - Chaque écriture (entry) contient des `movements[]` (lignes d'écriture).
//  - Chaque movement a un `value: { debit, credit, amount }` — `amount` = signed
//    (positif = credit, négatif = debit) ; on n'utilise que `debit` et `credit` bruts.
//  - Les comptes 40x (fournisseurs) et 41x (clients) ont une propriété `company`
//    optionnelle → c'est la source des contacts.

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

const PROVIDER = "myunisoft" as const;
const PROVIDER_SUB = null; // pas de sous-type provider à ce stade

// ─── Utilitaires ────────────────────────────────────────────────────────────

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

// MyUnisoft classifie les comptes par première classe PCG (1-9), comme la norme.
// On reproduit la logique du Pennylane mapper avec les sous-préfixes 4xx classés.
function classifyLedgerAccountType(number: string): LedgerAccountType {
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

// MyUnisoft expose un `journal.type` lisible ("Achat" | "Vente" | "Banque" | …).
// On garde la valeur native pour traçabilité (notre Journal.type est typé string ouvert).
function mapJournalType(rawType: string | null | undefined): string {
  return (rawType ?? "unknown").toString();
}

// État d'écriture : MyUnisoft considère que toute entry est "posted" sauf si
// `additionalProducerProperties.locked === false` (situation rare). Par défaut posted.
function classifyEntryStatus(): AccountingEntryStatus {
  return "posted";
}

// ─── Types attendus côté MAD (forme défensive) ─────────────────────────────

export type MyUnisoftSimplifiedAccount = {
  producerId?: string | number;
  number: string;
  name?: string | null;
};

export type MyUnisoftCompany = {
  name?: string;
  SIREN?: string;
  CEO?: string;
  payment?: { producerId?: string; code?: string };
  address?: {
    city?: string;
    fullName?: string;
    addressNumber?: string;
    postalCode?: string;
    streetName?: string;
    streetType?: string;
    country?: string;
  };
  contacts?: Array<{
    firstname?: string;
    lastname?: string;
    phoneNumber?: string;
    role?: string;
    email?: string;
  }>;
  ape?: { producerId?: string; code?: string; name?: string };
};

export type MyUnisoftAccount = MyUnisoftSimplifiedAccount & {
  correspondanceAccount?: { name?: string; number?: string } | null;
  company?: MyUnisoftCompany | null;
};

export type MyUnisoftJournal = {
  producerId: string | number;
  name?: string;
  customerReferenceCode?: string;
  type?: string;
  counterpartAccount?: MyUnisoftSimplifiedAccount | null;
  additionalProducerProperties?: { type?: string; locked?: boolean };
};

export type MyUnisoftMovementValue = {
  debit?: number | string;
  credit?: number | string;
  amount?: number | string;
};

export type MyUnisoftMovement = {
  producerId?: string | number;
  description?: string;
  value: MyUnisoftMovementValue;
  dueDate?: string | null;
  freeNumber?: string | null;
  invoiceNumber?: string | null;
  account: MyUnisoftSimplifiedAccount;
  payment?: unknown;
  analytics?: Array<{ code?: string; sections?: Array<{ code?: string; rate?: number; amount?: number }> }>;
  lettering?: { state?: string; value?: string | null };
};

export type MyUnisoftEntry = {
  producerId: string | number;
  date: string;
  dueDate?: string | null;
  journal: MyUnisoftJournal;
  currency?: { code?: string };
  movements: MyUnisoftMovement[];
  attachments?: Record<string, unknown>;
  additionalProducerProperties?: {
    createdAt?: number;
    accountedAt?: string;
    source?: { name?: string; thirdParty?: { name?: string; code?: string } };
    partnerMetadata?: unknown;
    comment?: string | null;
  };
};

export type MyUnisoftBalanceEntry = {
  account: MyUnisoftSimplifiedAccount;
  balance: number;
};

// ─── Mappers ────────────────────────────────────────────────────────────────

export function mapJournal(
  raw: MyUnisoftJournal,
  ctx: { userId: string; connectionId: string }
): Journal {
  const code = raw.customerReferenceCode || raw.additionalProducerProperties?.type || String(raw.producerId);
  const label = raw.name || code;
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.producerId),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    code,
    label,
    type: mapJournalType(raw.type),
  };
}

export function mapLedgerAccount(
  raw: MyUnisoftAccount,
  ctx: { userId: string; connectionId: string }
): LedgerAccount {
  const number = String(raw.number ?? "");
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.producerId ?? number),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    number,
    label: raw.name ?? number,
    type: classifyLedgerAccountType(number),
  };
}

// Les comptes 40x (fournisseurs) et 41x (clients) avec une `company` deviennent des Contacts.
// Cette fonction est appelée par le fetcher pour CHAQUE compte qui a une `company`.
export function mapContactFromAccount(
  raw: MyUnisoftAccount,
  ctx: { userId: string; connectionId: string }
): Contact | null {
  const number = String(raw.number ?? "");
  if (!raw.company || !number) return null;

  const isCustomer = number.startsWith("411");
  const isSupplier = number.startsWith("401") || number.startsWith("404");
  if (!isCustomer && !isSupplier) return null;

  const company = raw.company;
  const firstContact = company.contacts?.[0];
  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.producerId ?? number),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    type: isCustomer ? "customer" : "supplier",
    name: company.name?.trim() || raw.name?.trim() || `Contact ${raw.producerId ?? number}`,
    legalName: toNullableString(company.name),
    siret: toNullableString(company.SIREN),
    vatNumber: null,
    email: toNullableString(firstContact?.email),
    sector: toNullableString(company.ape?.name),
    countryCode: toNullableString(company.address?.country) ?? "FR",
    createdAtExternal: null,
  };
}

function mapMovement(raw: MyUnisoftMovement): AccountingEntryLine {
  const accountNumber = String(raw.account?.number ?? "").trim();
  const debit = toNumber(raw.value?.debit, 0);
  const credit = toNumber(raw.value?.credit, 0);
  return {
    externalId: raw.producerId !== undefined ? String(raw.producerId) : null,
    accountNumber,
    accountLabel: toNullableString(raw.account?.name),
    debit,
    credit,
    currency: "EUR",
    vatRate: null,
    description: toNullableString(raw.description),
    analyticalCodes: Array.isArray(raw.analytics)
      ? raw.analytics.map((a) => a.code ?? "").filter(Boolean)
      : [],
    contactExternalId: null,
  };
}

export function mapEntry(
  raw: MyUnisoftEntry,
  ctx: { userId: string; connectionId: string }
): AccountingEntry {
  const lines = Array.isArray(raw.movements) ? raw.movements.map(mapMovement) : [];
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  // Label = description du premier mouvement OU type/journal en fallback.
  const label =
    raw.movements?.[0]?.description?.trim() ||
    `${raw.journal?.type ?? "Écriture"} ${raw.producerId}`;

  return {
    id: "",
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: String(raw.producerId),
    source: PROVIDER,
    providerSub: PROVIDER_SUB,
    syncedAt: new Date().toISOString(),
    rawData: raw as unknown as Record<string, unknown>,
    journalCode:
      raw.journal?.customerReferenceCode ||
      raw.journal?.additionalProducerProperties?.type ||
      String(raw.journal?.producerId ?? ""),
    date: toIsoDate(raw.date),
    label,
    reference: toNullableString(raw.movements?.[0]?.invoiceNumber ?? raw.movements?.[0]?.freeNumber),
    status: classifyEntryStatus(),
    totalDebit,
    totalCredit,
    currency: raw.currency?.code ?? "EUR",
    lines,
  };
}

// ─── Trial balance MAD → NormalizedTrialBalanceEntry ────────────────────────
//
// MAD format : `[{ account: {number, name}, balance: number }]`. La balance est
// signée (debit - credit). Pour reconstituer notre format `{debit, credit}`
// (consommé par balanceSheetSnapshotBuilder + trialBalanceAggregator), on:
//   - balance >= 0 → debit = balance, credit = 0
//   - balance < 0  → debit = 0, credit = -balance
// La somme `debit - credit` reste équivalente à `balance` (préserve la sémantique).

export function mapTrialBalance(
  raw: MyUnisoftBalanceEntry[],
  periodStart: Date,
  periodEnd: Date
): NormalizedTrialBalanceEntry[] {
  return raw
    .filter((item) => item?.account?.number)
    .map((item) => {
      const balance = toNumber(item.balance);
      const debit = balance >= 0 ? balance : 0;
      const credit = balance < 0 ? -balance : 0;
      return {
        accountNumber: String(item.account.number).trim(),
        accountLabel: item.account.name ?? "",
        formattedNumber: null,
        debit,
        credit,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      };
    });
}
