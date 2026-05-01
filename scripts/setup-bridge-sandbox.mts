// Script interactif : alimente la sandbox Bridge avec un utilisateur de test
// connecté à la "Demo Bank" Bridge, puis affiche les comptes + transactions
// récupérés.
//
// Pourquoi un script et pas un seed automatique : la connexion banque côté
// Bridge passe par un flux interactif avec SCA simulée (l'opérateur ouvre
// l'URL retournée par /connect-sessions dans son navigateur, choisit la
// Demo Bank, valide). C'est intentionnel chez Bridge — pas de bypass headless.
//
// Usage :
//   npx tsx scripts/setup-bridge-sandbox.mts [--email=demo@vyzor.fr]
//
// Pré-requis :
//   - BRIDGE_CLIENT_ID et BRIDGE_CLIENT_SECRET dans .env (cf. .env.example)

import {
  buildBridgeClientFromEnv,
  createBridgeUser,
  authenticateBridgeUser,
  createBridgeConnectSession,
  fetchBridgeAccounts,
  fetchBridgeTransactions,
  type BridgeRawAccount,
  type BridgeRawTransaction,
} from "../services/integrations/adapters/bridge/index";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60_000;

function parseArgs(): { email: string } {
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith("--email="));
  const email = emailArg ? emailArg.split("=")[1] : `demo+${Date.now()}@vyzor.fr`;
  if (!email) throw new Error("Email vide.");
  return { email };
}

async function waitForUserInput(prompt: string): Promise<void> {
  process.stdout.write(`\n${prompt}\nAppuie sur Entrée quand c'est fait... `);
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}

async function pollAccounts(
  client: ReturnType<typeof buildBridgeClientFromEnv>,
  timeoutMs: number
): Promise<BridgeRawAccount[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const accounts = await fetchBridgeAccounts(client);
      if (accounts.length > 0) return accounts;
    } catch (err) {
      // 401 transitoire ou rate limit → on retente jusqu'au timeout
      console.log(`[poll] erreur transitoire : ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timeout — aucun compte détecté après 60 s. La connexion Demo Bank a-t-elle bien été validée ?");
}

function fmtMoney(amount: number, currency = "EUR"): string {
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function summarizeAccounts(accounts: BridgeRawAccount[]): void {
  console.log(`\n📊 ${accounts.length} compte(s) récupéré(s) :`);
  for (const a of accounts) {
    console.log(
      `  • [${a.id}] ${a.name} — type=${a.type} — solde=${fmtMoney(a.balance, a.currency_code)} — banque=${a.provider?.name ?? "?"}${a.iban ? ` — IBAN=${a.iban}` : ""}`
    );
  }
}

function summarizeTransactions(transactions: BridgeRawTransaction[]): void {
  console.log(`\n💳 ${transactions.length} transaction(s) récupérée(s). Aperçu des 20 premières :\n`);
  const head = transactions.slice(0, 20);
  for (const tx of head) {
    const sign = tx.amount >= 0 ? "+" : "";
    console.log(
      `  ${tx.date}  ${sign}${tx.amount.toFixed(2).padStart(10)}€  [${tx.operation_type ?? "?"}/${tx.category_id}]  ${tx.clean_description ?? tx.provider_description ?? ""}`
    );
  }
  if (transactions.length > 20) {
    console.log(`  ... + ${transactions.length - 20} autres`);
  }
}

function summarizeAll(
  accounts: BridgeRawAccount[],
  transactions: BridgeRawTransaction[]
): void {
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const dates = transactions.map((t) => t.date).sort();
  const minDate = dates[0] ?? "-";
  const maxDate = dates[dates.length - 1] ?? "-";
  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`Résumé sandbox Bridge`);
  console.log(`──────────────────────────────────────────────────────────`);
  console.log(`  Comptes        : ${accounts.length}`);
  console.log(`  Transactions   : ${transactions.length}`);
  console.log(`  Solde total    : ${fmtMoney(totalBalance)}`);
  console.log(`  Période tx     : ${minDate} → ${maxDate}`);
  console.log(`──────────────────────────────────────────────────────────`);
}

async function main() {
  const { email } = parseArgs();
  console.log(`🔧 Setup sandbox Bridge pour : ${email}\n`);

  // Charge .env.local / .env si dispo (Next.js convention).
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: ".env.local" });
    dotenv.config({ path: ".env" });
  } catch {
    // dotenv pas dispo — l'env doit être chargé en amont.
  }

  const appClient = buildBridgeClientFromEnv();

  // ─── 1. Création de l'utilisateur Bridge (idempotent côté API)
  console.log("➡️  Création / récupération utilisateur Bridge...");
  try {
    const user = await createBridgeUser(appClient, email);
    console.log(`   ✓ utilisateur uuid=${user.uuid}`);
  } catch (err) {
    // 409 si déjà existant — on continue avec authenticate.
    console.log(`   utilisateur déjà existant (ou erreur) : ${err instanceof Error ? err.message : err}`);
  }

  // ─── 2. Récupération du token utilisateur
  console.log("\n➡️  Authentification utilisateur...");
  const userToken = await authenticateBridgeUser(appClient, email);
  console.log(`   ✓ access_token reçu (expiry=${userToken.expires_at ?? "?"})`);

  // Client utilisateur pour les requêtes /accounts /transactions
  const userClient = buildBridgeClientFromEnv(userToken.access_token);

  // ─── 3. Création de la session Connect
  console.log("\n➡️  Création de la session Connect...");
  const session = await createBridgeConnectSession(appClient, {
    userEmail: email,
    redirectUrl: "https://localhost:3000/integrations/bridge/callback",
  });
  console.log(`   ✓ session id=${session.id}`);
  console.log(`\n🌐 Ouvre cette URL dans ton navigateur pour connecter la Demo Bank :\n`);
  console.log(`   ${session.url}\n`);
  console.log(`   1. Choisis "Demo Bank" dans la liste`);
  console.log(`   2. Connecte-toi avec n'importe quels identifiants (sandbox)`);
  console.log(`   3. Valide la SCA simulée`);

  await waitForUserInput("Connexion Demo Bank validée ?");

  // ─── 4. Polling /accounts jusqu'à apparition des comptes
  console.log(`\n⏳ Polling /accounts (timeout ${POLL_TIMEOUT_MS / 1000}s)...`);
  const accounts = await pollAccounts(userClient, POLL_TIMEOUT_MS);
  summarizeAccounts(accounts);

  // ─── 5. Récupération des transactions
  console.log(`\n➡️  Récupération des transactions (toutes pages)...`);
  const transactions = await fetchBridgeTransactions(userClient, { maxPages: 20 });
  summarizeTransactions(transactions);

  // ─── 6. Résumé global
  summarizeAll(accounts, transactions);
}

main().catch((err) => {
  console.error("\n❌ Erreur :", err);
  process.exit(1);
});
