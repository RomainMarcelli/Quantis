// Audit "vérité terrain" de la sandbox Pennylane.
//
// Appelle directement les fetchers + agrégateurs du pipeline (pas de Firestore,
// pas de front, pas de Next route) et imprime un rapport console couvrant :
//   1. Écritures comptables totales + répartition par journal (VE/HA/OD/BQ/...)
//   2. Trial balance résumée par préfixe de compte (3 chars) — solde net
//   3. Variables 2033-SD (codes PnlVariableCode) sommées sur toute la période
//      via buildDailyAccounting
//   4. KPIs calculés (CA, VA, EBITDA, résultat net, BFR, DSO, DPO, solvabilité)
//   5. balanceSheetSnapshot (clients, fournisseurs, dispo, emprunts, total_*)
//
// Usage : npx tsx --env-file=.env scripts/audit-pennylane-sandbox.mts

// Imports dynamiques car les .ts du repo sont chargés en CJS par tsx alors que
// ce script est en ESM (.mts). Les named imports statiques ne traversent pas
// l'interop, on passe donc par `m.default ?? m`.
import type {
  AccountingEntry,
  AdapterSyncContext,
  Connection,
  PnlVariableCode,
} from "../types/connectors";

async function loadCjs<T>(path: string): Promise<T> {
  const m = (await import(path)) as Record<string, unknown> & { default?: T };
  return (m.default ?? (m as unknown as T));
}

const fetchersM = await loadCjs<{
  fetchAccountingEntries: (
    ctx: AdapterSyncContext,
    cursor: string | null
  ) => Promise<{ items: AccountingEntry[]; nextCursor: string | null }>;
  fetchTrialBalance: (
    connection: Connection,
    periodStart: Date,
    periodEnd: Date
  ) => Promise<Array<{ accountNumber: string; debit: number; credit: number; accountLabel: string }>>;
  fetchJournals: (
    ctx: AdapterSyncContext,
    cursor: string | null
  ) => Promise<{ items: Array<{ externalId: string; code: string; label: string; type: string }>; nextCursor: string | null }>;
}>("../services/integrations/adapters/pennylane/fetchers");

const pcgM = await loadCjs<{
  aggregateEntriesToParsedFinancialData: (entries: AccountingEntry[], options: unknown) => unknown;
}>("../services/integrations/aggregations/pcgAggregator");

const dailyM = await loadCjs<{
  buildDailyAccounting: (entries: AccountingEntry[]) => Array<{ date: string; values: Record<PnlVariableCode, number> }>;
}>("../services/integrations/aggregations/dailyAccountingBuilder");

const balanceM = await loadCjs<{
  buildBalanceSheetSnapshot: (
    tb: Array<{ accountNumber: string; debit: number; credit: number }>,
    asOf: string,
    start: string
  ) => { asOfDate: string; periodStart: string; values: Record<string, number> } | null;
}>("../services/integrations/aggregations/balanceSheetSnapshotBuilder");

const mappingM = await loadCjs<{
  mapParsedFinancialDataToMappedFinancialData: (data: unknown) => Record<string, number | null>;
}>("../services/mapping/parsedFinancialDataBridge");

const kpiM = await loadCjs<{
  computeKpis: (data: Record<string, number | null>) => Record<string, number | null>;
}>("../services/kpiEngine");

const sanitizeM = await loadCjs<{
  sanitizeMappedData: (data: Record<string, number | null>) => {
    sanitized: Record<string, number | null>;
    warnings: Array<{ field: string; rejectedValue: number; reason: string }>;
  };
}>("../services/kpiSanitizer");

const fetchAccountingEntries = fetchersM.fetchAccountingEntries;
const fetchTrialBalance = fetchersM.fetchTrialBalance;
const fetchJournals = fetchersM.fetchJournals;
const aggregateEntriesToParsedFinancialData = pcgM.aggregateEntriesToParsedFinancialData;
const buildDailyAccounting = dailyM.buildDailyAccounting;
const buildBalanceSheetSnapshot = balanceM.buildBalanceSheetSnapshot;
const mapParsedFinancialDataToMappedFinancialData = mappingM.mapParsedFinancialDataToMappedFinancialData;
const computeKpis = kpiM.computeKpis;
const sanitizeMappedData = sanitizeM.sanitizeMappedData;

