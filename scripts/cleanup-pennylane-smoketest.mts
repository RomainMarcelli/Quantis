// Cleanup ciblé : supprime une analyse Pennylane de smoke test + toutes les
// entités synchronisées rattachées à la connexion qui l'a produite.
//
// Diagnostique aussi en parallèle l'analyse PDF rGONfpZyPHk0dGV2Bp85 (ca=0)
// en dumpant les premiers champs non-null de mappedData / parsedData.
//
// Mode dry-run par défaut. Pour réellement supprimer : `-- --apply`.
//
// Usage :
//   npx tsx --env-file=.env scripts/cleanup-pennylane-smoketest.mts          # dry-run
//   npx tsx --env-file=.env scripts/cleanup-pennylane-smoketest.mts --apply  # delete

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const TARGET_UID = "2ZwWKFTuynU40HXjRV3FZY4I2pj2";
const TARGET_ANALYSIS_ID = "fK0oQjOVLJPw9YfKWXfE";
const DIAG_ANALYSIS_ID = "rGONfpZyPHk0dGV2Bp85";

const ENTITY_COLLECTIONS = [
  "journals",
  "ledger_accounts",
  "contacts",
  "accounting_entries",
  "invoices",
  "bank_accounts",
  "bank_transactions",
] as const;

function initAdmin() {
  if (getApps().length > 0) return;
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function firstNonNull(obj: Record<string, unknown> | undefined | null, n: number): Array<[string, unknown]> {
  if (!obj || typeof obj !== "object") return [];
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out.push([k, v]);
    if (out.length >= n) break;
  }
  return out;
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value.length > 80 ? `"${value.slice(0, 77)}..."` : `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})${value.length > 0 ? ` ex=${summarize(value[0])}` : ""}`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    return `{${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", ..." : ""}}`;
  }
  return String(value);
}

