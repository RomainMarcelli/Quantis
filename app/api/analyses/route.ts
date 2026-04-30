// app/api/analyses/route.ts
// Route API d'orchestration d'analyse: upload, parsing, calcul KPI et réponse JSON.
import { NextRequest, NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";
import type { UploadedBinaryFile } from "@/services/parsers/fileParser";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

interface StorageFileRef {
  pdfUrl: string;
  fileName: string;
  fileSize: number;
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Utilisez le SDK client Firestore pour lister les analyses depuis le frontend authentifie."
    },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-analyses-post",
    maxRequests: 12,
    windowMs: 60_000
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let userId: string;
    let folderName: string;
    let companySize: string | null;
    let sector: string | null;
    let source: "dashboard" | "analysis" | "upload" | "manual";
    let storageFiles: StorageFileRef[] = [];
    let formDataFiles: File[] = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      userId = String(body.userId ?? "");
      folderName = String(body.folderName ?? "").trim() || "Dossier principal";
      companySize = body.companySize ? String(body.companySize).trim() : null;
      sector = body.sector ? String(body.sector).trim() : null;
      const sourceRaw = String(body.source ?? "").trim();
      source = sourceRaw === "analysis" || sourceRaw === "upload" || sourceRaw === "manual" ? sourceRaw : "dashboard";
      storageFiles = Array.isArray(body.storageFiles) ? body.storageFiles : [];
    } else {
      const formData = await request.formData();
      userId = String(formData.get("userId") ?? "");
      folderName = String(formData.get("folderName") ?? "").trim() || "Dossier principal";
      companySize = String(formData.get("companySize") ?? "").trim() || null;
      sector = String(formData.get("sector") ?? "").trim() || null;
      const sourceRaw = String(formData.get("source") ?? "").trim();
      source = sourceRaw === "analysis" || sourceRaw === "upload" || sourceRaw === "manual" ? sourceRaw : "dashboard";
      formDataFiles = formData.getAll("files").filter((f): f is File => f instanceof File);

      const storageFilesRaw = formData.get("storageFiles");
      if (typeof storageFilesRaw === "string") {
        try {
          storageFiles = JSON.parse(storageFilesRaw);
        } catch { /* ignore */ }
      }
    }

    if (!userId) {
      await safeLogSecurityEventFromRequest(request, {
        source: "api",
        eventType: "upload_validation_failed",
        statusCode: 400,
        userId: null,
        message: "Upload refusé: userId manquant."
      });
      return NextResponse.json({ error: "Le champ userId est obligatoire." }, { status: 400 });
    }

    if (!formDataFiles.length && !storageFiles.length) {
      await safeLogSecurityEventFromRequest(request, {
        source: "api",
        eventType: "upload_validation_failed",
        statusCode: 400,
        userId,
        message: "Upload refusé: aucun fichier transmis."
      });
      return NextResponse.json({ error: "Au moins un fichier est obligatoire." }, { status: 400 });
    }

    const binaryFiles: UploadedBinaryFile[] = [];

    for (const sf of storageFiles) {
      if (!sf.pdfUrl || !sf.fileName) continue;

      const validDomain = sf.pdfUrl.startsWith("https://firebasestorage.googleapis.com/") ||
        sf.pdfUrl.startsWith("https://storage.googleapis.com/");
      if (!validDomain) {
        return NextResponse.json({ error: `URL non autorisée pour ${sf.fileName}.` }, { status: 400 });
      }

      const res = await fetch(sf.pdfUrl);
      if (!res.ok) {
        throw new Error(`Impossible de télécharger ${sf.fileName} depuis Storage (HTTP ${res.status}).`);
      }
      const arrayBuffer = await res.arrayBuffer();
      const type = detectSupportedUploadType(sf.fileName, "application/pdf");
      if (!type) {
        throw new Error(`Format de fichier non supporte pour ${sf.fileName}.`);
      }
      binaryFiles.push({
        name: sf.fileName,
        mimeType: "application/pdf",
        size: sf.fileSize || arrayBuffer.byteLength,
        type,
        buffer: Buffer.from(arrayBuffer)
      });
    }

    for (const candidate of formDataFiles) {
      // Lit le buffer en avance pour permettre le sniff FEC sur les .csv/.txt.
      const arrayBuffer = await candidate.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const type = detectSupportedUploadType(candidate.name, candidate.type, buffer);
      if (!type) {
        throw new Error(`Format de fichier non supporte pour ${candidate.name}.`);
      }
      binaryFiles.push({
        name: candidate.name,
        mimeType: candidate.type,
        size: candidate.size,
        type,
        buffer,
      });
    }

    const analysisDraft = await runAnalysisPipeline({
      userId,
      folderName,
      files: binaryFiles,
      uploadContext: { companySize, sector, source }
    });

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "upload_analysis_success",
      statusCode: 200,
      userId,
      message: "Upload traité avec succès.",
      metadata: {
        folderName,
        filesCount: binaryFiles.length,
        source,
        hasCompanySize: Boolean(companySize),
        hasSector: Boolean(sector),
        storageFilesCount: storageFiles.length
      }
    });

    return NextResponse.json({ analysisDraft }, { status: 200 });
  } catch (error) {
    const userId = "unknown";
    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "upload_analysis_failed",
      statusCode: 500,
      userId,
      message: toErrorMessage(error)
    });
    return NextResponse.json(
      { error: "Le pipeline d'upload a echoue.", detail: toErrorMessage(error) },
      { status: 500 }
    );
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inconnue";
}
