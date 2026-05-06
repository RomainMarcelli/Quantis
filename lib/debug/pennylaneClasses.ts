// File: lib/debug/pennylaneClasses.ts
// Role: agrégateur "vue par classe PCG" des données Pennylane synchronisées.
//
// Point d'entrée debug pour le PM : qu'est-ce qu'on rapatrie réellement
// depuis Pennylane, classe par classe (1 à 7) du Plan Comptable Général ?
//
// Convention PCG française :
//   - Classe 1 : Capitaux (capital, réserves, emprunts)
//   - Classe 2 : Immobilisations
//   - Classe 3 : Stocks et en-cours
//   - Classe 4 : Tiers (clients 41x, fournisseurs 40x, État 44x, sociaux 43x)
//   - Classe 5 : Trésorerie (banques 512x, caisses 53x)
//   - Classe 6 : Charges
//   - Classe 7 : Produits
//   - (Classes 8/9 plus rares — exposées si présentes mais hors focus)
//
// L'agrégation se fait depuis :
//   - `accounting_entries` (lignes : debit, credit, accountNumber, accountLabel)
//   - `ledger_accounts`    (catalogue des comptes : numéro + libellé)
//
// Calculs :
//   - debit / credit / net (debit - credit) cumulés par classe
//   - top N comptes par valeur absolue cumulée
//   - dernières N lignes pour donner un aperçu concret au PM

import type { AccountingEntry, LedgerAccount } from "@/types/connectors";

export type PcgClassCode = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export type PcgClassMeta = {
  code: PcgClassCode;
  label: string;
  description: string;
  /** Sens "habituel" du solde — utile pour qualifier le `net` côté UI. */
  expectedSign: "debit" | "credit" | "mixed";
};

export const PCG_CLASSES: Record<PcgClassCode, PcgClassMeta> = {
  "1": {
    code: "1",
    label: "Capitaux",
    description: "Capital social, réserves, résultat, provisions, emprunts.",
    expectedSign: "credit",
  },
  "2": {
    code: "2",
    label: "Immobilisations",
    description: "Incorporelles, corporelles, financières + amortissements.",
    expectedSign: "debit",
  },
  "3": {
    code: "3",
    label: "Stocks et en-cours",
    description: "Matières premières, marchandises, produits finis.",
    expectedSign: "debit",
  },
  "4": {
    code: "4",
    label: "Comptes de tiers",
    description: "Fournisseurs (40x), clients (41x), salariés (42x), sociaux (43x), État (44x).",
    expectedSign: "mixed",
  },
  "5": {
    code: "5",
    label: "Trésorerie",
    description: "Banques (512x), caisse (53x), valeurs mobilières de placement.",
    expectedSign: "debit",
  },
  "6": {
    code: "6",
    label: "Charges",
    description: "Achats, charges externes, salaires, impôts, dotations.",
    expectedSign: "debit",
  },
  "7": {
    code: "7",
    label: "Produits",
    description: "Ventes, production, subventions, produits financiers/exceptionnels.",
    expectedSign: "credit",
  },
  "8": {
    code: "8",
    label: "Spéciaux",
    description: "Engagements hors bilan, comptes spéciaux (rare en PME).",
    expectedSign: "mixed",
  },
  "9": {
    code: "9",
    label: "Comptabilité analytique",
    description: "Réservés à l'analytique — rarement présents en PME.",
    expectedSign: "mixed",
  },
};

/** Liste ordonnée des classes 1 à 7 — pour itérer côté UI. */
export const PCG_PRIMARY_CLASSES: PcgClassCode[] = ["1", "2", "3", "4", "5", "6", "7"];

/** Renvoie la classe PCG (1er chiffre) d'un numéro de compte, "?" si invalide. */
export function classOfAccount(accountNumber: string): PcgClassCode | null {
  if (!accountNumber || accountNumber.length === 0) return null;
  const first = accountNumber.charAt(0);
  if (!/^[1-9]$/.test(first)) return null;
  return first as PcgClassCode;
}

export type AccountAggregate = {
  number: string;
  label: string | null;
  totalDebit: number;
  totalCredit: number;
  net: number;
  lineCount: number;
};

