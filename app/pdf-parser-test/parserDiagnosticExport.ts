import type { ParserResponse, ParserSuccessPayload } from "./types";

type DiagnosticInput = {
  responsePayload: ParserResponse | null;
  statusCode: number | null;
  networkError: string | null;
  apiErrorMessage: string | null;
  elapsedSeconds: number;
  estimatedDurationSeconds: number | null;
};

type DiagnosticField = {
  key: string;
  value: number | null;
};

type TraceSummary = {
  field: string;
  selected: {
    value: number | null;
    reason: string;
  } | null;
};

type ReconstructedRowSummary = {
  page: number | null;
  rowNumber: number | null;
  section: string | null;
  label: string;
  lineCode: string | null;
  amountCandidates: Array<{ value: number | null }>;
};

type MissingFieldDiagnostic = {
  field: string;
  status:
    | "missing_label_not_found"
    | "missing_label_without_amount"
    | "missing_intentional_null"
    | "missing_unresolved";
  reason: string;
  traceField: string | null;
  blockingImpact: {
    blockedKpis: string[];
  };
};

export type FieldStatusDiagnostic = {
  field: string;
  value: number | null;
  status:
    | "extracted_confident"
    | "extracted_partial"
    | "missing_label_not_found"
    | "missing_label_without_amount"
    | "missing_intentional_null"
    | "missing_unresolved";
  confidence: number | null;
  reason: string;
  traceFields: string[];
};

export type KpiStatusDiagnostic = {
  kpi: string;
  value: number | null;
  status: "calculated" | "blocked_missing_inputs" | "unavailable";
  reason: string;
  missingSources: string[];
};

export type ParserDiagnostic = {
  generatedAt: string;
  execution: {
    httpStatus: number | null;
    success: boolean;
    parserVersion: string | null;
    confidenceScore: number | null;
    analysisId: string | null;
    elapsedSeconds: number;
    estimatedSeconds: number | null;
    warningsCount: number;
    mappedFilledCount: number;
    mappedMissingCount: number;
    kpiFilledCount: number;
    kpiMissingCount: number;
  };
  principalFinancials: Record<string, number | null> | null;
  mappedData: {
    importantFilled: DiagnosticField[];
    importantMissing: DiagnosticField[];
    families: ReturnType<typeof buildMappedFamilies>;
  };
  kpis: {
    importantFilled: DiagnosticField[];
    importantMissing: DiagnosticField[];
    suspects: Array<{ key: string; value: number | null }>;
  };
  dataQuality: {
    importantFieldStatuses: FieldStatusDiagnostic[];
    missingFieldDiagnostics: MissingFieldDiagnostic[];
    manualReviewQueue: Array<{
      field: string;
      reason: string;
    }>;
  };
  kpiStatus: {
    important: KpiStatusDiagnostic[];
    blocked: KpiStatusDiagnostic[];
  };
  anomalies: {
    networkError: string | null;
    apiError: string | null;
    warnings: string[];
    missingCriticalFinancialFields: string[];
    missingMappedImportant: string[];
    blockedImportantKpis: string[];
    missingFieldDiagnostics: MissingFieldDiagnostic[];
  };
  traces: TraceSummary[];
  reconstructedRows: ReconstructedRowSummary[];
};

const IMPORTANT_MAPPED_FIELDS = [
  "ace",
  "autres_creances",
  "dettes_fisc_soc",
  "total_actif_circ",
  "total_actif_immo",
  "ventes_march",
  "prod_vendue",
  "prod_stockee",
  "prod_immo",
  "subv_expl",
  "autres_prod_expl",
  "prod_fin",
  "charges_fin",
  "prod_excep",
  "charges_excep",
  "is_impot",
  "autres_charges_expl",
  "dprov",
  "total_prod_expl",
  "total_charges_expl",
  "stocks_mp",
  "stocks_march",
  "avances_vers_actif",
  "vmp",
  "creances",
  "avances_recues_passif",
  "fournisseurs",
  "total_prov",
  "emprunts"
] as const;

const IMPORTANT_KPI_FIELDS = [
  "bfr",
  "workingCapital",
  "dpo",
  "ratio_immo",
  "ebe",
  "ebitda",
  "va",
  "ca",
  "resultat_net"
] as const;

