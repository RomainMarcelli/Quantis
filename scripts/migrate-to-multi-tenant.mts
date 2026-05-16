// File: scripts/migrate-to-multi-tenant.mts
// Role: migre la base Firestore vers le modèle multi-tenant Sprint A.
//
// Périmètre (cf. docs/audit-sprint-A.md) :
//   1. Pour chaque User : crée une Company (1 par user, mode dirigeant
//      MVP). Source déduite de la connection active.
//   2. Ajoute `companyId` à chaque AnalysisRecord, ConnectionRecord, et
//      aux entités comptables (accounting_entries, invoices, journals,
//      ledger_accounts, contacts, bank_accounts, bank_transactions).
//   3. Pour `banking_summaries/{userId}` : ajoute le champ `companyId`
//      sans renommer le doc ID (cf. audit, point 9 banking_summaries).
//
// Garanties :
//   - **Idempotent** : si une Company existe déjà pour un user, on la
//     réutilise. Si un doc a déjà un `companyId`, on ne touche pas.
//   - **Dry-run** : flag `--dry-run` affiche les actions sans écrire en
//     base. Toujours lancer en dry-run AVANT exécution prod.
//   - **Logging détaillé** : compteurs par étape + erreurs explicites.
//
// Usage :
//   npx tsx --env-file=.env.local scripts/migrate-to-multi-tenant.mts --dry-run
//   npx tsx --env-file=.env.local scripts/migrate-to-multi-tenant.mts        # exécution réelle
//
// PRÉ-REQUIS : backup Firestore via PITR activé (cf. audit-sprint-A.md).

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

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

// ─── Types locaux (évite l'import des modules Next.js dans un script tsx) ───

type CompanySource =
  | "manual"
  | "pennylane_manual"
  | "pennylane_oauth"
  | "myu"
  | "fec"
  | "bridge";

type MigrationStats = {
  usersScanned: number;
  companiesCreated: number;
  companiesReused: number;
  analysesUpdated: number;
  analysesSkipped: number;
  connectionsUpdated: number;
  connectionsSkipped: number;
  entitiesUpdated: Record<string, number>;
  entitiesSkipped: Record<string, number>;
  bankingSummariesUpdated: number;
  bankingSummariesSkipped: number;
  errors: string[];
};

const ENTITY_COLLECTIONS = [
  "accounting_entries",
  "invoices",
  "journals",
  "ledger_accounts",
  "contacts",
  "bank_accounts",
  "bank_transactions",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(msg);
}

