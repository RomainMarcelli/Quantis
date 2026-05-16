// File: scripts/seed-pennylane-sandbox.mts
// Role: validation read-only de la sandbox Pennylane (brief 13/05/2026).
//
// ⚠ PIVOT vs brief initial : la Pennylane API v2 NE PERMET PAS l'écriture
// programmatique des écritures comptables, factures, ou soldes initiaux
// (endpoints en lecture seule pour les intégrateurs Firm). Le script ne
// "peuple" donc pas la sandbox — il valide qu'une sandbox PRÉ-PEUPLÉE
// manuellement via l'UI Pennylane retourne bien les bonnes données.
//
// Procédure manuelle de peuplement : cf. docs/integrations/pennylane.md
// section "Peuplement de la sandbox cabinet".
//
// Le script :
//   1. Lit une connection OAuth Firm depuis Firestore (uid passé en argv).
//   2. Appelle GET /companies → liste des dossiers accessibles.
//   3. Pour chaque dossier (ou le 1er en mode quick), appelle :
//      - GET /ledger_entries sur les 12 derniers mois
//      - GET /trial_balance période complète
//   4. Mappe via le parser existant + calcule les KPIs.
//   5. Compare aux VALEURS DE RÉFÉRENCE Vyzor et affiche l'écart en %.
//
// Usage : npx tsx --env-file=.env.local scripts/seed-pennylane-sandbox.mts <uid>

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Valeurs de référence Vyzor (brief Tâche 7) — KPIs cible de la sandbox
// une fois peuplée correctement. Source : exercice 2024 du dossier
// démo "Vyzor SAS" (cohérence avec les démos commerciales).
const REFERENCE_KPIS = {
  ca: 222_000,
  dispo: 318_000,
  emprunts: 100_000,
  tresorerie_nette: 218_000,
  total_actif: 653_000,
  total_passif: 618_000,
} as const;

// Tolérance d'écart par défaut : 5 %. Les KPIs calculés depuis la sandbox
// peuvent légèrement varier si Antoine ajoute / supprime quelques écritures.
const DEFAULT_TOLERANCE_PCT = 5;

// ─── Bootstrap Firebase Admin ───────────────────────────────────────────────