const TRACE_FIELDS_BY_MAPPED: Record<string, string[]> = {
  ace: ["externalCharges"],
  autres_creances: ["otherReceivables"],
  dettes_fisc_soc: ["taxSocialPayables"],
  prod_stockee: [],
  prod_immo: [],
  subv_expl: [],
  autres_prod_expl: ["otherOperatingIncome"],
  prod_fin: ["financialProducts"],
  charges_fin: ["financialCharges"],
  prod_excep: ["exceptionalProducts"],
  charges_excep: ["exceptionalCharges"],
  is_impot: ["incomeTax"],
  autres_charges_expl: ["otherOperatingCharges"],
  dprov: ["provisionsAllocations"],
  total_actif_circ: ["totalCurrentAssets"],
  total_actif_immo: ["totalFixedAssets"],
  avances_vers_actif: ["advancesAndPrepaymentsAssets"],
  vmp: ["marketableSecurities"],
  avances_recues_passif: ["advancesAndPrepaymentsLiabilities"],
  total_prov: ["provisions"],
  total_charges_expl: ["totalOperatingCharges"],
  prod_vendue: ["productionSold", "productionSoldGoods", "productionSoldServices"]
};

const LABEL_HINTS_BY_MAPPED: Record<string, string[]> = {
  autres_creances: ["autres creances"],
  dettes_fisc_soc: ["dettes fiscales et sociales"],
  autres_prod_expl: ["autres produits d'exploitation", "autres produits"],
  prod_fin: ["produits financiers"],
  charges_fin: ["charges financieres"],
  prod_excep: ["produits exceptionnels"],
  charges_excep: ["charges exceptionnelles"],
  is_impot: ["impots sur les benefices", "impot sur les benefices"],
  autres_charges_expl: ["autres charges d'exploitation", "autres charges"],
  dprov: ["dotations aux provisions"],
  avances_vers_actif: ["avances et acomptes verses"],
  vmp: ["valeurs mobilieres de placement", "vmp"],
  avances_recues_passif: ["avances et acomptes recus"],
  total_prov: ["provisions pour risques et charges", "total provisions"],
  prod_vendue: ["production vendue", "production vendue de biens", "production vendue de services"]
};

const KPI_DEPENDENCIES: Record<string, string[]> = {
  bfr: ["total_stocks", "creances", "fournisseurs", "dettes_fisc_soc"],
  workingCapital: ["total_stocks", "creances", "fournisseurs", "dettes_fisc_soc"],
  ratio_immo: ["total_actif_immo_net", "total_actif_immo_brut", "total_actif_immo"]
};

