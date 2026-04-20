import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  "totalOperatingCharges",
  "productionSoldGoods",
  "productionSoldServices",
  "productionSold",
  "netTurnover"
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

    if (process.env.SAVE_BELAIR_FIXTURE === "true") {
      const fixturePath = join(
        process.cwd(),
        "services/pdf-analysis/fixtures/belair-docai.json"
      );
      mkdirSync(dirname(fixturePath), { recursive: true });
      // On ne garde que les `tables` de chaque page (le reste — tokens, bounding boxes,
      // layout pixel — pèse ~16 MB et n'est pas utilisé par le parser). Pour BEL AIR,
      // `tables` est vide, donc on produit une fixture minimale.
      const trimmedPages = documentAiResponse.pages.map((page) => {
        const record = page as Record<string, unknown>;
        return {
          tables: Array.isArray(record.tables) ? record.tables : []
        };
      });
      const payload = {
        rawText: documentAiResponse.rawText,
        pages: trimmedPages,
        tables: documentAiResponse.tables
      };
      writeFileSync(fixturePath, JSON.stringify(payload, null, 2));
      console.log(`[FIXTURE] écrit : ${fixturePath} (${JSON.stringify(payload).length} octets)`);
    }

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
          resultat_exercice: mapped.resultat_exercice,
          autres_creances: mapped.autres_creances,
          dettes_fisc_soc: mapped.dettes_fisc_soc,
          dispo: mapped.dispo,
          clients: mapped.clients,
          prod_vendue: mapped.prod_vendue
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

    console.log(`\n========== DUMP ROWS AUTOUR DES ANCRES BILAN / CDR ==========`);
    const ANCHOR_PATTERNS: Array<{ label: string; pattern: RegExp; before?: number; after?: number }> = [
      { label: "otherReceivables (autres creances)", pattern: /^autres\s+creances?\b/ },
      { label: "taxSocialPayables (dettes fiscales et sociales)", pattern: /^dettes?\s+fiscales?\s+et\s+sociales?\b/ },
      { label: "productionSoldServices (production vendue services)", pattern: /production\s+vendue.*services?/, before: 5, after: 5 }
    ];

    for (const { label, pattern, before = 20, after = 20 } of ANCHOR_PATTERNS) {
      const anchorIndex = analysis.rows.findIndex((row) => pattern.test(row.normalizedLabel));
      console.log(`\n--- ${label} ---`);
      if (anchorIndex < 0) {
        console.log(`  (ancre introuvable)`);
        continue;
      }
      console.log(`  anchorIndex=${anchorIndex}`);
      const start = Math.max(0, anchorIndex - before);
      const end = Math.min(analysis.rows.length, anchorIndex + after + 1);
      for (let i = start; i < end; i++) {
        const row = analysis.rows[i];
        if (!row) continue;
        const marker = i === anchorIndex ? " <== ANCHOR" : "";
        console.log(
          JSON.stringify(
            {
              idx: i,
              rowNumber: row.rowNumber,
              page: row.page,
              source: row.source,
              section: row.section,
              label: row.label,
              fullText: row.fullText.slice(0, 120),
              lineCode: row.lineCode,
              candidates: row.amountCandidates.map((c) => ({
                value: c.value,
                columnIndex: c.columnIndex,
                raw: c.raw
              }))
            }
          ) + marker
        );
      }
    }

    console.log(`\n========== DUMP RAW TEXT BRUT (extraits pertinents) ==========`);
    const rawText = documentAiResponse.rawText;
    const RAW_MARKERS = [
      { label: "autres creances", pattern: /autres\s+cr[eé]ances/i },
      { label: "dettes fiscales et sociales", pattern: /dettes?\s+fiscales?\s+et\s+sociales?/i },
      { label: "production vendue services", pattern: /production\s+vendue[^\n]*services?/i }
    ];
    for (const { label, pattern } of RAW_MARKERS) {
      const match = pattern.exec(rawText);
      if (!match) {
        console.log(`\n--- raw ${label} : introuvable ---`);
        continue;
      }
      const start = Math.max(0, match.index - 200);
      const end = Math.min(rawText.length, match.index + 3000);
      console.log(`\n--- raw ${label} (pos ${match.index}) ---`);
      console.log(rawText.slice(start, end));
    }

    console.log(`\n========== FIN DIAGNOSTIC ==========\n`);
  }, 120_000);
});