export type EntrySample = {
  externalId: string | null;
  date: string;
  journalCode: string;
  reference: string | null;
  label: string;
  totalDebit: number;
  totalCredit: number;
  /** Lignes filtrées sur cette classe uniquement (pour ne pas noyer le PM). */
  linesInClass: Array<{
    accountNumber: string;
    accountLabel: string | null;
    debit: number;
    credit: number;
    description: string | null;
  }>;
};

export type ClassAggregate = {
  classCode: PcgClassCode;
  meta: PcgClassMeta;
  accountCount: number;
  lineCount: number;
  totalDebit: number;
  totalCredit: number;
  net: number;
  topAccounts: AccountAggregate[];
  sampleEntries: EntrySample[];
};

export type PennylaneClassReport = {
  connectionId: string;
  externalCompanyId: string;
  generatedAt: string;
  totals: {
    accountCount: number;
    entryCount: number;
    lineCount: number;
    earliestEntryDate: string | null;
    latestEntryDate: string | null;
  };
  classes: ClassAggregate[];
  /** Classes inattendues (8, 9, ou null) trouvées dans les données. */
  unmappedAccountSamples: Array<{ number: string; label: string | null; lineCount: number }>;
};

const TOP_ACCOUNTS_PER_CLASS = 10;
const SAMPLE_ENTRIES_PER_CLASS = 5;

/**
 * Construit le rapport complet à partir des entités brutes de la connection.
 * Pure fonction — pas d'I/O. Testable avec des fixtures simples.
 */
