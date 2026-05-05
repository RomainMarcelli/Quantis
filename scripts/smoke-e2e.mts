// Smoke test end-to-end de l'intégration Pennylane :
// 1. Cleanup des données du run précédent (connection + entités + analyses) pour le test uid
// 2. Mint un Firebase ID token via Admin SDK + REST exchange
// 3. POST /api/integrations/pennylane/connect (mode company_token)
// 4. POST /api/integrations/pennylane/sync
// 5. Lecture Firestore : connection, comptages par entité, sample, analyse générée
//
// Usage : npx tsx --env-file=.env scripts/smoke-e2e.mts

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const TEST_UID = "smoke-e2e-uid-001";
const APP_BASE = process.env.APP_BASE_URL || "http://localhost:3000";

// ─── Bootstrap Firebase Admin ───────────────────────────────────────────────

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskToken(value: string): string {
  if (value.length < 12) return "****";
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

function dot(prefix: string): string {
  return "─".repeat(60 - prefix.length);
}

async function getIdToken(uid: string): Promise<string> {
  const customToken = await getAuth().createCustomToken(uid);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY manquante.");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    throw new Error(`Custom token exchange ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { idToken: string };
  return json.idToken;
}

async function cleanup(userId: string): Promise<void> {
  const db = getFirestore();
  const collections = [
    "connections",
    "journals",
    "ledger_accounts",
    "contacts",
    "accounting_entries",
    "invoices",
    "bank_accounts",
    "bank_transactions",
    "analyses",
  ];
  for (const c of collections) {
    const snap = await db.collection(c).where("userId", "==", userId).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`  cleaned ${c}: ${snap.size} docs`);
  }
}

