import { describe, expect, it } from "vitest";
import { selectFinancialPageIndices } from "./pdfImageExtractor";

describe("selectFinancialPageIndices", () => {
  it("retourne 6 indices dans [3,14] pour un PDF de 35 pages", () => {
    const indices = selectFinancialPageIndices(35, 6);
    expect(indices).toHaveLength(6);
    expect(indices[0]).toBeGreaterThanOrEqual(3);
    expect(indices[indices.length - 1]).toBeLessThanOrEqual(14);
  });

  it("retourne toutes les pages si totalPages <= maxPages", () => {
    const indices = selectFinancialPageIndices(5, 6);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it("retourne 6 indices dans [2,10] pour un PDF de 20 pages", () => {
    const indices = selectFinancialPageIndices(20, 6);
    expect(indices).toHaveLength(6);
    expect(indices[0]).toBeGreaterThanOrEqual(1);
    expect(indices[indices.length - 1]).toBeLessThan(10);
  });
});
