import { NextRequest, NextResponse } from "next/server";
import { getAnalysisById } from "@/services/repositories/analysisRepository";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await context.params;

  try {
    const analysis = await getAnalysisById(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load analysis.", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

