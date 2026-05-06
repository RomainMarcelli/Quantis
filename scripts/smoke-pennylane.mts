// Smoke test Pennylane sandbox — phase 1 : valider que les endpoints répondent
// et inspecter la forme réelle des réponses pour ajuster les mappers si besoin.
//
// Usage : PENNYLANE_TEST_TOKEN=xxx npx tsx scripts/smoke-pennylane.mts

const TOKEN = process.env.PENNYLANE_TEST_TOKEN;
if (!TOKEN) {
  console.error("PENNYLANE_TEST_TOKEN non défini.");
  process.exit(1);
}

const BASE = process.env.PENNYLANE_API_BASE_URL || "https://app.pennylane.com/api/external/v2";

type CallResult = { status: number; ok: boolean; body: unknown };

async function call(path: string): Promise<CallResult> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  return { status: res.status, ok: res.ok, body };
}

function previewItems(body: unknown): { items: unknown[]; container: string } {
  if (!body || typeof body !== "object") return { items: [], container: "non-object" };
  const obj = body as Record<string, unknown>;
  for (const key of ["items", "data", "results"]) {
    const v = obj[key];
    if (Array.isArray(v)) return { items: v, container: key };
  }
  return { items: [], container: `keys:[${Object.keys(obj).slice(0, 6).join(",")}]` };
}

function summarize(label: string, result: CallResult): void {
  console.log(`\n[${label}] status=${result.status}`);
  if (!result.ok) {
    const preview =
      typeof result.body === "string"
        ? result.body.slice(0, 200)
        : JSON.stringify(result.body).slice(0, 200);
    console.log(`  err: ${preview}`);
    return;
  }
  const { items, container } = previewItems(result.body);
  console.log(`  container=${container}, items.length=${items.length}`);
  if (items.length > 0) {
    const first = items[0] as Record<string, unknown>;
    console.log(`  keys[0]: ${Object.keys(first).slice(0, 18).join(", ")}`);
    console.log(`  sample[0]: ${JSON.stringify(first).slice(0, 350)}`);
  }
}

(async () => {
  console.log(`[BASE] ${BASE}`);

  const me = await call("/me");
  console.log(`\n[/me] status=${me.status}`);
  if (!me.ok) {
    console.log(
      `  body: ${
        typeof me.body === "string" ? me.body.slice(0, 200) : JSON.stringify(me.body).slice(0, 200)
      }`
    );
    process.exit(2);
  }
  console.log(`  body: ${JSON.stringify(me.body).slice(0, 300)}`);

  const endpoints = [
    "/journals",
    "/ledger_accounts?limit=10",
    "/customers?limit=5",
    "/suppliers?limit=5",
    "/customer_invoices?limit=5",
    "/supplier_invoices?limit=5",
    "/ledger_entries?limit=5",
  ];

  for (const ep of endpoints) {
    try {
      const result = await call(ep);
      summarize(ep, result);
    } catch (e) {
      console.log(`\n[${ep}] EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\n[SMOKE OK]");
})();
