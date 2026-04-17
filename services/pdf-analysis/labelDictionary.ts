import type { FieldDefinition } from "@/services/pdf-analysis/types";

const alias = (...values: string[]) => values;
const regex = (...values: RegExp[]) => values;

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "salesGoods",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("ventes de marchandises", "vente de marchandises"),
    regexAliases: regex(/\bventes?\s+de\s+marchandises?\b/),
    excludes: alias("variation", "stock"),
    expectedLineCodes: ["209"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "productionSoldGoods",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("production vendue de biens", "production vendue biens"),
    regexAliases: regex(/\bproduction\s+vendue\s+de\s+biens\b/),
    excludes: alias("stockee", "immobilisee"),
    expectedLineCodes: ["215"],
    minAbs: 1000
    // allowNegative retiré en Lot 3 : prod_vendue biens peut être légitimement négatif (BEL AIR : -7 031). Voir DBG-007.
  },
  {
    key: "productionSoldServices",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("production vendue de services", "production vendue services"),
    regexAliases: regex(/\bproduction\s+vendue\s+de\s+services\b/),
    excludes: alias("stockee", "immobilisee"),
    expectedLineCodes: ["217"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "productionSold",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("production vendue"),
    regexAliases: regex(/\bproduction\s+vendue\b/),
    // Exclure les sous-lignes "biens" et "services" pour ne matcher que le total agrégé.
    // Sans cette exclusion, la ligne "production vendue de biens" absorbe le champ au lieu du total.
    // allowNegative retiré en Lot 3 : prod_vendue peut être légitimement négatif. Voir DBG-007.
    excludes: alias("stockee", "immobilisee", "biens", "services")
  },
  {
    key: "purchasesGoods",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("achat de marchandises", "achats de marchandises"),
    regexAliases: regex(/\bachats?\s+de\s+marchandises?\b/),
    excludes: alias("variation"),
    expectedLineCodes: ["234"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "stockVariationGoods",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "signedRightmost",
    aliases: alias("variation de stocks (marchandises)", "variation de stock marchandises"),
    regexAliases: regex(/\bvariation\s+de\s+stocks?\b.*\bmarchandises?\b/),
    excludes: alias("matieres"),
    expectedLineCodes: ["236"]
  },
  {
    key: "rawMaterialPurchases",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias(
      "achats de matieres premieres et autres approvisionnements",
      "achats de matieres premieres",
      "achats mp"
    ),
    regexAliases: regex(/\bachats?\s+de\s+matieres?\s+premieres?\b/),
    excludes: alias("variation"),
    expectedLineCodes: ["238"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "stockVariationRawMaterials",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "signedRightmost",
    aliases: alias("variation de stock matieres premieres", "variation de stock"),
    regexAliases: regex(/\bvariation\s+de\s+stocks?\b/),
    excludes: alias("marchandises"),
    expectedLineCodes: ["240"]
  },
  {
    key: "externalCharges",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("autres charges externes", "autres achats et charges externes"),
    regexAliases: regex(/\bautres?\s+charges?\s+externes?\b/, /\bautres?\s+achats?\s+et\s+charges?\s+externes?\b/),
    excludes: alias("exceptionnelles"),
    expectedLineCodes: ["242"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "taxesAndLevies",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("impots, taxes et versements assimiles", "impots et taxes", "impots taxes"),
    regexAliases: regex(/\bimpots?\b.*\btaxes?\b/),
    excludes: alias("benefices"),
    expectedLineCodes: ["244"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "wages",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("remunerations du personnel", "salaires et traitements"),
    regexAliases: regex(/\bremunerations?\s+du\s+personnel\b/, /\bsalaires?\b/),
    excludes: alias("charges"),
    expectedLineCodes: ["250"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "socialCharges",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("charges sociales"),
    regexAliases: regex(/\bcharges?\s+sociales?\b/),
    excludes: alias("financieres", "exceptionnelles"),
    expectedLineCodes: ["252"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "depreciationAllocations",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("dotations aux amortissements", "dotations amortissements"),
    regexAliases: regex(/\bdotations?\b.*\bamortissements?\b/),
    excludes: alias("provisions"),
    expectedLineCodes: ["254"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "provisionsAllocations",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("dotations aux provisions", "dotations provisions"),
    regexAliases: regex(/\bdotations?\b.*\bprovisions?\b/),
    excludes: alias("actif circulant", "bilan"),
    expectedLineCodes: ["256"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "otherOperatingIncome",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("autres produits d'exploitation", "autres produits"),
    regexAliases: regex(/\bautres?\s+produits?\s+d[' ]?exploitation\b/, /\bautres?\s+produits?\b/),
    excludes: alias("financiers", "exceptionnels"),
    expectedLineCodes: ["230"],
    minAbs: 1000
  },
  {
    key: "otherOperatingCharges",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("autres charges d'exploitation", "autres charges"),
    regexAliases: regex(/\bautres?\s+charges?\s+d[' ]?exploitation\b/, /\bautres?\s+charges?\b/),
    excludes: alias("financieres", "exceptionnelles", "externes"),
    expectedLineCodes: ["262"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "financialProducts",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des produits financiers", "produits financiers"),
    regexAliases: regex(/\btotal\s+des?\s+produits?\s+financiers?\b/, /\bproduits?\s+financiers?\b/),
    excludes: alias("resultat"),
    expectedLineCodes: ["280"],
    minAbs: 1000
  },
  {
    key: "financialCharges",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des charges financieres", "charges financieres"),
    regexAliases: regex(/\btotal\s+des?\s+charges?\s+financieres?\b/, /\bcharges?\s+financieres?\b/),
    excludes: alias("resultat"),
    expectedLineCodes: ["294"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "exceptionalProducts",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des produits exceptionnels", "produits exceptionnels"),
    regexAliases: regex(/\btotal\s+des?\s+produits?\s+exceptionnels?\b/, /\bproduits?\s+exceptionnels?\b/),
    excludes: alias("resultat"),
    expectedLineCodes: ["290"],
    minAbs: 1000
  },
  {
    key: "exceptionalCharges",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des charges exceptionnelles", "charges exceptionnelles"),
    regexAliases: regex(/\btotal\s+des?\s+charges?\s+exceptionnelles?\b/, /\bcharges?\s+exceptionnelles?\b/),
    excludes: alias("resultat"),
    expectedLineCodes: ["300"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "incomeTax",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("impot sur les benefices", "impots sur les benefices"),
    regexAliases: regex(/\bimpots?\s+sur\s+les\s+benefices\b/, /\bimpot\s+sur\s+les\s+benefices\b/),
    excludes: alias("dettes", "etat"),
    expectedLineCodes: ["306"],
    minAbs: 1000
  },
  {
    key: "netTurnover",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("chiffres d'affaires nets", "chiffre d'affaires net", "ca net", "chiffre d'affaires"),
    regexAliases: regex(
      /\bchiffres?\s+d[' ]?affaires?\s+nets?\b/,
      /\bchiffres?\s+d[' ]?affaires?\b/,
      /\bca\b/
    ),
    excludes: alias("variation", "stockee", "capitaux", "charges", "dettes", "passif", "actif"),
    expectedLineCodes: ["210", "209"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "totalOperatingProducts",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des produits d'exploitation", "total produits d'exploitation"),
    regexAliases: regex(/\btotal\s+des?\s+produits?\s+d[' ]?exploitation\b/),
    excludes: alias("financiers", "exceptionnels"),
    expectedLineCodes: ["232"],
    minAbs: 1000
  },
  {
    key: "totalOperatingCharges",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des charges d'exploitation", "total charges d'exploitation"),
    regexAliases: regex(
      /\btotal\s+des?\s+charges?\s+d[' ]?exploitation\b/,
      /\btotal\s+des?\s+charges?\b.*\bexploitation\b/
    ),
    excludes: alias("financieres", "exceptionnelles"),
    expectedLineCodes: ["264"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "operatingResult",
    section: "incomeStatement",
    kind: "result",
    columnStrategy: "signedRightmost",
    aliases: alias("resultat d'exploitation", "resultat exploitation"),
    regexAliases: regex(/\bresultat\s+d[' ]?exploitation\b/),
    excludes: alias("financier", "exceptionnel"),
    expectedLineCodes: ["270"],
    minAbs: 1000
  },
  {
    key: "financialResult",
    section: "incomeStatement",
    kind: "result",
    columnStrategy: "signedRightmost",
    aliases: alias("resultat financier"),
    regexAliases: regex(/\bresultat\s+financier\b/),
    excludes: alias(),
    expectedLineCodes: ["296", "294"],
    minAbs: 1000
  },
  {
    key: "ordinaryResultBeforeTax",
    section: "incomeStatement",
    kind: "result",
    columnStrategy: "signedRightmost",
    aliases: alias("resultat courant avant impot", "resultat courant avant impots"),
    regexAliases: regex(/\bresultat\s+courant\s+avant\s+impot/),
    excludes: alias(),
    expectedLineCodes: ["300", "306"],
    minAbs: 1000
  },
  {
    key: "exceptionalResult",
    section: "incomeStatement",
    kind: "result",
    columnStrategy: "signedRightmost",
    aliases: alias("resultat exceptionnel"),
    regexAliases: regex(/\bresultat\s+exceptionnel\b/),
    excludes: alias(),
    expectedLineCodes: ["304"],
    minAbs: 1000
  },
  {
    key: "totalProducts",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des produits", "total produits"),
    regexAliases: regex(/\btotal\s+des?\s+produits?\b/),
    excludes: alias("exploitation", "financiers", "exceptionnels", "exceptionnelles"),
    minAbs: 1000
  },
  {
    key: "totalCharges",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total des charges", "total charges"),
    regexAliases: regex(/\btotal\s+des?\s+charges?\b/),
    excludes: alias("exploitation", "financieres", "exceptionnelles", "exceptionnels"),
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "netResult",
    section: "incomeStatement",
    kind: "result",
    columnStrategy: "signedRightmost",
    aliases: alias("resultat net", "resultat de l'exercice", "benefice ou perte", "resultat comptable"),
    regexAliases: regex(/\bresultat\s+net\b/, /\bresultat\s+de\s+l'?exercice\b/, /\bbenefice\s+ou\s+perte\b/, /\bresultat\s+comptable\b/),
    excludes: alias("d'exploitation", "financier", "exceptionnel"),
    expectedLineCodes: ["310"],
    minAbs: 1000
  },
  {
    key: "intangibleAssets",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("immobilisations incorporelles"),
    regexAliases: regex(/\bimmobilisations?\s+incorporelles?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["010", "014"]
  },
  {
    key: "tangibleAssets",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("immobilisations corporelles"),
    regexAliases: regex(/\bimmobilisations?\s+corporelles?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["028"]
  },
  {
    key: "financialAssets",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("immobilisations financieres"),
    regexAliases: regex(/\bimmobilisations?\s+financieres?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["040"]
  },
  {
    key: "totalFixedAssetsGross",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "leftmost",
    aliases: alias("total actif immobilise"),
    regexAliases: regex(/\btotal\s+actif\s+immobilise\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["044", "045"],
    minAbs: 1000
  },
  {
    key: "totalFixedAssets",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "netPriority",
    aliases: alias("total actif immobilise", "total i"),
    regexAliases: regex(/\btotal\s+actif\s+immobilise\b/, /\btotal\s+i\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["044", "045"],
    minAbs: 1000
  },
  {
    key: "totalCurrentAssets",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "netPriority",
    aliases: alias("total actif circulant", "total ii"),
    regexAliases: regex(/\btotal\s+actif\s+circulant\b/, /\btotal\s+ii\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["096"],
    minAbs: 1000
  },
  {
    key: "rawMaterialInventories",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("matieres premieres, approvisionnements, en cours de production", "matieres premieres"),
    regexAliases: regex(/\bmatieres?\s+premieres?\b/, /\bapprovisionnements?\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["050"],
    allowNegative: false
  },
  {
    key: "advancesAndPrepaymentsAssets",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("avances et acomptes verses sur commandes", "avances et acomptes verses"),
    regexAliases: regex(/\bavances?\s+et\s+acomptes?\s+verses?\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["064"]
  },
  {
    key: "inventoriesGoods",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("marchandises", "stocks", "stocks marchandises"),
    regexAliases: regex(/\bstocks?\b.*\bmarchandises?\b/, /\bmarchandises?\b/),
    excludes: alias("variation", "passif"),
    expectedLineCodes: ["060"]
  },
  {
    key: "tradeReceivables",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("creances clients et comptes rattaches", "clients et comptes rattaches", "creances clients"),
    regexAliases: regex(/\bcreances?\s+clients?\b/, /\bclients?\s+et\s+comptes\s+rattaches\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["068"]
  },
  {
    key: "otherReceivables",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("autres creances"),
    regexAliases: regex(/\bautres\s+creances?\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["072"],
    sublineStrategy: "sum",
    sublinePatterns: [
      /\bpersonnel\b/,
      /\borganismes?\s+sociaux\b/,
      /^autres$/
    ]
  },
  {
    key: "marketableSecurities",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("valeurs mobilieres de placement", "vmp"),
    regexAliases: regex(/\bvaleurs?\s+mobilieres?\s+de\s+placement\b/, /\bvmp\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["080"]
  },
  {
    key: "cashAndCashEquivalents",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("disponibilites", "tresorerie", "banque"),
    regexAliases: regex(/\bdisponibilites?\b/, /\btresorerie\b/, /\bbanque\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["084", "085"]
  },
  {
    key: "prepaidExpenses",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "netPriority",
    aliases: alias("charges constatees d'avance"),
    regexAliases: regex(/\bcharges?\s+constatees?\s+d[' ]?avance\b/),
    excludes: alias("passif"),
    expectedLineCodes: ["092"]
  },
  {
    key: "totalAssets",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "netPriority",
    aliases: alias("total actif", "total general actif"),
    regexAliases: regex(/\btotal\s+general\s+actif\b/, /\btotal\s+actif\b/, /\btotal\s+g[ée]n[ée]ral\b/),
    excludes: alias("passif", "circulant", "immobilise"),
    expectedLineCodes: ["110"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "equity",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("capitaux propres", "total capitaux propres", "total i - capitaux propres", "total (1)", "total (i)"),
    regexAliases: regex(/\bcapitaux?\s+propres?\b/, /\btotal\s+i\b.*\bcapitaux?\s+propres?\b/, /\btotal\s*\((i|1)\)\b/),
    excludes: alias("actif"),
    expectedLineCodes: ["142"],
    minAbs: 1000
  },
  {
    key: "provisions",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("provisions pour risques et charges", "total provisions"),
    regexAliases: regex(/\bprovisions?\s+pour\s+risques?\s+et\s+charges?\b/, /\btotal\s+provisions?\b/),
    excludes: alias("actif"),
    expectedLineCodes: ["154"]
  },
  {
    key: "borrowings",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("emprunts et dettes assimilees", "emprunts"),
    regexAliases: regex(/\bemprunts?\s+et\s+dettes?\s+assimilees?\b/, /\bemprunts?\b/),
    excludes: alias("total", "fournisseurs", "fiscales", "sociales"),
    expectedLineCodes: ["156"],
    allowNegative: false
  },
  {
    key: "debts",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("emprunts et dettes", "total emprunts et dettes", "total dettes", "total (iv)"),
    regexAliases: regex(/\bemprunts?\s+et\s+dettes?\b/, /\btotal\s+iii\b.*\bemprunts?\s+et\s+dettes?\b/, /\btotal\s+dettes?\b/, /\btotal\s*\(iv\)\b/),
    excludes: alias("fiscales", "sociales", "fournisseurs"),
    expectedLineCodes: ["176"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "tradePayables",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("dettes fournisseurs et comptes rattaches", "dettes fournisseurs"),
    regexAliases: regex(/\bdettes?\s+fournisseurs?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["166"]
  },
  {
    key: "advancesAndPrepaymentsLiabilities",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("avances et acomptes recus sur commandes en cours", "avances et acomptes recus"),
    regexAliases: regex(/\bavances?\s+et\s+acomptes?\s+recus?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["164"]
  },
  {
    key: "taxSocialPayables",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("dettes fiscales et sociales", "dettes fiscales", "dettes fisc"),
    regexAliases: regex(/\bdettes?\s+fiscales?\s+(?:et\s+sociales?)?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["172"],
    sublineStrategy: "sum",
    sublinePatterns: [
      /\bpersonnel\b/,
      /\borganismes?\s+sociaux\b/,
      /\betat\b.*\btaxe/,
      /\bautres\s+imp[oô]ts?\b/,
      /\bdettes?\s+fiscales?/
    ]
  },
  {
    key: "otherDebts",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("autres dettes"),
    regexAliases: regex(/\bautres\s+dettes?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["175"]
  },
  {
    key: "deferredIncome",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("produits constates d'avance"),
    regexAliases: regex(/\bproduits?\s+constates?\s+d[' ]?avance\b/),
    excludes: alias("total"),
    expectedLineCodes: ["174"]
  },
  {
    key: "totalLiabilities",
    section: "balanceSheet",
    kind: "total",
    columnStrategy: "nCurrent",
    aliases: alias("total passif", "total general passif"),
    regexAliases: regex(/\btotal\s+passif\b/, /\btotal\s+general\s+passif\b/, /\btotal\s+g[ée]n[ée]ral\b/),
    excludes: alias("actif"),
    expectedLineCodes: ["180"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "totalAssetDepreciationProvisions",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "rightmost",
    aliases: alias("total amortissements", "amortissements et provisions"),
    regexAliases: regex(/\b(amortissements?|provisions?)\b/),
    excludes: alias("passif")
  },
  {
    key: "shortTermBankDebt",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("concours bancaires courants", "dettes bancaires court terme"),
    regexAliases: regex(/\bconcours\s+bancaires?\s+courants?\b/, /\bcourt\s+terme\b.*\bbanc/),
    excludes: alias("long terme")
  },
  {
    key: "longTermBankDebt",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("emprunts obligataires", "dettes bancaires long terme"),
    regexAliases: regex(/\blong\s+terme\b.*\bbanc/, /\bemprunts?\b/),
    excludes: alias("court terme")
  },

  // ── Lot 2 : CA N-1 ────────────────────────────────────────────────────────
  {
    key: "netTurnoverPreviousYear",
    section: "incomeStatement",
    kind: "total",
    columnStrategy: "nMinus1",
    aliases: alias("chiffres d'affaires nets", "chiffre d'affaires net", "ca net", "chiffre d'affaires"),
    regexAliases: regex(
      /\bchiffres?\s+d[' ]?affaires?\s+nets?\b/,
      /\bchiffres?\s+d[' ]?affaires?\b/
    ),
    excludes: alias("variation", "stockee", "capitaux", "charges", "dettes", "passif", "actif"),
    expectedLineCodes: ["210", "209"],
    minAbs: 1000,
    allowNegative: false
  },

  // ── Lot 2 : Compte de résultat — lignes manquantes ────────────────────────
  {
    key: "productionStored",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "signedRightmost",
    aliases: alias("production stockee", "variation de production stockee"),
    regexAliases: regex(/\bproduction\s+stockee\b/),
    excludes: alias("vendue", "immobilisee"),
    expectedLineCodes: ["222"]
  },
  {
    key: "productionCapitalized",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("production immobilisee"),
    regexAliases: regex(/\bproduction\s+immobilisee\b/),
    excludes: alias("vendue", "stockee"),
    expectedLineCodes: ["224"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "operatingSubsidies",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("subventions d'exploitation", "subventions exploitation"),
    regexAliases: regex(/\bsubventions?\s+d[' ]?exploitation\b/),
    excludes: alias("investissement"),
    expectedLineCodes: ["226"],
    minAbs: 1000,
    allowNegative: false
  },

  // ── Lot 2 : Bilan passif — détail capitaux propres ────────────────────────
  {
    key: "shareCapital",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("capital social ou individuel", "capital social", "capital"),
    regexAliases: regex(/\bcapital\s+social\b/, /\bcapital\b/),
    excludes: alias("total", "propres", "actif"),
    expectedLineCodes: ["120"],
    minAbs: 1000,
    allowNegative: false
  },
  {
    key: "revaluationDifferences",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("ecarts de reevaluation"),
    regexAliases: regex(/\becarts?\s+de\s+reevaluation\b/),
    excludes: alias("total"),
    expectedLineCodes: ["124"]
  },
  {
    key: "legalReserves",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("reserve legale"),
    regexAliases: regex(/\breserve\s+legale\b/),
    excludes: alias("total", "reglementees"),
    expectedLineCodes: ["126"],
    allowNegative: false
  },
  {
    key: "regulatoryReserves",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("reserves reglementees"),
    regexAliases: regex(/\breserves?\s+reglementees?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["130"],
    allowNegative: false
  },
  {
    key: "otherReserves",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("autres reserves"),
    regexAliases: regex(/\bautres\s+reserves?\b/),
    excludes: alias("total", "reglementees"),
    expectedLineCodes: ["132"]
  },
  {
    key: "retainedEarnings",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("report a nouveau"),
    regexAliases: regex(/\breport\s+a\s+nouveau\b/),
    excludes: alias("total"),
    expectedLineCodes: ["134"]
  },
  {
    key: "investmentSubsidies",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("subventions d'investissement", "subventions investissement"),
    regexAliases: regex(/\bsubventions?\s+d[' ]?investissement\b/),
    excludes: alias("exploitation"),
    expectedLineCodes: ["137"],
    allowNegative: false
  },
  {
    key: "regulatoryProvisions",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("provisions reglementees"),
    regexAliases: regex(/\bprovisions?\s+reglementees?\b/),
    excludes: alias("risques", "total"),
    expectedLineCodes: ["140"],
    allowNegative: false
  },

  // ── Lot 2 : Bilan passif — comptes courants d'associés ────────────────────
  {
    key: "associatesCurrentAccounts",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("comptes courants d'associes", "comptes courants associes"),
    regexAliases: regex(/\bcomptes?\s+courants?\s+d[' ]?associes?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["173"]
  }
];

export const SECTION_HEADING_PATTERNS = {
  incomeStatement: [
    /\bcompte\s+de\s+resultat\b/,
    /\bcompte\s+resultat\b/
  ],
  balanceAssets: [
    /\bbilan\b.*\bactif\b/,
    /\bactif\b/
  ],
  balanceLiabilities: [
    /\bbilan\b.*\bpassif\b/,
    /\bpassif\b/
  ]
} as const;

export const SECTION_KEYWORDS = {
  incomeStatement: ["produits", "charges", "resultat"],
  balanceSheet: ["actif", "passif", "capitaux propres", "dettes"]
} as const;
