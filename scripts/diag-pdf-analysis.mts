// Dump complet et lisible du contenu d'une analyse PDF :
//   - parsedData[0].metrics (les valeurs extraites du PDF)
//   - parsedData[0].previewRows (le texte d'échantillon)
//   - mappedData (mapping vers les champs internes)
//   - kpis (résultats finaux du pipeline)

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ANALYSIS_ID = process.argv[2] ?? "rGONfpZyPHk0dGV2Bp85";

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
}

(async () => {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection("analyses").doc(ANALYSIS_ID).get();
  if (!snap.exists) {
    console.log("Introuvable.");
    process.exit(1);
  }
  const d = snap.data() as Record<string, unknown>;

  const parsed = d.parsedData as Record<string, unknown> | undefined;
  const first = parsed?.["0"] as Record<string, unknown> | undefined;

  console.log(`Analyse ${ANALYSIS_ID}`);
  console.log(`fileName : ${first?.fileName}`);
  console.log(`fiscalYear : ${first?.fiscalYear}`);
  console.log(`parserVersion : ${d.parserVersion}`);

  // ─── metrics ────────────────────────────────────────────────────────────
  const metrics = first?.metrics as Array<Record<string, unknown>> | undefined;
  console.log(`\n=== parsedData[0].metrics (${metrics?.length ?? 0}) ===`);
  if (metrics) {
    for (const m of metrics) {
      console.log(JSON.stringify(m, null, 2));
    }
  }

  // ─── previewRows ────────────────────────────────────────────────────────
  const previewRows = first?.previewRows as Array<Record<string, unknown>> | undefined;
  console.log(`\n=== parsedData[0].previewRows (${previewRows?.length ?? 0}) ===`);
  if (previewRows) {
    for (const row of previewRows) {
      const r = { ...row };
      // textSample peut être très long — on tronque
      if (typeof r.textSample === "string") {
        const ts = r.textSample as string;
        r.textSample = ts.length > 1500 ? `${ts.slice(0, 1500)}\n[...tronqué, total ${ts.length} chars]` : ts;
      }
      console.log(JSON.stringify(r, null, 2));
    }
  }

  // ─── mappedData (non-null seulement, lisible) ───────────────────────────
  const mapped = d.mappedData as Record<string, unknown> | undefined;
  console.log(`\n=== mappedData (champs non-null seulement) ===`);
  if (mapped) {
    for (const [k, v] of Object.entries(mapped)) {
      if (v === null || v === undefined) continue;
      console.log(`  ${k.padEnd(30)} = ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
  }

  // ─── kpis (non-null + ≠ 0 mis en avant) ────────────────────────────────
  const kpis = d.kpis as Record<string, unknown> | undefined;
  console.log(`\n=== kpis (non-null) ===`);
  if (kpis) {
    for (const [k, v] of Object.entries(kpis)) {
      if (v === null || v === undefined) continue;
      const flag = typeof v === "number" && v !== 0 ? " ←" : "";
      console.log(`  ${k.padEnd(30)} = ${typeof v === "object" ? JSON.stringify(v) : String(v)}${flag}`);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
