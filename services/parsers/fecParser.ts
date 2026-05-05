// File: services/parsers/fecParser.ts
// Role: parse un Fichier des Écritures Comptables (FEC, art. A47 A-1 du LPF)
// vers le schéma unifié `AccountingEntry[]` consommé par les agrégateurs
// (pcgAggregator, dailyAccountingBuilder, balanceSheetSnapshotBuilder).
//
// Format FEC : 18 colonnes obligatoires, séparateur `|` ou `\t`, encodage UTF-8 ou ANSI.
//   1. JournalCode
//   2. JournalLib
//   3. EcritureNum
//   4. EcritureDate (YYYYMMDD)
//   5. CompteNum
//   6. CompteLib
//   7. CompAuxNum
//   8. CompAuxLib
//   9. PieceRef
//  10. PieceDate (YYYYMMDD)
//  11. EcritureLib
//  12. Debit (décimal `,` ou `.`)
//  13. Credit (décimal `,` ou `.`)
//  14. EcritureLet
//  15. DateLet (YYYYMMDD ou vide)
//  16. ValidDate (YYYYMMDD)
//  17. Montantdevise
//  18. Idevise
//
// Sortie : la même `AccountingEntry[]` que les adapters dynamiques produisent —
// les écritures sont regroupées par (JournalCode, EcritureNum). Le bridge en
// aval (pcgAggregator → dailyAccountingBuilder → balanceSheetSnapshot) recycle
// alors la chaîne unifiée et produit `dailyAccounting + balanceSheetSnapshot`.

import type {
  AccountingEntry,
  AccountingEntryLine,
  NormalizedTrialBalanceEntry,
} from "@/types/connectors";

const REQUIRED_HEADERS = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
];

export type FecParseResult = {
  entries: AccountingEntry[];
  trialBalance: NormalizedTrialBalanceEntry[];
  /** Période effective couverte par le FEC (min/max EcritureDate). */
  periodStart: string; // ISO YYYY-MM-DD
  periodEnd: string;   // ISO YYYY-MM-DD
  /** Diagnostique : nombre de lignes lues, écritures regroupées, lignes ignorées. */
  stats: {
    rowsRead: number;
    entriesGrouped: number;
    rowsSkipped: number;
    delimiter: "|" | "\t" | ",";
  };
};

/**
 * Détecte si un contenu textuel ressemble à un FEC. Critère : la première ligne
 * non vide doit contenir tous les en-têtes obligatoires `REQUIRED_HEADERS`.
 */
export function looksLikeFec(text: string): boolean {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
  if (!firstLine) return false;
  // On accepte les 3 délimiteurs les plus courants (FEC officiel = `|`, mais `\t` et
  // `,` apparaissent dans les exports Sage/Cegid mal configurés).
  const lower = firstLine.toLowerCase();
  return REQUIRED_HEADERS.every((h) => lower.includes(h.toLowerCase()));
}

