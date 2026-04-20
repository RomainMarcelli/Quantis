"use client";

import { useState } from "react";
import type { ParserDiagnostic } from "@/app/pdf-parser-test/parserDiagnosticExport";

type ParserDiagnosticActionsProps = {
  summaryText: string;
  diagnostic: ParserDiagnostic;
};

export function ParserDiagnosticActions({ summaryText, diagnostic }: ParserDiagnosticActionsProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(summaryText);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
        className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/15"
      >
        {copied ? "Copie" : "Copier resume parser"}
      </button>

      <button
        type="button"
        onClick={() => {
          const fileNameBase = `parser-diagnostic-${new Date().toISOString().replace(/[:.]/g, "-")}`;
          const payload = JSON.stringify(
            {
              summaryText,
              diagnostic
            },
            null,
            2
          );

          const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${fileNameBase}.json`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }}
        className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/15"
      >
        Telecharger diagnostic parser
      </button>
    </div>
  );
}
