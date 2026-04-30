// Vérifie que le parser FEC produit le MÊME schéma unifié que les adapters
// dynamiques (Pennylane/MyUnisoft/Odoo). Le critère d'acceptation : à partir
// d'un FEC minimal réaliste, on doit obtenir les mêmes codes 2033-SD côté
// `dailyAccounting` et `balanceSheetSnapshot` que ce que produirait le
// pipeline Pennylane sur les mêmes écritures.

import { describe, expect, it } from "vitest";
import { looksLikeFec, parseFec } from "@/services/parsers/fecParser";
import { buildDailyAccounting } from "@/services/integrations/aggregations/dailyAccountingBuilder";
import { buildBalanceSheetSnapshot } from "@/services/integrations/aggregations/balanceSheetSnapshotBuilder";

const MINIMAL_FEC = [
  "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise",
  // Vente : CA HT 1000 + TVA 200 → 411 client 1200 (DR), 706 prestation 1000 (CR), 44571 TVA 200 (CR)
  "VE|Ventes|V001|20260115|411ACME|Client Acme|||F2026-001|20260115|Vente prestation|1200,00|0,00||||0,00|EUR",
  "VE|Ventes|V001|20260115|706000|Prestations de services|||F2026-001|20260115|Vente prestation|0,00|1000,00||||0,00|EUR",
  "VE|Ventes|V001|20260115|44571|TVA collectée|||F2026-001|20260115|Vente prestation|0,00|200,00||||0,00|EUR",
  // Achat : Loyer HT 500 + TVA 100 → 613 loyer 500 (DR), 4456 TVA 100 (DR), 401 fournisseur 600 (CR)
  "HA|Achats|A001|20260201|613000|Locations|||L2026-02|20260201|Loyer février|500,00|0,00||||0,00|EUR",
  "HA|Achats|A001|20260201|445661|TVA déductible|||L2026-02|20260201|Loyer février|100,00|0,00||||0,00|EUR",
  "HA|Achats|A001|20260201|401LOUEUR|Loueur SARL|||L2026-02|20260201|Loyer février|0,00|600,00||||0,00|EUR",
  // Salaires : 641 8000 (DR) + 645 3200 (DR) → 421 salaires nets 8000 (CR) + 431 charges 3200 (CR)
  "PA|Paie|P001|20260228|641000|Rémunérations|||SAL2026-02|20260228|Salaires février|8000,00|0,00||||0,00|EUR",
  "PA|Paie|P001|20260228|645000|Charges sociales|||SAL2026-02|20260228|Salaires février|3200,00|0,00||||0,00|EUR",
  "PA|Paie|P001|20260228|421000|Personnel rémunérations dues|||SAL2026-02|20260228|Salaires février|0,00|8000,00||||0,00|EUR",
  "PA|Paie|P001|20260228|431000|Sécurité sociale|||SAL2026-02|20260228|Salaires février|0,00|3200,00||||0,00|EUR",
].join("\n");

describe("looksLikeFec", () => {
  it("détecte un en-tête FEC valide", () => {
    expect(looksLikeFec(MINIMAL_FEC)).toBe(true);
  });

  it("rejette un CSV générique sans en-têtes FEC", () => {
    expect(looksLikeFec("date,libelle,montant\n2026-01-01,test,100")).toBe(false);
  });

  it("rejette un fichier vide", () => {
    expect(looksLikeFec("")).toBe(false);
  });
});

describe("parseFec", () => {
  it("regroupe les lignes par EcritureNum en 3 écritures équilibrées", () => {
    const result = parseFec(MINIMAL_FEC);
    expect(result.entries).toHaveLength(3);
    expect(result.stats.delimiter).toBe("|");
    expect(result.stats.rowsRead).toBe(10);

    for (const entry of result.entries) {
      expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 2);
    }
  });

  it("calcule la période effective (min/max EcritureDate)", () => {
    const result = parseFec(MINIMAL_FEC);
    expect(result.periodStart).toBe("2026-01-15");
    expect(result.periodEnd).toBe("2026-02-28");
  });

  it("produit une trial balance par numéro de compte", () => {
    const result = parseFec(MINIMAL_FEC);
    const tb = Object.fromEntries(result.trialBalance.map((t) => [t.accountNumber, t]));
    expect(tb["706000"]?.credit).toBeCloseTo(1000, 2);
    expect(tb["613000"]?.debit).toBeCloseTo(500, 2);
    expect(tb["641000"]?.debit).toBeCloseTo(8000, 2);
    expect(tb["44571"]?.credit).toBeCloseTo(200, 2);
  });

  it("convertit les dates YYYYMMDD en ISO YYYY-MM-DD", () => {
    const result = parseFec(MINIMAL_FEC);
    expect(result.entries[0]?.date.startsWith("2026-")).toBe(true);
  });

  it("accepte le délimiteur tabulation", () => {
    const tabbed = MINIMAL_FEC.replace(/\|/g, "\t");
    const result = parseFec(tabbed);
    expect(result.stats.delimiter).toBe("\t");
    expect(result.entries).toHaveLength(3);
  });

  it("supporte les montants au format virgule (européen) et point", () => {
    const mixed = MINIMAL_FEC.replace("1200,00", "1200.00").replace("1000,00", "1000.00");
    const result = parseFec(mixed);
    expect(result.entries[0]?.totalDebit).toBeCloseTo(1200, 2);
  });

  it("rejette les FEC sans colonne obligatoire", () => {
    const broken = MINIMAL_FEC.replace("EcritureDate", "MyDate");
    expect(() => parseFec(broken)).toThrow(/EcritureDate/);
  });
});

