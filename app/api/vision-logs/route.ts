import { NextRequest, NextResponse } from "next/server";
import { getVisionLogs, clearVisionLogs, formatLogsAsText } from "@/services/pdf-analysis/visionLogger";
import { AuthError, requireAdmin } from "@/lib/auth/requireAdmin";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "text") {
    const text = formatLogsAsText();
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  return NextResponse.json(getVisionLogs());
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  clearVisionLogs();
  return NextResponse.json({ cleared: true });
}