(async () => {
  const apply = process.argv.includes("--apply");
  initAdmin();
  const db = getFirestore();

  console.log("=".repeat(76));
  console.log(`Mode : ${apply ? "APPLY (destructif)" : "DRY-RUN (lecture seule)"}`);
  console.log("=".repeat(76));

  // ─── 1) Lire l'analyse cible pour extraire le connectionId ──────────────
  console.log(`\n[1] Analyse cible : ${TARGET_ANALYSIS_ID}`);
  const targetRef = db.collection("analyses").doc(TARGET_ANALYSIS_ID);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    console.log(`  ⚠ Document introuvable. Rien à supprimer côté analyses.`);
  } else {
    const d = targetSnap.data() as Record<string, unknown>;
    const userId = String(d.userId ?? "");
    const meta = d.sourceMetadata as
      | { type?: string; provider?: string; connectionId?: string }
      | undefined;
    const connectionId = meta?.connectionId ?? (d.connectionId as string | undefined);
    console.log(`  userId        : ${userId}`);
    console.log(`  provider      : ${meta?.provider ?? "(none)"}`);
    console.log(`  type          : ${meta?.type ?? "(none)"}`);
    console.log(`  connectionId  : ${connectionId ?? "(none)"}`);

    if (userId !== TARGET_UID) {
      console.log(`  ⚠ userId différent de ${TARGET_UID} — abort.`);
      process.exit(1);
    }

    if (!connectionId) {
      console.log(`  ⚠ Pas de connectionId sur l'analyse — on ne peut pas cibler les entités.`);
    } else {
      // ─── 2) Compter les entités liées à cette connexion ────────────────
      console.log(`\n[2] Entités liées à connectionId=${connectionId} pour user=${TARGET_UID}`);
      let totalEntities = 0;
      const entityCounts: Array<{ collection: string; count: number; ids: string[] }> = [];
      for (const c of ENTITY_COLLECTIONS) {
        const snap = await db
          .collection(c)
          .where("userId", "==", TARGET_UID)
          .where("connectionId", "==", connectionId)
          .get();
        entityCounts.push({ collection: c, count: snap.size, ids: snap.docs.map((x) => x.id) });
        totalEntities += snap.size;
        console.log(`  ${c.padEnd(22)} ${String(snap.size).padStart(4)}`);
      }
      console.log(`  ${"TOTAL".padEnd(22)} ${String(totalEntities).padStart(4)}`);

      // ─── 3) Vérifier la connexion elle-même (info, on ne supprime pas) ─
      const connSnap = await db.collection("connections").doc(connectionId).get();
      if (connSnap.exists) {
        const cd = connSnap.data() as Record<string, unknown>;
        console.log(`\n  Connection doc présente :`);
        console.log(`    provider=${cd.provider}  status=${cd.status}  userId=${cd.userId}`);
        console.log(`    (NB: la connexion elle-même n'est pas supprimée par ce script)`);
      } else {
        console.log(`\n  Connection doc déjà absente.`);
      }

      // ─── 4) Apply ───────────────────────────────────────────────────────
      if (apply) {
        console.log(`\n[3] Suppression effective…`);
        for (const c of ENTITY_COLLECTIONS) {
          const snap = await db
            .collection(c)
            .where("userId", "==", TARGET_UID)
            .where("connectionId", "==", connectionId)
            .get();
          if (snap.empty) continue;
          let deleted = 0;
          const docs = snap.docs;
          for (let i = 0; i < docs.length; i += 400) {
            const batch = db.batch();
            docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            deleted += Math.min(400, docs.length - i);
          }
          console.log(`  ${c.padEnd(22)} ${deleted} supprimés`);
        }
        await targetRef.delete();
        console.log(`  analyses/${TARGET_ANALYSIS_ID} supprimée`);
      } else {
        console.log(`\n[3] DRY-RUN — aucune suppression. Relancer avec --apply pour appliquer.`);
      }
    }
  }

  // ─── 5) Diagnostic de l'analyse PDF rGONfpZyPHk0dGV2Bp85 ───────────────
  console.log(`\n${"=".repeat(76)}`);
  console.log(`[DIAG] Analyse PDF : ${DIAG_ANALYSIS_ID}`);
  console.log("=".repeat(76));
  const diagSnap = await db.collection("analyses").doc(DIAG_ANALYSIS_ID).get();
  if (!diagSnap.exists) {
    console.log(`  ⚠ Introuvable.`);
  } else {
    const d = diagSnap.data() as Record<string, unknown>;
    const meta = d.sourceMetadata as Record<string, unknown> | undefined;
    const kpis = d.kpis as Record<string, unknown> | undefined;
    const createdAt = (d.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? "(no date)";

    console.log(`  userId        : ${d.userId}`);
    console.log(`  createdAt     : ${createdAt}`);
    console.log(`  source.type   : ${meta?.type ?? "(none)"}`);
    console.log(`  source.provider : ${meta?.provider ?? "(none)"}`);
    console.log(`  fileName      : ${meta?.fileName ?? d.fileName ?? "(none)"}`);
    console.log(`  kpis.ca       : ${kpis?.ca ?? "(null)"}`);
    console.log(`  kpis keys     : ${kpis ? Object.keys(kpis).join(", ") : "(none)"}`);

    // mappedData
    const mapped = d.mappedData as Record<string, unknown> | undefined;
    console.log(`\n  --- mappedData ---`);
    if (!mapped) {
      console.log(`  (absent)`);
    } else {
      const allKeys = Object.keys(mapped);
      const nonNullKeys = allKeys.filter((k) => mapped[k] !== null && mapped[k] !== undefined);
      console.log(`  total keys      : ${allKeys.length}`);
      console.log(`  non-null keys   : ${nonNullKeys.length}`);
      if (nonNullKeys.length === 0) {
        console.log(`  ⚠ TOUS LES CHAMPS SONT NULL/UNDEFINED — le parser n'a rien extrait.`);
      } else {
        console.log(`  Premier 10 champs non-null :`);
        for (const [k, v] of firstNonNull(mapped, 10)) {
          console.log(`    ${k.padEnd(28)} = ${summarize(v)}`);
        }
      }
    }

    // parsedData
    const parsed = d.parsedData as Record<string, unknown> | undefined;
    console.log(`\n  --- parsedData ---`);
    if (!parsed) {
      console.log(`  (absent)`);
    } else {
      const allKeys = Object.keys(parsed);
      const nonNullKeys = allKeys.filter((k) => parsed[k] !== null && parsed[k] !== undefined);
      console.log(`  total keys      : ${allKeys.length}`);
      console.log(`  non-null keys   : ${nonNullKeys.length}`);
      console.log(`  Premier 10 champs non-null :`);
      for (const [k, v] of firstNonNull(parsed, 10)) {
        console.log(`    ${k.padEnd(28)} = ${summarize(v)}`);
      }

      // Dump détaillé de parsedData[0] (le bloc d'extraction)
      const first = parsed["0"] as Record<string, unknown> | undefined;
      if (first) {
        console.log(`\n  --- parsedData[0] (extraction PDF) ---`);
        for (const k of ["fileName", "fileType", "extractedAt", "fiscalYear", "parserVersion"]) {
          if (k in first) console.log(`    ${k.padEnd(20)} = ${summarize(first[k])}`);
        }
        const metrics = first.metrics as Record<string, unknown> | undefined;
        if (metrics) {
          const mAll = Object.keys(metrics);
          const mNN = mAll.filter((k) => metrics[k] !== null && metrics[k] !== undefined);
          console.log(`    metrics             : total=${mAll.length}, non-null=${mNN.length}`);
          for (const [k, v] of firstNonNull(metrics, 15)) {
            console.log(`      ${k.padEnd(26)} = ${summarize(v)}`);
          }
        }
        const previewRows = first.previewRows as unknown[] | undefined;
        if (Array.isArray(previewRows)) {
          console.log(`    previewRows         : Array(${previewRows.length})`);
          for (let i = 0; i < Math.min(5, previewRows.length); i++) {
            console.log(`      [${i}] ${summarize(previewRows[i])}`);
          }
        }
      }
    }

    // Champs racine intéressants
    console.log(`\n  --- Champs racine ---`);
    const interesting = ["error", "warnings", "parserVersion", "extractor", "rawTextLength", "ocrUsed"];
    for (const k of interesting) {
      if (k in d) console.log(`  ${k.padEnd(20)} = ${summarize(d[k])}`);
    }
  }

  console.log(`\n${"=".repeat(76)}`);
  console.log("Done.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