export function buildParserDiagnostic(input: DiagnosticInput): ParserDiagnostic {
  const successPayload = input.responsePayload?.success ? input.responsePayload : null;
  const mapped = toNumericRecord(successPayload?.mappedData ?? successPayload?.debugData?.mappedData);
  const kpis = toNumericRecord(successPayload?.kpis ?? successPayload?.debugData?.kpis);
  const warnings = successPayload?.warnings ?? [];

  const mappedEntries = toFieldRows(mapped);
  const kpiEntries = toFieldRows(kpis);
  const mappedFilled = mappedEntries.filter((row) => row.value !== null);
  const mappedMissing = mappedEntries.filter((row) => row.value === null);
  const kpiFilled = kpiEntries.filter((row) => row.value !== null);
  const kpiMissing = kpiEntries.filter((row) => row.value === null);

  const importantMapped = IMPORTANT_MAPPED_FIELDS.map((key) => ({
    key,
    value: mapped[key] ?? null
  }));
  const importantKpis = IMPORTANT_KPI_FIELDS.map((key) => ({
    key,
    value: kpis[key] ?? null
  }));

  const missingMappedImportant = importantMapped.filter((item) => item.value === null).map((item) => item.key);
  const missingKpiImportant = importantKpis.filter((item) => item.value === null).map((item) => item.key);

  const targetTraceFields = new Set<string>([
    ...missingMappedImportant.flatMap((key) => TRACE_FIELDS_BY_MAPPED[key] ?? [key]),
    "totalOperatingCharges",
    "totalCharges"
  ]);

  const traces = extractTargetTraces(successPayload, targetTraceFields);
  const reconstructedRows = extractTargetRows(successPayload, missingMappedImportant);
  const missingFieldDiagnostics = buildMissingFieldDiagnostics({
    successPayload,
    missingMappedImportant,
    mapped,
    kpis
  });
  const importantFieldStatuses = buildImportantFieldStatuses({
    successPayload,
    mapped,
    importantMapped,
    missingFieldDiagnostics
  });
  const importantKpiStatuses = buildImportantKpiStatuses({
    kpis,
    mapped,
    importantKpis
  });
  const blockedKpiStatuses = importantKpiStatuses.filter((status) => status.status !== "calculated");
  const manualReviewQueue = missingFieldDiagnostics
    .filter((item) => item.status === "missing_label_without_amount")
    .map((item) => ({
      field: item.field,
      reason: item.reason
    }));

  const diagnostic = {
    generatedAt: new Date().toISOString(),
    execution: {
      httpStatus: input.statusCode,
      success: Boolean(successPayload),
      parserVersion: successPayload?.parserVersion ?? null,
      confidenceScore: successPayload?.confidenceScore ?? null,
      analysisId: successPayload?.persistence.analysisId ?? null,
      elapsedSeconds: Math.max(0, Math.floor(input.elapsedSeconds)),
      estimatedSeconds: input.estimatedDurationSeconds,
      warningsCount: warnings.length,
      mappedFilledCount: mappedFilled.length,
      mappedMissingCount: mappedMissing.length,
      kpiFilledCount: kpiFilled.length,
      kpiMissingCount: kpiMissing.length
    },
    principalFinancials: successPayload?.quantisData ?? null,
    mappedData: {
      importantFilled: importantMapped.filter((row) => row.value !== null),
      importantMissing: importantMapped.filter((row) => row.value === null),
      families: buildMappedFamilies(mapped)
    },
    kpis: {
      importantFilled: importantKpis.filter((row) => row.value !== null),
      importantMissing: importantKpis.filter((row) => row.value === null),
      suspects: detectSuspectKpis(kpis)
    },
    dataQuality: {
      importantFieldStatuses,
      missingFieldDiagnostics,
      manualReviewQueue
    },
    kpiStatus: {
      important: importantKpiStatuses,
      blocked: blockedKpiStatuses
    },
    anomalies: {
      networkError: input.networkError,
      apiError: input.apiErrorMessage,
      warnings,
      missingCriticalFinancialFields: Object.entries(successPayload?.quantisData ?? {})
        .filter(([, value]) => value === null)
        .map(([key]) => key),
      missingMappedImportant,
      blockedImportantKpis: missingKpiImportant,
      missingFieldDiagnostics
    },
    traces,
    reconstructedRows
  };

  return diagnostic;
}

