// File: scripts/probe-myunisoft.mts
// Role: script standalone qui valide la connectivité MyUnisoft sandbox
// avec les credentials réels (X-Third-Party-Secret + JWT cabinet).
//
// Usage :
//   npx tsx --env-file=.env.local scripts/probe-myunisoft.mts
//
// Variables requises (dans .env.local) :
//   MYUNISOFT_THIRD_PARTY_SECRET   — clé partenaire fournie par MyUnisoft
//   MYUNISOFT_TEST_JWT             — JWT cabinet/société pour la sandbox
//   MYUNISOFT_API_BASE_URL         — optionnel (défaut prod ; sandbox =
//                                     https://sandbox.api.myunisoft.fr/api/v1)
//
// Sortie attendue : status HTTP + extrait du body pour chaque endpoint
// utilisé par l'adapter (auth, journals, comptes, écritures, balance).
// Permet de :
//   1. Confirmer que la clé partenaire est valide.
//   2. Voir la forme réelle des réponses pour ajuster les types/mappers.
//   3. Détecter les endpoints qui retournent 404 (chemins erronés dans
//      l'adapter — la doc partner liste plusieurs alternatives).
//
// IMPORTANT : ce script ne touche AUCUNE donnée Firestore. Il fait juste
// des GET en lecture sur la sandbox MyUnisoft.

const SECRET = process.env.MYUNISOFT_THIRD_PARTY_SECRET?.trim();
const JWT = process.env.MYUNISOFT_TEST_JWT?.trim();
const BASE =
  process.env.MYUNISOFT_API_BASE_URL?.trim() ||
  "https://api.myunisoft.fr/api/v1";

if (!SECRET) {
  console.error(
    "❌ MYUNISOFT_THIRD_PARTY_SECRET manquant. Ajoute-le dans .env.local."
  );
  process.exit(1);
}
if (!JWT) {
  console.error(
    "❌ MYUNISOFT_TEST_JWT manquant. Récupère un JWT cabinet sandbox depuis MyUnisoft."
  );
  process.exit(1);
}

type ProbeResult = {
  endpoint: string;
  status: number;
  preview: string;
  itemCount?: number;
};

async function call(endpoint: string, query?: Record<string, string>): Promise<ProbeResult> {
  const url = new URL(`${BASE}${endpoint}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  const start = Date.now();
  const response = await fetch(url.toString(), {
    headers: {
      "X-Third-Party-Secret": SECRET as string,
      Authorization: `Bearer ${JWT}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const ms = Date.now() - start;

  // Tente de parser comme JSON pour extraire un compte d'éléments si liste
  let itemCount: number | undefined;
  try {
    const json = JSON.parse(text) as unknown;
    if (Array.isArray(json)) {
      itemCount = json.length;
    } else if (json && typeof json === "object") {
      const data = (json as { data?: unknown }).data;
      const items = (json as { items?: unknown }).items;
      if (Array.isArray(data)) itemCount = data.length;
      else if (Array.isArray(items)) itemCount = items.length;
    }
  } catch {
    // Pas du JSON valide — ignore
  }

  console.log(
    `\n[${endpoint}] ${response.status} (${ms} ms)${
      itemCount !== undefined ? ` · ${itemCount} item(s)` : ""
    }`
  );
  console.log(text.slice(0, 1500));

  return {
    endpoint,
    status: response.status,
    preview: text.slice(0, 200),
    itemCount,
  };
}

(async () => {
  console.log(`▶ MyUnisoft probe — base URL : ${BASE}`);
  console.log(`▶ Secret : ${SECRET!.slice(0, 4)}…${SECRET!.slice(-4)}`);
  console.log(`▶ JWT    : ${JWT!.slice(0, 8)}…`);

  const results: ProbeResult[] = [];

  // 1. Vérification d'auth via un endpoint léger.
  results.push(await call("/exercice"));

  // 2. Référentiel : journaux.
  results.push(await call("/diary"));
  // alternative à tester si /diary 404 :
  //   results.push(await call("/journal"));

  // 3. Référentiel : plan comptable.
  results.push(await call("/account"));

  // 4. Écritures sur l'exercice courant.
  const year = new Date().getUTCFullYear();
  results.push(
    await call("/entry", {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      limit: "10",
    })
  );

  // 5. Balance.
  results.push(
    await call("/balance", {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    })
  );

  // ─── Récap ───
  console.log("\n────────── RÉCAP ──────────");
  for (const r of results) {
    const icon = r.status >= 200 && r.status < 300 ? "✓" : r.status === 401 || r.status === 403 ? "🔒" : "✗";
    const count = r.itemCount !== undefined ? ` (${r.itemCount} items)` : "";
    console.log(`${icon} ${r.endpoint.padEnd(30)} ${r.status}${count}`);
  }
  const failed = results.filter((r) => r.status < 200 || r.status >= 300);
  if (failed.length > 0) {
    console.log(`\n⚠️  ${failed.length}/${results.length} endpoint(s) en échec.`);
    console.log("→ Les endpoints utilisés par l'adapter peuvent nécessiter un ajustement");
    console.log("  (cf. services/integrations/adapters/myunisoft/fetchers.ts).");
    process.exit(1);
  }
  console.log(`\n✅ Tous les endpoints ont répondu 2xx — l'adapter peut tourner en prod.`);
})().catch((err) => {
  console.error("\n❌ Probe failed:", err);
  process.exit(1);
});
