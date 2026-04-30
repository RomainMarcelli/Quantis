// File: services/integrations/adapters/pennylane/fetchers.test.ts
// Role: tests unitaires sur la construction des filtres Pennylane v2.
//
// Régression couverte : Pennylane v2 n'autorise PAS `updated_at` sur
// /customers / /suppliers / /ledger_accounts (allowlist limitée à
// `id, customer_type, ledger_account_id, name, external_reference,
// reg_no, emails` côté /customers). L'ancien comportement ajoutait
// `updated_at` en mode incrémental → 400 Pennylane :
//   "Field \"updated_at\" is not allowed for filter."
//
// On verrouille ici le comportement attendu :
//   - static       : aucun filtre
//   - entity       : aucun filtre (refetch full du référentiel à chaque sync)
//   - transactional initial   : borne `date >= periodStart` + `date <= periodEnd`
//   - transactional incremental : filtre `updated_at >= periodStart`

import { describe, expect, it } from "vitest";
import { buildFilters } from "@/services/integrations/adapters/pennylane/fetchers";
import type { AdapterSyncContext, Connection } from "@/types/connectors";

function makeCtx(
  mode: "initial" | "incremental",
  periodStart: Date,
  periodEnd: Date
): AdapterSyncContext {
  // On n'utilise pas la connection dans buildFilters — un stub minimal suffit.
  const connection = {
    id: "conn-1",
    userId: "user-1",
    provider: "pennylane",
    auth: { mode: "company_token", accessToken: "x", externalCompanyId: "co-1" },
  } as unknown as Connection;
  return { connection, mode, periodStart, periodEnd };
}

describe("buildFilters (Pennylane fetchers)", () => {
  const periodStart = new Date("2026-01-01T00:00:00.000Z");
  const periodEnd = new Date("2026-04-30T00:00:00.000Z");

  it("static + initial : aucun filtre", () => {
    const ctx = makeCtx("initial", periodStart, periodEnd);
    expect(buildFilters(ctx, "static")).toEqual({});
  });

  it("static + incremental : aucun filtre", () => {
    const ctx = makeCtx("incremental", periodStart, periodEnd);
    expect(buildFilters(ctx, "static")).toEqual({});
  });

  it("entity + initial : aucun filtre (référentiel refetch full)", () => {
    const ctx = makeCtx("initial", periodStart, periodEnd);
    expect(buildFilters(ctx, "entity")).toEqual({});
  });

  it("entity + incremental : aucun filtre — Pennylane refuse updated_at sur /customers, /suppliers, /ledger_accounts", () => {
    const ctx = makeCtx("incremental", periodStart, periodEnd);
    const result = buildFilters(ctx, "entity");
    expect(result).toEqual({});
    // Sécurité : si quelqu'un réintroduit `updated_at` ici, le test casse.
    expect(JSON.stringify(result)).not.toContain("updated_at");
  });

  it("transactional + initial : borne date sur la période demandée", () => {
    const ctx = makeCtx("initial", periodStart, periodEnd);
    const result = buildFilters(ctx, "transactional");
    expect(result.filter).toBeDefined();
    const parsed = JSON.parse(result.filter as string) as Array<{
      field: string;
      operator: string;
      value: string;
    }>;
    expect(parsed).toEqual([
      { field: "date", operator: "gteq", value: "2026-01-01" },
      { field: "date", operator: "lteq", value: "2026-04-30" },
    ]);
  });

  it("transactional + incremental : filtre date >= periodStart (Pennylane refuse updated_at sur /ledger_entries)", () => {
    const ctx = makeCtx("incremental", periodStart, periodEnd);
    const result = buildFilters(ctx, "transactional");
    expect(result.filter).toBeDefined();
    const parsed = JSON.parse(result.filter as string) as Array<{
      field: string;
      operator: string;
      value: string;
    }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      field: "date",
      operator: "gteq",
      value: "2026-01-01",
    });
    // Sécurité : si `updated_at` réapparaît ici, le sync casse (400 Pennylane).
    expect(JSON.stringify(result)).not.toContain("updated_at");
  });
});