export function buildParserDiagnosticSummaryText(diagnostic: ParserDiagnostic): string {
  const lines: string[] = [];

  lines.push("=== RESUME EXECUTION ===");
  lines.push(`HTTP: ${diagnostic.execution.httpStatus ?? "-"}`);
  lines.push(`Succes: ${diagnostic.execution.success ? "oui" : "non"}`);
  lines.push(`Parser version: ${diagnostic.execution.parserVersion ?? "-"}`);
  lines.push(`Confiance: ${diagnostic.execution.confidenceScore ?? "-"}`);
  lines.push(`Analysis ID: ${diagnostic.execution.analysisId ?? "-"}`);
  lines.push(`Temps ecoule: ${diagnostic.execution.elapsedSeconds}s`);
  lines.push(`Temps estime: ${diagnostic.execution.estimatedSeconds ?? "-"}s`);
  lines.push(`Warnings: ${diagnostic.execution.warningsCount}`);
  lines.push(
    `Mapped remplis/manquants: ${diagnostic.execution.mappedFilledCount}/${diagnostic.execution.mappedMissingCount}`
  );
  lines.push(`KPI remplis/manquants: ${diagnostic.execution.kpiFilledCount}/${diagnostic.execution.kpiMissingCount}`);
  lines.push("");

  lines.push("=== CHAMPS FINANCIERS PRINCIPAUX ===");
  if (diagnostic.principalFinancials) {
    Object.entries(diagnostic.principalFinancials).forEach(([key, value]) => {
      lines.push(`${key}: ${value ?? "null"}`);
    });
  } else {
    lines.push("indisponible");
  }
  lines.push("");

  lines.push("=== MAPPED DATA (IMPORTANT) ===");
  lines.push(`Remplis: ${diagnostic.mappedData.importantFilled.map((item) => item.key).join(", ") || "-"}`);
  lines.push(`Manquants: ${diagnostic.mappedData.importantMissing.map((item) => item.key).join(", ") || "-"}`);
  lines.push("");

  lines.push("=== KPI (IMPORTANT) ===");
  lines.push(`Remplis: ${diagnostic.kpis.importantFilled.map((item) => item.key).join(", ") || "-"}`);
  lines.push(`Manquants: ${diagnostic.kpis.importantMissing.map((item) => item.key).join(", ") || "-"}`);
  lines.push(`Suspects: ${diagnostic.kpis.suspects.map((item) => item.key).join(", ") || "-"}`);
  lines.push("");

  lines.push("=== ANOMALIES / PRIORITES ===");
  lines.push(`Warnings API/parser: ${diagnostic.anomalies.warnings.join(" | ") || "-"}`);
  lines.push(
    `Champs critiques manquants: ${
      diagnostic.anomalies.missingCriticalFinancialFields.join(", ") || "-"
    }`
  );
  lines.push(`Mapped importants manquants: ${diagnostic.anomalies.missingMappedImportant.join(", ") || "-"}`);
  lines.push(`KPI bloques: ${diagnostic.anomalies.blockedImportantKpis.join(", ") || "-"}`);
  if (diagnostic.anomalies.missingFieldDiagnostics.length > 0) {
    lines.push(
      `Details champs manquants: ${diagnostic.anomalies.missingFieldDiagnostics
        .map((item) => `${item.field}=${item.status}`)
        .join(" | ")}`
    );
  }
  if (diagnostic.kpiStatus.blocked.length > 0) {
    lines.push(
      `Details KPI bloques: ${diagnostic.kpiStatus.blocked
        .map((item) => `${item.kpi}=>${item.missingSources.join("+") || "n/a"}`)
        .join(" | ")}`
    );
  }
  lines.push("");

  lines.push("=== CHAMPS MANQUANTS JUSTIFIES ===");
  if (diagnostic.dataQuality.missingFieldDiagnostics.length === 0) {
    lines.push("aucun");
  } else {
    diagnostic.dataQuality.missingFieldDiagnostics.forEach((item) => {
      lines.push(
        `${item.field}: ${item.status} (${item.reason}) | KPI impactes: ${item.blockingImpact.blockedKpis.join(", ") || "-"}`
      );
    });
  }
  lines.push("");

  lines.push("=== KPI BLOQUES DETAIL ===");
  if (diagnostic.kpiStatus.blocked.length === 0) {
    lines.push("aucun");
  } else {
    diagnostic.kpiStatus.blocked.forEach((item) => {
      lines.push(`${item.kpi}: ${item.reason} | sources manquantes: ${item.missingSources.join(", ") || "-"}`);
    });
  }
  lines.push("");

  lines.push("=== TRACES CIBLEES ===");
  if (!diagnostic.traces.length) {
    lines.push("aucune");
  } else {
    diagnostic.traces.forEach((trace) => {
      lines.push(`${trace.field}: ${trace.selected ? `${trace.selected.value} (${trace.selected.reason})` : "null"}`);
    });
  }
  lines.push("");

  lines.push("=== RECONSTRUCTED ROWS CIBLEES ===");
  if (!diagnostic.reconstructedRows.length) {
    lines.push("aucune");
  } else {
    diagnostic.reconstructedRows.forEach((row) => {
      lines.push(
        `p${row.page}/l${row.rowNumber} [${row.section}] ${row.label} | lineCode=${row.lineCode ?? "-"} | amounts=${row.amountCandidates
          .map((item) => item.value)
          .join(", ")}`
      );
    });
  }

  return lines.join("\n");
}

