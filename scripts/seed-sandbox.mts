// Seed enrichi de la sandbox Pennylane.
//
// Génère un jeu de données réaliste pour tester l'intégration end-to-end :
//  - 10 customers (4 secteurs)
//  - 8 suppliers
//  - 12 products (3 catégories)
//  - 4 customer invoices (drafts)
//  - Setup financier (capital, emprunt, immo)
//  - Ventes spread sur 12 mois 2025 (~25 écritures)
//  - Achats spread sur 12 mois 2025 (~20 écritures)
//  - Paie mensuelle (12 écritures)
//  - Loyer mensuel (12 écritures)
//  - Taxes + DAP trimestrielles (8 écritures)
//
// Total : ~80 écritures comptables couvrant tous les KPI majeurs (CA, VA, EBITDA, BFR,
// trésorerie, capital, emprunts, immo, taxes, salaires).
//
// Usage : npx tsx --env-file=.env scripts/seed-sandbox.mts

const TOKEN = process.env.PENNYLANE_TEST_TOKEN;
if (!TOKEN) {
  console.error("PENNYLANE_TEST_TOKEN absent (lance avec --env-file=.env).");
  process.exit(1);
}

const BASE = "https://app.pennylane.com/api/external/v2";
const RUN_TAG = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

// ─── Helpers HTTP ───────────────────────────────────────────────────────────

type ApiResult<T = unknown> = { ok: boolean; status: number; data: T | { error: string } };

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// Rate limit Pennylane v2 sandbox = ~1 req/s. On throttle systématiquement +
// on retry sur 429 jusqu'à 6 tentatives avec backoff exponentiel.
async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) {
      await sleep(1100 * Math.pow(1.5, attempt - 1));
    } else {
      // Throttle de base entre toutes les requêtes pour éviter le rate limit.
      await sleep(250);
    }
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {}

    // Rate limit → retry après pause.
    if (res.status === 429 || (typeof data === "string" && data.includes("Rate limit"))) {
      continue;
    }
    if (typeof data === "object" && data && typeof (data as any).error === "string" &&
        (data as any).error.includes("Rate limit")) {
      continue;
    }
    return { ok: res.ok, status: res.status, data };
  }
  return { ok: false, status: 429, data: { error: "Rate limit après 6 tentatives" } };
}

function logStep(label: string, ok: boolean, extra: string = ""): void {
  console.log(`[${ok ? "OK" : "KO"}] ${label} ${extra}`);
}

