// File: scripts/diagnose-myunisoft-pipeline.mts
// Role: trace toute la chaîne MyUnisoft → KPI Vyzor SANS Firestore.
//   1. Fetch /mad/entries en direct
//   2. mapEntry (adapter) → AccountingEntry[]
//   3. aggregateEntriesToParsedFinancialData → ParsedFinancialData
//   4. mapParsedFinancialDataToMappedFinancialData → MappedFinancialData
//   5. computeKpis → CalculatedKpis
//
// À chaque étape on dump les valeurs clés pour repérer où la chaîne casse.
// Permet de répondre en 1 run : "le bug est-il dans l'adapter, l'aggregator,
// le bridge ou l'engine KPI ?"
//
// Usage : npx tsx --env-file=.env scripts/diagnose-myunisoft-pipeline.mts

// Imports dynamiques via .default pour contourner le wrapper CJS appliqué
// par tsx aux fichiers .ts du projet (Next.js force "type":"commonjs" sur
// certains chemins). Les imports statiques renvoient un objet vide ;
// passer par await import() + .default récupère bien les nommés.
import type { MyUnisoftEntry } from "@/services/integrations/adapters/myunisoft/mappers";
const mappersMod = await import("@/services/integrations/adapters/myunisoft/mappers");
const aggMod = await import("@/services/integrations/aggregations/pcgAggregator");
const bridgeMod = await import("@/services/mapping/parsedFinancialDataBridge");
const kpiMod = await import("@/services/kpiEngine");
const mapEntry = (mappersMod.default ?? mappersMod).mapEntry;
const aggregateEntriesToParsedFinancialData =
  (aggMod.default ?? aggMod).aggregateEntriesToParsedFinancialData;
const mapParsedFinancialDataToMappedFinancialData =
  (bridgeMod.default ?? bridgeMod).mapParsedFinancialDataToMappedFinancialData;
const computeKpis = (kpiMod.default ?? kpiMod).computeKpis;

const SECRET = process.env.MYUNISOFT_THIRD_PARTY_SECRET?.trim();
const JWT = process.env.MYUNISOFT_TEST_JWT?.trim();
const BASE =
  process.env.MYUNISOFT_API_BASE_URL?.trim() ||
  "https://api.myunisoft.fr/api/v1";