const TOKEN = process.env.PENNYLANE_TEST_TOKEN;
if (!TOKEN) {
  console.error("PENNYLANE_TEST_TOKEN absent. Lance avec --env-file=.env");
  process.exit(1);
}

// Période large pour capter toutes les écritures (sandbox = ~2024-2026).
const PERIOD_START = new Date("2024-01-01T00:00:00.000Z");
const PERIOD_END = new Date("2027-12-31T23:59:59.999Z");

// ─── Construction d'une Connection minimaliste en mémoire ──────────────────
function buildAuditConnection(): Connection {
  const noCursor = { paginationCursor: null, lastSyncedAt: null };
  return {
    id: "audit-pennylane-sandbox",
    userId: "audit-script",
    provider: "pennylane",
    providerSub: null,
    status: "active",
    authMode: "company_token",
    tokenPreview: "",
    tokenExpiresAt: null,
    scopes: [],
    externalCompanyId: "",
    externalFirmId: null,
    odooInstanceUrl: null,
    odooDatabase: null,
    odooLogin: null,
    syncCursors: {
      entries: noCursor,
      invoices: noCursor,
      ledgerAccounts: noCursor,
      contacts: noCursor,
      journals: noCursor,
      bankTransactions: noCursor,
    },
    lastSyncAt: null,
    lastSyncStatus: "never",
    lastSyncError: null,
    createdAt: new Date().toISOString(),
    auth: {
      mode: "company_token",
      accessToken: TOKEN as string,
      externalCompanyId: "",
    },
  } as Connection;
}