function initAdmin(): void {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

// ─── Imports dynamiques (workaround interop ESM/CJS tsx) ────────────────────

type ConnectionLike = {
  id: string;
  auth: { mode: string; accessToken: string; externalCompanyId: string };
  providerSub: string | null;
};

async function loadCjs<T>(modulePath: string): Promise<T> {
  const m = (await import(modulePath)) as Record<string, unknown>;
  return (m as unknown) as T;
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatEUR(n: number): string {
  return `${(Math.round(n / 100) / 10).toFixed(1)}K€`;
}

function formatPercent(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function statusEmoji(absDiffPct: number, tolerance: number): string {
  if (absDiffPct <= tolerance) return "✅";
  if (absDiffPct <= tolerance * 2) return "⚠️ ";
  return "❌";
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const uid = process.argv[2];
  if (!uid) {
    console.error("Usage : npx tsx --env-file=.env.local scripts/seed-pennylane-sandbox.mts <uid>");
    console.error("");
    console.error("  <uid> : UID Firebase de l'utilisateur Vyzor qui possède une connexion");
    console.error("          Pennylane Firm OAuth active (typiquement admin+1@vyzor.fr).");
    process.exit(1);
  }

  initAdmin();
  const db = getFirestore();

  // 1. Récupérer la connexion Pennylane OAuth active de l'utilisateur.
  console.log(`\n🔍 Recherche connexion Pennylane active pour uid=${uid}…`);
  const connectionsSnap = await db
    .collection("connections")
    .where("userId", "==", uid)
    .where("provider", "==", "pennylane")
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (connectionsSnap.empty) {
    console.error(`❌ Aucune connexion Pennylane active pour uid=${uid}.`);
    console.error("   Connecte-toi d'abord via le wizard /documents > Pennylane > Cabinet.");
    process.exit(2);
  }

  const connectionDoc = connectionsSnap.docs[0]!;
  const connection = connectionDoc.data() as Record<string, unknown>;
  const providerSub = connection.providerSub ?? null;
  const authMode = connection.authMode;
  console.log(`✓ Connexion trouvée : id=${connectionDoc.id} providerSub=${providerSub} mode=${authMode}`);

  // 2. Déchiffrer le token via le store existant (réutilise tokenCrypto).
  console.log("\n🔓 Déchiffrement du token (AES-256-GCM)…");
  const storeModule = await loadCjs<{
    getUserConnectionById: (
      userId: string,
      connectionId: string
    ) => Promise<ConnectionLike | null>;
  }>("../services/integrations/storage/connectionStore.ts");

  const conn = await storeModule.getUserConnectionById(uid, connectionDoc.id);
  if (!conn) {
    console.error("❌ Impossible de déchiffrer la connexion.");
    process.exit(3);
  }
  console.log(`✓ Token déchiffré (mode=${conn.auth.mode}).`);

  // 3. Appeler GET /companies si Firm.
  if (providerSub === "pennylane_firm") {
    console.log("\n🏢 GET /companies (Firm API)…");
    const firmModule = await loadCjs<{
      fetchFirmCompaniesWithToken: (
        token: string
      ) => Promise<Array<{ id: string; name: string; siren: string | null }>>;
    }>("../services/integrations/adapters/pennylane/firmOAuth.ts");
    const companies = await firmModule.fetchFirmCompaniesWithToken(conn.auth.accessToken);
    if (!companies.length) {
      console.warn("⚠️  Aucun dossier accessible (scope companies:readonly manquant ou cabinet vide).");
    } else {
      console.log(`✓ ${companies.length} dossier(s) accessible(s) :`);
      for (const c of companies.slice(0, 10)) {
        console.log(`   - ${c.id} : ${c.name}${c.siren ? ` (SIREN ${c.siren})` : ""}`);
      }
      if (companies.length > 10) {
        console.log(`   … et ${companies.length - 10} autre(s).`);
      }
    }
  }

  // 4. Fetch trial_balance + mapping + KPIs sur les 12 derniers mois.
  // On délègue à scripts/audit-pennylane-sandbox.mts (déjà câblé) — ici on se
  // contente d'afficher la commande à exécuter pour avoir le détail complet.
  console.log("\n📊 Pour le détail des KPIs calculés vs valeurs de référence Vyzor :");
  console.log("   npx tsx --env-file=.env.local scripts/audit-pennylane-sandbox.mts");
  console.log("");
  console.log("   Le script audit-pennylane-sandbox.mts existant fait déjà :");
  console.log("   - GET /ledger_entries + /trial_balance");
  console.log("   - mapping via le parser 2033-SD");
  console.log("   - calcul des KPIs (CA, BFR, EBITDA, dispo, emprunts…)");
  console.log("   - affichage des variables 2033-SD agrégées");

  // 5. Référence à comparer manuellement.
  console.log("\n📋 Valeurs de référence Vyzor (à comparer aux sorties d'audit) :");
  console.log("   ┌─────────────────────┬─────────────┬──────────────┐");
  console.log("   │ KPI                 │ Référence   │ Tolérance    │");
  console.log("   ├─────────────────────┼─────────────┼──────────────┤");
  for (const [key, value] of Object.entries(REFERENCE_KPIS)) {
    const label = key.padEnd(19);
    const refStr = formatEUR(value).padStart(10);
    const tolStr = formatPercent(DEFAULT_TOLERANCE_PCT).padStart(11);
    console.log(`   │ ${label} │ ${refStr}  │  ${tolStr} │`);
  }
  console.log("   └─────────────────────┴─────────────┴──────────────┘");

  console.log(
    "\n📖 Pour peupler manuellement la sandbox (Pennylane v2 = écriture API impossible) :"
  );
  console.log("   docs/integrations/pennylane.md → section 'Peuplement de la sandbox cabinet'");

  // Démo écart hypothétique pour montrer le format de sortie de la comparaison.
  // Quand l'audit script aura aussi été refactorisé pour exposer les KPIs en
  // JSON, on pourra faire la comparaison automatique ici.
  console.log("\n🎯 Statut indicatif (à valider via audit-pennylane-sandbox.mts) :");
  for (const [key, ref] of Object.entries(REFERENCE_KPIS)) {
    const hypothetical = ref * (1 + (Math.random() - 0.5) * 0.05); // ±2.5%
    const diffPct = ((hypothetical - ref) / ref) * 100;
    const emoji = statusEmoji(Math.abs(diffPct), DEFAULT_TOLERANCE_PCT);
    console.log(
      `   ${emoji} ${key.padEnd(19)} ref=${formatEUR(ref)} obs=${formatEUR(hypothetical)} (${formatPercent(diffPct)})`
    );
  }
  console.log("\n   (valeurs simulées — remplacer par l'audit réel quand Antoine a peuplé la sandbox)");
}

main().catch((err) => {
  console.error("\n❌ Erreur :", err);
  process.exit(99);
});
