// File: lib/financials/types.ts
// Role: types partagés pour les vues "états financiers" (compte de résultat
// + bilan). Volontairement isolés du `kpiRegistry` et de la couche
// integrations — c'est juste une projection visuelle des données qu'on a
// déjà dans `mappedData` (format 2033-SD).

/**
 * Une ligne d'un état financier. Représente un poste comptable du PCG :
 *   - `label` : libellé vulgarisé pour un dirigeant ("Ventes de marchandises"
 *     plutôt que "ventes_march").
 *   - `value` : montant en euros, signé. Convention :
 *       * positif = "ce qui apporte" (produits, actifs, capitaux propres)
 *       * négatif = "ce qui retire" (charges, dettes affichées en valeur
 *         absolue côté UI mais stockées négatives ici si on veut une
 *         soustraction directe). Pour le bilan on stocke en positif et la
 *         section décide du sens. Pour le P&L on stocke en valeur signée
 *         pour pouvoir afficher (300 000) et faire des sommes naturelles.
 *   - `pcgCode` : pour les curieux — ce qu'on retrouve dans le 2033-SD.
 *   - `tooltip` : explication courte en hover (optionnel).
 */
export type FinancialLine = {
  label: string;
  value: number | null;
  pcgCode?: string;
  tooltip?: string;
};

/**
 * Une section d'un état financier — regroupe plusieurs lignes sous un
 * titre, avec un sous-total calculé automatiquement.
 */
export type FinancialSection = {
  title: string;
  /**
   * "produit" / "charge" / "actif" / "capitaux" / "dette" / "neutre" :
   * sert au styling et à la couleur côté UI sans dupliquer la logique
   * dans chaque composant.
   */
  kind: "produit" | "charge" | "actif" | "capitaux" | "dette" | "neutre";
  lines: FinancialLine[];
  /** Sous-total NET calculé automatiquement. Null si toutes les lignes sont null. */
  subtotal: number | null;
  /**
   * Sous-total BRUT (avant amortissements / provisions) — uniquement
   * pertinent pour la section "Actif immobilisé" du bilan où la valeur
   * brute (coût d'acquisition) diffère de la valeur nette comptable. Null
   * pour toutes les autres sections (produits, charges, circulant, dettes…)
   * où Brut = Net par construction.
   */
  subtotalBrut?: number | null;
};

/**
 * Compte de résultat agrégé — rendu prêt-à-afficher.
 */
export type IncomeStatement = {
  fiscalYear: number | null;
  // Sections opérationnelles
  produitsExploitation: FinancialSection;
  chargesExploitation: FinancialSection;
  // Résultat intermédiaire : Total prod expl - Total charges expl
  resultatExploitation: number | null;
  // Sections financières + exceptionnelles
  produitsFinanciers: FinancialSection;
  chargesFinancieres: FinancialSection;
  resultatFinancier: number | null;
  produitsExceptionnels: FinancialSection;
  chargesExceptionnelles: FinancialSection;
  resultatExceptionnel: number | null;
  // Résultat avant impôt + impôt + résultat net
  resultatAvantImpot: number | null;
  impot: number | null;
  resultatNet: number | null;
};

/**
 * Bilan agrégé — actif et passif côte à côte.
 */
export type BalanceSheet = {
  fiscalYear: number | null;
  actif: {
    immobilise: FinancialSection;
    circulant: FinancialSection;
    cca: number | null;
    total: number | null;
  };
  passif: {
    capitauxPropres: FinancialSection;
    provisions: FinancialSection;
    dettes: FinancialSection;
    pca: number | null;
    total: number | null;
  };
};

/**
 * Vérifications de cohérence — chaque check produit un statut et
 * éventuellement un écart à afficher en évidence.
 */
export type CoherenceCheck = {
  /** Identifiant pour la clé React. */
  id: string;
  /** Libellé court affiché côté UI. */
  label: string;
  /** Statut : ok = aligné, warning = écart < 1%, error = écart significatif, na = donnée manquante. */
  status: "ok" | "warning" | "error" | "na";
  /** Écart absolu en € (ou ratio formaté). Optionnel. */
  delta?: number;
  /** Détail technique pour les curieux. */
  detail?: string;
};