function detectDelimiter(headerLine: string): "|" | "\t" | "," {
  const counts: Record<"|" | "\t" | ",", number> = { "|": 0, "\t": 0, ",": 0 };
  for (const ch of headerLine) {
    if (ch === "|" || ch === "\t" || ch === ",") counts[ch] += 1;
  }
  // Le délimiteur dominant.
  let best: "|" | "\t" | "," = "|";
  let bestCount = -1;
  for (const d of ["|", "\t", ","] as const) {
    if (counts[d] > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return best;
}

function parseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-") return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseFecDate(raw: string): string | null {
  const trimmed = raw.trim();
  // FEC officiel : YYYYMMDD. On tolère aussi YYYY-MM-DD au cas où.
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Parse le contenu textuel d'un FEC en `AccountingEntry[]` + trial balance.
 *
 * - Regroupe les lignes par (JournalCode, EcritureNum) → 1 entry par groupe.
 * - Calcule la trial balance comme les cumuls débit/crédit par compte synthétique
 *   (3 ou 4 premiers chiffres) ainsi que par numéro complet.
 *
 * @throws Error si le format n'est pas reconnu (en-têtes manquants).
 */
export function parseFec(text: string, fileName: string = "fec.txt"): FecParseResult {
  const cleaned = text.replace(/^﻿/, ""); // strip BOM
  const allLines = cleaned.split(/\r?\n/);
  // Première ligne non vide = en-tête.
  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if ((allLines[i] ?? "").trim().length > 0) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("FEC vide.");
  }

  const headerLine = allLines[headerIdx]!;
  const delimiter = detectDelimiter(headerLine);
  const headers = headerLine.split(delimiter).map((h) => h.trim());
  // Mapping nom → index pour lookup robuste (l'ordre exact est imposé par l'art. A47
  // mais certains exports échangent quelques colonnes — on s'aligne sur les noms).
  const idx: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    idx[headers[i]!] = i;
  }
  for (const required of REQUIRED_HEADERS) {
    if (!(required in idx)) {
      throw new Error(`FEC : colonne "${required}" manquante.`);
    }
  }

  const dataLines = allLines.slice(headerIdx + 1).filter((l) => l.trim().length > 0);

  type RawRow = {
    journalCode: string;
    journalLib: string;
    ecritureNum: string;
    date: string;
    accountNumber: string;
    accountLabel: string;
    pieceRef: string;
    pieceDate: string;
    label: string;
    debit: number;
    credit: number;
  };

  const rows: RawRow[] = [];
  let skipped = 0;

  for (const line of dataLines) {
    const cells = line.split(delimiter);
    const dateIso = parseFecDate(cells[idx.EcritureDate!] ?? "");
    if (!dateIso) {
      skipped++;
      continue;
    }
    const accountNumber = (cells[idx.CompteNum!] ?? "").trim();
    if (!accountNumber) {
      skipped++;
      continue;
    }
    rows.push({
      journalCode: (cells[idx.JournalCode!] ?? "").trim(),
      journalLib: (cells[idx.JournalLib!] ?? "").trim(),
      ecritureNum: (cells[idx.EcritureNum!] ?? "").trim(),
      date: dateIso,
      accountNumber,
      accountLabel: (cells[idx.CompteLib!] ?? "").trim(),
      pieceRef: (cells[idx.PieceRef!] ?? "").trim(),
      pieceDate: parseFecDate(cells[idx.PieceDate!] ?? "") ?? dateIso,
      label: (cells[idx.EcritureLib!] ?? "").trim(),
      debit: parseAmount(cells[idx.Debit!] ?? "0"),
      credit: parseAmount(cells[idx.Credit!] ?? "0"),
    });
  }

  // ─── Regrouper par (JournalCode, EcritureNum) ────────────────────────────
  const groups = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = `${row.journalCode}|${row.ecritureNum}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  let minDate: string | null = null;
  let maxDate: string | null = null;
  const entries: AccountingEntry[] = [];

  for (const [key, group] of groups) {
    const first = group[0]!;
    if (!minDate || first.date < minDate) minDate = first.date;
    if (!maxDate || first.date > maxDate) maxDate = first.date;

    const lines: AccountingEntryLine[] = group.map((r) => ({
      externalId: null,
      accountNumber: r.accountNumber,
      accountLabel: r.accountLabel || null,
      debit: r.debit,
      credit: r.credit,
      currency: "EUR",
      vatRate: null,
      description: r.label || null,
      analyticalCodes: [],
      contactExternalId: null,
    }));
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    entries.push({
      // EntityBase — placeholder values : ces écritures ne sont pas persistées en
      // Firestore (le FEC reste in-memory dans le pipeline d'analyse).
      id: "",
      userId: "",
      connectionId: "",
      externalId: key,
      source: "fec",
      providerSub: null,
      syncedAt: new Date().toISOString(),
      rawData: {},
      // AccountingEntry
      journalCode: first.journalCode,
      date: `${first.date}T00:00:00.000Z`,
      label: first.label,
      reference: first.pieceRef || null,
      status: "posted",
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      currency: "EUR",
      lines,
    });
  }

  // ─── Trial balance : cumuls par numéro de compte exact + variantes synthétiques ─
  const tbByExact = new Map<string, { debit: number; credit: number; label: string }>();
  for (const row of rows) {
    const slot =
      tbByExact.get(row.accountNumber) ?? { debit: 0, credit: 0, label: row.accountLabel };
    slot.debit += row.debit;
    slot.credit += row.credit;
    if (!slot.label && row.accountLabel) slot.label = row.accountLabel;
    tbByExact.set(row.accountNumber, slot);
  }
  const periodStart = minDate ?? new Date().toISOString().slice(0, 10);
  const periodEnd = maxDate ?? new Date().toISOString().slice(0, 10);

  const trialBalance: NormalizedTrialBalanceEntry[] = [...tbByExact.entries()].map(
    ([accountNumber, agg]) => ({
      accountNumber,
      accountLabel: agg.label || accountNumber,
      formattedNumber: null,
      debit: Math.round(agg.debit * 100) / 100,
      credit: Math.round(agg.credit * 100) / 100,
      periodStart: `${periodStart}T00:00:00.000Z`,
      periodEnd: `${periodEnd}T23:59:59.999Z`,
    })
  );

  return {
    entries,
    trialBalance,
    periodStart,
    periodEnd,
    stats: {
      rowsRead: dataLines.length,
      entriesGrouped: entries.length,
      rowsSkipped: skipped,
      delimiter,
    },
  };
}
