import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { processPdfWithDocumentAI } from "@/services/documentAI";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";

const TARGET_FIELDS = new Set([
  "externalCharges",
  "wages",
  "socialCharges",
  "depreciationAllocations",
  "taxesAndLevies",
  "exceptionalProducts",
  "exceptionalCharges",
  "totalOperatingProducts",
  "totalOperatingCharges"
]);

const CDR_LABEL_PATTERNS = [
  /autres?\s+achats?\s+et\s+charges?\s+externes?/i,
  /salaires?\s+et\s+traitements?/i,
  /charges?\s+sociales?/i,
  /dotations?.*amortissements?/i,
  /impots?.*taxes?/i,
  /produits?\s+exceptionnels?/i,
  /charges?\s+exceptionnelles?/i,
  /total\s+des?\s+produits?\s+d[' ]exploitation/i,
  /total\s+des?\s+charges?\s+d[' ]exploitation/i,
  /exercice\s+clos/i,
  /exercice\s+precedent/i
];

const CANDIDATE_PDFS = [
  "docs/docs-compta/BEL AIR FASHION B. AIR - Comptes sociaux 2024réduis.pdf",
  "docs/docs-compta/BEL AIR FASHION B. AIR - Comptes sociaux 2024SHORT.pdf",
  "docs/docs-compta/BEL AIR FASHION B. AIR - Comptes sociaux 2024.pdf"
];

const RUN_DIAGNOSTIC = process.env.RUN_BELAIR_DIAGNOSTIC === "true";

describe.skipIf(!RUN_DIAGNOSTIC)("BEL AIR CDR diagnostic", () => {
  it("capture traces et candidates pour les 9 champs CDR cibles", async () => {
    let documentAiResponse: Awaited<ReturnType<typeof processPdfWithDocumentAI>> | null = null;
    let usedPath: string | null = null;
    const errors: string[] = [];

    for (const rel of CANDIDATE_PDFS) {
      const abs = join(process.cwd(), rel);
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = readFileSync(abs);
      } catch (error) {
        errors.push(`${rel}: fichier illisible — ${String(error)}`);
        continue;
      }

      console.log(`\n[tentative] ${rel} (${pdfBuffer.length} octets)`);
      try {
        documentAiResponse = await processPdfWithDocumentAI({
          pdfBuffer,
          fileName: rel.split("/").pop() ?? "belair.pdf",
          mimeType: "application/pdf"
        });
        usedPath = rel;
        break;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        const pc = (error as { pageCount?: number }).pageCount;
        errors.push(`${rel}: ${code ?? "ERR"} (${pc ?? "?"} pages) — ${String(error).slice(0, 120)}`);
      }
    }

    if (!documentAiResponse || !usedPath) {
      throw new Error(`Aucun PDF BEL AIR traitable :\n  - ${errors.join("\n  - ")}`);
    }

    console.log(`\n========== BEL AIR DIAGNOSTIC ==========`);
    console.log(`PDF utilisé : ${usedPath}`);

    console.log(`rawText length: ${documentAiResponse.rawText.length}`);
    console.log(`pages: ${documentAiResponse.pages.length}`);
    console.log(`tables: ${documentAiResponse.tables.length}`);

    const analysis = analyzeFinancialDocument(documentAiResponse);

    console.log(`\n========== ROWS CDR CANDIDATES ==========`);
    const cdrRows = analysis.rows.filter((row) =>
      row.section === "incomeStatement" &&
      CDR_LABEL_PATTERNS.some((pattern) => pattern.test(row.normalizedLabel))
    );

    cdrRows.forEach((row) => {
      console.log(
        JSON.stringify(
          {
            source: row.source,
            page: row.page,
            label: row.label,
            normalizedLabel: row.normalizedLabel,
            lineCode: row.lineCode,
            fullText: row.fullText.slice(0, 200),
            candidates: row.amountCandidates.map((c) => ({
              value: c.value,
              columnIndex: c.columnIndex,
              headerHint: c.headerHint,
              raw: c.raw
            }))
          },
          null,
          2
        )
      );
    });

    console.log(`\n========== TRACES CHAMPS CIBLES ==========`);
    const targetTraces = analysis.traces.filter((trace) => TARGET_FIELDS.has(trace.field));
    targetTraces.forEach((trace) => {
      console.log(
        JSON.stringify(
          {
            field: trace.field,
            selected: trace.selected,
            alternatives: trace.alternatives
          },
          null,
          2
        )
      );
    });

    console.log(`\n========== VALEURS FINALES (ParsedFinancialData) ==========`);
    const is = analysis.parsedFinancialData.incomeStatement;
    console.log(
      JSON.stringify(
        {
          externalCharges: is.externalCharges,
          wages: is.wages,
          socialCharges: is.socialCharges,
          depreciationAllocations: is.depreciationAllocations,
          taxesAndLevies: is.taxesAndLevies,
          exceptionalProducts: is.exceptionalProducts,
          exceptionalCharges: is.exceptionalCharges,
          totalOperatingProducts: is.totalOperatingProducts,
          totalOperatingCharges: is.totalOperatingCharges,
          netTurnover: is.netTurnover,
          netResult: is.netResult
        },
        null,
        2
      )
    );

    console.log(`\n========== VALEURS MAPPÉES (MappedFinancialData — noms app) ==========`);
    const mapped = mapParsedFinancialDataToMappedFinancialData(analysis.parsedFinancialData);
    console.log(
      JSON.stringify(
        {
          ace: mapped.ace,
          salaires: mapped.salaires,
          charges_soc: mapped.charges_soc,
          dap: mapped.dap,
          impots_taxes: mapped.impots_taxes,
          prod_excep: mapped.prod_excep,
          charges_excep: mapped.charges_excep,
          total_prod_expl: mapped.total_prod_expl,
          total_charges_expl: mapped.total_charges_expl,
          ca: mapped.ca,
          resultat_exercice: mapped.resultat_exercice
        },
        null,
        2
      )
    );

    console.log(`\n========== KPIs CALCULÉS ==========`);
    const kpis = computeKpis(mapped);
    const kpiNullFields = Object.entries(kpis)
      .filter(([, value]) => value === null)
      .map(([key]) => key);
    console.log(
      JSON.stringify(
        {
          ca: kpis.ca,
          tcam: kpis.tcam,
          va: kpis.va,
          ebitda: kpis.ebitda,
          marge_ebitda: kpis.marge_ebitda,
          mscv: kpis.mscv,
          charges_fixes: kpis.charges_fixes,
          point_mort: kpis.point_mort,
          bfr: kpis.bfr,
          caf: kpis.caf,
          tn: kpis.tn,
          solvabilite: kpis.solvabilite,
          roce: kpis.roce,
          roe: kpis.roe,
          resultat_net: kpis.resultat_net,
          null_fields_count: kpiNullFields.length,
          null_fields: kpiNullFields
        },
        null,
        2
      )
    );

    console.log(`\n========== FIN DIAGNOSTIC ==========\n`);
  }, 120_000);
});