async function callApi(
  path: string,
  body: unknown,
  idToken: string
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${APP_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
}

// ─── Main ───────────────────────────────────────────────────────────────────

(async () => {
  if (!process.env.PENNYLANE_TEST_TOKEN) {
    console.error("PENNYLANE_TEST_TOKEN manquante.");
    process.exit(1);
  }

  initAdmin();

  console.log(`\n[1/5] Cleanup du run précédent (uid=${TEST_UID}) ${dot("[1/5] Cleanup ")}`);
  await cleanup(TEST_UID);

  console.log(`\n[2/5] Mint Firebase ID token ${dot("[2/5] Mint ID token ")}`);
  const idToken = await getIdToken(TEST_UID);
  console.log(`  ${maskToken(idToken)}`);

  console.log(`\n[3/5] POST /api/integrations/pennylane/connect ${dot("[3/5] /connect ")}`);
  const connectResult = await callApi(
    "/api/integrations/pennylane/connect",
    {
      mode: "company_token",
      accessToken: process.env.PENNYLANE_TEST_TOKEN,
    },
    idToken
  );
  console.log(`  status=${connectResult.status}`);
  console.log(`  ${JSON.stringify(connectResult.data, null, 2).split("\n").join("\n  ")}`);
  if (connectResult.status !== 201) {
    console.error("Échec /connect — abort.");
    process.exit(2);
  }
  const connectionId = connectResult.data.connectionId;

  console.log(`\n[4/5] POST /api/integrations/pennylane/sync ${dot("[4/5] /sync ")}`);
  console.log(`  connectionId=${connectionId}`);
  const syncStart = Date.now();
  const syncResult = await callApi(
    "/api/integrations/pennylane/sync",
    { connectionId },
    idToken
  );
  const syncDuration = Date.now() - syncStart;
  console.log(`  status=${syncResult.status}, duration=${syncDuration}ms`);
  if (syncResult.status !== 200) {
    console.log(`  ${JSON.stringify(syncResult.data, null, 2)}`);
    process.exit(3);
  }
  const report = syncResult.data.report;
  const analysisInfo = syncResult.data.analysis;
  console.log(`  Sync report par entité :`);
  for (const e of report.entities) {
    const stat = e.error
      ? `KO ${e.error}`
      : `OK ${e.itemsPersisted} items / ${e.pagesFetched} pages / ${e.durationMs}ms`;
    console.log(`    ${e.entity.padEnd(20)} ${stat}`);
  }
  console.log(
    `  Analyse générée : ${
      analysisInfo
        ? `id=${analysisInfo.analysisId} fy=${analysisInfo.fiscalYear} | trial_balance=${analysisInfo.trialBalanceUsed ? "oui" : "non (fallback entries)"}`
        : "aucune (pas de données)"
    }`
  );

  // ─── 5. Inspection Firestore ──────────────────────────────────────────────
  console.log(`\n[5/5] Lecture Firestore ${dot("[5/5] Firestore ")}`);
  const db = getFirestore();

  // Connection.
  const connDoc = await db.collection("connections").doc(connectionId).get();
  if (connDoc.exists) {
    const d = connDoc.data() as any;
    console.log(`\n  connections/${connectionId} :`);
    console.log(`    provider           : ${d.provider}`);
    console.log(`    providerSub        : ${d.providerSub}`);
    console.log(`    status             : ${d.status}`);
    console.log(`    authMode           : ${d.authMode}`);
    console.log(`    encryptedAccessToken: ${maskToken(d.encryptedAccessToken)}`);
    console.log(`    externalCompanyId  : ${d.externalCompanyId || "(vide)"}`);
    console.log(`    lastSyncStatus     : ${d.lastSyncStatus}`);
    console.log(`    syncCursors        :`);
    for (const [k, v] of Object.entries(d.syncCursors as Record<string, any>)) {
      console.log(`      ${k.padEnd(18)} cursor=${v.paginationCursor ?? "null"} lastSyncedAt=${v.lastSyncedAt ?? "null"}`);
    }
  }

  // Comptages par entité.
  const entityCollections = [
    "journals",
    "ledger_accounts",
    "contacts",
    "accounting_entries",
    "invoices",
  ];
  console.log(`\n  Entités persistées :`);
  for (const c of entityCollections) {
    const snap = await db.collection(c).where("userId", "==", TEST_UID).get();
    console.log(`    ${c.padEnd(20)} ${snap.size}`);
  }

  // Sample : 1 contact, 1 invoice, 1 entry.
  const contactsSnap = await db.collection("contacts").where("userId", "==", TEST_UID).limit(1).get();
  if (!contactsSnap.empty) {
    const c = contactsSnap.docs[0]!.data();
    console.log(`\n  Sample contact :`);
    console.log(
      `    type=${c.type} | name="${c.name}" | siret=${c.siret ?? "-"} | sector=${c.sector ?? "-"}`
    );
  }

  const invoicesSnap = await db.collection("invoices").where("userId", "==", TEST_UID).limit(2).get();
  for (const doc of invoicesSnap.docs) {
    const inv = doc.data();
    console.log(
      `  Sample invoice : ${inv.type} | n°${inv.number} | ${inv.date} | ${inv.totalExclVat} HT / ${inv.totalInclVat} TTC | status=${inv.status} | lines=${inv.lines.length}`
    );
  }

  const entriesSnap = await db
    .collection("accounting_entries")
    .where("userId", "==", TEST_UID)
    .limit(1)
    .get();
  if (!entriesSnap.empty) {
    const e = entriesSnap.docs[0]!.data();
    console.log(
      `  Sample entry : ${e.date} | journal=${e.journalCode} | label="${e.label}" | debit=${e.totalDebit} credit=${e.totalCredit} | lines=${e.lines.length}`
    );
  }

  // Analyse.
  if (analysisInfo) {
    const aDoc = await db.collection("analyses").doc(analysisInfo.analysisId).get();
    if (aDoc.exists) {
      const a = aDoc.data() as any;
      console.log(`\n  analyses/${analysisInfo.analysisId} :`);
      console.log(`    fiscalYear         : ${a.fiscalYear}`);
      console.log(`    sourceMetadata     : type=${a.sourceMetadata?.type} provider=${a.sourceMetadata?.provider}`);
      console.log(`    period             : ${a.sourceMetadata?.periodStart} → ${a.sourceMetadata?.periodEnd}`);
      console.log(`\n    KPI clés :`);
      const kpis = a.kpis ?? {};
      const interesting = [
        "ca", "va", "ebitda", "marge_ebitda", "resultat_net", "bfr", "tn", "dso", "dpo",
        "solvabilite", "healthScore",
      ];
      for (const k of interesting) {
        console.log(`      ${k.padEnd(18)} ${kpis[k] ?? "null"}`);
      }
      console.log(`\n    Quantis Score      : ${a.quantisScore?.quantis_score ?? "-"}`);
      console.log(`    Piliers            :`);
      for (const [k, v] of Object.entries(a.quantisScore?.piliers ?? {})) {
        console.log(`      ${k.padEnd(14)} ${v}`);
      }

      console.log(`\n    granularInsights :`);
      const g = a.granularInsights;
      if (g) {
        console.log(`      total clients      : ${g.customers.total}`);
        console.log(`      top clients :`);
        for (const c of g.customers.topByRevenue.slice(0, 5)) {
          console.log(`        - ${c.name.padEnd(40)} ${c.revenue} EUR | share=${(c.share * 100).toFixed(1)}% | factures=${c.invoicesCount}`);
        }
        console.log(`      concentration top5 : ${(g.customers.concentration.top5Share * 100).toFixed(1)}%`);
        console.log(`      secteurs (top 3)   :`);
        for (const s of g.customers.sectorBreakdown.slice(0, 3)) {
          console.log(`        - ${s.sector.padEnd(20)} ${s.revenue} EUR | ${s.customerCount} clients`);
        }
        console.log(`      receivables outst  : ${g.receivables.totalOutstanding} EUR | overdue=${g.receivables.overdueCount}`);
        console.log(`      DSO (jours)        : ${g.receivables.averageDSO ?? "-"}`);
        console.log(`      top fournisseurs   :`);
        for (const s of g.suppliers.topByPurchase.slice(0, 5)) {
          console.log(`        - ${s.name.padEnd(40)} ${s.totalPurchases} EUR | factures=${s.invoicesCount}`);
        }
        console.log(`      revenue timeline (12 mois) : ${g.revenueTimeline.length} entrées`);
        const nonZero = g.revenueTimeline.filter((m: any) => m.totalRevenue > 0);
        for (const m of nonZero) {
          console.log(`        - ${m.month}  ${m.totalRevenue} EUR`);
        }
      }

      console.log(`\n    kpisTimeSeries     : ${a.kpisTimeSeries?.length ?? 0} mois`);
      console.log(`    vatInsights        :`);
      const v = a.vatInsights;
      if (v) {
        console.log(`      périodicité        : ${v.periodicity}`);
        console.log(`      total collecté     : ${v.totalCollected}`);
        console.log(`      total déductible   : ${v.totalDeductible}`);
        console.log(`      total dû           : ${v.totalDue}`);
      }

      // ─── Nouveau format Option 1 (PM) — variable codes 2033-SD ─────────
      console.log(`\n    dailyAccounting    : ${a.dailyAccounting?.length ?? 0} jours avec écritures`);
      const days = a.dailyAccounting ?? [];
      if (days.length > 0) {
        console.log(`      premiers jours :`);
        for (const d of days.slice(0, 3)) {
          // Variables non nulles uniquement pour le résumé.
          const nonZero = Object.entries(d.values).filter(([, v]) => (v as number) !== 0);
          const summary = nonZero
            .map(([k, v]) => `${k}=${(v as number).toFixed(0)}`)
            .join(" ");
          console.log(`        ${d.date} | ${d.entryCount} écriture(s) | ${summary}`);
        }
        if (days.length > 3) {
          console.log(`        … (${days.length - 3} autres jours)`);
        }
        // Détail complet du dernier jour pour montrer le contrat stable (toutes les variables).
        const last = days[days.length - 1];
        console.log(`      dernier jour (${last.date}) — variables P&L :`);
        const codes = Object.keys(last.values).sort();
        const half = Math.ceil(codes.length / 2);
        for (let i = 0; i < half; i++) {
          const left = codes[i];
          const right = codes[i + half];
          const lv = (last.values[left] as number).toFixed(2).padStart(10);
          const rv = right ? (last.values[right] as number).toFixed(2).padStart(10) : "";
          const rk = right ? right.padEnd(20) : "";
          console.log(`        ${left.padEnd(20)} ${lv}    ${rk} ${rv}`);
        }
      }

      console.log(`\n    balanceSheetSnapshot :`);
      const snap = a.balanceSheetSnapshot;
      if (snap) {
        console.log(`      asOfDate    : ${snap.asOfDate}`);
        console.log(`      periodStart : ${snap.periodStart}`);
        console.log(`      Variables bilan (non nulles uniquement) :`);
        const nonZero = Object.entries(snap.values).filter(([, v]) => (v as number) !== 0);
        if (nonZero.length === 0) {
          console.log(`        (toutes à 0 — bilan vide)`);
        } else {
          for (const [code, value] of nonZero.sort()) {
            console.log(`        ${code.padEnd(22)} ${(value as number).toFixed(2).padStart(12)}`);
          }
          const zeroCount = Object.keys(snap.values).length - nonZero.length;
          console.log(`        … + ${zeroCount} autres variables à 0 (contrat stable)`);
        }
      } else {
        console.log(`      (absent — trial_balance non disponible)`);
      }
    }
  }

  console.log(`\n[DONE] Smoke test terminé.`);
})();
