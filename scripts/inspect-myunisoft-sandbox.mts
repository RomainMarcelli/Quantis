// File: scripts/inspect-myunisoft-sandbox.mts
// Role: diagnostique BRUT du contenu du dossier sandbox MyUnisoft, sans
// passer par les mappers Vyzor. Permet de répondre en 1 run à la question
// "le dossier contient-il des données P&L exploitables ?" avant d'aller
// suspecter notre code de mapping.
//
// Usage :
//   npx tsx --env-file=.env scripts/inspect-myunisoft-sandbox.mts
//
// Sortie : tableau par classe PCG + totaux CA/charges/EBE bruts +
// verdict en 1 ligne ("sandbox vide" vs "bug mappers Vyzor").

const SECRET = process.env.MYUNISOFT_THIRD_PARTY_SECRET?.trim();
const JWT = process.env.MYUNISOFT_TEST_JWT?.trim();
const BASE =
  process.env.MYUNISOFT_API_BASE_URL?.trim() ||
  "https://api.myunisoft.fr/api/v1";

if (!SECRET) {
  console.error("❌ MYUNISOFT_THIRD_PARTY_SECRET manquant.");
  process.exit(1);
}
if (!JWT) {
  console.error("❌ MYUNISOFT_TEST_JWT manquant.");
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

async function call<T>(endpoint: string, query: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${endpoint}`);
  if (!query.version) query.version = "1.0.0";
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const response = await fetch(url.toString(), {
    headers: {
      "X-Third-Party-Secret": SECRET as string,
      Authorization: `Bearer ${JWT}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${endpoint} → ${response.status}: ${body.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

type Exercice = {
  producerId: string;
  name: string;
  period: { start: string; end: string };
  state: string;
};

type Account = {
  producerId: string;
  number: string;
  name: string;
  closed?: boolean;
};

type Movement = {
  account: { number: string; name?: string };
  value: { credit: number; debit: number; amount?: number };
};

type Entry = {
  producerId: string;
  date: string;
  movements: Movement[];
};

function classOf(accountNumber: string): string {
  return accountNumber.charAt(0) || "?";
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

(async () => {
  console.log(`${ANSI.bold}▶ Inspection sandbox MyUnisoft${ANSI.reset} — base ${BASE}\n`);

  // ─── 1. Exercices ──────────────────────────────────────────────────────
  const exercices = await call<Exercice[]>("/mad/exercices");
  console.log(`${ANSI.bold}1. Exercices disponibles${ANSI.reset} (${exercices.length})`);
  for (const ex of exercices) {
    console.log(
      `   · ${ANSI.cyan}${ex.name}${ANSI.reset} (${ex.period.start} → ${ex.period.end}) · ${ex.state} · id=${ex.producerId}`
    );
  }

  // Cible : exercice "N" (le plus récent ouvert) — celui qui a le plus de
  // chances de contenir des données représentatives.
  const target =
    exercices.find((e) => e.state === "open" && new Date(e.period.start).getFullYear() <= new Date().getFullYear())
      ?? exercices[0];
  if (!target) {
    console.log(`${ANSI.red}Aucun exercice retourné — abandon.${ANSI.reset}`);
    process.exit(1);
  }
  console.log(
    `\n${ANSI.bold}→ Exercice cible :${ANSI.reset} ${ANSI.cyan}${target.name}${ANSI.reset} (${target.period.start} → ${target.period.end})\n`
  );

  // ─── 2. Plan comptable par classe ──────────────────────────────────────
  const accounts = await call<Account[]>("/mad/accounts");
  const accountsByClass = new Map<string, Account[]>();
  for (const acc of accounts) {
    const cls = classOf(acc.number);
    if (!accountsByClass.has(cls)) accountsByClass.set(cls, []);
    accountsByClass.get(cls)!.push(acc);
  }

  console.log(`${ANSI.bold}2. Plan comptable par classe${ANSI.reset} (total ${accounts.length})`);
  console.log(`   ${"classe".padEnd(8)}${"comptes".padStart(10)}  exemples`);
  console.log(`   ${ANSI.dim}${"─".repeat(70)}${ANSI.reset}`);
  for (const cls of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
    const items = accountsByClass.get(cls) ?? [];
    const examples = items
      .slice(0, 3)
      .map((a) => `${a.number} ${a.name.slice(0, 20)}`)
      .join(", ");
    console.log(
      `   ${cls.padEnd(8)}${String(items.length).padStart(10)}  ${ANSI.dim}${examples}${ANSI.reset}`
    );
  }

  // ─── 3. Écritures de l'exercice cible ──────────────────────────────────
  const entries = await call<Entry[]>("/mad/entries", {
    startDate: target.period.start,
    endDate: target.period.end,
  });
  console.log(
    `\n${ANSI.bold}3. Écritures sur ${target.name}${ANSI.reset} : ${entries.length} écriture(s)`
  );

  // Compter les mouvements par classe + sommer credit/debit
  type ClassStats = { count: number; totalDebit: number; totalCredit: number };
  const movementsByClass = new Map<string, ClassStats>();
  let totalMovements = 0;
  for (const entry of entries) {
    if (!Array.isArray(entry.movements)) continue;
    for (const mvt of entry.movements) {
      const num = String(mvt.account?.number ?? "");
      if (!num) continue;
      totalMovements++;
      const cls = classOf(num);
      const stats = movementsByClass.get(cls) ?? { count: 0, totalDebit: 0, totalCredit: 0 };
      stats.count++;
      stats.totalDebit += Number(mvt.value?.debit ?? 0);
      stats.totalCredit += Number(mvt.value?.credit ?? 0);
      movementsByClass.set(cls, stats);
    }
  }

  console.log(
    `\n   ${"classe".padEnd(8)}${"mouvements".padStart(12)}${"débits".padStart(20)}${"crédits".padStart(20)}`
  );
  console.log(`   ${ANSI.dim}${"─".repeat(70)}${ANSI.reset}`);
  for (const cls of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
    const s = movementsByClass.get(cls) ?? { count: 0, totalDebit: 0, totalCredit: 0 };
    console.log(
      `   ${cls.padEnd(8)}${String(s.count).padStart(12)}${fmtAmount(s.totalDebit).padStart(20)}${fmtAmount(s.totalCredit).padStart(20)}`
    );
  }
  console.log(`   ${ANSI.dim}total mouvements : ${totalMovements}${ANSI.reset}`);

  // ─── 4. CA brut + charges d'exploitation brutes + EBE brut ────────────
  // Logique brute, sans mapping Vyzor :
  //  - CA brut = somme des crédits sur classe 7 (produits)
  //  - Charges d'exploitation = somme débits sur 60..64 (achats + ext + impôts + perso)
  //  - EBE brut ≈ CA - charges (approximation rapide ; ignore subv/autres prod/charges)
  let revenueRaw = 0;
  let chargesExploitRaw = 0;
  let cashMovementsDebit = 0;
  let cashMovementsCredit = 0;
  const accountPrefixHits = new Map<string, number>();

  for (const entry of entries) {
    if (!Array.isArray(entry.movements)) continue;
    for (const mvt of entry.movements) {
      const num = String(mvt.account?.number ?? "");
      const credit = Number(mvt.value?.credit ?? 0);
      const debit = Number(mvt.value?.debit ?? 0);
      const prefix3 = num.slice(0, 3);
      accountPrefixHits.set(prefix3, (accountPrefixHits.get(prefix3) ?? 0) + 1);

      if (num.startsWith("70") || num.startsWith("71") || num.startsWith("72") || num.startsWith("74")) {
        // Produits d'exploitation (CA + production stockée/immo + subventions)
        revenueRaw += credit - debit;
      }
      if (
        num.startsWith("60") ||
        num.startsWith("61") ||
        num.startsWith("62") ||
        num.startsWith("63") ||
        num.startsWith("64")
      ) {
        chargesExploitRaw += debit - credit;
      }
      if (num.startsWith("5")) {
        // Trésorerie (banques, caisse)
        cashMovementsDebit += debit;
        cashMovementsCredit += credit;
      }
    }
  }

  const ebeRaw = revenueRaw - chargesExploitRaw;

  console.log(`\n${ANSI.bold}4. Calculs P&L bruts (sans mappers Vyzor)${ANSI.reset}`);
  console.log(`   CA brut (Σ crédits 70/71/72/74)         : ${ANSI.cyan}${fmtAmount(revenueRaw)}${ANSI.reset}`);
  console.log(`   Charges expl. brutes (Σ débits 60-64)   : ${ANSI.cyan}${fmtAmount(chargesExploitRaw)}${ANSI.reset}`);
  console.log(`   EBE brut approximatif                    : ${ANSI.cyan}${fmtAmount(ebeRaw)}${ANSI.reset}`);

  console.log(`\n${ANSI.bold}5. Mouvements de trésorerie (classe 5)${ANSI.reset}`);
  console.log(`   Σ débits  classe 5 : ${fmtAmount(cashMovementsDebit)}`);
  console.log(`   Σ crédits classe 5 : ${fmtAmount(cashMovementsCredit)}`);
  console.log(`   Solde net (D − C)  : ${fmtAmount(cashMovementsDebit - cashMovementsCredit)} ${ANSI.dim}(approx, sans à-nouveau)${ANSI.reset}`);

  // Top 10 préfixes les plus fréquents — utile pour repérer les comptes
  // dominants (ex. cabinet test qui ne ferait QUE des paiements).
  const topPrefixes = [...accountPrefixHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`\n${ANSI.bold}6. Top 10 préfixes de compte (3 chiffres) par fréquence${ANSI.reset}`);
  for (const [prefix, count] of topPrefixes) {
    console.log(`   ${prefix.padEnd(6)} ${String(count).padStart(8)} mouvement(s)`);
  }

  // ─── Verdict ───────────────────────────────────────────────────────────
  console.log(`\n${ANSI.bold}════════ VERDICT ════════${ANSI.reset}`);
  const hasRevenue = revenueRaw > 1;
  const hasCharges = chargesExploitRaw > 1;
  if (!hasRevenue && !hasCharges) {
    console.log(
      `${ANSI.red}🟥 SANDBOX VIDE${ANSI.reset} — aucun mouvement significatif sur 7x ni 6x. Les KPIs CA/EBE NE PEUVENT PAS être calculés depuis cette donnée. Demander à MyUnisoft un dossier sandbox avec données représentatives.`
    );
  } else if (hasRevenue && hasCharges) {
    console.log(
      `${ANSI.yellow}🟧 BUG MAPPERS VYZOR${ANSI.reset} — la sandbox contient des produits ET des charges (CA brut=${fmtAmount(revenueRaw)}, charges=${fmtAmount(chargesExploitRaw)}). Si Vyzor affiche "Données insuffisantes", investiguer aggregateEntriesToParsedFinancialData → parsedFinancialDataBridge → computeKpis.`
    );
  } else if (hasRevenue) {
    console.log(
      `${ANSI.yellow}🟧 SANDBOX PARTIELLE${ANSI.reset} — produits présents (${fmtAmount(revenueRaw)}) mais aucune charge d'exploitation. CA devrait s'afficher, EBE sera ≈ CA. Si Vyzor n'affiche rien, bug mappers ou seuil de validation côté front.`
    );
  } else {
    console.log(
      `${ANSI.yellow}🟧 SANDBOX PARTIELLE${ANSI.reset} — charges présentes (${fmtAmount(chargesExploitRaw)}) mais aucun produit. CA introuvable.`
    );
  }
})().catch((err) => {
  console.error(`\n${ANSI.red}❌ Échec :${ANSI.reset}`, err instanceof Error ? err.message : err);
  process.exit(1);
});