function logSection(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

/**
 * Déduit la source d'une Company depuis les connections actives du user.
 * Si plusieurs connections actives, on prend la plus récente par lastSyncAt.
 * Si aucune connection active, "manual" par défaut.
 */
function deduceSource(
  connections: FirebaseFirestore.QueryDocumentSnapshot[]
): { source: CompanySource; externalCompanyId?: string } {
  const active = connections
    .map((doc) => doc.data())
    .filter((c) => c.status === "active");

  if (active.length === 0) {
    return { source: "manual" };
  }

  // Sort by lastSyncAt desc (most recent first). Les docs sans
  // lastSyncAt vont en queue (string vide < ISO date).
  active.sort((a, b) => String(b.lastSyncAt ?? "").localeCompare(String(a.lastSyncAt ?? "")));
  const primary = active[0]!;
  const provider = primary.provider as string;
  const authMode = primary.authMode as string | undefined;
  const externalCompanyId = primary.externalCompanyId as string | undefined;

  let source: CompanySource;
  if (provider === "pennylane") {
    source = authMode === "oauth2" ? "pennylane_oauth" : "pennylane_manual";
  } else if (provider === "myunisoft") {
    source = "myu";
  } else if (provider === "bridge") {
    source = "bridge";
  } else {
    source = "manual";
  }

  return {
    source,
    externalCompanyId: externalCompanyId && externalCompanyId.trim() ? externalCompanyId : undefined,
  };
}

// ─── Étape 1 : User → Company ───────────────────────────────────────────────

async function migrateUsersToCompanies(
  db: FirebaseFirestore.Firestore,
  dryRun: boolean,
  stats: MigrationStats
): Promise<Map<string, string>> {
  logSection("ÉTAPE 1 — Users → Companies");

  // Map userId → companyId pour les étapes suivantes.
  const userToCompany = new Map<string, string>();

  const usersSnap = await db.collection("users").get();
  stats.usersScanned = usersSnap.size;
  log(`  Users à traiter : ${usersSnap.size}`);

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const user = userDoc.data();

    // Idempotence : si une Company existe déjà pour ce user, on la réutilise.
    const existingCompanies = await db
      .collection("companies")
      .where("ownerUserId", "==", userId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!existingCompanies.empty) {
      const companyId = existingCompanies.docs[0]!.id;
      userToCompany.set(userId, companyId);
      stats.companiesReused += 1;
      log(`  [skip] User ${userId} → Company ${companyId} déjà existante`);
      continue;
    }

    // Liste les connections actives pour déduire la source.
    const userConnections = await db
      .collection("connections")
      .where("userId", "==", userId)
      .get();

    const { source, externalCompanyId } = deduceSource(userConnections.docs);

    const companyName = String(user.companyName ?? "").trim() || "Mon entreprise";
    const siren = String(user.siren ?? "").trim() || undefined;

    // createdAt : on essaie de récupérer celui du User pour préserver la
    // chronologie historique. Si absent (format string Firestore), on
    // fallback sur Timestamp.now().
    let createdAt: Timestamp = Timestamp.now();
    if (user.createdAt) {
      try {
        const date = new Date(String(user.createdAt));
        if (!Number.isNaN(date.getTime())) {
          createdAt = Timestamp.fromDate(date);
        }
      } catch {
        /* fallback to now */
      }
    }

    const payload: Record<string, unknown> = {
      ownerUserId: userId,
      name: companyName,
      source,
      status: "active",
      createdAt,
      updatedAt: Timestamp.now(),
    };
    if (siren) payload.siren = siren;
    if (externalCompanyId) payload.externalCompanyId = externalCompanyId;

    if (dryRun) {
      const fakeId = `<would-create-company-for-${userId}>`;
      userToCompany.set(userId, fakeId);
      stats.companiesCreated += 1;
      log(
        `  [dry-run] CREATE company { ownerUserId: ${userId}, name: "${companyName}", source: "${source}"${siren ? `, siren: "${siren}"` : ""}${externalCompanyId ? `, externalCompanyId: "${externalCompanyId}"` : ""} }`
      );
    } else {
      const docRef = db.collection("companies").doc();
      await docRef.set(payload);
      userToCompany.set(userId, docRef.id);
      stats.companiesCreated += 1;
      log(
        `  [created] Company ${docRef.id} pour User ${userId} (source=${source}${siren ? `, SIREN=${siren}` : ""})`
      );
    }
  }

  return userToCompany;
}

// ─── Étape 2 : ajout de companyId aux entités existantes ────────────────────

async function addCompanyIdToCollection(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  userToCompany: Map<string, string>,
  dryRun: boolean
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  const snap = await db.collection(collectionName).get();
  log(`  ${collectionName} → ${snap.size} documents à scanner`);

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.companyId) {
      skipped += 1;
      continue;
    }
    const userId = data.userId as string | undefined;
    if (!userId) {
      errors.push(`${collectionName}/${doc.id} : pas de userId, impossible de mapper`);
      continue;
    }
    const companyId = userToCompany.get(userId);
    if (!companyId) {
      errors.push(`${collectionName}/${doc.id} : userId=${userId} n'a pas de Company mappée`);
      continue;
    }
    if (dryRun) {
      log(`  [dry-run] UPDATE ${collectionName}/${doc.id} { companyId: "${companyId}" }`);
    } else {
      await doc.ref.update({ companyId });
    }
    updated += 1;
  }

  return { updated, skipped, errors };
}

