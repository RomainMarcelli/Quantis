import { NextRequest, NextResponse } from "next/server";
import { getVisionLogs, clearVisionLogs, formatLogsAsText } from "@/services/pdf-analysis/visionLogger";

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format");

  if (format === "text") {
    const text = formatLogsAsText();
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  return NextResponse.json(getVisionLogs());
}

export async function DELETE() {
  clearVisionLogs();
  return NextResponse.json({ cleared: true });
}