async function ensureLedgerAccount(
  number: string,
  label: string
): Promise<{ id: number; number: string; label: string } | null> {
  const create = await api<any>("POST", "/ledger_accounts", { number, label });
  if (create.ok) return { id: create.data.id, number, label };
  // Si déjà existant : on récupère via filter.
  const filter = encodeURIComponent(JSON.stringify([{ field: "number", operator: "eq", value: number }]));
  const list = await api<any>("GET", `/ledger_accounts?filter=${filter}&limit=10`);
  if (list.ok && Array.isArray(list.data.items) && list.data.items.length > 0) {
    return { id: list.data.items[0].id, number: list.data.items[0].number, label: list.data.items[0].label };
  }
  // Fallback paginé.
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const url = `/ledger_accounts?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await api<any>("GET", url);
    if (!page.ok) return null;
    const found = (page.data.items as Array<{ id: number; number: string; label: string }>).find(
      (a) => a.number === number
    );
    if (found) return found;
    cursor = page.data.next_cursor ?? null;
    if (!cursor) break;
  }
  return null;
}

type Account = { id: number; number: string; label: string };
type Customer = { id: number; name: string; ledgerAccountId: number; sector: string };
type Supplier = { id: number; name: string; ledgerAccountId: number };
type Product = { id: number; label: string; priceBeforeTax: number };

// ─── Plan comptable étendu ──────────────────────────────────────────────────

async function ensureChartOfAccounts(): Promise<Record<string, Account>> {
  console.log("\n=== Plan comptable étendu ===");
  // Numéros choisis pour ne PAS finir par 0 (rejet Pennylane sur comptes synthétiques).
  const PCG: Array<[string, string]> = [
    ["101001", "Capital social"],
    ["120001", "Résultat de l'exercice (à-nouveau)"],
    ["164001", "Emprunts auprès des établissements de crédit"],
    ["211001", "Immobilisations corporelles - Terrains"],
    ["215001", "Matériel industriel"],
    ["218001", "Autres immobilisations corporelles"],
    ["281001", "Amortissements des immobilisations"],
    ["421001", "Personnel - Rémunérations dues"],
    ["431001", "Sécurité sociale"],
    ["445511", "TVA à décaisser"],
    ["512001", "Banque - Compte courant"],
    ["601001", "Achats matières premières"],
    ["604001", "Achats études et prestations"],
    ["606001", "Achats non stockés (eau, électricité)"],
    ["607001", "Achats marchandises"],
    ["613001", "Locations"],
    ["616001", "Primes d'assurance"],
    ["622001", "Honoraires"],
    ["626001", "Frais postaux et télécoms"],
    ["635001", "Autres impôts et taxes"],
    ["641001", "Rémunérations du personnel"],
    ["645001", "Charges de sécurité sociale"],
    ["681001", "Dotations aux amortissements"],
    ["701001", "Ventes de produits finis"],
    ["706001", "Prestations de services"],
    ["707001", "Ventes de marchandises"],
    ["709001", "Rabais, remises et ristournes accordés"],
    ["44571", "TVA collectée"],
    ["445661", "TVA déductible"],
  ];

  const accounts: Record<string, Account> = {};
  for (const [number, label] of PCG) {
    const acc = await ensureLedgerAccount(number, label);
    if (acc) accounts[number] = acc;
  }
  console.log(`  ${Object.keys(accounts).length}/${PCG.length} comptes prêts`);
  return accounts;
}

// ─── Customers (10 répartis sur 4 secteurs) ────────────────────────────────

async function createCustomers(): Promise<Customer[]> {
  console.log("\n=== Customers ===");
  const seed = [
    { name: "Acme Industries", sector: "industrie", city: "Boulogne", postal: "92100" },
    { name: "Tech Conseils", sector: "services", city: "Bordeaux", postal: "33000" },
    { name: "Bistrot du Marché", sector: "commerce", city: "Paris", postal: "75011" },
    { name: "DataCloud SAS", sector: "tech", city: "Lyon", postal: "69002" },
    { name: "Mécanique Lefebvre", sector: "industrie", city: "Lille", postal: "59000" },
    { name: "Green Energy SARL", sector: "industrie", city: "Nantes", postal: "44000" },
    { name: "Studio Création", sector: "services", city: "Marseille", postal: "13001" },
    { name: "Boulangerie Pichard", sector: "commerce", city: "Toulouse", postal: "31000" },
    { name: "FinTech Express", sector: "tech", city: "Paris", postal: "75009" },
    { name: "Cabinet Conseil RH", sector: "services", city: "Strasbourg", postal: "67000" },
  ];
  const created: Customer[] = [];
  for (const c of seed) {
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const result = await api<any>("POST", "/company_customers", {
      name: `${c.name} ${RUN_TAG}`,
      billing_address: {
        address: `${1 + Math.floor(Math.random() * 100)} rue de la République`,
        postal_code: c.postal,
        city: c.city,
        country_alpha2: "FR",
      },
      delivery_address: {
        address: `${1 + Math.floor(Math.random() * 100)} rue de la République`,
        postal_code: c.postal,
        city: c.city,
        country_alpha2: "FR",
      },
      // Email unique par run pour éviter les rejets de duplicate côté Pennylane.
      emails: [`contact-${RUN_TAG}@${slug}.fr`],
    });
    if (result.ok) {
      created.push({
        id: result.data.id,
        name: `${c.name} ${RUN_TAG}`,
        ledgerAccountId: result.data.ledger_account?.id,
        sector: c.sector,
      });
    } else {
      console.warn(`  [KO] Customer "${c.name}" : ${JSON.stringify(result.data).slice(0, 200)}`);
    }
  }
  logStep(`Customers créés`, created.length === seed.length, `${created.length}/${seed.length}`);
  return created;
}

// ─── Suppliers (8 variés) ──────────────────────────────────────────────────

async function createSuppliers(): Promise<Supplier[]> {
  console.log("\n=== Suppliers ===");
  const names = [
    "Fournitures Pro",
    "Cloud Hosting",
    "Telecom France",
    "Loueur Bureau Plus",
    "Electricité Nationale",
    "Comptable Cabinet",
    "Logistique Express",
    "Assureur Premium",
  ];
  const created: Supplier[] = [];
  for (const name of names) {
    const result = await api<any>("POST", "/suppliers", {
      name: `${name} ${RUN_TAG}`,
    });
    if (result.ok) {
      created.push({
        id: result.data.id,
        name: `${name} ${RUN_TAG}`,
        ledgerAccountId: result.data.ledger_account?.id,
      });
    } else {
      console.warn(`  [KO] Supplier "${name}" : ${JSON.stringify(result.data).slice(0, 200)}`);
    }
  }
  logStep(`Suppliers créés`, created.length === names.length, `${created.length}/${names.length}`);
  return created;
}

// ─── Products (12 dans 3 catégories) ───────────────────────────────────────

async function createProducts(): Promise<Product[]> {
  console.log("\n=== Products ===");
  const seed = [
    // Audit & conseil (haute valeur, ~1500-3000€)
    { label: "Audit financier annuel", price: "2500" },
    { label: "Audit fiscal", price: "1800" },
    { label: "Conseil stratégique", price: "3000" },
    { label: "Diagnostic 360", price: "1500" },
    // Abonnements SaaS (récurrent)
    { label: "Abonnement Pro - Mensuel", price: "299" },
    { label: "Abonnement Enterprise", price: "899" },
    { label: "Module API premium", price: "499" },
    { label: "Stockage cloud étendu", price: "199" },
    // Formation & support (moyenne valeur)
    { label: "Formation 1 jour", price: "850" },
    { label: "Formation 2 jours", price: "1500" },
    { label: "Workshop équipe", price: "2200" },
    { label: "Support dédié - Mensuel", price: "650" },
  ];
  const created: Product[] = [];
  for (const p of seed) {
    const result = await api<any>("POST", "/products", {
      label: `${p.label} ${RUN_TAG}`,
      price_before_tax: p.price,
      vat_rate: "FR_200",
    });
    if (result.ok) {
      created.push({
        id: result.data.id,
        label: `${p.label} ${RUN_TAG}`,
        priceBeforeTax: Number(p.price),
      });
    } else {
      console.warn(`  [KO] Product "${p.label}" : ${JSON.stringify(result.data).slice(0, 200)}`);
    }
  }
  logStep(`Products créés`, created.length === seed.length, `${created.length}/${seed.length}`);
  return created;
}

// ─── Helpers entries ───────────────────────────────────────────────────────

async function createLedgerEntry(params: {
  date: string;
  label: string;
  journalCode: string;
  lines: Array<{ accountId: number; debit: number; credit: number }>;
  journals: Map<string, number>;
}): Promise<number | null> {
  const journalId = params.journals.get(params.journalCode);
  if (!journalId) return null;
  const result = await api<any>("POST", "/ledger_entries", {
    date: params.date,
    label: params.label,
    journal_id: journalId,
    ledger_entry_lines: params.lines.map((l) => ({
      ledger_account_id: l.accountId,
      debit: l.debit.toFixed(2),
      credit: l.credit.toFixed(2),
    })),
  });
  return result.ok ? result.data.id : null;
}

async function getJournals(): Promise<Map<string, number>> {
  const result = await api<any>("GET", "/journals");
  const map = new Map<string, number>();
  if (result.ok && Array.isArray(result.data.items)) {
    for (const j of result.data.items) {
      if (j.code) map.set(j.code, j.id);
      // Fallback : mapping par type.
      if (j.type === "sales") map.set("VE", j.id);
      if (j.type === "purchases") map.set("HA", j.id);
      if (j.type === "bank") map.set("BQ", j.id);
      if (j.type === "misc") map.set("OD", j.id);
      if (j.type === "payroll") map.set("PA", j.id);
    }
  }
  return map;
}

// ─── Setup financier (capital + emprunt + immo) ────────────────────────────

async function seedSetup(
  accounts: Record<string, Account>,
  journals: Map<string, number>,
  suppliers: Supplier[]
): Promise<number> {
  console.log("\n=== Setup financier ===");
  // Vérifier que tous les comptes nécessaires sont là.
  const required = ["101001", "164001", "215001", "445661", "512001"];
  for (const code of required) {
    if (!accounts[code]) {
      console.warn(`  [SKIP] Setup : compte ${code} manquant`);
      return 0;
    }
  }
  if (suppliers.length === 0) {
    console.warn(`  [SKIP] Setup : pas de supplier disponible`);
    return 0;
  }
  let count = 0;

  // Capital social (101 → 512)
  const cap = await createLedgerEntry({
    date: "2025-01-02",
    label: "Apport en capital initial",
    journalCode: "OD",
    journals,
    lines: [
      { accountId: accounts["512001"]!.id, debit: 100000, credit: 0 },
      { accountId: accounts["101001"]!.id, debit: 0, credit: 100000 },
    ],
  });
  if (cap) count++;

  // Emprunt bancaire (164 → 512)
  const loan = await createLedgerEntry({
    date: "2025-01-15",
    label: "Emprunt bancaire 5 ans",
    journalCode: "OD",
    journals,
    lines: [
      { accountId: accounts["512001"]!.id, debit: 50000, credit: 0 },
      { accountId: accounts["164001"]!.id, debit: 0, credit: 50000 },
    ],
  });
  if (loan) count++;

  // Achat matériel industriel (215 + 4456 → 401)
  const supplier = suppliers[0]!;
  const immo = await createLedgerEntry({
    date: "2025-02-10",
    label: "Acquisition matériel industriel",
    journalCode: "HA",
    journals,
    lines: [
      { accountId: accounts["215001"]!.id, debit: 30000, credit: 0 },
      { accountId: accounts["445661"]!.id, debit: 6000, credit: 0 },
      { accountId: supplier.ledgerAccountId, debit: 0, credit: 36000 },
    ],
  });
  if (immo) count++;

  // Paiement matériel par banque (401 → 512)
  const pay = await createLedgerEntry({
    date: "2025-02-15",
    label: "Paiement acquisition matériel",
    journalCode: "BQ",
    journals,
    lines: [
      { accountId: supplier.ledgerAccountId, debit: 36000, credit: 0 },
      { accountId: accounts["512001"]!.id, debit: 0, credit: 36000 },
    ],
  });
  if (pay) count++;

  console.log(`  ${count}/4 setup entries`);
  return count;
}

// ─── Ventes spread sur 12 mois ─────────────────────────────────────────────

async function seedSales(
  accounts: Record<string, Account>,
  journals: Map<string, number>,
  customers: Customer[],
  products: Product[]
): Promise<number> {
  console.log("\n=== Ventes 2025 (spread 12 mois) ===");
  // Pattern saisonnier : creux été, peak Q4.
  const monthlyMultiplier = [1.0, 1.1, 1.2, 1.0, 0.9, 0.7, 0.6, 0.7, 1.1, 1.3, 1.5, 1.4];
  let count = 0;

  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    const mult = monthlyMultiplier[month - 1]!;
    // 2 à 3 ventes par mois.
    const count_per_month = month % 4 === 0 ? 3 : 2;

    for (let i = 0; i < count_per_month; i++) {
      const customer = customers[(month + i) % customers.length]!;
      const product = products[(month * 2 + i) % products.length]!;
      const qty = 1 + (month % 3);
      const ht = Math.round(product.priceBeforeTax * qty * mult);
      const tva = Math.round(ht * 0.2);
      const ttc = ht + tva;
      const day = String(5 + i * 8 + (month % 5)).padStart(2, "0");

      const id = await createLedgerEntry({
        date: `2025-${mm}-${day}`,
        label: `Vente ${customer.name.split(" ")[0]} - ${product.label.split(" ")[0]}`,
        journalCode: "VE",
        journals,
        lines: [
          { accountId: customer.ledgerAccountId, debit: ttc, credit: 0 },
          { accountId: accounts["701001"]!.id, debit: 0, credit: ht },
          { accountId: accounts["44571"]!.id, debit: 0, credit: tva },
        ],
      });
      if (id) count++;
    }
  }

  console.log(`  ${count} écritures de vente créées`);
  return count;
}

// ─── Achats spread sur 12 mois ─────────────────────────────────────────────

async function seedPurchases(
  accounts: Record<string, Account>,
  journals: Map<string, number>,
  suppliers: Supplier[]
): Promise<number> {
  console.log("\n=== Achats 2025 (spread 12 mois) ===");
  let count = 0;

  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    // 2 achats par mois.
    for (let i = 0; i < 2; i++) {
      const supplier = suppliers[(month + i) % suppliers.length]!;
      const ht = 200 + (month * 50) + i * 150;
      const tva = Math.round(ht * 0.2 * 100) / 100;
      const ttc = ht + tva;
      const day = String(8 + i * 10 + (month % 4)).padStart(2, "0");
      const accountChoice = i === 0 ? "607001" : "604001";

      const id = await createLedgerEntry({
        date: `2025-${mm}-${day}`,
        label: `Achat ${supplier.name.split(" ")[0]}`,
        journalCode: "HA",
        journals,
        lines: [
          { accountId: accounts[accountChoice]!.id, debit: ht, credit: 0 },
          { accountId: accounts["445661"]!.id, debit: tva, credit: 0 },
          { accountId: supplier.ledgerAccountId, debit: 0, credit: ttc },
        ],
      });
      if (id) count++;
    }
  }

  console.log(`  ${count} écritures d'achat créées`);
  return count;
}

