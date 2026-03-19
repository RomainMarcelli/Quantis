import { describe, expect, it } from "vitest";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";

describe("detectSupportedUploadType", () => {
  it("detects excel files", () => {
    expect(detectSupportedUploadType("balance.xlsx", "application/vnd.ms-excel")).toBe("excel");
    expect(detectSupportedUploadType("export.csv", "text/csv")).toBe("excel");
  });

  it("detects pdf files", () => {
    expect(detectSupportedUploadType("report.pdf", "application/pdf")).toBe("pdf");
  });

  it("returns null for unsupported formats", () => {
    expect(detectSupportedUploadType("photo.png", "image/png")).toBeNull();
  });
});

