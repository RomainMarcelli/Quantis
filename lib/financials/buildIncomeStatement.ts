// File: lib/financials/buildIncomeStatement.ts
// Role: construit un `IncomeStatement` (compte de résultat) à partir du
// `mappedData` 2033-SD persisté dans une analyse.
//
// Structure produite (conforme au PCG français) :
//   Produits d'exploitation
//   - Charges d'exploitation
//   = Résultat d'exploitation (EBIT)
//   ± Résultat financier
//   ± Résultat exceptionnel
//   - Impôt sur les bénéfices
//   = Résultat net
//
// Les libellés sont vulgarisés pour un dirigeant non-comptable. Le code
// PCG (2033-SD) reste accessible en tooltip pour la traçabilité.

import type { MappedFinancialData } from "@/types/analysis";
import type { FinancialLine, FinancialSection, IncomeStatement } from "@/lib/financials/types";

/** Helper : somme une liste de valeurs nullables. Renvoie null si tout est null. */
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

/** Helper : construit une ligne. Utile pour ne pas répéter la structure. */
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

/** Helper : assemble une section et calcule son sous-total. */
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

export function buildIncomeStatement(
  mapped: MappedFinancialData,
  fiscalYear: number | null
): IncomeStatement {
  // ─── Produits d'exploitation ─────────────────────────────────────────
  // On s'aligne sur la structure 2033-SD : ventes de march., production
  // vendue (biens + services), production stockée, production immobilisée,
  // subventions d'exploitation, autres produits.
  const produitsExploitation = section(
    "Produits d'exploitation",
    "produit",
    [
      line(
        "Ventes de marchandises",
        mapped.ventes_march,
        "FL",
        "Revente de marchandises achetées en l'état."
      ),
      line(
        "Production vendue (biens + services)",
        mapped.prod_vendue,
        "FF + FI",
        "Biens et services produits puis vendus sur la période."
      ),
      line(
        "Production stockée",
        mapped.prod_stockee,
        "FM",
        "Produits finis encore en stock à la clôture (variation de stock)."
      ),
      line(
        "Production immobilisée",
        mapped.prod_immo,
        "FN",
        "Production faite par l'entreprise pour elle-même (immobilisations auto-créées)."
      ),
      line(
        "Subventions d'exploitation",
        mapped.subv_expl,
        "FO",
        "Subventions perçues liées à l'activité courante."
      ),
      line(
        "Autres produits d'exploitation",
        mapped.autres_prod_expl,
        "FQ"
      ),
    ]
  );

  // ─── Charges d'exploitation (stockées en négatif pour cumul direct) ──
  // Convention : on stocke en valeur signée (négative = charge) pour que
  // les sommes côté UI soient naturelles. Le composant choisit d'afficher
  // (X) ou -X.
  const chargesExploitation = section(
    "Charges d'exploitation",
    "charge",
    [
      line(
        "Achats de marchandises",
        negate(mapped.achats_march),
        "FS",
        "Achats consommés revendus en l'état."
      ),
      line(
        "Variation de stocks de marchandises",
        negate(mapped.var_stock_march),
        "FT",
        "+ si le stock de marchandises augmente sur la période."
      ),
      line(
        "Achats de matières premières",
        negate(mapped.achats_mp),
        "FU"
      ),
      line(
        "Variation de stocks de matières",
        negate(mapped.var_stock_mp),
        "FV"
      ),
      line(
        "Autres charges externes",
        negate(mapped.ace),
        "FW",
        "Loyers, sous-traitance, honoraires, transports, télécoms..."
      ),
      line(
        "Impôts et taxes (hors IS)",
        negate(mapped.impots_taxes),
        "FX"
      ),
      line(
        "Salaires bruts",
        negate(mapped.salaires),
        "FY"
      ),
      line(
        "Charges sociales",
        negate(mapped.charges_soc),
        "FZ"
      ),
      line(
        "Dotations aux amortissements",
        negate(mapped.dap),
        "GA",
        "Étalement comptable du coût des immobilisations."
      ),
      line(
        "Dotations aux provisions",
        negate(mapped.dprov),
        "GB"
      ),
      line(
        "Autres charges d'exploitation",
        negate(mapped.autres_charges_expl),
        "GE"
      ),
    ]
  );

  // ─── Résultat d'exploitation (EBIT) ──────────────────────────────────
  const resultatExploitation = sumNullable([
    produitsExploitation.subtotal,
    chargesExploitation.subtotal,
  ]);

  // ─── Résultat financier ──────────────────────────────────────────────
  const produitsFinanciers = section(
    "Produits financiers",
    "produit",
    [line("Produits financiers", mapped.prod_fin, "GJ → GP")]
  );
  const chargesFinancieres = section(
    "Charges financières",
    "charge",
    [line("Charges financières (intérêts d'emprunts...)", negate(mapped.charges_fin), "GR → GU")]
  );
  const resultatFinancier = sumNullable([
    produitsFinanciers.subtotal,
    chargesFinancieres.subtotal,
  ]);

  // ─── Résultat exceptionnel ───────────────────────────────────────────
  const produitsExceptionnels = section(
    "Produits exceptionnels",
    "produit",
    [line("Produits exceptionnels", mapped.prod_excep, "HA → HD")]
  );
  const chargesExceptionnelles = section(
    "Charges exceptionnelles",
    "charge",
    [line("Charges exceptionnelles", negate(mapped.charges_excep), "HE → HH")]
  );
  const resultatExceptionnel = sumNullable([
    produitsExceptionnels.subtotal,
    chargesExceptionnelles.subtotal,
  ]);

  // ─── Résultat avant impôt → impôt → résultat net ─────────────────────
  const resultatAvantImpot = sumNullable([
    resultatExploitation,
    resultatFinancier,
    resultatExceptionnel,
  ]);
  const impot = mapped.is_impot !== null ? -Math.abs(mapped.is_impot) : null;
  // Privilégier le résultat net comptable persisté quand il existe
  // (mapping authoritative depuis le 2033-SD), sinon recalcule.
  const resultatNet =
    mapped.res_net ??
    mapped.resultat_exercice ??
    sumNullable([resultatAvantImpot, impot]);

  return {
    fiscalYear,
    produitsExploitation,
    chargesExploitation,
    resultatExploitation,
    produitsFinanciers,
    chargesFinancieres,
    resultatFinancier,
    produitsExceptionnels,
    chargesExceptionnelles,
    resultatExceptionnel,
    resultatAvantImpot,
    impot,
    resultatNet,
  };
}

/** -1 × x, ou null si x est null. */
function negate(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return -value;
}
