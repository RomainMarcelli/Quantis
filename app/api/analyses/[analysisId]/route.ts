import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await context.params;
  return NextResponse.json(
    {
      error: `Direct API read disabled for ${analysisId}. Use Firestore client SDK in frontend.`
    },
    { status: 405 }
  );
}
