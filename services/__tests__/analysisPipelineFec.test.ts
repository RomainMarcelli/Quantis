// Verifie qu'un upload de fichier FEC (type="fec") via runAnalysisPipeline
// produit la sortie unifiee : dailyAccounting + balanceSheetSnapshot avec les
// memes variable codes 2033-SD que le pipeline Pennylane / MyUnisoft / Odoo.
//
// Ce test est l'equivalent end-to-end du chemin /api/analyses → fileParser →
// detectSupportedUploadType → runAnalysisPipeline(branche FEC).

import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";

const FEC_CONTENT = [
  "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise",
  // Vente HT 1000 + TVA 200 = 1200 TTC
  "VE|Ventes|V001|20260115|411ACME|Client Acme|||F2026-001|20260115|Vente prestation|1200,00|0,00||||0,00|EUR",
  "VE|Ventes|V001|20260115|706000|Prestations de services|||F2026-001|20260115|Vente prestation|0,00|1000,00||||0,00|EUR",
  "VE|Ventes|V001|20260115|44571|TVA collectee|||F2026-001|20260115|Vente prestation|0,00|200,00||||0,00|EUR",
  // Loyer HT 500 + TVA 100 = 600 TTC
  "HA|Achats|A001|20260201|613000|Locations|||L2026-02|20260201|Loyer fevrier|500,00|0,00||||0,00|EUR",
  "HA|Achats|A001|20260201|445661|TVA deductible|||L2026-02|20260201|Loyer fevrier|100,00|0,00||||0,00|EUR",
  "HA|Achats|A001|20260201|401LOUEUR|Loueur SARL|||L2026-02|20260201|Loyer fevrier|0,00|600,00||||0,00|EUR",
  // Salaires : 8000 brut + 3200 charges
  "PA|Paie|P001|20260228|641000|Remunerations|||SAL2026-02|20260228|Salaires fevrier|8000,00|0,00||||0,00|EUR",
  "PA|Paie|P001|20260228|645000|Charges sociales|||SAL2026-02|20260228|Salaires fevrier|3200,00|0,00||||0,00|EUR",
  "PA|Paie|P001|20260228|421000|Personnel remunerations dues|||SAL2026-02|20260228|Salaires fevrier|0,00|8000,00||||0,00|EUR",
  "PA|Paie|P001|20260228|431000|Securite sociale|||SAL2026-02|20260228|Salaires fevrier|0,00|3200,00||||0,00|EUR",
].join("\n");

describe("Chemin upload FEC : detect → pipeline → AnalysisDraft unifie", () => {
  it("detectSupportedUploadType reconnait un .txt FEC", () => {
    const buffer = Buffer.from(FEC_CONTENT, "utf8");
    expect(detectSupportedUploadType("export.txt", "text/plain", buffer)).toBe("fec");
  });

  it("detectSupportedUploadType reconnait un .csv exporte au format FEC", () => {
    const buffer = Buffer.from(FEC_CONTENT, "utf8");
    expect(detectSupportedUploadType("export.csv", "text/csv", buffer)).toBe("fec");
  });

  it("runAnalysisPipeline produit dailyAccounting + balanceSheetSnapshot pour un fichier FEC", async () => {
    const buffer = Buffer.from(FEC_CONTENT, "utf8");
    const draft = await runAnalysisPipeline({
      userId: "test-user",
      folderName: "Tests FEC",
      files: [
        {
          name: "fec-2026.txt",
          mimeType: "text/plain",
          size: buffer.length,
          type: "fec",
          buffer,
        },
      ],
    });

    // Sortie unifiee presente.
    expect(draft.dailyAccounting).toBeDefined();
    expect(draft.balanceSheetSnapshot).toBeDefined();
    expect(draft.dailyAccounting!.length).toBe(3); // 3 jours d'ecritures distincts.

    // sourceMetadata indique au front que le format dynamique est dispo.
    expect(draft.sourceMetadata).toBeDefined();
    expect(draft.sourceMetadata!.type).toBe("dynamic");
    expect(draft.sourceMetadata!.provider).toBe("fec");
    expect(draft.sourceMetadata!.connectionId).toBeNull();
  });

  it("les variable codes 2033-SD sont identiques a ceux produits par la chaine Pennylane", async () => {
    const buffer = Buffer.from(FEC_CONTENT, "utf8");
    const draft = await runAnalysisPipeline({
      userId: "test-user",
      folderName: "Tests FEC",
      files: [
        { name: "fec-2026.txt", mimeType: "text/plain", size: buffer.length, type: "fec", buffer },
      ],
    });

    const byDate = Object.fromEntries(
      draft.dailyAccounting!.map((d) => [d.date, d.values])
    );

    // 706 -> prod_serv
    expect(byDate["2026-01-15"]?.prod_serv).toBeCloseTo(1000, 2);
    // 613 -> ace
    expect(byDate["2026-02-01"]?.ace).toBeCloseTo(500, 2);
    // 641 -> salaires, 645 -> charges_soc
    expect(byDate["2026-02-28"]?.salaires).toBeCloseTo(8000, 2);
    expect(byDate["2026-02-28"]?.charges_soc).toBeCloseTo(3200, 2);
    // EBIT calcule sur les flux du jour
    expect(byDate["2026-01-15"]?.ebit).toBeCloseTo(1000, 2);
    expect(byDate["2026-02-28"]?.ebit).toBeCloseTo(-11200, 2);

    // balanceSheetSnapshot avec les codes bilan (creances 411, fournisseurs 401, etc.)
    expect(draft.balanceSheetSnapshot!.values.creances).toBeGreaterThan(0);
    expect(draft.balanceSheetSnapshot!.values.fournisseurs).toBeGreaterThan(0);
  });

  it("les KPIs classiques (mappedData + kpis) restent calcules pour la legacy", async () => {
    const buffer = Buffer.from(FEC_CONTENT, "utf8");
    const draft = await runAnalysisPipeline({
      userId: "test-user",
      folderName: "Tests FEC",
      files: [
        { name: "fec-2026.txt", mimeType: "text/plain", size: buffer.length, type: "fec", buffer },
      ],
    });

    expect(draft.mappedData).toBeDefined();
    expect(draft.kpis).toBeDefined();
    expect(draft.financialFacts).toBeDefined();
    expect(draft.quantisScore).toBeDefined();
    expect(draft.fiscalYear).toBe(2026);
  });
});
