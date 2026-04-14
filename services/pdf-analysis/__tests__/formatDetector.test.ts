import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectDocumentFormat } from "@/services/pdf-analysis/formatDetector";

function loadFixtureRawText(fileName: string): string {
  const fixturePath = join(process.cwd(), "services/pdf-analysis/fixtures", fileName);
  const raw = readFileSync(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as { rawText: string };
  return parsed.rawText;
}

describe("detectDocumentFormat", () => {
  it("retourne 'unknown' pour un rawText vide", () => {
    expect(detectDocumentFormat("")).toBe("unknown");
    expect(detectDocumentFormat("   \n\t  ")).toBe("unknown");
  });

  it("détecte '2033-sd' sur la fixture BEL AIR (aucun marqueur 2050)", () => {
    const rawText = loadFixtureRawText("belair-docai.json");
    expect(detectDocumentFormat(rawText)).toBe("2033-sd");
  });

  it("détecte 'dgfip-2050' sur la fixture AG FRANCE", () => {
    const rawText = loadFixtureRawText("agfrance-docai.json");
    expect(detectDocumentFormat(rawText)).toBe("dgfip-2050");
  });

  it("détecte 'dgfip-2050' via le titre DGFiP N° 2050", () => {
    const rawText = "Quelques lignes\nDGFiP N° 2050\nFin du document";
    expect(detectDocumentFormat(rawText)).toBe("dgfip-2050");
  });

  it("détecte 'dgfip-2050' via le marqueur edi-tdfc", () => {
    const rawText = "edi-tdfc\nBilan actif\nFonds commercial";
    expect(detectDocumentFormat(rawText)).toBe("dgfip-2050");
  });

  it("détecte 'dgfip-2050' via 3+ codes alphabétiques caractéristiques", () => {
    const rawText = "AA quelque chose\nBJ autre ligne\nFJ encore";
    expect(detectDocumentFormat(rawText)).toBe("dgfip-2050");
  });

  it("ne détecte PAS 'dgfip-2050' avec seulement 2 codes alphabétiques", () => {
    // AA + BJ seulement (sans titre ni edi-tdfc) → pas assez robuste
    const rawText = "AA blabla BJ blabla";
    expect(detectDocumentFormat(rawText)).toBe("2033-sd");
  });

  it("retombe sur '2033-sd' par défaut pour un rawText neutre", () => {
    const rawText = "CHIFFRES D'AFFAIRES NETS 209 10 307 405 3 370 595";
    expect(detectDocumentFormat(rawText)).toBe("2033-sd");
  });
});