if (!SECRET || !JWT) {
  console.error("❌ MYUNISOFT_THIRD_PARTY_SECRET ou MYUNISOFT_TEST_JWT manquant.");
  process.exit(1);
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return `${ANSI.red}null${ANSI.reset}`;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

// Découpage 12 mois max (mêmes règles que le fetcher prod) — voir
// services/integrations/adapters/myunisoft/fetchers.ts.
async function fetchEntriesChunked(start: string, end: string): Promise<MyUnisoftEntry[]> {
  const fetchersMod = await import("@/services/integrations/adapters/myunisoft/fetchers");
  const split = (fetchersMod.default ?? fetchersMod).splitDateRangeIntoChunks as (
    s: Date,
    e: Date
  ) => Array<{ start: Date; end: Date }>;
  const chunks = split(new Date(start), new Date(end));
  console.log(`   ${ANSI.dim}découpage en ${chunks.length} chunk(s) :${ANSI.reset}`);
  for (const c of chunks) {
    console.log(`     ${c.start.toISOString().slice(0, 10)} → ${c.end.toISOString().slice(0, 10)}`);
  }
  const all: MyUnisoftEntry[] = [];
  for (const chunk of chunks) {
    const url = new URL(`${BASE}/mad/entries`);
    url.searchParams.set("version", "1.0.0");
    url.searchParams.set("startDate", chunk.start.toISOString().slice(0, 10));
    url.searchParams.set("endDate", chunk.end.toISOString().slice(0, 10));
    const response = await fetch(url.toString(), {
      headers: {
        "X-Third-Party-Secret": SECRET as string,
        Authorization: `Bearer ${JWT}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`/mad/entries → ${response.status}: ${await response.text()}`);
    }
    const arr = (await response.json()) as MyUnisoftEntry[];
    all.push(...arr);
  }
  return all;
}

(async () => {
  // Reproduire exactement la fenêtre du sync prod : 36 mois en arrière depuis aujourd'hui.
  // Avec le fix du chunking, le fetcher doit gérer cette fenêtre malgré la limite API à 12 mois.
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 36);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  console.log(`${ANSI.bold}▶ Pipeline diagnostic${ANSI.reset} sur ${start} → ${end}\n`);

  // ─── Étape 1 : fetch brut ──────────────────────────────────────────────
  console.log(`${ANSI.bold}1. Fetch /mad/entries (avec chunking 12 mois)${ANSI.reset}`);
  const raw = await fetchEntriesChunked(start, end);
  console.log(`   ${raw.length} écriture(s) brute(s) reçue(s)`);
  const sampleEntry = raw.find((e) =>
    e.movements?.some((m) => String(m.account?.number ?? "").startsWith("706"))
  );
  if (sampleEntry) {
    console.log(`   ${ANSI.dim}exemple raw (1 écriture sur 706) :${ANSI.reset}`);
    const sampleMvt = sampleEntry.movements?.find((m) =>
      String(m.account?.number ?? "").startsWith("706")
    );
    console.log(`     date=${sampleEntry.date}, journal.type=${sampleEntry.journal?.type}`);
    console.log(`     movement: account=${sampleMvt?.account?.number}, credit=${sampleMvt?.value?.credit}, debit=${sampleMvt?.value?.debit}`);
  }

  // ─── Étape 2 : mapEntry ────────────────────────────────────────────────
  console.log(`\n${ANSI.bold}2. mapEntry (MyUnisoft → AccountingEntry)${ANSI.reset}`);
  const ctx = { userId: "diag-user", connectionId: "diag-conn" };
  const mapped = raw.map((e) => mapEntry(e, ctx));
  const totalLines = mapped.reduce((s, e) => s + (e.lines?.length ?? 0), 0);
  const linesWith706 = mapped.flatMap((e) => e.lines).filter((l) => l?.accountNumber?.startsWith("706")).length;
  const linesWith60to64 = mapped.flatMap((e) => e.lines).filter((l) =>
    l?.accountNumber && /^(60|61|62|63|64)/.test(l.accountNumber)
  ).length;
  console.log(`   ${mapped.length} entries mappées · ${totalLines} lignes au total`);
  console.log(`   lignes sur 706 : ${linesWith706}`);
  console.log(`   lignes sur 60-64 : ${linesWith60to64}`);
  // Vérifier que les dates sont bien parseable
  const datesValid = mapped.filter((e) => !Number.isNaN(new Date(e.date).getTime())).length;
  console.log(`   entries avec date valide : ${datesValid}/${mapped.length}`);
  if (mapped[0]) {
    console.log(`   ${ANSI.dim}exemple AccountingEntry :${ANSI.reset}`);
    console.log(`     date=${mapped[0].date}, lines=${mapped[0].lines?.length}, totalCredit=${mapped[0].totalCredit}, totalDebit=${mapped[0].totalDebit}`);
    if (mapped[0].lines?.[0]) {
      const l = mapped[0].lines[0];
      console.log(`     line[0]: account=${l.accountNumber}, debit=${l.debit}, credit=${l.credit}`);
    }
  }

  // ─── Étape 3 : aggregateEntriesToParsedFinancialData ──────────────────
  console.log(`\n${ANSI.bold}3. aggregateEntriesToParsedFinancialData${ANSI.reset}`);
  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  const previousPeriodStart = new Date("2025-01-01");
  const previousPeriodEnd = new Date("2025-12-31");
  const parsed = aggregateEntriesToParsedFinancialData(mapped, {
    periodStart,
    periodEnd,
    previousPeriodStart,
    previousPeriodEnd,
  });
  const is = parsed.incomeStatement;
  const bs = parsed.balanceSheet;
  console.log(`   ${ANSI.dim}incomeStatement (champs critiques) :${ANSI.reset}`);
  console.log(`     salesGoods (707)               : ${fmt(is.salesGoods)}`);
  console.log(`     productionSoldGoods (701-705)  : ${fmt(is.productionSoldGoods)}`);
  console.log(`     productionSoldServices (706,8) : ${fmt(is.productionSoldServices)}`);
  console.log(`     productionSold (calculé)       : ${fmt(is.productionSold)}`);
  console.log(`     netTurnover (calculé)          : ${fmt(is.netTurnover)}`);
  console.log(`     revenue (calculé)              : ${fmt(is.revenue)}`);
  console.log(`     totalOperatingProducts         : ${fmt(is.totalOperatingProducts)}`);
  console.log(`     externalCharges (61,62)        : ${fmt(is.externalCharges)}`);
  console.log(`     wages (641,644,648)            : ${fmt(is.wages)}`);
  console.log(`     socialCharges (645-647)        : ${fmt(is.socialCharges)}`);
  console.log(`     totalOperatingCharges          : ${fmt(is.totalOperatingCharges)}`);
  console.log(`     operatingResult (EBE proxy)    : ${fmt(is.operatingResult)}`);
  console.log(`   ${ANSI.dim}balanceSheet (champs critiques) :${ANSI.reset}`);
  console.log(`     cashAndCashEquivalents (5x)    : ${fmt(bs.cashAndCashEquivalents)}`);
  console.log(`     tradeReceivables (411x)        : ${fmt(bs.tradeReceivables)}`);
  console.log(`     tradePayables (401x)           : ${fmt(bs.tradePayables)}`);

  // ─── Étape 4 : bridge → MappedFinancialData ───────────────────────────
  console.log(`\n${ANSI.bold}4. mapParsedFinancialDataToMappedFinancialData${ANSI.reset}`);
  const mappedData = mapParsedFinancialDataToMappedFinancialData(parsed);
  console.log(`   ventes_march      : ${fmt(mappedData.ventes_march)}`);
  console.log(`   prod_biens        : ${fmt(mappedData.prod_biens)}`);
  console.log(`   prod_serv         : ${fmt(mappedData.prod_serv)}`);
  console.log(`   prod_vendue       : ${fmt(mappedData.prod_vendue)}`);
  console.log(`   total_prod_expl   : ${fmt(mappedData.total_prod_expl)}`);
  console.log(`   ace               : ${fmt(mappedData.ace)}`);
  console.log(`   salaires          : ${fmt(mappedData.salaires)}`);
  console.log(`   charges_soc       : ${fmt(mappedData.charges_soc)}`);
  console.log(`   total_charges_expl: ${fmt(mappedData.total_charges_expl)}`);
  console.log(`   ebit              : ${fmt(mappedData.ebit)}`);
  console.log(`   dispo             : ${fmt(mappedData.dispo)}`);
  console.log(`   clients           : ${fmt(mappedData.clients)}`);
  console.log(`   fournisseurs      : ${fmt(mappedData.fournisseurs)}`);

  // ─── Étape 5 : computeKpis ────────────────────────────────────────────
  console.log(`\n${ANSI.bold}5. computeKpis${ANSI.reset}`);
  const kpis = computeKpis(mappedData);
  console.log(`   ${ANSI.green}ca${ANSI.reset}                : ${fmt(kpis.ca)}`);
  console.log(`   ${ANSI.green}ebe${ANSI.reset}               : ${fmt(kpis.ebe)}`);
  console.log(`   ${ANSI.green}va${ANSI.reset}                : ${fmt(kpis.va)}`);
  console.log(`   marge_ebitda      : ${kpis.marge_ebitda}`);
  console.log(`   disponibilites    : ${fmt(kpis.disponibilites)}`);
  console.log(`   tn (tréso nette)  : ${fmt(kpis.tn)}`);
  console.log(`   bfr               : ${fmt(kpis.bfr)}`);
  console.log(`   resultat_net      : ${fmt(kpis.res_net ?? null)}`);

  // ─── Verdict ──────────────────────────────────────────────────────────
  console.log(`\n${ANSI.bold}════════ VERDICT ════════${ANSI.reset}`);
  if (kpis.ca !== null && kpis.ca > 0) {
    console.log(`${ANSI.green}✓ Pipeline OK${ANSI.reset} — CA=${fmt(kpis.ca)}, EBE=${fmt(kpis.ebe)}`);
    console.log(`Si le dashboard affiche "Données insuffisantes", le problème est côté front`);
    console.log(`(seuil de validation, hydratation Firestore, sélecteur).`);
  } else {
    console.log(`${ANSI.red}✗ Pipeline KO${ANSI.reset} — CA est null/0 alors que la sandbox a 15M+ de produits.`);
    console.log(`Localiser le maillon : examiner les valeurs ci-dessus, le premier null indique la rupture.`);
  }
})().catch((err) => {
  console.error(`\n${ANSI.red}❌ Échec :${ANSI.reset}`, err instanceof Error ? err.message : err);
  process.exit(1);
});
