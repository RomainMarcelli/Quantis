import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearReducedPdfStoreForTests,
  deleteReducedPdf,
  getReducedPdf,
  storeReducedPdf
} from "@/services/pdf-analysis/reducedPdfStore";

describe("reducedPdfStore", () => {
  beforeEach(() => {
    __clearReducedPdfStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    __clearReducedPdfStoreForTests();
  });

  it("store + get retourne le buffer original", () => {
    const buffer = Buffer.from("fake pdf content");
    storeReducedPdf("req-1", buffer);

    const retrieved = getReducedPdf("req-1");

    expect(retrieved).toBe(buffer);
  });

  it("get avec un requestId inconnu retourne null", () => {
    expect(getReducedPdf("unknown-id")).toBeNull();
  });

  it("get après TTL expiré retourne null et supprime l'entrée", () => {
    vi.useFakeTimers();
    const buffer = Buffer.from("expiring pdf");
    storeReducedPdf("req-2", buffer);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(getReducedPdf("req-2")).toBeNull();
    // Seconde lecture pour confirmer la suppression définitive
    expect(getReducedPdf("req-2")).toBeNull();
  });

  it("delete retire l'entrée immédiatement", () => {
    const buffer = Buffer.from("to delete");
    storeReducedPdf("req-3", buffer);

    deleteReducedPdf("req-3");

    expect(getReducedPdf("req-3")).toBeNull();
  });
});
