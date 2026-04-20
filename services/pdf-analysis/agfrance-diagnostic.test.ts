import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { processPdfWithDocumentAI } from "@/services/documentAI";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";

// Diagnostic AG FRANCE — formulaire DGFiP 2050/2051/2052/2053 scanné (edi-tdfc).
// Skip par défaut ; activer via RUN_AGFRANCE_DIAGNOSTIC=true.
// Sauve une fixture via SAVE_AGFRANCE_FIXTURE=true.

const RUN_DIAGNOSTIC = process.env.RUN_AGFRANCE_DIAGNOSTIC === "true";

const PDF_PATH = "docs/docs-compta/AG FRANCE - Comptes sociaux 2024.pdf";

describe.skipIf(!RUN_DIAGNOSTIC)("AG FRANCE DGFiP 2050 diagnostic", () => {
  it("capture rawText, rows, marqueurs de format", async () => {
    const pdfBuffer = readFileSync(join(process.cwd(), PDF_PATH));
    console.log(`\n========== AG FRANCE DIAGNOSTIC ==========`);
    console.log(`PDF : ${PDF_PATH} (${pdfBuffer.length} octets)`);

    const documentAiResponse = await processPdfWithDocumentAI({
      pdfBuffer,
      fileName: PDF_PATH.split("/").pop() ?? "agfrance.pdf",
      mimeType: "application/pdf"
    });

    console.log(`rawText length: ${documentAiResponse.rawText.length}`);
    console.log(`pages: ${documentAiResponse.pages.length}`);
    console.log(`tables: ${documentAiResponse.tables.length}`);

    if (process.env.SAVE_AGFRANCE_FIXTURE === "true") {
      const fixturePath = join(
        process.cwd(),
        "services/pdf-analysis/fixtures/agfrance-docai.json"
      );
      mkdirSync(dirname(fixturePath), { recursive: true });
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

    console.log(`\n========== MARQUEURS DE FORMAT ==========`);
    const rawText = documentAiResponse.rawText;
    const markers = [
      { name: "2050", pattern: /\b2050\b/ },
      { name: "2051", pattern: /\b2051\b/ },
      { name: "2052", pattern: /\b2052\b/ },
      { name: "2053", pattern: /\b2053\b/ },
      { name: "edi-tdfc", pattern: /edi[\s-]?tdfc/i },
      { name: "DGFiP", pattern: /DGFiP/i },
      { name: "code AA inline", pattern: /\bAA\b/ },
      { name: "code BJ inline", pattern: /\bBJ\b/ },
      { name: "code FA inline", pattern: /\bFA\b/ },
      { name: "code FJ inline", pattern: /\bFJ\b/ },
      { name: "code FY inline", pattern: /\bFY\b/ },
      { name: "code CF inline", pattern: /\bCF\b/ },
      { name: "code HN inline", pattern: /\bHN\b/ },
      { name: "code DL inline", pattern: /\bDL\b/ }
    ];
    for (const { name, pattern } of markers) {
      const match = pattern.exec(rawText);
      console.log(`  ${name}: ${match ? `FOUND at pos ${match.index}` : "absent"}`);
    }

    console.log(`\n========== RAWTEXT — 100 PREMIÈRES LIGNES ==========`);
    const rawLines = rawText.split(/\r?\n/g).map((line, idx) => ({ idx, text: line }));
    for (const { idx, text } of rawLines.slice(0, 100)) {
      console.log(`  [${idx}] ${text}`);
    }

    console.log(`\n========== RAWTEXT AUTOUR DES CODES ALPHA CLÉS ==========`);
    const alphaCodeQueries = ["BJ", "BT", "BX", "BZ", "CF", "CJ", "CO", "DL", "DX", "DY", "FA", "FG", "FJ", "FW", "FY", "FZ", "GA", "GF", "HN"];
    for (const code of alphaCodeQueries) {
      const regex = new RegExp(`\\b${code}\\b`);
      const match = regex.exec(rawText);
      if (match) {
        const start = Math.max(0, match.index - 80);
        const end = Math.min(rawText.length, match.index + 120);
        const snippet = rawText.slice(start, end).replace(/\n/g, " | ");
        console.log(`  ${code} @${match.index}: ${snippet}`);
      } else {
        console.log(`  ${code}: absent`);
      }
    }

    console.log(`\n========== PARSING + 30 PREMIÈRES ROWS ==========`);
    const analysis = analyzeFinancialDocument(documentAiResponse);
    console.log(`detectedSections: ${JSON.stringify(analysis.detectedSections)}`);
    console.log(`confidence: ${analysis.diagnostics.confidenceScore}`);

    for (let i = 0; i < Math.min(30, analysis.rows.length); i++) {
      const row = analysis.rows[i];
      if (!row) continue;
      console.log(
        JSON.stringify({
          idx: i,
          rowNumber: row.rowNumber,
          page: row.page,
          source: row.source,
          section: row.section,
          label: row.label.slice(0, 60),
          lineCode: row.lineCode,
          candidates: row.amountCandidates.map((c) => ({ v: c.value, col: c.columnIndex }))
        })
      );
    }

    console.log(`\n========== VALEURS FINALES MAPPED ==========`);
    const mapped = mapParsedFinancialDataToMappedFinancialData(analysis.parsedFinancialData);
    const kpis = computeKpis(mapped);
    const keyFields = {
      total_actif: mapped.total_actif,
      total_actif_immo: mapped.total_actif_immo,
      total_actif_circ: mapped.total_actif_circ,
      stocks_march: mapped.stocks_march,
      clients: mapped.clients,
      autres_creances: mapped.autres_creances,
      dispo: mapped.dispo,
      total_cp: mapped.total_cp,
      fournisseurs: mapped.fournisseurs,
      dettes_fisc_soc: mapped.dettes_fisc_soc,
      total_dettes: mapped.total_dettes,
      ventes_march: mapped.ventes_march,
      prod_serv: mapped.prod_serv,
      ca_kpi: kpis.ca,
      ca_mapped: mapped.ca,
      ace: mapped.ace,
      salaires: mapped.salaires,
      charges_soc: mapped.charges_soc,
      dap: mapped.dap,
      total_charges_expl: mapped.total_charges_expl,
      resultat_exercice: mapped.resultat_exercice,
      prod_excep: mapped.prod_excep,
      charges_excep: mapped.charges_excep
    };
    console.log(JSON.stringify(keyFields, null, 2));

    console.log(`\n========== FIN DIAGNOSTIC ==========\n`);
  }, 120_000);
});