async function migrateEntities(
  db: FirebaseFirestore.Firestore,
  userToCompany: Map<string, string>,
  dryRun: boolean,
  stats: MigrationStats
): Promise<void> {
  logSection("ÉTAPE 2 — Ajout de companyId aux entités");

  // Analyses
  {
    const result = await addCompanyIdToCollection(db, "analyses", userToCompany, dryRun);
    stats.analysesUpdated = result.updated;
    stats.analysesSkipped = result.skipped;
    stats.errors.push(...result.errors);
  }

  // Connections
  {
    const result = await addCompanyIdToCollection(db, "connections", userToCompany, dryRun);
    stats.connectionsUpdated = result.updated;
    stats.connectionsSkipped = result.skipped;
    stats.errors.push(...result.errors);
  }

  // Entités comptables (top-level, pattern userId + connectionId)
  for (const collection of ENTITY_COLLECTIONS) {
    const result = await addCompanyIdToCollection(db, collection, userToCompany, dryRun);
    stats.entitiesUpdated[collection] = result.updated;
    stats.entitiesSkipped[collection] = result.skipped;
    stats.errors.push(...result.errors);
  }

  // banking_summaries (doc ID = userId — on ajoute juste un champ, pas de
  // renommage du doc ID).
  logSection("ÉTAPE 3 — banking_summaries (doc ID = userId, ajout champ companyId)");
  const bsSnap = await db.collection("banking_summaries").get();
  log(`  banking_summaries → ${bsSnap.size} documents à scanner`);
  for (const doc of bsSnap.docs) {
    const data = doc.data();
    if (data.companyId) {
      stats.bankingSummariesSkipped += 1;
      continue;
    }
    const userId = doc.id; // doc ID = userId
    const companyId = userToCompany.get(userId);
    if (!companyId) {
      stats.errors.push(`banking_summaries/${doc.id} : userId=${userId} sans Company mappée`);
      continue;
    }
    if (dryRun) {
      log(`  [dry-run] UPDATE banking_summaries/${doc.id} { companyId: "${companyId}" }`);
    } else {
      await doc.ref.update({ companyId });
    }
    stats.bankingSummariesUpdated += 1;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    logSection("MODE DRY-RUN — aucune écriture Firestore");
  } else {
    logSection("MODE RÉEL — écritures Firestore activées");
    log("  ⚠ Cette exécution modifie la base prod.");
    log("  ⚠ PITR Firestore doit être activé (rollback < 7 jours).");
  }

  initAdmin();
  const db = getFirestore();
  void FieldValue; // garde l'import pour les futures extensions (rollback partiel)

  const stats: MigrationStats = {
    usersScanned: 0,
    companiesCreated: 0,
    companiesReused: 0,
    analysesUpdated: 0,
    analysesSkipped: 0,
    connectionsUpdated: 0,
    connectionsSkipped: 0,
    entitiesUpdated: {},
    entitiesSkipped: {},
    bankingSummariesUpdated: 0,
    bankingSummariesSkipped: 0,
    errors: [],
  };

  const userToCompany = await migrateUsersToCompanies(db, dryRun, stats);
  await migrateEntities(db, userToCompany, dryRun, stats);

  logSection("RÉCAPITULATIF");
  console.log(`  Users scannés          : ${stats.usersScanned}`);
  console.log(`  Companies créées       : ${stats.companiesCreated}`);
  console.log(`  Companies réutilisées  : ${stats.companiesReused}`);
  console.log(`  Analyses MAJ           : ${stats.analysesUpdated} (skip ${stats.analysesSkipped})`);
  console.log(`  Connections MAJ        : ${stats.connectionsUpdated} (skip ${stats.connectionsSkipped})`);
  for (const collection of ENTITY_COLLECTIONS) {
    const u = stats.entitiesUpdated[collection] ?? 0;
    const s = stats.entitiesSkipped[collection] ?? 0;
    if (u + s > 0) console.log(`  ${collection.padEnd(22)} : ${u} MAJ (skip ${s})`);
  }
  console.log(`  banking_summaries      : ${stats.bankingSummariesUpdated} MAJ (skip ${stats.bankingSummariesSkipped})`);

  if (stats.errors.length > 0) {
    console.log(`\n  ⚠ ${stats.errors.length} erreur(s) :`);
    for (const err of stats.errors) console.log(`    - ${err}`);
  }

  if (dryRun) {
    console.log("\n  ✓ Dry-run terminé. Pour exécuter pour de vrai :");
    console.log("    npx tsx --env-file=.env.local scripts/migrate-to-multi-tenant.mts");
  } else {
    console.log("\n  ✓ Migration terminée. Vérifie en console Firebase.");
  }
}

main().catch((err) => {
  console.error("\n❌ Erreur fatale :", err);
  process.exit(99);
});
