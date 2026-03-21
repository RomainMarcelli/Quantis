import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await context.params;
  return NextResponse.json(
    {
      error: `Lecture API directe desactivee pour ${analysisId}. Utilisez le SDK client Firestore dans le frontend.`
    },
    { status: 405 }
  );
}
