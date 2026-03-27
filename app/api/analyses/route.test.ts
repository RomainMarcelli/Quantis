import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runAnalysisPipelineMock,
  enforceRouteRateLimitMock,
  safeLogSecurityEventFromRequestMock
} = vi.hoisted(() => ({
  runAnalysisPipelineMock: vi.fn(),
  enforceRouteRateLimitMock: vi.fn(),
  safeLogSecurityEventFromRequestMock: vi.fn()
}));

vi.mock("@/services/analysisPipeline", () => ({
  runAnalysisPipeline: runAnalysisPipelineMock
}));

vi.mock("@/lib/server/rateLimit", () => ({
  enforceRouteRateLimit: enforceRouteRateLimitMock
}));

vi.mock("@/lib/server/securityAudit", () => ({
  safeLogSecurityEventFromRequest: safeLogSecurityEventFromRequestMock
}));

import { POST } from "@/app/api/analyses/route";

describe("POST /api/analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRouteRateLimitMock.mockReturnValue(null);
    safeLogSecurityEventFromRequestMock.mockResolvedValue(undefined);
    runAnalysisPipelineMock.mockResolvedValue({
      folderName: "Dossier principal",
      createdAt: new Date("2026-03-27T10:00:00.000Z").toISOString()
    });
  });

  it("retourne 400 quand aucun fichier n'est envoye", async () => {
    const formData = new FormData();
    formData.append("userId", "user-1");

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Au moins un fichier");
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled();
  });

  it("retourne 500 pour un format de fichier non supporte", async () => {
    const formData = new FormData();
    formData.append("userId", "user-1");
    formData.append("files", createFile("unsupported.txt", "text/plain", "hello"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as { error: string; detail: string };

    expect(response.status).toBe(500);
    expect(payload.error).toContain("echoue");
    expect(payload.detail).toContain("Format de fichier non supporte");
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled();
  });

  it("accepte les champs optionnels absents et envoie null au pipeline", async () => {
    const formData = new FormData();
    formData.append("userId", "user-42");
    formData.append("folderName", "Mon dossier");
    formData.append("source", "upload");
    formData.append("files", createFile("report.csv", "text/csv", "a,b\n1,2"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as { analysisDraft: { folderName: string } };

    expect(response.status).toBe(200);
    expect(payload.analysisDraft.folderName).toBe("Dossier principal");
    expect(runAnalysisPipelineMock).toHaveBeenCalledTimes(1);
    expect(runAnalysisPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-42",
        folderName: "Mon dossier",
        uploadContext: {
          companySize: null,
          sector: null,
          source: "upload"
        },
        files: [
          expect.objectContaining({
            name: "report.csv",
            type: "excel"
          })
        ]
      })
    );
  });

  it("transmet plusieurs fichiers au pipeline", async () => {
    const formData = new FormData();
    formData.append("userId", "user-99");
    formData.append("files", createFile("first.csv", "text/csv", "a,b\n1,2"));
    formData.append(
      "files",
      createFile(
        "second.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "fake"
      )
    );

    const response = await POST(createRequest(formData));

    expect(response.status).toBe(200);
    expect(runAnalysisPipelineMock).toHaveBeenCalledTimes(1);
    expect(runAnalysisPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({ name: "first.csv", type: "excel" }),
          expect.objectContaining({ name: "second.xlsx", type: "excel" })
        ]
      })
    );
  });
});

function createRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost:3000/api/analyses", {
    method: "POST",
    body: formData
  });
}

function createFile(name: string, mimeType: string, content: string): File {
  return new File([content], name, { type: mimeType });
}