// ─── Paie mensuelle (12 mois) ──────────────────────────────────────────────

async function seedPayroll(
  accounts: Record<string, Account>,
  journals: Map<string, number>
): Promise<number> {
  console.log("\n=== Paie 2025 (mensuelle) ===");
  let count = 0;
  // Salaires mensuels nets ~6000 + charges sociales ~3000.
  const monthlyNetWages = 6000;
  const monthlySocial = 3000;

  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    const id = await createLedgerEntry({
      date: `2025-${mm}-28`,
      label: `Paie ${mm}/2025`,
      journalCode: "PA",
      journals,
      lines: [
        { accountId: accounts["641001"]!.id, debit: monthlyNetWages, credit: 0 },
        { accountId: accounts["645001"]!.id, debit: monthlySocial, credit: 0 },
        { accountId: accounts["421001"]!.id, debit: 0, credit: monthlyNetWages },
        { accountId: accounts["431001"]!.id, debit: 0, credit: monthlySocial },
      ],
    });
    if (id) count++;
  }
  console.log(`  ${count}/12 paies créées`);
  return count;
}

// ─── Loyer mensuel (12 mois) ───────────────────────────────────────────────

async function seedRent(
  accounts: Record<string, Account>,
  journals: Map<string, number>,
  suppliers: Supplier[]
): Promise<number> {
  console.log("\n=== Loyer 2025 (mensuel) ===");
  const renter = suppliers.find((s) => s.name.startsWith("Loueur")) ?? suppliers[3]!;
  let count = 0;
  const monthlyRent = 1800;
  const tva = monthlyRent * 0.2;
  const ttc = monthlyRent + tva;

  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    const id = await createLedgerEntry({
      date: `2025-${mm}-01`,
      label: `Loyer bureaux ${mm}/2025`,
      journalCode: "HA",
      journals,
      lines: [
        { accountId: accounts["613001"]!.id, debit: monthlyRent, credit: 0 },
        { accountId: accounts["445661"]!.id, debit: tva, credit: 0 },
        { accountId: renter.ledgerAccountId, debit: 0, credit: ttc },
      ],
    });
    if (id) count++;
  }
  console.log(`  ${count}/12 loyers créés`);
  return count;
}

