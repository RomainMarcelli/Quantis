import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "vitest";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { processPdfWithDocumentAI } from "@/services/documentAI";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";
import { detectDocumentFormat } from "@/services/pdf-analysis/formatDetector";
import {
  buildReconstructedRows,
  detectCdrLayout
} from "@/services/pdf-analysis/rowReconstruction";

// Diagnostic TROIS V SARL — format Sage (logiciel comptable).
// Skip par défaut ; activer via RUN_TROISV_DIAGNOSTIC=true.
// Sauve une fixture via SAVE_TROISV_FIXTURE=true.

const RUN_DIAGNOSTIC = process.env.RUN_TROISV_DIAGNOSTIC === "true";

const PDF_PATH = "docs/docs-compta/TROISV - Comptes sociaux 2025.pdf";

describe.skipIf(!RUN_DIAGNOSTIC)("TROIS V Sage diagnostic", () => {
  it("capture rawText, rows, marqueurs Sage, traces 6 champs", async () => {
    const pdfBuffer = readFileSync(join(process.cwd(), PDF_PATH));
    console.log(`\n========== TROIS V DIAGNOSTIC ==========`);
    console.log(`PDF : ${PDF_PATH} (${pdfBuffer.length} octets)`);

    const documentAiResponse = await processPdfWithDocumentAI({
      pdfBuffer,
      fileName: PDF_PATH.split("/").pop() ?? "troisv.pdf",
      mimeType: "application/pdf"
    });

    console.log(`rawText length: ${documentAiResponse.rawText.length}`);
    console.log(`pages: ${documentAiResponse.pages.length}`);
    console.log(`tables: ${documentAiResponse.tables.length}`);

    if (process.env.SAVE_TROISV_FIXTURE === "true") {
      const fixturePath = join(
        process.cwd(),
        "services/pdf-analysis/fixtures/troisv-docai.json"
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

    console.log(`\n========== MARQUEURS SAGE ==========`);
    const rawText = documentAiResponse.rawText;
    const markers = [
      { name: "© Sage", pattern: /©\s*Sage/i },
      { name: "Sage", pattern: /\bSage\b/i },
      { name: "BRUNO ZOUARY", pattern: /BRUNO\s+ZOUARY/i },
      { name: "TROIS V", pattern: /TROIS\s*V/i },
      { name: "Bilan Actif", pattern: /Bilan\s+Actif/i },
      { name: "CR Première Partie", pattern: /Compte de R[ée]sultat \(Premi[èe]re Partie\)/i },
      { name: "CR Seconde Partie", pattern: /Compte de R[ée]sultat \(Seconde Partie\)/i },
      { name: "TOTAL immob incorp", pattern: /TOTAL\s+immobilisations\s+incorporelles/i },
      { name: "Net (N)", pattern: /Net\s*\(N\)/i },
      { name: "Net (N-1)", pattern: /Net\s*\(N-1\)/i },
      { name: "28/02/2025", pattern: /28\/02\/2025/ },
      { name: "29/02/2024", pattern: /29\/02\/2024/ },
      { name: "DGFiP 2050 (neg control)", pattern: /DGFiP\s*N[°o]?\s*205\d\b/i },
      { name: "edi-tdfc (neg control)", pattern: /edi[\s-]?tdfc/i }
    ];
    for (const { name, pattern } of markers) {
      const match = pattern.exec(rawText);
      console.log(`  ${name}: ${match ? `FOUND at pos ${match.index}` : "absent"}`);
    }

    console.log(`\n========== FORMAT DETECTION ==========`);
    const format = detectDocumentFormat(rawText);
    console.log(`detectDocumentFormat() → "${format}"`);

    console.log(`\n========== CDR LAYOUT DETECTION ==========`);
    const rowsForLayout = buildReconstructedRows(documentAiResponse);
    const cdrLayout = detectCdrLayout(rowsForLayout);
    console.log(`detectCdrLayout() → "${cdrLayout}"`);
    console.log(`(nCurrent strategy picks col1 si "standard", col2 si "inverted", fallback rightmost si "unknown")`);

    console.log(`\n========== RAWTEXT — 80 PREMIÈRES LIGNES ==========`);
    const rawLines = rawText.split(/\r?\n/g).map((line, idx) => ({ idx, text: line }));
    for (const { idx, text } of rawLines.slice(0, 80)) {
      console.log(`  [${idx}] ${text}`);
    }

    console.log(`\n========== RAWTEXT AUTOUR DES LIBELLÉS CLÉS ==========`);
    const labelQueries = [
      "Ventes de marchandises",
      "Chiffres d'affaires nets",
      "Salaires et traitements",
      "Charges sociales",
      "CHARGES D'EXPLOITATION",
      "BÉNÉFICE OU PERTE",
      "Dettes fiscales et sociales",
      "Dettes fournisseurs",
      "TOTAL GÉNÉRAL"
    ];
    for (const label of labelQueries) {
      const pattern = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const match = pattern.exec(rawText);
      if (match) {
        const start = Math.max(0, match.index - 20);
        const end = Math.min(rawText.length, match.index + 200);
        const snippet = rawText.slice(start, end).replace(/\n/g, " | ");
        console.log(`  "${label}" @${match.index}: ${snippet}`);
      } else {
        console.log(`  "${label}": absent`);
      }
    }

    console.log(`\n========== PARSING + ROWS (40 premières) ==========`);
    const analysis = analyzeFinancialDocument(documentAiResponse);
    console.log(`detectedSections: ${JSON.stringify(analysis.detectedSections)}`);
    console.log(`confidence: ${analysis.diagnostics.confidenceScore}`);
    console.log(`total rows: ${analysis.rows.length}`);

    for (let i = 0; i < Math.min(40, analysis.rows.length); i++) {
      const row = analysis.rows[i];
      if (!row) continue;
      console.log(
        JSON.stringify({
          idx: i,
          rowNumber: row.rowNumber,
          page: row.page,
          source: row.source,
          section: row.section,
          label: row.label.slice(0, 70),
          lineCode: row.lineCode,
          candidates: row.amountCandidates.map((c) => ({ v: c.value, col: c.columnIndex, h: c.headerHint }))
        })
      );
    }

    console.log(`\n========== TRACES 9 CHAMPS CIBLES ==========`);
    const targetFields = [
      "wages",
      "socialCharges",
      "totalOperatingCharges",
      "salesGoods",
      "totalAssets",
      "taxSocialPayables",
      "netTurnover",
      "equity",
      "debts"
    ];
    for (const field of targetFields) {
      const trace = analysis.traces.find((t) => t.field === field);
      if (!trace) {
        console.log(`\n  [${field}] NO TRACE FOUND`);
        continue;
      }
      console.log(`\n  [${field}]`);
      console.log(`    selected: ${JSON.stringify(trace.selected)}`);
      console.log(`    alternatives (up to 5):`);
      for (const alt of trace.alternatives.slice(0, 5)) {
        console.log(`      ${JSON.stringify(alt)}`);
      }
    }

    console.log(`\n========== VALEURS FINALES MAPPED ==========`);
    const mapped = mapParsedFinancialDataToMappedFinancialData(analysis.parsedFinancialData);
    const kpis = computeKpis(mapped);
    const keyFields = {
      // bilan actif
      total_actif: mapped.total_actif,
      total_actif_immo: mapped.total_actif_immo,
      total_actif_circ: mapped.total_actif_circ,
      stocks_march: mapped.stocks_march,
      clients: mapped.clients,
      autres_creances: mapped.autres_creances,
      dispo: mapped.dispo,
      // bilan passif
      total_cp: mapped.total_cp,
      fournisseurs: mapped.fournisseurs,
      dettes_fisc_soc: mapped.dettes_fisc_soc,
      total_dettes: mapped.total_dettes,
      total_passif: mapped.total_passif,
      capital: mapped.capital,
      // CDR
      ventes_march: mapped.ventes_march,
      prod_serv: mapped.prod_serv,
      ca_kpi: kpis.ca,
      ca_mapped: mapped.ca,
      ace: mapped.ace,
      salaires: mapped.salaires,
      charges_soc: mapped.charges_soc,
      dap: mapped.dap,
      impots_taxes: mapped.impots_taxes,
      total_prod_expl: mapped.total_prod_expl,
      total_charges_expl: mapped.total_charges_expl,
      resultat_exercice: mapped.resultat_exercice,
      prod_excep: mapped.prod_excep,
      charges_excep: mapped.charges_excep
    };
    console.log(JSON.stringify(keyFields, null, 2));

    console.log(`\n========== FIN DIAGNOSTIC ==========\n`);
  }, 120_000);
});
