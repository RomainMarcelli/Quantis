import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn()
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: requireAdminMock,
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.name = "AuthError";
    }
  }
}));

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
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ uid: "user-1", email: "admin@test.fr" });
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
