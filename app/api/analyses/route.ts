import { NextRequest, NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";

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
  const formData = await request.formData();
  const userId = String(formData.get("userId") ?? "");
  const folderName = String(formData.get("folderName") ?? "").trim() || "Dossier principal";

  if (!userId) {
    return NextResponse.json({ error: "Le champ userId est obligatoire." }, { status: 400 });
  }

  const files = formData.getAll("files");
  if (!files.length) {
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

    return NextResponse.json({ analysisDraft }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Le pipeline d'upload a echoue.", detail: toErrorMessage(error) },
      { status: 500 }
    );
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inconnue";
}