// ─── Taxes + DAP trimestrielles (8 entries) ────────────────────────────────

async function seedQuarterly(
  accounts: Record<string, Account>,
  journals: Map<string, number>
): Promise<number> {
  console.log("\n=== Taxes + DAP trimestrielles 2025 ===");
  let count = 0;

  for (const q of [1, 2, 3, 4]) {
    // Taxes (CFE / CVAE)
    const monthEnd = String(q * 3).padStart(2, "0");
    const tax = await createLedgerEntry({
      date: `2025-${monthEnd}-25`,
      label: `Taxes diverses Q${q}/2025`,
      journalCode: "OD",
      journals,
      lines: [
        { accountId: accounts["635001"]!.id, debit: 1200, credit: 0 },
        { accountId: accounts["445511"]!.id, debit: 0, credit: 1200 },
      ],
    });
    if (tax) count++;

    // DAP (matériel industriel sur 5 ans = 30000/5/4 = 1500/trimestre)
    const dap = await createLedgerEntry({
      date: `2025-${monthEnd}-28`,
      label: `DAP matériel Q${q}/2025`,
      journalCode: "OD",
      journals,
      lines: [
        { accountId: accounts["681001"]!.id, debit: 1500, credit: 0 },
        { accountId: accounts["281001"]!.id, debit: 0, credit: 1500 },
      ],
    });
    if (dap) count++;
  }

  console.log(`  ${count}/8 entries trimestrielles`);
  return count;
}