function toNumericRecord(value: unknown): Record<string, number | null> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, number | null> = {};
  Object.entries(value).forEach(([key, item]) => {
    result[key] = typeof item === "number" && Number.isFinite(item) ? item : null;
  });
  return result;
}

function toFieldRows(record: Record<string, number | null>): DiagnosticField[] {
  return Object.entries(record)
    .map(([key, value]) => ({ key, value }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildMappedFamilies(mapped: Record<string, number | null>) {
  const keys = Object.keys(mapped);
  const byPredicate = (predicate: (key: string) => boolean) =>
    keys.filter(predicate).map((key) => ({ key, value: mapped[key] ?? null }));

  const actif = byPredicate((key) => key.startsWith("immob_") || key.includes("actif") || key.includes("stocks") || key === "clients" || key === "autres_creances" || key === "creances" || key === "dispo");
  const passif = byPredicate((key) => key.includes("dettes") || key.includes("fournisseurs") || key.includes("emprunts") || key.includes("cp") || key.includes("passif"));
  const income = byPredicate((key) => key.includes("ventes") || key.includes("prod") || key.includes("charges") || key.includes("achats") || key.includes("resultat") || key === "ace");
  const transformations = byPredicate((key) => key === "n" || key.includes("delta") || key.includes("n_minus_1"));

  return { actif, passif, income, transformations };
}

function detectSuspectKpis(kpis: Record<string, number | null>): Array<{ key: string; value: number | null }> {
  return Object.entries(kpis)
    .filter(([key, value]) => {
      if (value === null) {
        return false;
      }
      if (key === "ratio_immo") {
        return value < 0 || value > 1.5;
      }
      if (key === "dpo" || key === "dso") {
        return value < 0 || value > 3650;
      }
      if (key === "ca" || key === "ebitda" || key === "ebe" || key === "va") {
        return Math.abs(value) > 1_000_000_000;
      }
      return false;
    })
    .map(([key, value]) => ({ key, value }));
}

function extractTargetTraces(successPayload: ParserSuccessPayload | null, targetFields: Set<string>): TraceSummary[] {
  const traces = successPayload?.debugData?.traces;
  if (!Array.isArray(traces)) {
    return [];
  }

  return traces
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => typeof item.field === "string" && targetFields.has(item.field))
    .map((item) => ({
      field: String(item.field),
      selected: toTraceSelected(item.selected)
    }))
    .slice(0, 20);
}

function extractTargetRows(
  successPayload: ParserSuccessPayload | null,
  missingMappedFields: string[]
): ReconstructedRowSummary[] {
  const rows = successPayload?.debugData?.reconstructedRows;
  if (!Array.isArray(rows)) {
    return [];
  }

  const keywords = new Set<string>();
  missingMappedFields.forEach((field) => {
    switch (field) {
      case "ace":
        keywords.add("charges externes");
        break;
      case "autres_creances":
        keywords.add("autres creances");
        break;
      case "dettes_fisc_soc":
        keywords.add("dettes fiscales");
        break;
      case "total_actif_circ":
        keywords.add("actif circulant");
        keywords.add("total (ii)");
        break;
      case "total_actif_immo":
        keywords.add("actif immobilise");
        keywords.add("total (1)");
        break;
      case "prod_vendue":
        keywords.add("production vendue");
        break;
      case "autres_prod_expl":
        keywords.add("autres produits");
        break;
      case "autres_charges_expl":
        keywords.add("autres charges");
        break;
      case "prod_fin":
        keywords.add("produits financiers");
        break;
      case "charges_fin":
        keywords.add("charges financieres");
        break;
      case "prod_excep":
        keywords.add("produits exceptionnels");
        break;
      case "charges_excep":
        keywords.add("charges exceptionnelles");
        break;
      case "is_impot":
        keywords.add("impots sur les benefices");
        break;
      case "dprov":
        keywords.add("dotations aux provisions");
        break;
      case "avances_vers_actif":
        keywords.add("avances et acomptes verses");
        break;
      case "avances_recues_passif":
        keywords.add("avances et acomptes recus");
        break;
      case "vmp":
        keywords.add("valeurs mobilieres de placement");
        break;
      default:
        break;
    }
  });

  return rows
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => {
      const label = typeof item.label === "string" ? normalize(labelSafe(item.label)) : "";
      if (!label) {
        return false;
      }
      return Array.from(keywords).some((keyword) => label.includes(keyword));
    })
    .map((item) => ({
      page: toNullableNumber(item.page),
      rowNumber: toNullableNumber(item.rowNumber),
      section: typeof item.section === "string" ? item.section : null,
      label: typeof item.label === "string" ? item.label : "",
      lineCode: typeof item.lineCode === "string" ? item.lineCode : null,
      amountCandidates: Array.isArray(item.amountCandidates)
        ? item.amountCandidates
            .filter((candidate): candidate is Record<string, unknown> => isRecord(candidate))
            .map((candidate) => ({
              value: toNullableNumber(candidate.value)
            }))
        : []
    }))
    .slice(0, 30);
}

function labelSafe(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toTraceSelected(value: unknown): TraceSummary["selected"] {
  if (!isRecord(value)) {
    return null;
  }

  return {
    value: toNullableNumber(value.value),
    reason: typeof value.reason === "string" ? value.reason : ""
  };
}

function buildMissingFieldDiagnostics(input: {
  successPayload: ParserSuccessPayload | null;
  missingMappedImportant: string[];
  mapped: Record<string, number | null>;
  kpis: Record<string, number | null>;
}): MissingFieldDiagnostic[] {
  const { successPayload, missingMappedImportant, mapped, kpis } = input;
  const traceMap = new Map<string, TraceSummary["selected"]>();
  const traces = successPayload?.debugData?.traces;
  if (Array.isArray(traces)) {
    traces
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .forEach((item) => {
        if (typeof item.field !== "string") {
          return;
        }
        traceMap.set(item.field, toTraceSelected(item.selected));
      });
  }

  const normalizedLabels = collectNormalizedRowLabels(successPayload?.debugData?.reconstructedRows);
  const kpiStatuses = buildImportantKpiStatuses({
    kpis,
    mapped,
    importantKpis: IMPORTANT_KPI_FIELDS.map((key) => ({
      key,
      value: kpis[key] ?? null
    }))
  });

  return missingMappedImportant.map((mappedField) => {
    const candidateTraceFields = TRACE_FIELDS_BY_MAPPED[mappedField] ?? [mappedField];
    const withSelection = candidateTraceFields.find((field) => traceMap.get(field) !== null);
    const blockedKpis = kpiStatuses
      .filter((status) => status.status === "blocked_missing_inputs")
      .filter((status) => status.missingSources.includes(mappedField))
      .map((status) => status.kpi);

    if (mappedField === "prod_vendue") {
      const hasSalesGoods = mapped.ventes_march !== null;
      if (hasSalesGoods && !withSelection) {
        return {
          field: mappedField,
          status: "missing_intentional_null",
          reason: "Aucune ligne de production vendue fiable detectee, valeur laissee a null par prudence.",
          traceField: candidateTraceFields[0] ?? null,
          blockingImpact: { blockedKpis }
        };
      }
    }

    if (withSelection) {
      return {
        field: mappedField,
        status: "missing_intentional_null",
        reason: "Valeur source detectee mais rejetee par garde-fou qualite.",
        traceField: withSelection,
        blockingImpact: { blockedKpis }
      };
    }

    const labelHints = LABEL_HINTS_BY_MAPPED[mappedField] ?? [];
    const labelDetected = labelHints.some((hint) => normalizedLabels.some((label) => label.includes(hint)));
    return {
      field: mappedField,
      status: labelDetected ? "missing_label_without_amount" : "missing_label_not_found",
      reason: labelDetected
        ? "Libelle detecte dans le document, mais aucun montant exploitable n'a ete reconstruit."
        : "Libelle non detecte dans le document analyse.",
      traceField: candidateTraceFields[0] ?? null,
      blockingImpact: { blockedKpis }
    };
  });
}

function collectNormalizedRowLabels(rows: unknown): string[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => (typeof item.label === "string" ? normalize(labelSafe(item.label)) : ""))
    .filter((value) => value.length > 0);
}

function extractFieldScores(successPayload: ParserSuccessPayload | null): Record<string, number> {
  const raw = successPayload?.debugData?.diagnostics;
  if (!isRecord(raw) || !isRecord(raw.fieldScores)) {
    return {};
  }

  const result: Record<string, number> = {};
  Object.entries(raw.fieldScores).forEach(([key, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }
  });
  return result;
}

function buildImportantFieldStatuses(input: {
  successPayload: ParserSuccessPayload | null;
  mapped: Record<string, number | null>;
  importantMapped: Array<{ key: string; value: number | null }>;
  missingFieldDiagnostics: MissingFieldDiagnostic[];
}): FieldStatusDiagnostic[] {
  const { successPayload, mapped, importantMapped, missingFieldDiagnostics } = input;
  const fieldScores = extractFieldScores(successPayload);
  const missingByField = new Map(missingFieldDiagnostics.map((item) => [item.field, item]));

  return importantMapped.map(({ key, value }) => {
    const traceFields = TRACE_FIELDS_BY_MAPPED[key] ?? [key];
    const confidences = traceFields
      .map((traceField) => fieldScores[traceField])
      .filter((score): score is number => typeof score === "number");
    const confidence = confidences.length > 0 ? Math.max(...confidences) : null;

    if (value !== null) {
      const status: FieldStatusDiagnostic["status"] =
        confidence !== null && confidence >= 0.75 ? "extracted_confident" : "extracted_partial";
      return {
        field: key,
        value: mapped[key] ?? null,
        status,
        confidence,
        reason:
          status === "extracted_confident"
            ? "Champ extrait avec un contexte de selection solide."
            : "Champ extrait avec confiance partielle.",
        traceFields
      };
    }

    const missing = missingByField.get(key);
    return {
      field: key,
      value: null,
      status: missing?.status ?? "missing_unresolved",
      confidence,
      reason: missing?.reason ?? "Champ non alimente, cause non classifiee.",
      traceFields
    };
  });
}

function buildImportantKpiStatuses(input: {
  kpis: Record<string, number | null>;
  mapped: Record<string, number | null>;
  importantKpis: Array<{ key: string; value: number | null }>;
}): KpiStatusDiagnostic[] {
  const { kpis, mapped, importantKpis } = input;
  return importantKpis.map(({ key, value }) => {
    if (value !== null) {
      return {
        kpi: key,
        value,
        status: "calculated",
        reason: "KPI calcule avec les donnees disponibles.",
        missingSources: []
      };
    }

    const missingSources = getMissingSourcesForKpi(key, mapped);
    if (missingSources.length > 0) {
      return {
        kpi: key,
        value: null,
        status: "blocked_missing_inputs",
        reason: "KPI non calculable faute de donnees source.",
        missingSources
      };
    }

    return {
      kpi: key,
      value: kpis[key] ?? null,
      status: "unavailable",
      reason: "KPI non calculable (conditions de formule non satisfaites).",
      missingSources: []
    };
  });
}

function getMissingSourcesForKpi(
  kpi: string,
  mapped: Record<string, number | null>
): string[] {
  if (kpi === "ratio_immo") {
    return getMissingSourcesForRatioImmo(mapped);
  }

  const dependencies = KPI_DEPENDENCIES[kpi];
  if (!dependencies?.length) {
    return [];
  }

  return dependencies.filter((dependency) => mapped[dependency] === null);
}

function getMissingSourcesForRatioImmo(mapped: Record<string, number | null>): string[] {
  const net = mapped.total_actif_immo_net;
  const brut = mapped.total_actif_immo_brut;
  const total = mapped.total_actif_immo;

  const pathA = net !== null && brut !== null;
  const pathB =
    net !== null &&
    total !== null &&
    total > 0 &&
    total >= net &&
    total !== net;
  const pathC =
    brut !== null &&
    total !== null &&
    total > 0 &&
    brut >= total &&
    brut !== total;

  if (pathA || pathB || pathC) {
    return [];
  }

  return ["total_actif_immo_net", "total_actif_immo_brut", "total_actif_immo"].filter(
    (dependency) => mapped[dependency] === null
  );
}
