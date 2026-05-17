// File: services/integrations/connectorVisibility.test.ts
// Role: couverture du module central de visibilité MVP Phase 1
// (brief 14/05/2026). Vérifie que :
//   - Les 3 connecteurs MVP (Pennylane manuel, MyU manuel, FEC) sont
//     TOUJOURS visibles, peu importe les env vars.
//   - Bridge, Odoo, Tiime sont MASQUÉS par défaut et n'apparaissent que
//     si leur flag dédié vaut "true".
//   - Pennylane Firm/Company sont gatés via les helpers existants
//     isFirmOAuthVisible / isCompanyOAuthEnabled.
//   - Parsing strict ("true" only — rejette "1", "yes", "TRUE" en partie).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConnectorVisibility } from "@/services/integrations/connectorVisibility";

const FLAGS = [
  "PENNYLANE_FIRM_VISIBLE",
  "PENNYLANE_COMPANY_ENABLED",
  "BRIDGE_VISIBLE",
  "ODOO_VISIBLE",
  "TIIME_VISIBLE",
] as const;

const ORIGINAL: Partial<Record<(typeof FLAGS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const flag of FLAGS) {
    ORIGINAL[flag] = process.env[flag];
    delete process.env[flag];
  }
});

afterEach(() => {
  for (const flag of FLAGS) {
    const original = ORIGINAL[flag];
    if (original === undefined) delete process.env[flag];
    else process.env[flag] = original;
  }
});

describe("getConnectorVisibility — MVP Phase 1 defaults", () => {
  it("Pennylane manuel TOUJOURS visible (jamais flagué)", () => {
    const v = getConnectorVisibility();
    expect(v.pennylane_manual.visible).toBe(true);
  });

  it("MyU manuel TOUJOURS visible (jamais flagué)", () => {
    const v = getConnectorVisibility();
    expect(v.myu_manual.visible).toBe(true);
  });

  it("FEC upload TOUJOURS visible (jamais flagué)", () => {
    const v = getConnectorVisibility();
    expect(v.fec_upload.visible).toBe(true);
  });

  it("Bridge masqué par défaut (BRIDGE_VISIBLE absent)", () => {
    const v = getConnectorVisibility();
    expect(v.bridge.visible).toBe(false);
  });

  it("Odoo masqué par défaut (ODOO_VISIBLE absent)", () => {
    const v = getConnectorVisibility();
    expect(v.odoo.visible).toBe(false);
  });

  it("Tiime masqué par défaut (TIIME_VISIBLE absent)", () => {
    const v = getConnectorVisibility();
    expect(v.tiime.visible).toBe(false);
  });

  it("Pennylane Firm masqué par défaut (PENNYLANE_FIRM_VISIBLE absent)", () => {
    const v = getConnectorVisibility();
    expect(v.pennylane_firm.visible).toBe(false);
  });

  it("Pennylane Company masqué par défaut (PENNYLANE_COMPANY_ENABLED absent)", () => {
    const v = getConnectorVisibility();
    expect(v.pennylane_company.visible).toBe(false);
  });
});

describe("getConnectorVisibility — activation flags", () => {
  it("BRIDGE_VISIBLE=true → bridge.visible=true", () => {
    process.env.BRIDGE_VISIBLE = "true";
    expect(getConnectorVisibility().bridge.visible).toBe(true);
  });

  it("ODOO_VISIBLE=true → odoo.visible=true", () => {
    process.env.ODOO_VISIBLE = "true";
    expect(getConnectorVisibility().odoo.visible).toBe(true);
  });

  it("TIIME_VISIBLE=true → tiime.visible=true", () => {
    process.env.TIIME_VISIBLE = "true";
    expect(getConnectorVisibility().tiime.visible).toBe(true);
  });

  it("PENNYLANE_FIRM_VISIBLE=true → pennylane_firm.visible=true (non-régression commit 88e3e4b)", () => {
    process.env.PENNYLANE_FIRM_VISIBLE = "true";
    expect(getConnectorVisibility().pennylane_firm.visible).toBe(true);
  });

  it("PENNYLANE_COMPANY_ENABLED=true → pennylane_company.visible=true", () => {
    process.env.PENNYLANE_COMPANY_ENABLED = "true";
    expect(getConnectorVisibility().pennylane_company.visible).toBe(true);
  });
});

describe("getConnectorVisibility — parsing strict", () => {
  it("BRIDGE_VISIBLE='false' explicite → masqué", () => {
    process.env.BRIDGE_VISIBLE = "false";
    expect(getConnectorVisibility().bridge.visible).toBe(false);
  });

  it("Insensible à la casse (BRIDGE_VISIBLE='True')", () => {
    process.env.BRIDGE_VISIBLE = "True";
    expect(getConnectorVisibility().bridge.visible).toBe(true);
  });

  it("Rejette '1', 'yes', 'on' — strict 'true' uniquement", () => {
    for (const value of ["1", "yes", "on", "TRUE_"]) {
      process.env.BRIDGE_VISIBLE = value;
      expect(getConnectorVisibility().bridge.visible).toBe(false);
    }
  });

  it("Active uniquement le bon connecteur — pas de fuite entre flags", () => {
    process.env.BRIDGE_VISIBLE = "true";
    const v = getConnectorVisibility();
    expect(v.bridge.visible).toBe(true);
    expect(v.odoo.visible).toBe(false);
    expect(v.tiime.visible).toBe(false);
    expect(v.pennylane_firm.visible).toBe(false);
  });
});

describe("getConnectorVisibility — tous flags actifs (config preview)", () => {
  it("Tous les flags=true → tous les connecteurs visibles", () => {
    for (const flag of FLAGS) {
      process.env[flag] = "true";
    }
    const v = getConnectorVisibility();
    expect(v.pennylane_manual.visible).toBe(true);
    expect(v.myu_manual.visible).toBe(true);
    expect(v.fec_upload.visible).toBe(true);
    expect(v.pennylane_firm.visible).toBe(true);
    expect(v.pennylane_company.visible).toBe(true);
    expect(v.bridge.visible).toBe(true);
    expect(v.odoo.visible).toBe(true);
    expect(v.tiime.visible).toBe(true);
  });
});