// ─── Seed 6 mois PME (Nov 2025 → Avr 2026) ─────────────────────────────────
// Génère une comptabilité PME réaliste sur 6 mois pour valider tous les KPI :
//   - À-nouveau (AN) : soldes d'ouverture (12x report à nouveau, 411 créances,
//     401 dettes, 512 banque pour équilibrer).
//   - Salaires mensuels : 641 (8000€) + 645 (3200€) + 421 (rémunérations dues).
//   - Loyer mensuel : 613 (1500€) + TVA 20%.
//   - Assurances mensuelles : 616 (300€) sans TVA.
//   - Télécom mensuel : 626 (150€) + TVA 20%.
//   - Honoraires comptable trimestriels : 622 (500€) + TVA 20%, 2 trimestres.
//   - Ventes diversifiées avec montants fluctuants sur 6 mois (3 clients existants
//     + 2 nouveaux).
//   - Avoir : facture client annulée partiellement (709).
//   - Remboursement fournisseur : écriture inversée sur 401.
//   - Amortissements mensuels : 681 (200€) + 28xx.
//   - Banque : règlements (paiement fournisseur, encaissement client) sur 6 mois.

const SIX_MONTHS: Array<{ y: number; m: number }> = [
  { y: 2025, m: 11 },
  { y: 2025, m: 12 },
  { y: 2026, m: 1 },
  { y: 2026, m: 2 },
  { y: 2026, m: 3 },
  { y: 2026, m: 4 },
];

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function createExtraCustomers(): Promise<Customer[]> {
  console.log("\n=== 2 nouveaux customers (PME 6 mois) ===");
  const seed = [
    { name: "Atelier Côté Mer", sector: "commerce", city: "La Rochelle", postal: "17000" },
    { name: "Logiciels Vauban",  sector: "tech",     city: "Lille",       postal: "59000" },
  ];
  const created: Customer[] = [];
  for (const c of seed) {
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const result = await api<any>("POST", "/company_customers", {
      name: `${c.name} ${RUN_TAG}`,
      billing_address: { address: "12 quai Vauban", postal_code: c.postal, city: c.city, country_alpha2: "FR" },
      delivery_address: { address: "12 quai Vauban", postal_code: c.postal, city: c.city, country_alpha2: "FR" },
      emails: [`pme-${RUN_TAG}@${slug}.fr`],
    });
    if (result.ok) {
      created.push({
        id: result.data.id,
        name: `${c.name} ${RUN_TAG}`,
        ledgerAccountId: result.data.ledger_account?.id,
        sector: c.sector,
      });
    } else {
      console.warn(`  [KO] Customer "${c.name}" : ${JSON.stringify(result.data).slice(0, 200)}`);
    }
  }
  logStep("Customers PME créés", created.length === seed.length, `${created.length}/${seed.length}`);
  return created;
}

