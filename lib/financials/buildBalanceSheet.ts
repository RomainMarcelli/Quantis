// File: lib/financials/buildBalanceSheet.ts
// Role: construit un `BalanceSheet` (bilan) à partir du `mappedData`
// 2033-SD persisté dans une analyse.
//
// Structure produite (conforme au PCG français) :
//   ACTIF                              PASSIF
//   ├── Actif immobilisé               ├── Capitaux propres
//   ├── Actif circulant                ├── Provisions pour risques
//   ├── CCA                            ├── Dettes
//   = Total actif                      ├── PCA
//                                      = Total passif
//
// Convention : valeurs stockées en POSITIF dans toutes les sections (le
// bilan additionne en positif des deux côtés). Pas de négatif sauf erreur
// de saisie — le composant CoherenceChecks repérera un total ≠ entre
// actif et passif.

import type { MappedFinancialData } from "@/types/analysis";
import type { BalanceSheet, FinancialLine, FinancialSection } from "@/lib/financials/types";

function sumNullable(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let hasAny = false;
  for (const v of values) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      total += v;
      hasAny = true;
    }
  }
  return hasAny ? total : null;
}

function line(
  label: string,
  value: number | null | undefined,
  pcgCode?: string,
  tooltip?: string
): FinancialLine {
  return {
    label,
    value: value === undefined ? null : value,
    pcgCode,
    tooltip,
  };
}

function section(
  title: string,
  kind: FinancialSection["kind"],
  lines: FinancialLine[]
): FinancialSection {
  return {
    title,
    kind,
    lines,
    subtotal: sumNullable(lines.map((l) => l.value)),
  };
}

export function buildBalanceSheet(
  mapped: MappedFinancialData,
  fiscalYear: number | null
): BalanceSheet {
  // ─── Actif immobilisé ────────────────────────────────────────────────
  const immobilise = section(
    "Actif immobilisé",
    "actif",
    [
      line(
        "Immobilisations incorporelles",
        mapped.immob_incorp,
        "AB → AF",
        "Brevets, logiciels, licences, marques, fonds de commerce."
      ),
      line(
        "Immobilisations corporelles",
        mapped.immob_corp,
        "AN → AP",
        "Bâtiments, machines, outillage, matériel de transport, matériel informatique."
      ),
      line(
        "Immobilisations financières",
        mapped.immob_fin,
        "AR → AV",
        "Titres de participation, prêts à long terme, dépôts et cautionnements."
      ),
    ]
  );

  // ─── Actif circulant ─────────────────────────────────────────────────
  const circulant = section(
    "Actif circulant",
    "actif",
    [
      line(
        "Stocks (matières + marchandises)",
        mapped.total_stocks,
        "BL → BT",
        "Matières premières, marchandises, en-cours, produits finis."
      ),
      line(
        "Créances clients",
        mapped.clients,
        "BX",
        "Factures émises, en attente de paiement."
      ),
      line(
        "Autres créances",
        mapped.autres_creances,
        "BZ",
        "TVA déductible, acomptes versés, comptes courants associés..."
      ),
      line(
        "Valeurs mobilières de placement",
        mapped.vmp,
        "CD",
        "Placements financiers court terme."
      ),
      line(
        "Disponibilités",
        mapped.dispo,
        "CF",
        "Soldes des comptes bancaires + caisse."
      ),
    ]
  );

  const cca = mapped.cca;
  const totalActif = sumNullable([immobilise.subtotal, circulant.subtotal, cca]);

  // ─── Capitaux propres ────────────────────────────────────────────────
  const capitauxPropres = section(
    "Capitaux propres",
    "capitaux",
    [
      line("Capital social", mapped.capital, "DA"),
      line("Primes / écarts de réévaluation", mapped.ecarts_reeval, "DB → DD"),
      line("Réserve légale", mapped.reserve_legale, "DE"),
      line("Réserves réglementées", mapped.reserves_reglem, "DF"),
      line("Autres réserves", mapped.autres_reserves, "DG → DH"),
      line(
        "Report à nouveau",
        mapped.ran,
        "DI",
        "Bénéfices ou pertes des années passées non distribués."
      ),
      line(
        "Résultat de l'exercice",
        mapped.res_net ?? mapped.resultat_exercice,
        "DJ",
        "Bénéfice (ou perte) de l'année — viendra grossir le RAN à l'affectation."
      ),
      line("Subventions d'investissement", mapped.subv_invest, "DK"),
      line("Provisions réglementées", mapped.prov_reglem, "DL"),
    ]
  );

  // ─── Provisions ──────────────────────────────────────────────────────
  const provisions = section(
    "Provisions pour risques et charges",
    "dette",
    [
      line(
        "Total provisions",
        mapped.total_prov,
        "DP",
        "Risques anticipés (litiges, garanties, restructuration...)."
      ),
    ]
  );

  // ─── Dettes ──────────────────────────────────────────────────────────
  const dettes = section(
    "Dettes",
    "dette",
    [
      line(
        "Emprunts (banques + obligataires)",
        mapped.emprunts,
        "DT → DV",
        "Dettes financières long et court terme auprès d'établissements de crédit."
      ),
      line(
        "Avances reçues sur commandes",
        mapped.avances_recues_passif,
        "DW"
      ),
      line(
        "Fournisseurs",
        mapped.fournisseurs,
        "DX"
      ),
      line(
        "Dettes fiscales et sociales",
        mapped.dettes_fisc_soc,
        "DY",
        "TVA collectée, IS dû, charges sociales à payer, salaires à payer..."
      ),
      line(
        "Comptes courants associés",
        mapped.cca_passif,
        "EA"
      ),
      line(
        "Autres dettes",
        mapped.autres_dettes,
        "DZ"
      ),
    ]
  );

  const pca = mapped.pca;
  const totalPassif = sumNullable([
    capitauxPropres.subtotal,
    provisions.subtotal,
    dettes.subtotal,
    pca,
  ]);

  return {
    fiscalYear,
    actif: {
      immobilise,
      circulant,
      cca,
      total: totalActif,
    },
    passif: {
      capitauxPropres,
      provisions,
      dettes,
      pca,
      total: totalPassif,
    },
  };
}
