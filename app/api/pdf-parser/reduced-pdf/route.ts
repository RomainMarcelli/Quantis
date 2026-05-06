import { NextRequest, NextResponse } from "next/server";
import { getReducedPdf } from "@/services/pdf-analysis/reducedPdfStore";
import { AuthError, requireAdmin } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    throw error;
  }

  const requestId = request.nextUrl.searchParams.get("requestId")?.trim();
  if (!requestId) {
    return NextResponse.json(
      { success: false, error: "Parametre requestId requis." },
      { status: 400 }
    );
  }

  const buffer = getReducedPdf(requestId);
  if (!buffer) {
    return NextResponse.json(
      { success: false, error: "PDF reduit introuvable ou expire." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="reduced.pdf"',
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store"
    }
  });
}