export function buildPennylaneClassReport(input: {
  connectionId: string;
  externalCompanyId: string;
  ledgerAccounts: LedgerAccount[];
  accountingEntries: AccountingEntry[];
}): PennylaneClassReport {
  // Index libellés depuis ledger_accounts pour combler les lignes qui n'ont
  // pas le label embarqué (Pennylane le fournit la plupart du temps mais on
  // ne veut pas dépendre de ça à 100%).
  const labelByNumber = new Map<string, string>();
  for (const acc of input.ledgerAccounts) {
    if (acc.number) labelByNumber.set(acc.number, acc.label ?? "");
  }

  // Agrégats par classe + par compte.
  const classBuckets = new Map<PcgClassCode, ClassBucket>();
  const unmappedAccounts = new Map<string, { label: string | null; lineCount: number }>();

  let earliestDate: string | null = null;
  let latestDate: string | null = null;

  // Trie les écritures par date pour pouvoir extraire les "dernières" en O(N).
  const sortedEntries = [...input.accountingEntries].sort((a, b) => b.date.localeCompare(a.date));

  for (const entry of sortedEntries) {
    if (!earliestDate || entry.date < earliestDate) earliestDate = entry.date;
    if (!latestDate || entry.date > latestDate) latestDate = entry.date;

    // Pour le sample : on regroupe les lignes par classe pour pouvoir attacher
    // l'écriture à chaque classe qu'elle touche (un Achat touche 6 + 4 + 4).
    const linesByClass = new Map<PcgClassCode, EntrySample["linesInClass"]>();

    for (const line of entry.lines) {
      const cls = classOfAccount(line.accountNumber);
      if (cls === null) {
        const cur = unmappedAccounts.get(line.accountNumber) ?? {
          label: line.accountLabel ?? labelByNumber.get(line.accountNumber) ?? null,
          lineCount: 0,
        };
        cur.lineCount += 1;
        unmappedAccounts.set(line.accountNumber, cur);
        continue;
      }

      let bucket = classBuckets.get(cls);
      if (!bucket) {
        bucket = createBucket(cls);
        classBuckets.set(cls, bucket);
      }
      bucket.lineCount += 1;
      bucket.totalDebit += line.debit;
      bucket.totalCredit += line.credit;

      const accountKey = line.accountNumber;
      let acc = bucket.accounts.get(accountKey);
      if (!acc) {
        acc = {
          number: line.accountNumber,
          label: line.accountLabel ?? labelByNumber.get(line.accountNumber) ?? null,
          totalDebit: 0,
          totalCredit: 0,
          net: 0,
          lineCount: 0,
        };
        bucket.accounts.set(accountKey, acc);
      }
      acc.totalDebit += line.debit;
      acc.totalCredit += line.credit;
      acc.net = acc.totalDebit - acc.totalCredit;
      acc.lineCount += 1;

      // Stockage en vue du sample : on garde la ligne dans la classe ad hoc.
      const lines = linesByClass.get(cls) ?? [];
      lines.push({
        accountNumber: line.accountNumber,
        accountLabel: acc.label,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      });
      linesByClass.set(cls, lines);
    }

    // Push le sample (limité par classe).
    for (const [cls, lines] of linesByClass) {
      const bucket = classBuckets.get(cls);
      if (!bucket) continue;
      if (bucket.sampleEntries.length >= SAMPLE_ENTRIES_PER_CLASS) continue;
      bucket.sampleEntries.push({
        externalId: entry.externalId ?? null,
        date: entry.date,
        journalCode: entry.journalCode,
        reference: entry.reference,
        label: entry.label,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        linesInClass: lines,
      });
    }
  }

  // On compte aussi les comptes du référentiel qui n'ont pas (encore) bougé,
  // pour qu'une classe vide puisse quand même afficher un compteur "X comptes
  // déclarés mais 0 ligne". Ça aide à détecter une sync partielle.
  for (const acc of input.ledgerAccounts) {
    const cls = classOfAccount(acc.number);
    if (cls === null) continue;
    let bucket = classBuckets.get(cls);
    if (!bucket) {
      bucket = createBucket(cls);
      classBuckets.set(cls, bucket);
    }
    if (!bucket.accounts.has(acc.number)) {
      bucket.accounts.set(acc.number, {
        number: acc.number,
        label: acc.label,
        totalDebit: 0,
        totalCredit: 0,
        net: 0,
        lineCount: 0,
      });
    }
  }

  // Finalisation : on fixe les top accounts (par |net|) + on calcule net global.
  const classes: ClassAggregate[] = [];
  const allClassCodes: PcgClassCode[] = [...PCG_PRIMARY_CLASSES, "8", "9"];
  for (const code of allClassCodes) {
    const bucket = classBuckets.get(code);
    if (!bucket && !PCG_PRIMARY_CLASSES.includes(code)) {
      // Pas de classe 8/9 → on ne les expose pas.
      continue;
    }
    if (!bucket) {
      classes.push({
        classCode: code,
        meta: PCG_CLASSES[code],
        accountCount: 0,
        lineCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        net: 0,
        topAccounts: [],
        sampleEntries: [],
      });
      continue;
    }

    const allAccounts = Array.from(bucket.accounts.values());
    const topAccounts = allAccounts
      .filter((a) => a.lineCount > 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, TOP_ACCOUNTS_PER_CLASS);

    classes.push({
      classCode: code,
      meta: PCG_CLASSES[code],
      accountCount: allAccounts.length,
      lineCount: bucket.lineCount,
      totalDebit: bucket.totalDebit,
      totalCredit: bucket.totalCredit,
      net: bucket.totalDebit - bucket.totalCredit,
      topAccounts,
      sampleEntries: bucket.sampleEntries,
    });
  }

  const unmappedAccountSamples = Array.from(unmappedAccounts.entries())
    .map(([number, info]) => ({ number, label: info.label, lineCount: info.lineCount }))
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 10);

  // Total accounts = somme des accounts par classe (sans double comptage car
  // un compte appartient à une seule classe).
  const totalAccountCount = classes.reduce((sum, c) => sum + c.accountCount, 0);
  const totalLineCount = classes.reduce((sum, c) => sum + c.lineCount, 0);

  return {
    connectionId: input.connectionId,
    externalCompanyId: input.externalCompanyId,
    generatedAt: new Date().toISOString(),
    totals: {
      accountCount: totalAccountCount,
      entryCount: input.accountingEntries.length,
      lineCount: totalLineCount,
      earliestEntryDate: earliestDate,
      latestEntryDate: latestDate,
    },
    classes,
    unmappedAccountSamples,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────

type ClassBucket = {
  classCode: PcgClassCode;
  lineCount: number;
  totalDebit: number;
  totalCredit: number;
  accounts: Map<string, AccountAggregate>;
  sampleEntries: EntrySample[];
};

function createBucket(code: PcgClassCode): ClassBucket {
  return {
    classCode: code,
    lineCount: 0,
    totalDebit: 0,
    totalCredit: 0,
    accounts: new Map(),
    sampleEntries: [],
  };
}
