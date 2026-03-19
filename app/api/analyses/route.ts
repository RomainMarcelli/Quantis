import { NextRequest, NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error: "Use Firestore client SDK for listing analyses in the authenticated frontend."
    },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const files = formData.getAll("files");
  if (!files.length) {
    return NextResponse.json({ error: "At least one file is required." }, { status: 400 });
  }

  try {
    const binaryFiles = await Promise.all(
      files.map(async (candidate) => {
        if (!(candidate instanceof File)) {
          throw new Error("Invalid file payload.");
        }

        const type = detectSupportedUploadType(candidate.name, candidate.type);
        if (!type) {
          throw new Error(`Unsupported file format for ${candidate.name}.`);
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
      files: binaryFiles
    });

    return NextResponse.json({ analysisDraft }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Upload pipeline failed.", detail: toErrorMessage(error) },
      { status: 500 }
    );
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