async function seedSixMonths(
  accounts: Record<string, Account>,
  journals: Map<string, number>,
  customers: Customer[],
  suppliers: Supplier[]
): Promise<{ created: number; expected: number }> {
  console.log("\n=== Seed PME 6 mois (Nov 2025 → Avr 2026) ===");

  // Vérifie les comptes essentiels.
  const required = ["120001", "411", "401", "512001", "613001", "616001", "622001", "626001",
                     "641001", "645001", "421001", "681001", "281001", "709001", "445661", "44571"];
  const missing = required.filter((c) => c !== "411" && c !== "401" && !accounts[c]);
  if (missing.length > 0) {
    console.warn(`  [SKIP] Comptes manquants : ${missing.join(", ")}`);
    return { created: 0, expected: 0 };
  }
  if (customers.length < 1 || suppliers.length < 4) {
    console.warn("  [SKIP] Pas assez de customers/suppliers");
    return { created: 0, expected: 0 };
  }

  let created = 0;
  let expected = 0;

  // 1) À-nouveau (AN) — Nov 1, 2025
  // 411 client : 12000€ debit (créances ouvertes)
  // 512 banque : 18000€ debit (cash position)
  // 12x report à nouveau : 25000€ credit (capitaux)
  // 401 fournisseur : 5000€ credit (dettes)
  // Total : 30000 / 30000 ✓
  const customerForAN = customers[0]!;
  const supplierForAN = suppliers[0]!;
  expected++;
  const an = await createLedgerEntry({
    date: "2025-11-01",
    label: "À-nouveau — soldes d'ouverture exercice",
    journalCode: "OD",
    journals,
    lines: [
      { accountId: customerForAN.ledgerAccountId, debit: 12000, credit: 0 },
      { accountId: accounts["512001"]!.id,        debit: 18000, credit: 0 },
      { accountId: accounts["120001"]!.id,        debit: 0,     credit: 25000 },
      { accountId: supplierForAN.ledgerAccountId, debit: 0,     credit: 5000 },
    ],
  });
  if (an) created++;

  // 2) Salaires mensuels (6 mois)
  const monthlySalary = 8000;
  const monthlySocial = 3200;
  for (const { y, m } of SIX_MONTHS) {
    expected++;
    const id = await createLedgerEntry({
      date: fmtDate(y, m, 28),
      label: `Salaires ${String(m).padStart(2, "0")}/${y}`,
      journalCode: "PA",
      journals,
      lines: [
        { accountId: accounts["641001"]!.id, debit: monthlySalary, credit: 0 },
        { accountId: accounts["645001"]!.id, debit: monthlySocial, credit: 0 },
        { accountId: accounts["421001"]!.id, debit: 0, credit: monthlySalary },
        { accountId: accounts["431001"]!.id, debit: 0, credit: monthlySocial },
      ],
    });
    if (id) created++;
  }

  // 3) Loyer mensuel (6 mois) avec TVA 20%
  const renter = suppliers.find((s) => s.name.startsWith("Loueur")) ?? suppliers[3]!;
  const rentHt = 1500;
  const rentTva = 300;
  const rentTtc = 1800;
  for (const { y, m } of SIX_MONTHS) {
    expected++;
    const id = await createLedgerEntry({
      date: fmtDate(y, m, 1),
      label: `Loyer bureaux ${String(m).padStart(2, "0")}/${y}`,
      journalCode: "HA",
      journals,
      lines: [
        { accountId: accounts["613001"]!.id,     debit: rentHt,  credit: 0 },
        { accountId: accounts["445661"]!.id,     debit: rentTva, credit: 0 },
        { accountId: renter.ledgerAccountId,     debit: 0,       credit: rentTtc },
      ],
    });
    if (id) created++;
  }

  // 4) Assurance mensuelle (6 mois) sans TVA
  const insurer = suppliers.find((s) => s.name.startsWith("Assureur")) ?? suppliers[7]!;
  const insurance = 300;
  for (const { y, m } of SIX_MONTHS) {
    expected++;
    const id = await createLedgerEntry({
      date: fmtDate(y, m, 5),
      label: `Assurance ${String(m).padStart(2, "0")}/${y}`,
      journalCode: "HA",
      journals,
      lines: [
        { accountId: accounts["616001"]!.id,     debit: insurance, credit: 0 },
        { accountId: insurer.ledgerAccountId,    debit: 0,         credit: insurance },
      ],
    });
    if (id) created++;
  }

  // 5) Télécom mensuel (6 mois) avec TVA 20%
  const telco = suppliers.find((s) => s.name.startsWith("Telecom")) ?? suppliers[2]!;
  const telcoHt = 150;
  const telcoTva = 30;
  const telcoTtc = 180;
  for (const { y, m } of SIX_MONTHS) {
    expected++;
    const id = await createLedgerEntry({
      date: fmtDate(y, m, 7),
      label: `Télécom internet ${String(m).padStart(2, "0")}/${y}`,
      journalCode: "HA",
      journals,
      lines: [
        { accountId: accounts["626001"]!.id,     debit: telcoHt,  credit: 0 },
        { accountId: accounts["445661"]!.id,     debit: telcoTva, credit: 0 },
        { accountId: telco.ledgerAccountId,      debit: 0,        credit: telcoTtc },
      ],
    });
    if (id) created++;
  }

  // 6) Honoraires comptable trimestriels (2 trimestres : Q4-25 fin nov, Q1-26 fin mars)
  const accountantSupplier = suppliers.find((s) => s.name.startsWith("Comptable")) ?? suppliers[5]!;
  const honoHt = 500;
  const honoTva = 100;
  const honoTtc = 600;
  for (const { date, label } of [
    { date: "2025-11-30", label: "Honoraires comptable Q4 2025" },
    { date: "2026-03-31", label: "Honoraires comptable Q1 2026" },
  ]) {
    expected++;
    const id = await createLedgerEntry({
      date,
      label,
      journalCode: "HA",
      journals,
      lines: [
        { accountId: accounts["622001"]!.id,                 debit: honoHt,  credit: 0 },
        { accountId: accounts["445661"]!.id,                 debit: honoTva, credit: 0 },
        { accountId: accountantSupplier.ledgerAccountId,     debit: 0,       credit: honoTtc },
      ],
    });
    if (id) created++;
  }

  // 7) Ventes diversifiées sur 6 mois (3 clients existants + 2 nouveaux supposés
  // ajoutés en queue de `customers`). Montants HT fluctuants pour simuler une
  // saisonnalité TPE (pic décembre, creux février, redémarrage avril).
  const salesSchedule: Array<{ y: number; m: number; day: number; idx: number; ht: number; label: string }> = [
    { y: 2025, m: 11, day: 8,  idx: 0, ht: 4500,  label: "Mission audit" },
    { y: 2025, m: 11, day: 22, idx: 4, ht: 6800,  label: "Conseil stratégique" },
    { y: 2025, m: 12, day: 6,  idx: 1, ht: 9500,  label: "Pack bilan annuel" },
    { y: 2025, m: 12, day: 18, idx: 2, ht: 7200,  label: "Audit fiscal fin d'année" },
    { y: 2025, m: 12, day: 27, idx: customers.length - 1, ht: 5400,  label: "Forfait support nouveaux clients" },
    { y: 2026, m: 1,  day: 12, idx: 0, ht: 3200,  label: "Mission complémentaire" },
    { y: 2026, m: 1,  day: 25, idx: 3, ht: 4100,  label: "Diagnostic flash" },
    { y: 2026, m: 2,  day: 4,  idx: customers.length - 2, ht: 2800,  label: "Workshop équipe" },
    { y: 2026, m: 2,  day: 20, idx: 1, ht: 1850,  label: "Module API premium" },
    { y: 2026, m: 3,  day: 9,  idx: 2, ht: 5600,  label: "Audit financier annuel" },
    { y: 2026, m: 3,  day: 26, idx: 4, ht: 3900,  label: "Conseil structuration" },
    { y: 2026, m: 4,  day: 8,  idx: customers.length - 1, ht: 6200,  label: "Plan investissement" },
    { y: 2026, m: 4,  day: 22, idx: 0, ht: 7400,  label: "Mission semestrielle" },
  ];
  for (const s of salesSchedule) {
    expected++;
    const cust = customers[s.idx % customers.length]!;
    const tva = Math.round(s.ht * 0.2);
    const ttc = s.ht + tva;
    const id = await createLedgerEntry({
      date: fmtDate(s.y, s.m, s.day),
      label: `${s.label} — ${cust.name.split(" ")[0]}`,
      journalCode: "VE",
      journals,
      lines: [
        { accountId: cust.ledgerAccountId,           debit: ttc, credit: 0 },
        { accountId: accounts["706001"]!.id,         debit: 0,   credit: s.ht },
        { accountId: accounts["44571"]!.id,          debit: 0,   credit: tva },
      ],
    });
    if (id) created++;
  }

  // 8) Avoir : annulation partielle d'une facture (compte 709) — 1500€ HT remboursé
  // au client, TVA 300€, total 1800€. Le client est crédité (sortie de créance).
  expected++;
  const refundedCustomer = customers[0]!;
  const avoirHt = 1500;
  const avoirTva = 300;
  const avoirTtc = 1800;
  const avoir = await createLedgerEntry({
    date: "2026-02-15",
    label: `Avoir partiel — ${refundedCustomer.name.split(" ")[0]}`,
    journalCode: "VE",
    journals,
    lines: [
      { accountId: accounts["709001"]!.id,             debit: avoirHt,  credit: 0 },
      { accountId: accounts["44571"]!.id,              debit: avoirTva, credit: 0 },
      { accountId: refundedCustomer.ledgerAccountId,   debit: 0,        credit: avoirTtc },
    ],
  });
  if (avoir) created++;

  // 9) Remboursement fournisseur : écriture inversée sur 401. Un fournisseur
  // rembourse un trop-perçu de 600€ TTC sur la facture télécom de janvier.
  expected++;
  const refundedSupplier = telco;
  const refund = await createLedgerEntry({
    date: "2026-03-12",
    label: `Remboursement fournisseur — ${refundedSupplier.name.split(" ")[0]}`,
    journalCode: "BQ",
    journals,
    lines: [
      { accountId: accounts["512001"]!.id,            debit: 600, credit: 0 },
      { accountId: refundedSupplier.ledgerAccountId,  debit: 0,   credit: 600 },
    ],
  });
  if (refund) created++;

  // 10) Amortissements mensuels (6 mois) : 200€/mois sur le matériel.
  for (const { y, m } of SIX_MONTHS) {
    expected++;
    const id = await createLedgerEntry({
      date: fmtDate(y, m, 30 < daysInMonth(y, m) ? 30 : daysInMonth(y, m)),
      label: `DAP ${String(m).padStart(2, "0")}/${y}`,
      journalCode: "OD",
      journals,
      lines: [
        { accountId: accounts["681001"]!.id, debit: 200, credit: 0 },
        { accountId: accounts["281001"]!.id, debit: 0,   credit: 200 },
      ],
    });
    if (id) created++;
  }

  // 11) Banque (BQ) — règlements sur 6 mois : 1 encaissement client + 1 paiement
  // fournisseur par mois. Montants alignés avec les ventes/achats récents.
  for (let i = 0; i < SIX_MONTHS.length; i++) {
    const { y, m } = SIX_MONTHS[i]!;
    const cust = customers[i % customers.length]!;
    const supp = suppliers[i % suppliers.length]!;
    const encaissement = 4000 + (i * 350); // fluctue
    const paiement = 1500 + (i * 120);

    // Encaissement client : 512 ↑ / 411 ↓
    expected++;
    const enc = await createLedgerEntry({
      date: fmtDate(y, m, 12),
      label: `Encaissement ${cust.name.split(" ")[0]}`,
      journalCode: "BQ",
      journals,
      lines: [
        { accountId: accounts["512001"]!.id,    debit: encaissement, credit: 0 },
        { accountId: cust.ledgerAccountId,      debit: 0,            credit: encaissement },
      ],
    });
    if (enc) created++;

    // Paiement fournisseur : 401 ↓ / 512 ↓
    expected++;
    const pay = await createLedgerEntry({
      date: fmtDate(y, m, 25),
      label: `Paiement ${supp.name.split(" ")[0]}`,
      journalCode: "BQ",
      journals,
      lines: [
        { accountId: supp.ledgerAccountId,      debit: paiement, credit: 0 },
        { accountId: accounts["512001"]!.id,    debit: 0,        credit: paiement },
      ],
    });
    if (pay) created++;
  }

  console.log(`  ${created}/${expected} écritures PME 6 mois créées`);
  return { created, expected };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ─── Customer invoices (4 drafts pour visu) ────────────────────────────────

async function seedCustomerInvoices(customers: Customer[], products: Product[]): Promise<number> {
  console.log("\n=== Customer invoices (drafts) ===");
  if (customers.length < 3 || products.length < 3) return 0;
  const drafts = [
    { customer: customers[0]!, product: products[0]!, qty: "2", date: "2025-06-15", deadline: "2025-07-14" },
    { customer: customers[1]!, product: products[4]!, qty: "1", date: "2025-09-10", deadline: "2025-10-10" },
    { customer: customers[2]!, product: products[8]!, qty: "3", date: "2025-11-05", deadline: "2025-12-05" },
    { customer: customers[3]!, product: products[5]!, qty: "5", date: "2026-01-15", deadline: "2026-02-15" },
  ];
  let count = 0;
  for (const inv of drafts) {
    const result = await api<any>("POST", "/customer_invoices", {
      draft: true,
      customer_id: inv.customer.id,
      date: inv.date,
      deadline: inv.deadline,
      invoice_lines: [{ product_id: inv.product.id, quantity: inv.qty }],
    });
    if (result.ok) count++;
  }
  console.log(`  ${count}/4 drafts créés`);
  return count;
}

// ─── Main ──────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Seed enrichi Pennylane sandbox — RUN_TAG=${RUN_TAG}\n`);

  const me = await api("GET", "/me");
  if (!me.ok) {
    console.error("Auth KO. Vérifier PENNYLANE_TEST_TOKEN.");
    process.exit(2);
  }
  console.log(`[OK] Auth ${(me.data as any).company?.name}`);

  const accounts = await ensureChartOfAccounts();
  const journals = await getJournals();
  console.log(`  Journals : ${[...journals.keys()].sort().join(", ")}`);

  const baseCustomers = await createCustomers();
  const extraCustomers = await createExtraCustomers();
  const customers = [...baseCustomers, ...extraCustomers];
  const suppliers = await createSuppliers();
  const products = await createProducts();

  const setup = await seedSetup(accounts, journals, suppliers);
  const sales = await seedSales(accounts, journals, customers, products);
  const purchases = await seedPurchases(accounts, journals, suppliers);
  const payroll = await seedPayroll(accounts, journals);
  const rent = await seedRent(accounts, journals, suppliers);
  const quarterly = await seedQuarterly(accounts, journals);
  const sixMonths = await seedSixMonths(accounts, journals, customers, suppliers);
  const drafts = await seedCustomerInvoices(customers, products);

  const totalLedger =
    setup + sales + purchases + payroll + rent + quarterly + sixMonths.created;

  console.log("\n=== Résumé ===");
  console.log(`  Customers              : ${customers.length}/12 (10 base + 2 PME)`);
  console.log(`  Suppliers              : ${suppliers.length}/8`);
  console.log(`  Products               : ${products.length}/12`);
  console.log(`  Customer invoices      : ${drafts}/4 (drafts)`);
  console.log(`  Ledger entries :`);
  console.log(`    Setup                : ${setup}/4`);
  console.log(`    Ventes 2025          : ${sales} (~25 attendues)`);
  console.log(`    Achats 2025          : ${purchases}/24`);
  console.log(`    Paies 2025           : ${payroll}/12`);
  console.log(`    Loyers 2025          : ${rent}/12`);
  console.log(`    Taxes + DAP 2025     : ${quarterly}/8`);
  console.log(`    PME 6 mois           : ${sixMonths.created}/${sixMonths.expected}`);
  console.log(`  TOTAL ledger           : ${totalLedger} écritures`);
})();