describe("FEC → unified schema (mêmes 2033-SD codes que Pennylane)", () => {
  it("produit dailyAccounting avec les codes P&L attendus (706→prod_serv, 613→ace, 641→salaires, 645→charges_soc)", () => {
    const parsed = parseFec(MINIMAL_FEC);
    const daily = buildDailyAccounting(parsed.entries);

    // Trois jours d'écritures distincts.
    expect(daily).toHaveLength(3);
    const byDate = Object.fromEntries(daily.map((d) => [d.date, d.values]));

    // 15 janvier — vente : prod_serv = 1000 (706 = Prestations de services)
    expect(byDate["2026-01-15"]).toBeDefined();
    expect(byDate["2026-01-15"].prod_serv).toBeCloseTo(1000, 2);
    expect(byDate["2026-01-15"].total_prod_expl).toBeCloseTo(1000, 2);
    expect(byDate["2026-01-15"].ebit).toBeCloseTo(1000, 2);

    // 1 février — loyer : ace = 500 (613 = ACE Autres Charges Externes)
    expect(byDate["2026-02-01"]).toBeDefined();
    expect(byDate["2026-02-01"].ace).toBeCloseTo(500, 2);
    expect(byDate["2026-02-01"].total_charges_expl).toBeCloseTo(500, 2);
    expect(byDate["2026-02-01"].ebit).toBeCloseTo(-500, 2);

    // 28 février — salaires : salaires = 8000, charges_soc = 3200
    expect(byDate["2026-02-28"]).toBeDefined();
    expect(byDate["2026-02-28"].salaires).toBeCloseTo(8000, 2);
    expect(byDate["2026-02-28"].charges_soc).toBeCloseTo(3200, 2);
    expect(byDate["2026-02-28"].total_charges_expl).toBeCloseTo(11200, 2);
    expect(byDate["2026-02-28"].ebit).toBeCloseTo(-11200, 2);
  });

  it("produit balanceSheetSnapshot avec les mêmes codes bilan que Pennylane (creances, fournisseurs, dettes_fisc_soc)", () => {
    const parsed = parseFec(MINIMAL_FEC);
    const snap = buildBalanceSheetSnapshot(parsed.trialBalance, parsed.periodEnd, parsed.periodStart);
    expect(snap.values.creances).toBeGreaterThan(0); // 411 client (solde débiteur)
    expect(snap.values.fournisseurs).toBeGreaterThan(0); // 401 supplier (solde créditeur)
    // Salaires nets dus + sécu + TVA collectée → tous classés en dettes_fisc_soc/dettes
    expect(snap.values.dettes_fisc_soc).toBeGreaterThan(0);
  });

  it("garantit le contrat de clés stable (toutes les variables 2033-SD présentes, même à 0)", () => {
    const parsed = parseFec(MINIMAL_FEC);
    const daily = buildDailyAccounting(parsed.entries);
    const expectedPnlCodes = [
      "ventes_march", "prod_biens", "prod_serv", "prod_vendue", "prod_stockee", "prod_immo",
      "subv_expl", "autres_prod_expl", "total_prod_expl", "achats_march", "var_stock_march",
      "achats_mp", "var_stock_mp", "ace", "impots_taxes", "salaires", "charges_soc", "dap",
      "dprov", "autres_charges_expl", "total_charges_expl", "ebit", "prod_fin", "charges_fin",
      "prod_excep", "charges_excep", "is_impot", "resultat_exercice",
    ];
    for (const day of daily) {
      for (const code of expectedPnlCodes) {
        expect(day.values).toHaveProperty(code);
      }
    }
  });
});