// ─── Helpers d'affichage ────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
function eur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${fmt.format(value)} €`.padStart(16);
}
function num(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}
function header(text: string): void {
  console.log(`\n${"═".repeat(78)}\n${text}\n${"═".repeat(78)}`);
}

// ─── Pagination util pour fetchAccountingEntries ────────────────────────────
async function fetchAllAccountingEntries(ctx: AdapterSyncContext): Promise<AccountingEntry[]> {
  const all: AccountingEntry[] = [];
  let cursor: string | null = null;
  let pageNo = 0;
  do {
    const page = await fetchAccountingEntries(ctx, cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
    pageNo++;
    process.stdout.write(`  page ${pageNo}: +${page.items.length} (cumul ${all.length})\r`);
  } while (cursor);
  process.stdout.write("\n");
  return all;
}

// ─── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const connection = buildAuditConnection();
  const ctx: AdapterSyncContext = {
    connection,
    mode: "initial",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  };

  header(`Audit sandbox Pennylane — ${PERIOD_START.toISOString().slice(0, 10)} → ${PERIOD_END.toISOString().slice(0, 10)}`);

  // ─── 1. Fetch écritures + trial balance ──────────────────────────────────
  console.log("\n[1/5] Fetch écritures comptables (paginé)...");
  const entries = await fetchAllAccountingEntries(ctx);

  console.log("\n[2/5] Fetch trial balance + journaux...");
  const trialBalance = await fetchTrialBalance(connection, PERIOD_START, PERIOD_END);
  console.log(`  ${trialBalance.length} comptes`);

  // Fetch des journaux pour traduire l'ID interne Pennylane → code lisible (VE/HA/...).
  const journalLookup = new Map<string, { code: string; label: string; type: string }>();
  let journalCursor: string | null = null;
  do {
    const page = await fetchJournals(ctx, journalCursor);
    for (const j of page.items) {
      journalLookup.set(j.externalId, { code: j.code, label: j.label, type: j.type });
    }
    journalCursor = page.nextCursor;
  } while (journalCursor);
  console.log(`  ${journalLookup.size} journaux`);

  // ─── 2. Écritures : total + répartition par journal ──────────────────────
  header("ÉCRITURES COMPTABLES");
  console.log(`Total : ${entries.length}`);

  // Période effective des écritures.
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  if (dates.length > 0) {
    console.log(`Période effective : ${dates[0]} → ${dates[dates.length - 1]}`);
  }

  // Répartition par journal — le mapper Pennylane stocke souvent l'ID interne
  // dans `journalCode` faute de code court côté API. On résout via journalLookup.
  type JournalSlot = { count: number; debit: number; credit: number; label: string; type: string };
  const byJournal = new Map<string, JournalSlot>();
  for (const e of entries) {
    const rawCode = (e.journalCode ?? "(none)").toUpperCase();
    const meta = journalLookup.get(e.journalCode ?? "");
    const display = meta?.code ? meta.code.toUpperCase() : rawCode;
    const slot = byJournal.get(display) ?? {
      count: 0,
      debit: 0,
      credit: 0,
      label: meta?.label ?? "",
      type: meta?.type ?? "",
    };
    slot.count++;
    for (const line of e.lines) {
      slot.debit += line.debit ?? 0;
      slot.credit += line.credit ?? 0;
    }
    byJournal.set(display, slot);
  }
  console.log(`\n${"Code".padEnd(8)} ${"Type".padEnd(14)} ${"Libellé".padEnd(28)} ${"Écritures".padStart(10)}  ${"Débit".padStart(16)}  ${"Crédit".padStart(16)}`);
  console.log("─".repeat(106));
  const journals = [...byJournal.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [code, s] of journals) {
    console.log(
      `${code.padEnd(8)} ${(s.type || "—").padEnd(14)} ${(s.label || "—").slice(0, 28).padEnd(28)} ${String(s.count).padStart(10)}  ${eur(s.debit)}  ${eur(s.credit)}`
    );
  }

  // ─── 3. Trial balance par préfixe 3 chars ────────────────────────────────
  header("TRIAL BALANCE — soldes nets par classe (préfixe 3 chars)");
  const byPrefix = new Map<string, { debit: number; credit: number; count: number }>();
  for (const tb of trialBalance) {
    const prefix = tb.accountNumber.slice(0, 3);
    const slot = byPrefix.get(prefix) ?? { debit: 0, credit: 0, count: 0 };
    slot.debit += tb.debit ?? 0;
    slot.credit += tb.credit ?? 0;
    slot.count++;
    byPrefix.set(prefix, slot);
  }
  console.log(`\n${"Préfixe".padEnd(10)} ${"Comptes".padStart(8)}  ${"Débit".padStart(16)}  ${"Crédit".padStart(16)}  ${"Solde D-C".padStart(16)}`);
  console.log("─".repeat(74));
  const prefixes = [...byPrefix.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [prefix, s] of prefixes) {
    const balance = s.debit - s.credit;
    console.log(
      `${prefix.padEnd(10)} ${String(s.count).padStart(8)}  ${eur(s.debit)}  ${eur(s.credit)}  ${eur(balance)}`
    );
  }

  // ─── 4. Variables 2033-SD (PnlVariableCode) via buildDailyAccounting ─────
  header("VARIABLES 2033-SD — totaux sur toute la période");
  const dailyAccounting = buildDailyAccounting(entries);
  console.log(`Jours non vides : ${dailyAccounting.length}`);

  // Somme par variable code sur tous les jours.
  const variableTotals = new Map<PnlVariableCode, number>();
  for (const day of dailyAccounting) {
    for (const [code, value] of Object.entries(day.values) as [PnlVariableCode, number][]) {
      variableTotals.set(code, (variableTotals.get(code) ?? 0) + (value ?? 0));
    }
  }

  console.log(`\n${"Code".padEnd(24)} ${"Total".padStart(16)}`);
  console.log("─".repeat(44));
  // Tri : non-zéros d'abord (plus utile à inspecter), par valeur décroissante.
  const sortedVars = [...variableTotals.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [code, total] of sortedVars) {
    if (total === 0) continue; // On masque les zéros pour rester lisible.
    console.log(`${code.padEnd(24)} ${eur(total)}`);
  }

  // ─── 5. mappedData → KPI ────────────────────────────────────────────────
  console.log("\n[3/5] Agrégation pcgAggregator...");
  const previousPeriodStart = new Date(PERIOD_START);
  previousPeriodStart.setUTCFullYear(previousPeriodStart.getUTCFullYear() - 1);
  const previousPeriodEnd = new Date(PERIOD_START.getTime() - 1);

  const parsedFinancialData = aggregateEntriesToParsedFinancialData(entries, {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    previousPeriodStart,
    previousPeriodEnd,
  });

  console.log("[4/5] Mapping → mappedData + sanitization...");
  const rawMappedData = mapParsedFinancialDataToMappedFinancialData(parsedFinancialData);
  const { sanitized: mappedData, warnings } = sanitizeMappedData(rawMappedData);
  if (warnings.length > 0) {
    console.log(`  ⚠ ${warnings.length} champ(s) écarté(s) par le garde-fou aberrantes :`);
    for (const w of warnings) {
      console.log(`    - ${w.field} (${w.reason}, valeur rejetée=${w.rejectedValue})`);
    }
  } else {
    console.log("  Aucun champ aberrant détecté.");
  }

  console.log("[5/5] computeKpis...");
  const kpis = computeKpis(mappedData);

  header("KPIs — calcul depuis mappedData");
  const kpiLines: Array<[string, number | null, "eur" | "pct" | "ratio" | "days"]> = [
    ["Chiffre d'affaires (CA)", kpis.ca, "eur"],
    ["Valeur ajoutée (VA)", kpis.va, "eur"],
    ["EBITDA", kpis.ebitda, "eur"],
    ["Marge EBITDA", kpis.marge_ebitda, "pct"],
    ["EBE", kpis.ebe, "eur"],
    ["Résultat net", kpis.resultat_net, "eur"],
    ["Charges fixes", kpis.charges_fixes, "eur"],
    ["Point mort", kpis.point_mort, "eur"],
    ["BFR", kpis.bfr, "eur"],
    ["Rotation BFR (jours)", kpis.rot_bfr, "days"],
    ["DSO (jours)", kpis.dso, "days"],
    ["DPO (jours)", kpis.dpo, "days"],
    ["Solvabilité (CP/Passif)", kpis.solvabilite, "ratio"],
    ["Liquidité générale", kpis.liq_gen, "ratio"],
    ["Trésorerie nette", kpis.tn, "eur"],
    ["Health score (/100)", kpis.healthScore, "ratio"],
  ];
  for (const [label, value, kind] of kpiLines) {
    let formatted: string;
    if (kind === "eur") formatted = eur(value);
    else if (kind === "pct") formatted = value === null ? "—" : `${num(value)} %`;
    else if (kind === "days") formatted = value === null ? "—" : `${num(value, 0)} j`;
    else formatted = num(value);
    console.log(`  ${label.padEnd(30)} ${formatted.padStart(16)}`);
  }

  // ─── 6. balanceSheetSnapshot ─────────────────────────────────────────────
  header("BALANCE SHEET SNAPSHOT");
  const snapshot =
    trialBalance.length > 0
      ? buildBalanceSheetSnapshot(
          trialBalance,
          PERIOD_END.toISOString().slice(0, 10),
          PERIOD_START.toISOString().slice(0, 10)
        )
      : null;

  if (!snapshot) {
    console.log("(non construit — trial balance vide)");
  } else {
    console.log(`asOfDate : ${snapshot.asOfDate}   périodeStart : ${snapshot.periodStart}\n`);
    const v = snapshot.values;
    const lines: Array<[string, number]> = [
      ["clients", v.clients ?? 0],
      ["fournisseurs", v.fournisseurs ?? 0],
      ["dispo (banque + caisse)", v.dispo ?? 0],
      ["emprunts", v.emprunts ?? 0],
      ["total_actif", v.total_actif ?? 0],
      ["total_passif", v.total_passif ?? 0],
      ["total_cp (capitaux propres)", v.total_cp ?? 0],
      ["total_stocks", v.total_stocks ?? 0],
      ["créances (total)", v.creances ?? 0],
      ["actif circulant", v.total_actif_circ ?? 0],
      ["actif immo (total)", v.total_actif_immo ?? 0],
      ["capital", v.capital ?? 0],
      ["résultat net (bilan)", v.res_net ?? 0],
      ["dettes fisc/soc", v.dettes_fisc_soc ?? 0],
      ["total dettes", v.total_dettes ?? 0],
    ];
    for (const [label, value] of lines) {
      console.log(`  ${label.padEnd(30)} ${eur(value).padStart(16)}`);
    }
  }

  console.log(`\n${"═".repeat(78)}\nFin de l'audit.\n`);
})().catch((e) => {
  console.error("\n[ERROR]", e);
  process.exit(1);
});
