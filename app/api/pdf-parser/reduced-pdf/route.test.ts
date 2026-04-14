import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  __clearReducedPdfStoreForTests,
  storeReducedPdf
} from "@/services/pdf-analysis/reducedPdfStore";

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

describe("GET /api/pdf-parser/reduced-pdf", () => {
  beforeEach(() => {
    __clearReducedPdfStoreForTests();
  });

  afterEach(() => {
    __clearReducedPdfStoreForTests();
  });

  it("retourne 400 si requestId absent", async () => {
    const response = await GET(makeRequest("http://localhost/api/pdf-parser/reduced-pdf"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("retourne 404 si requestId inconnu", async () => {
    const response = await GET(
      makeRequest("http://localhost/api/pdf-parser/reduced-pdf?requestId=unknown")
    );
    expect(response.status).toBe(404);
  });

  it("retourne 200 + application/pdf quand le buffer est présent", async () => {
    const buffer = Buffer.from("%PDF-1.4 fake content");
    storeReducedPdf("req-42", buffer);

    const response = await GET(
      makeRequest("http://localhost/api/pdf-parser/reduced-pdf?requestId=req-42")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");

    const returnedBytes = Buffer.from(await response.arrayBuffer());
    expect(returnedBytes.equals(buffer)).toBe(true);
  });
});
