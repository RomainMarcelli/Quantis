import { NextRequest, NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/services/analysisPipeline";
import { detectSupportedUploadType } from "@/services/parsers/fileParser";
import { listAnalysesByUser } from "@/services/repositories/analysisRepository";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  try {
    const analyses = await listAnalysesByUser(userId, Number.isFinite(year) ? year : undefined);
    return NextResponse.json({ analyses });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load analyses from Firestore.", detail: toErrorMessage(error) },
      { status: 500 }
    );
  }
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

    const analysis = await runAnalysisPipeline({
      userId,
      files: binaryFiles
    });

    return NextResponse.json({ analysis }, { status: 201 });
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
