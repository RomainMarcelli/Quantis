// Dump l'analyse dynamique Pennylane stockée en Firestore pour le user
// 2ZwWKFTuynU40HXjRV3FZY4I2pj2 et compare avec ce que l'audit live calcule.
// Fournit en particulier : kpis stockés, mappedData stocké, dailyAccounting
// agrégé par année (sum des PnlVariableCode), balanceSheetSnapshot.values.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const TARGET_UID = "2ZwWKFTuynU40HXjRV3FZY4I2pj2";

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

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${fmt.format(v)} €`;

(async () => {
  initAdmin();
  const db = getFirestore();
  const snap = await db
    .collection("analyses")
    .where("userId", "==", TARGET_UID)
    .get();

  console.log(`Analyses pour user=${TARGET_UID} : ${snap.size}\n`);

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const meta = d.sourceMetadata as
      | { type?: string; provider?: string; connectionId?: string; periodStart?: string; periodEnd?: string }
      | undefined;
    const kpis = (d.kpis as Record<string, number | null>) ?? {};
    const mapped = (d.mappedData as Record<string, number | null>) ?? {};
    const daily = (d.dailyAccounting as Array<{ date: string; values: Record<string, number> }>) ?? [];
    const snapshot = d.balanceSheetSnapshot as
      | { asOfDate: string; periodStart: string; values: Record<string, number> }
      | null
      | undefined;
    const createdAt = (d.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ?? "(no date)";

    console.log("═".repeat(78));
    console.log(`Analyse ${doc.id}`);
    console.log(`  createdAt    : ${createdAt}`);
    console.log(`  source.type  : ${meta?.type}`);
    console.log(`  provider     : ${meta?.provider}`);
    console.log(`  connectionId : ${meta?.connectionId}`);
    console.log(`  period       : ${meta?.periodStart} → ${meta?.periodEnd}`);
    console.log(`  parserVersion: ${d.parserVersion ?? "(none)"}`);

    console.log(`\n  --- kpis stockés ---`);
    console.log(`    ca                 = ${eur(kpis.ca)}`);
    console.log(`    va                 = ${eur(kpis.va)}`);
    console.log(`    ebitda             = ${eur(kpis.ebitda)}`);
    console.log(`    resultat_net       = ${eur(kpis.resultat_net)}`);
    console.log(`    bfr                = ${eur(kpis.bfr)}`);
    console.log(`    tn (tréso nette)   = ${eur(kpis.tn)}`);
    console.log(`    disponibilites     = ${eur(kpis.disponibilites)}`);
    console.log(`    healthScore        = ${kpis.healthScore ?? "null"}`);

    console.log(`\n  --- mappedData (extraits) ---`);
    const mappedKeys = ["ventes_march", "prod_vendue", "prod_biens", "prod_serv", "total_prod_expl", "salaires", "charges_soc", "ace", "achats_march", "dispo", "emprunts", "clients", "fournisseurs", "total_actif", "total_passif", "total_cp", "total_stocks", "creances", "dettes_fisc_soc"];
    for (const k of mappedKeys) {
      console.log(`    ${k.padEnd(22)} = ${eur(mapped[k])}`);
    }

    console.log(`\n  --- balanceSheetSnapshot ---`);
    if (snapshot) {
      console.log(`    asOfDate     : ${snapshot.asOfDate}`);
      console.log(`    periodStart  : ${snapshot.periodStart}`);
      const vk = ["dispo", "clients", "fournisseurs", "emprunts", "total_actif", "total_passif", "total_cp", "total_stocks", "dettes_fisc_soc"];
      for (const k of vk) {
        console.log(`    values.${k.padEnd(18)} = ${eur(snapshot.values?.[k])}`);
      }
    } else {
      console.log(`    (absent)`);
    }

    console.log(`\n  --- dailyAccounting : ${daily.length} jours non vides ---`);
    if (daily.length > 0) {
      const dates = daily.map((x) => x.date).sort();
      console.log(`    Plage : ${dates[0]} → ${dates[dates.length - 1]}`);

      // Bucket par année.
      const byYear = new Map<string, { days: number; ca: number; salaires: number; charges_soc: number; ace: number; achats_march: number; total_prod_expl: number; total_charges_expl: number; resultat_exercice: number }>();
      for (const day of daily) {
        const year = day.date.slice(0, 4);
        const slot = byYear.get(year) ?? { days: 0, ca: 0, salaires: 0, charges_soc: 0, ace: 0, achats_march: 0, total_prod_expl: 0, total_charges_expl: 0, resultat_exercice: 0 };
        slot.days++;
        const v = day.values;
        slot.ca += (v.ventes_march ?? 0) + (v.prod_vendue ?? 0);
        slot.total_prod_expl += v.total_prod_expl ?? 0;
        slot.salaires += v.salaires ?? 0;
        slot.charges_soc += v.charges_soc ?? 0;
        slot.ace += v.ace ?? 0;
        slot.achats_march += v.achats_march ?? 0;
        slot.total_charges_expl += v.total_charges_expl ?? 0;
        slot.resultat_exercice += v.resultat_exercice ?? 0;
        byYear.set(year, slot);
      }
      console.log(`\n    Année  Jours  ${"CA".padStart(12)}  ${"total_prod".padStart(12)}  ${"salaires".padStart(12)}  ${"charges_soc".padStart(12)}  ${"resultat".padStart(12)}`);
      for (const [year, s] of [...byYear.entries()].sort()) {
        console.log(
          `    ${year}    ${String(s.days).padStart(4)}  ${eur(s.ca).padStart(14)}  ${eur(s.total_prod_expl).padStart(14)}  ${eur(s.salaires).padStart(14)}  ${eur(s.charges_soc).padStart(14)}  ${eur(s.resultat_exercice).padStart(14)}`
        );
      }
      const total = [...byYear.values()].reduce((a, b) => a + b.ca, 0);
      console.log(`    TOTAL CA cumulé sur tous les jours : ${eur(total)}`);
    }

    console.log();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
