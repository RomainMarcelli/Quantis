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
    minAbs: 1000
  },
  {
    key: "productionSold",
    section: "incomeStatement",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("production vendue"),
    regexAliases: regex(/\bproduction\s+vendue\b/),
    excludes: alias("stockee", "immobilisee")
  },
  {
    key: "netTurnover",
    section: "incomeStatement",
    kind: "total",
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
    regexAliases: regex(/\btotal\s+des?\s+charges?\s+d[' ]?exploitation\b/),
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
    aliases: alias("resultat net", "resultat de l'exercice", "benefice ou perte"),
    regexAliases: regex(/\bresultat\s+net\b/, /\bresultat\s+de\s+l'?exercice\b/, /\bbenefice\s+ou\s+perte\b/),
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
    expectedLineCodes: ["072"]
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
    regexAliases: regex(/\btotal\s+general\s+actif\b/, /\btotal\s+actif\b/),
    excludes: alias("passif"),
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
    key: "taxSocialPayables",
    section: "balanceSheet",
    kind: "detail",
    columnStrategy: "nCurrent",
    aliases: alias("dettes fiscales et sociales"),
    regexAliases: regex(/\bdettes?\s+fiscales?\s+et\s+sociales?\b/),
    excludes: alias("total"),
    expectedLineCodes: ["172"]
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
    regexAliases: regex(/\btotal\s+passif\b/, /\btotal\s+general\s+passif\b/),
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
