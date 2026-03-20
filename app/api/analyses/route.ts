// app/api/analyses/route.ts
// Route API d'orchestration d'analyse: upload, parsing, calcul KPI et réponse JSON.
import { NextRequest, NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { safeLogSecurityEventFromRequest } from "@/lib/server/securityAudit";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error: "Utilisez le SDK client Firestore pour lister les analyses depuis le frontend authentifie."
    },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  // Protection anti-abus sur l'endpoint d'upload/calcul le plus coûteux.
  const rateLimitedResponse = enforceRouteRateLimit(request, {
    routeId: "api-analyses-post",
    maxRequests: 12,
    windowMs: 60_000
  });
  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  const formData = await request.formData();
  const userId = String(formData.get("userId") ?? "");
  const folderName = String(formData.get("folderName") ?? "").trim() || "Dossier principal";

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

  const files = formData.getAll("files");
  if (!files.length) {
    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "upload_validation_failed",
      statusCode: 400,
      userId,
      message: "Upload refusé: aucun fichier transmis."
    });
    return NextResponse.json({ error: "Au moins un fichier est obligatoire." }, { status: 400 });
  }

  try {
    const binaryFiles = await Promise.all(
      files.map(async (candidate) => {
        if (!(candidate instanceof File)) {
          throw new Error("Payload fichier invalide.");
        }

        const type = detectSupportedUploadType(candidate.name, candidate.type);
        if (!type) {
          throw new Error(`Format de fichier non supporte pour ${candidate.name}.`);
        }

        const arrayBuffer = await candidate.arrayBuffer();

        return {
          name: candidate.name,
          mimeType: candidate.type,
          size: candidate.size,
          type,
          buffer: Buffer.from(arrayBuffer)
        };
      })
    );

    const analysisDraft = await runAnalysisPipeline({
      userId,
      folderName,
      files: binaryFiles
    });

    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "upload_analysis_success",
      statusCode: 200,
      userId,
      message: "Upload traité avec succès.",
      metadata: {
        folderName,
        filesCount: binaryFiles.length
      }
    });

    return NextResponse.json({ analysisDraft }, { status: 200 });
  } catch (error) {
    await safeLogSecurityEventFromRequest(request, {
      source: "api",
      eventType: "upload_analysis_failed",
      statusCode: 500,
      userId: userId || null,
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
