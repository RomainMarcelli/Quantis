const TOKEN = process.env.PENNYLANE_TEST_TOKEN;
if (!TOKEN) process.exit(1);
const BASE = "https://app.pennylane.com/api/external/v2";

async function call(p: string) {
  const r = await fetch(`${BASE}${p}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const t = await r.text();
  console.log(`\n[${p}] ${r.status}\n${t.slice(0, 2500)}`);
}

(async () => {
  // Période 2026 complète.
  await call("/trial_balance?period_start=2026-01-01&period_end=2026-12-31");
  // Avec limit pour cursor.
  await call("/trial_balance?period_start=2026-01-01&period_end=2026-12-31&limit=10");
})();
