// File: lib/kpi/kpiRegistry.ts
// Role: source de vérité unique pour les KPIs Vyzor.
//
// Chaque KPI est décrit par une `KpiDefinition` qui contient :
//   - sa formule (humaine et code)
//   - son tooltip (explication, signaux, benchmark)
//   - les questions IA suggérées
//   - les seuils d'alerte
//   - les leviers de simulation
//   - les dépendances (variables 2033-SD ou autres KPIs amont)
//   - sa couche source (comptable, bancaire, ou les deux)
//   - sa phase de roadmap (CT / MT / LT)
//
// Tous les composants UI (KpiCard, AiChatPanel, SimulationWidget) lisent ce
// registre par `kpiId`. Pas de littéraux dispersés dans les composants.

import type { CalculatedKpis } from "@/types/analysis";

export type KpiCategory =
  | "creation_valeur"   // ce que l'activité produit (CA, VA, EBITDA, marges)
  | "investissement"    // efficacité du cycle d'exploitation (BFR, DSO, DPO, immo)
  | "financement"       // structure financière (CAF, gearing, solvabilité)
  | "rentabilite"       // retours sur capitaux (ROE, ROCE, effet de levier)
  | "tresorerie"        // liquidité court terme (dispo, runway, burn rate)
  | "score";            // indicateurs synthétiques (health score)

export type KpiUnit = "currency" | "percent" | "days" | "ratio" | "score";

export type KpiSourceLayer = "accounting" | "banking" | "both";

/**
 * Phase roadmap :
 *   - CT (court terme) : déjà en production, calculé par computeKpis aujourd'hui
 *   - MT (moyen terme) : nécessite l'intégration Bridge ou un calcul croisé
 *   - LT (long terme)  : nécessite plusieurs exercices ou des données externes
 */
export type KpiPhase = "CT" | "MT" | "LT";

export type KpiTooltip = {
  /** 3-4 lignes vulgarisées pour un dirigeant non-financier. */
  explanation: string;
  /** Ce qu'un bon résultat veut dire concrètement pour son business. */
  goodSign: string;
  /** Ce qu'un mauvais résultat veut dire et le risque associé. */
  badSign: string;
  /** Référence sectorielle si on a une donnée fiable. Optionnel. */
  benchmark?: string;
};

export type KpiSuggestedQuestions = {
  whenGood: string;
  whenBad: string;
};

export type KpiThresholds = {
  /** En dessous : zone rouge (alerte). */
  danger?: number;
  /** Entre danger et good : zone orange (vigilance). */
  warning?: number;
  /** Au-dessus : zone verte (sain). */
  good?: number;
};

export type KpiSimulation = {
  /** Variables sur lesquelles l'utilisateur peut agir pour bouger ce KPI. */
  levers: string[];
  /** Description courte de l'impact attendu d'une variation d'un levier. */
  impactFormula: string;
};

export type KpiDefinition = {
  id: keyof CalculatedKpis | string;
  label: string;
  shortLabel: string;
  category: KpiCategory;
  /** Formule humaine, prête à afficher dans un tooltip "Comment c'est calculé ?". */
  formula: string;
  /** Formule en pseudo-code, lisible mais sans dépendre de la syntaxe TS. */
  formulaCode: string;
  unit: KpiUnit;
  tooltip: KpiTooltip;
  suggestedQuestions: KpiSuggestedQuestions;
  thresholds?: KpiThresholds;
  simulation?: KpiSimulation;
  /**
   * Liste des codes (variables 2033-SD ou ids de KPI) dont la valeur dépend.
   * Sert au moteur de simulation pour propager un delta.
   */
  dependencies: string[];
  sourceLayer: KpiSourceLayer;
  phase: KpiPhase;
};

// ─────────────────────────────────────────────────────────────────────────
// Registre
// ─────────────────────────────────────────────────────────────────────────
//
// Note : on couvre TOUS les champs de `CalculatedKpis` (les 35 d'aujourd'hui)
// + une réservation pour les KPIs bancaires Bridge en phase MT (real_time_*).
// Les benchmarks sont issus de l'INSEE ESANE 2022 (PME 10-249 salariés)
// quand cités. À défaut on n'invente pas — `benchmark` reste `undefined`.

export const KPI_REGISTRY: Record<string, KpiDefinition> = {
  // ─── Création de valeur ─────────────────────────────────────────────────
  ca: {
    id: "ca",
    label: "Chiffre d'affaires",
    shortLabel: "CA",
    category: "creation_valeur",
    formula: "Ventes de marchandises + Production vendue",
    formulaCode: "ventes_march + prod_vendue",
    unit: "currency",
    tooltip: {
      explanation:
        "Le chiffre d'affaires correspond à tout ce que l'entreprise a facturé à ses clients sur la période, hors taxes. C'est le point de départ de l'analyse financière.",
      goodSign: "Un CA en croissance constante traduit une demande soutenue et un positionnement marché efficace.",
      badSign: "Un CA en baisse peut signaler une perte de clients, un positionnement à revoir ou un marché en contraction.",
    },
    suggestedQuestions: {
      whenGood: "Comment maintenir cette dynamique de croissance ?",
      whenBad: "Quels leviers pour relancer mon chiffre d'affaires ?",
    },
    simulation: {
      levers: ["ventes_march", "prod_vendue"],
      impactFormula: "Variation directe du CA en € — propage vers VA, EBITDA, marge, BFR, DSO.",
    },
    dependencies: ["ventes_march", "prod_vendue"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  tcam: {
    id: "tcam",
    label: "Taux de croissance annuel moyen",
    shortLabel: "TCAM",
    category: "creation_valeur",
    formula: "((CA_n / CA_départ)^(1/n) - 1) × 100",
    formulaCode: "((ca / ca_n_minus_1) ^ (1/n) - 1) * 100",
    unit: "percent",
    tooltip: {
      explanation:
        "Le TCAM lisse la croissance sur plusieurs exercices pour donner un rythme moyen, indépendamment des à-coups d'une année.",
      goodSign: "Un TCAM > 10% sur 3 ans est un signal de scale réussi.",
      badSign: "Un TCAM négatif sur plusieurs exercices indique une décroissance structurelle.",
      benchmark: "PME françaises tous secteurs : ~3% en moyenne (INSEE ESANE 2022).",
    },
    suggestedQuestions: {
      whenGood: "Mon TCAM est au-dessus du marché — comment maintenir ce rythme ?",
      whenBad: "Pourquoi mon TCAM décroche ? Comparaison vs concurrents directs.",
    },
    thresholds: { danger: 0, warning: 3, good: 10 },
    dependencies: ["ca", "ca_n_minus_1", "n"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  va: {
    id: "va",
    label: "Valeur ajoutée",
    shortLabel: "VA",
    category: "creation_valeur",
    formula: "Total production - Achats marchandises - Achats matières - Autres charges externes",
    formulaCode: "total_prod_expl - achats_march - achats_mp - ace",
    unit: "currency",
    tooltip: {
      explanation:
        "La valeur ajoutée mesure la richesse réellement créée par l'entreprise — ce qui reste après avoir payé les fournisseurs externes mais avant les salaires.",
      goodSign: "Une VA en hausse signifie que l'entreprise crée plus de valeur intrinsèque.",
      badSign: "Une VA qui stagne pendant que le CA augmente = la marge brute s'érode (achats qui pèsent plus).",
    },
    suggestedQuestions: {
      whenGood: "Comment ma VA se compare au secteur ?",
      whenBad: "Mes achats grignotent ma VA — où optimiser ?",
    },
    simulation: {
      levers: ["ventes_march", "prod_vendue", "achats_march", "achats_mp", "ace"],
      impactFormula: "VA = production - charges externes ; un -10% sur les achats remonte VA d'autant en €.",
    },
    dependencies: ["total_prod_expl", "achats_march", "achats_mp", "ace"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  ebitda: {
    id: "ebitda",
    label: "Excédent brut d'exploitation",
    shortLabel: "EBE",
    category: "creation_valeur",
    formula: "VA - Impôts et taxes - Salaires - Charges sociales",
    formulaCode: "va - impots_taxes - salaires - charges_soc",
    unit: "currency",
    tooltip: {
      explanation:
        "L'EBITDA (= EBE en France) mesure la rentabilité opérationnelle pure : ce que l'activité génère avant amortissements, intérêts et impôts sur les bénéfices.",
      goodSign: "Un EBITDA positif et croissant signifie que l'activité elle-même génère du cash.",
      badSign: "Un EBITDA négatif veut dire que l'activité courante consomme plus qu'elle ne produit — la viabilité est en jeu.",
      benchmark: "PME industrielles : 8-12% du CA. Services : 12-18%. Tech : 20%+.",
    },
    suggestedQuestions: {
      whenGood: "Mon EBITDA est bon — comment l'amplifier sans gonfler les charges ?",
      whenBad: "Mon EBITDA est négatif — par où commencer pour le redresser ?",
    },
    thresholds: { danger: 0 },
    simulation: {
      levers: ["salaires", "charges_soc", "ace", "ventes_march", "prod_vendue"],
      impactFormula: "Une embauche (+30k de salaires + 13k de charges) baisse l'EBITDA de 43k.",
    },
    dependencies: ["va", "impots_taxes", "salaires", "charges_soc"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  ebe: {
    id: "ebe",
    label: "Excédent brut d'exploitation",
    shortLabel: "EBE",
    category: "creation_valeur",
    formula: "Identique à l'EBITDA (convention française)",
    formulaCode: "ebitda",
    unit: "currency",
    tooltip: {
      explanation:
        "L'EBE est la version française de l'EBITDA. Même calcul, même usage : mesurer la rentabilité dégagée par l'activité.",
      goodSign: "Voir EBITDA.",
      badSign: "Voir EBITDA.",
    },
    suggestedQuestions: {
      whenGood: "Voir EBITDA.",
      whenBad: "Voir EBITDA.",
    },
    dependencies: ["ebitda"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  marge_ebitda: {
    id: "marge_ebitda",
    label: "Marge d'excédent brut d'exploitation",
    shortLabel: "Marge EBE",
    category: "creation_valeur",
    formula: "EBITDA / CA × 100",
    formulaCode: "(ebitda / ca) * 100",
    unit: "percent",
    tooltip: {
      explanation:
        "La marge EBITDA exprime la rentabilité opérationnelle en pourcentage du chiffre d'affaires — un indicateur direct de l'efficacité de l'activité.",
      goodSign: "Une marge > 10% est un signal de bonne santé opérationnelle.",
      badSign: "Une marge négative indique une activité non viable à structure constante.",
      benchmark: "PME France : 8% médiane (INSEE 2022).",
    },
    suggestedQuestions: {
      whenGood: "Comment ma marge EBITDA se compare au secteur ?",
      whenBad: "Quels postes de charge plombent ma marge EBITDA ?",
    },
    thresholds: { danger: 0, warning: 5, good: 10 },
    dependencies: ["ebitda", "ca"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  mscv: {
    id: "mscv",
    label: "Marge sur coûts variables",
    shortLabel: "MSCV",
    category: "creation_valeur",
    formula: "CA - Charges variables",
    formulaCode: "ca - charges_var",
    unit: "currency",
    tooltip: {
      explanation:
        "La MSCV mesure ce qui reste de chaque euro de CA après avoir payé les achats et variations de stock variables. C'est la base du calcul du seuil de rentabilité.",
      goodSign: "Une MSCV élevée donne du coussin pour absorber les charges fixes.",
      badSign: "Une MSCV qui s'érode signale une pression sur les marges (achats qui montent, prix qui ne suivent pas).",
    },
    suggestedQuestions: {
      whenGood: "Ma MSCV se tient — comment la sécuriser face à l'inflation ?",
      whenBad: "Mes achats variables augmentent — à quel prix dois-je vendre pour compenser ?",
    },
    dependencies: ["ca", "charges_var"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  tmscv: {
    id: "tmscv",
    label: "Taux de marge sur coûts variables",
    shortLabel: "TMSCV",
    category: "creation_valeur",
    formula: "MSCV / CA",
    formulaCode: "mscv / ca",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le TMSCV est le ratio MSCV/CA. Il représente le pourcentage de chaque euro de CA disponible pour couvrir les charges fixes et dégager un profit.",
      goodSign: "Un TMSCV > 30% laisse de la latitude pour absorber des chocs sur les coûts fixes.",
      badSign: "Un TMSCV faible (< 15%) rend l'entreprise très sensible à la baisse du CA.",
    },
    suggestedQuestions: {
      whenGood: "Quelle est l'élasticité de mon TMSCV face à un choc de CA ?",
      whenBad: "Comment remonter mon TMSCV sans casser le volume ?",
    },
    dependencies: ["mscv", "ca"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  ratio_masse_salariale: {
    id: "ratio_masse_salariale",
    label: "Ratio masse salariale / CA",
    shortLabel: "Masse sal. / CA",
    category: "creation_valeur",
    formula: "(Salaires bruts + Charges sociales) / CA × 100",
    formulaCode: "(salaires + charges_soc) / ca * 100",
    unit: "percent",
    tooltip: {
      explanation:
        "Sur chaque euro gagné, combien part dans les salaires et les charges. Au-dessus de 60 %, vos salaires pèsent lourd sur votre rentabilité.",
      goodSign:
        "Un ratio < 40 % laisse du coussin pour absorber les charges fixes et investir.",
      badSign:
        "Au-delà de 70 %, l'équation devient tendue : peu de marge pour absorber un imprévu.",
      benchmark:
        "PME services FR : 50-60 %. Industrie : 25-35 %. Tech / SaaS : 35-45 % (sources INSEE ESANE 2022, OPIIEC).",
    },
    suggestedQuestions: {
      whenGood: "Quels postes (commerciaux, R&D…) seraient les plus rentables à étoffer ?",
      whenBad: "Comment réduire le ratio sans casser la dynamique commerciale ?",
    },
    thresholds: { good: 40, warning: 55, danger: 70 },
    simulation: {
      levers: ["salaires", "charges_soc"],
      impactFormula: "Ratio = (salaires + charges_soc) / ca — bouge avec chacune des 3 variables.",
    },
    dependencies: ["salaires", "charges_soc", "ca"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  charges_var: {
    id: "charges_var",
    label: "Charges variables",
    shortLabel: "Ch. variables",
    category: "creation_valeur",
    formula: "Achats marchandises + Achats matières + Variations de stocks",
    formulaCode: "achats_march + achats_mp + var_stock_march + var_stock_mp",
    unit: "currency",
    tooltip: {
      explanation:
        "Les charges variables suivent le volume d'activité — plus on produit/vend, plus elles augmentent. Elles s'opposent aux charges fixes (loyers, salaires).",
      goodSign: "Maîtriser ses charges variables permet de protéger sa marge en cas de hausse des coûts d'achat.",
      badSign: "Si elles dérivent plus vite que le CA, c'est que les conditions d'achat se dégradent.",
    },
    suggestedQuestions: {
      whenGood: "Comment sécuriser mes prix d'achat sur les 12 prochains mois ?",
      whenBad: "Mes charges variables s'envolent — où est la fuite ?",
    },
    dependencies: ["achats_march", "achats_mp", "var_stock_march", "var_stock_mp"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  charges_fixes: {
    id: "charges_fixes",
    label: "Charges fixes",
    shortLabel: "Ch. fixes",
    category: "creation_valeur",
    formula: "Autres charges externes + Salaires + Charges sociales + Dotations aux amortissements",
    formulaCode: "ace + salaires + charges_soc + dap",
    unit: "currency",
    tooltip: {
      explanation:
        "Les charges fixes ne dépendent pas du volume d'activité — l'entreprise les paie même si le CA tombe à zéro (loyer, salaires, amortissements).",
      goodSign: "Des charges fixes mesurées donnent de la flexibilité en cas de retournement.",
      badSign: "Des charges fixes lourdes augmentent le seuil de rentabilité — risque de bascule rapide en cas de baisse de CA.",
    },
    suggestedQuestions: {
      whenGood: "Quelle marge de manœuvre pour absorber un choc de CA ?",
      whenBad: "Quels postes fixes sont les plus compressibles à court terme ?",
    },
    simulation: {
      levers: ["salaires", "charges_soc", "ace"],
      impactFormula: "Réduire les charges fixes baisse directement le point mort.",
    },
    dependencies: ["ace", "salaires", "charges_soc", "dap"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  point_mort: {
    id: "point_mort",
    label: "Seuil de rentabilité",
    shortLabel: "Seuil rentab.",
    category: "creation_valeur",
    formula: "Charges fixes / TMSCV",
    formulaCode: "charges_fixes / tmscv",
    unit: "currency",
    tooltip: {
      explanation:
        "Le point mort est le CA minimum à réaliser pour couvrir toutes les charges (fixes + variables). En dessous, l'entreprise perd de l'argent.",
      goodSign: "Un CA largement au-dessus du point mort signale une zone de profit confortable.",
      badSign: "Un CA proche du point mort = la moindre baisse plonge dans le rouge.",
    },
    suggestedQuestions: {
      whenGood: "Quelle est ma marge de sécurité en pourcentage de mon CA ?",
      whenBad: "Comment faire baisser mon point mort ?",
    },
    dependencies: ["charges_fixes", "tmscv"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  resultat_net: {
    id: "resultat_net",
    label: "Résultat net",
    shortLabel: "Rés. net",
    category: "creation_valeur",
    formula: "Résultat de l'exercice (après impôts, charges financières et exceptionnelles)",
    formulaCode: "res_net ?? resultat_exercice",
    unit: "currency",
    tooltip: {
      explanation:
        "Le résultat net est ce qui reste en bas du compte de résultat, une fois tout payé : c'est ce qu'on peut distribuer aux actionnaires ou réinvestir.",
      goodSign: "Un résultat net positif et stable nourrit l'autofinancement et la capacité d'investissement.",
      badSign: "Un résultat net négatif récurrent érode les capitaux propres et compromet la solvabilité.",
    },
    suggestedQuestions: {
      whenGood: "Quelle stratégie de distribution / réinvestissement pour ce résultat ?",
      whenBad: "Quelles actions structurelles pour redevenir rentable ?",
    },
    thresholds: { danger: 0 },
    dependencies: ["res_net", "resultat_exercice"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  netProfit: {
    id: "netProfit",
    label: "Résultat net",
    shortLabel: "Rés. net",
    category: "creation_valeur",
    formula: "Identique à resultat_net",
    formulaCode: "resultat_net",
    unit: "currency",
    tooltip: {
      explanation: "Voir resultat_net. Champ dupliqué pour les composants premium qui utilisent une nomenclature anglo-saxonne.",
      goodSign: "Voir resultat_net.",
      badSign: "Voir resultat_net.",
    },
    suggestedQuestions: {
      whenGood: "Voir resultat_net.",
      whenBad: "Voir resultat_net.",
    },
    dependencies: ["resultat_net"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  grossMarginRate: {
    id: "grossMarginRate",
    label: "Taux de marge brute",
    shortLabel: "Marge brute %",
    category: "creation_valeur",
    formula: "TMSCV × 100 (en %)",
    formulaCode: "tmscv * 100",
    unit: "percent",
    tooltip: {
      explanation: "Pourcentage de chaque euro de vente qui reste après les coûts variables — proche de la marge brute usuelle.",
      goodSign: "Marge brute > 30% : bonne capacité à absorber les coûts fixes.",
      badSign: "Marge brute < 15% : très sensible à toute hausse des coûts d'achat.",
    },
    suggestedQuestions: {
      whenGood: "Quel benchmark sectoriel pour ma marge brute ?",
      whenBad: "Quels leviers pour remonter la marge brute ?",
    },
    thresholds: { danger: 10, warning: 20, good: 30 },
    dependencies: ["tmscv"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  // ─── Investissement (cycle d'exploitation) ─────────────────────────────
  bfr: {
    id: "bfr",
    label: "Besoin en fonds de roulement",
    shortLabel: "BFR",
    category: "investissement",
    formula: "(Stocks + Créances clients) - (Dettes fournisseurs + Dettes fiscales/sociales)",
    formulaCode: "(total_stocks + creances) - (fournisseurs + dettes_fisc_soc)",
    unit: "currency",
    tooltip: {
      explanation:
        "Le BFR mesure le cash immobilisé par le cycle d'exploitation : ce qu'on a payé d'avance (stocks) ou ce qu'on attend d'encaisser (clients), diminué de ce qu'on doit (fournisseurs).",
      goodSign: "Un BFR négatif (clients qui paient avant qu'on règle les fournisseurs) finance le cycle.",
      badSign: "Un BFR élevé et croissant immobilise du cash qui pourrait servir à investir ou à rembourser.",
    },
    suggestedQuestions: {
      whenGood: "Comment maintenir ce cycle de cash favorable ?",
      whenBad: "Quels leviers immédiats pour réduire mon BFR ?",
    },
    simulation: {
      levers: ["clients", "fournisseurs", "total_stocks"],
      impactFormula: "Une baisse de 10j de DSO libère ~3% du CA en cash.",
    },
    dependencies: ["total_stocks", "creances", "fournisseurs", "dettes_fisc_soc"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  workingCapital: {
    id: "workingCapital",
    label: "Besoin en fonds de roulement",
    shortLabel: "BFR",
    category: "investissement",
    formula: "Identique au BFR",
    formulaCode: "bfr",
    unit: "currency",
    tooltip: {
      explanation: "Voir BFR. Alias anglais utilisé par les composants premium.",
      goodSign: "Voir BFR.",
      badSign: "Voir BFR.",
    },
    suggestedQuestions: { whenGood: "Voir BFR.", whenBad: "Voir BFR." },
    dependencies: ["bfr"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  rot_bfr: {
    id: "rot_bfr",
    label: "Rotation du besoin en fonds de roulement",
    shortLabel: "Rot. BFR",
    category: "investissement",
    formula: "(BFR / (Total production × 1.2)) × jours_période",
    formulaCode: "(bfr / (total_prod_expl * 1.2)) * periodDays",
    unit: "days",
    tooltip: {
      explanation:
        "La rotation du BFR exprime ce dernier en nombre de jours de CA. Pratique pour comparer entre tailles d'entreprise et benchmarker.",
      goodSign: "< 30 jours est très sain pour la plupart des secteurs.",
      badSign: "> 90 jours = le cycle d'exploitation pèse lourd, risque de tension de cash.",
    },
    suggestedQuestions: {
      whenGood: "Comment gagner encore quelques jours ?",
      whenBad: "Pourquoi mon cycle d'exploitation est si long ?",
    },
    thresholds: { good: 30, warning: 60, danger: 90 },
    dependencies: ["bfr", "total_prod_expl"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  dso: {
    id: "dso",
    label: "Délai de paiement clients",
    shortLabel: "DSO",
    category: "investissement",
    formula: "(Créances clients × jours_période) / (Total production × 1.2)",
    formulaCode: "(clients * periodDays) / (total_prod_expl * 1.2)",
    unit: "days",
    tooltip: {
      explanation:
        "Le DSO (Days Sales Outstanding) est le nombre moyen de jours entre la facturation et l'encaissement. C'est un indicateur clé de la qualité du recouvrement.",
      goodSign: "DSO < 45j en BtoB indique des clients qui paient bien et un recouvrement actif.",
      badSign: "DSO > 90j = risque de défaillance client + tension de trésorerie immédiate.",
      benchmark: "BtoB France : 60j en moyenne, 30j idéal.",
    },
    suggestedQuestions: {
      whenGood: "Comment maintenir cette qualité de paiement ?",
      whenBad: "Comment relancer mes clients sans casser la relation ?",
    },
    thresholds: { good: 45, warning: 75, danger: 120 },
    simulation: {
      levers: ["clients"],
      impactFormula: "-10j de DSO libère ~3% du CA en trésorerie.",
    },
    dependencies: ["clients", "total_prod_expl"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  dpo: {
    id: "dpo",
    label: "Délai de paiement fournisseurs",
    shortLabel: "DPO",
    category: "investissement",
    formula: "(Dettes fournisseurs × jours_période) / ((Achats marchandises + Autres charges externes) × 1.2)",
    formulaCode: "(fournisseurs * periodDays) / ((achats_march + ace) * 1.2)",
    unit: "days",
    tooltip: {
      explanation:
        "Le DPO (Days Payable Outstanding) est le nombre moyen de jours qu'on prend pour payer ses fournisseurs. Plus long = on garde le cash plus longtemps.",
      goodSign: "Un DPO supérieur au DSO signale qu'on encaisse avant de payer — cycle de cash favorable.",
      badSign: "Un DPO très court (< 15j) immobilise du cash dont on aurait besoin ailleurs.",
    },
    suggestedQuestions: {
      whenGood: "Comment formaliser des conditions de paiement étendues sans tendre la relation ?",
      whenBad: "Quels fournisseurs renégocier pour gagner des jours de cash ?",
    },
    thresholds: { good: 60, warning: 30, danger: 15 },
    dependencies: ["fournisseurs", "achats_march", "ace"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  rot_stocks: {
    id: "rot_stocks",
    label: "Rotation des stocks",
    shortLabel: "DIO",
    category: "investissement",
    formula: "(Stocks × jours_période) / Total production",
    formulaCode: "(total_stocks * periodDays) / total_prod_expl",
    unit: "days",
    tooltip: {
      explanation:
        "Le DIO (Days Inventory Outstanding) est le nombre moyen de jours pendant lesquels un produit reste en stock avant d'être vendu.",
      goodSign: "Un DIO court signale une bonne demande et limite l'immobilisation de cash.",
      badSign: "Un DIO long peut indiquer un sur-stock, un produit qui ne tourne pas, ou une obsolescence à venir.",
    },
    suggestedQuestions: {
      whenGood: "Comment ajuster encore le sourcing pour réduire le stock ?",
      whenBad: "Quels SKU dorment dans mon stock ?",
    },
    thresholds: { good: 30, warning: 60, danger: 120 },
    dependencies: ["total_stocks", "total_prod_expl"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  ratio_immo: {
    id: "ratio_immo",
    label: "Ratio d'usure des immobilisations",
    shortLabel: "Ratio immo.",
    category: "investissement",
    formula: "Total actif immobilisé net / Total actif immobilisé brut",
    formulaCode: "total_actif_immo_net / total_actif_immo_brut",
    unit: "ratio",
    tooltip: {
      explanation:
        "Ce ratio compare la valeur nette des immobilisations à leur valeur d'origine. Il indique l'âge moyen de l'outil de travail.",
      goodSign: "Un ratio proche de 1 signale un parc neuf, peu amorti.",
      badSign: "Un ratio < 0.3 signale un outil très amorti — un cycle d'investissement à anticiper.",
    },
    suggestedQuestions: {
      whenGood: "Comment optimiser le ROI de mes investissements récents ?",
      whenBad: "Quel plan d'investissement pour renouveler mon outil ?",
    },
    thresholds: { danger: 0.3, warning: 0.5, good: 0.7 },
    dependencies: ["total_actif_immo_net", "total_actif_immo_brut"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  etat_materiel_indice: {
    id: "etat_materiel_indice",
    label: "Indice d'état du matériel",
    shortLabel: "État matériel",
    category: "investissement",
    formula: "Ratio d'immobilisations × 100",
    formulaCode: "ratio_immo * 100",
    unit: "percent",
    tooltip: {
      explanation:
        "Indice de fraîcheur de l'outil productif, en pourcentage. 100% = neuf, 0% = entièrement amorti.",
      goodSign: "Indice > 70% : outil moderne, peu d'investissements à prévoir.",
      badSign: "Indice < 30% : risque de pannes et besoin de capex significatif à anticiper.",
    },
    suggestedQuestions: {
      whenGood: "Quels gains de productivité tirer de cet outil neuf ?",
      whenBad: "Comment prioriser le renouvellement ?",
    },
    thresholds: { danger: 30, warning: 50, good: 70 },
    dependencies: ["ratio_immo"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  // ─── Financement (structure financière) ────────────────────────────────
  caf: {
    id: "caf",
    label: "Capacité d'autofinancement",
    shortLabel: "CAF",
    category: "financement",
    formula: "Résultat net + Dotations aux amortissements",
    formulaCode: "res_net + dap",
    unit: "currency",
    tooltip: {
      explanation:
        "La CAF est le cash potentiel que l'entreprise dégage par son activité — résultat net retraité des charges non décaissables (amortissements).",
      goodSign: "Une CAF positive et croissante = capacité à rembourser les emprunts et investir sans dette nouvelle.",
      badSign: "Une CAF négative oblige à recourir à l'emprunt ou à puiser dans les capitaux propres pour fonctionner.",
    },
    suggestedQuestions: {
      whenGood: "Comment allouer cette capacité d'autofinancement ?",
      whenBad: "Quelles actions immédiates pour redresser ma CAF ?",
    },
    thresholds: { danger: 0 },
    dependencies: ["res_net", "dap"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  fte: {
    id: "fte",
    label: "Flux de trésorerie d'exploitation",
    shortLabel: "FTE",
    category: "financement",
    formula: "CAF - Variation du BFR",
    formulaCode: "caf - delta_bfr",
    unit: "currency",
    tooltip: {
      explanation:
        "Le FTE est le cash réellement disponible après avoir financé l'évolution du cycle d'exploitation. C'est le cash qu'on peut effectivement utiliser.",
      goodSign: "FTE > 0 = l'activité s'autofinance, on peut rembourser ou investir.",
      badSign: "FTE négatif sur plusieurs périodes = risque structurel de tension de cash.",
    },
    suggestedQuestions: {
      whenGood: "Comment maximiser ce cash flow disponible ?",
      whenBad: "Mon FTE négatif vient-il de la rentabilité ou du BFR ?",
    },
    thresholds: { danger: 0 },
    dependencies: ["caf", "bfr"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  solvabilite: {
    id: "solvabilite",
    label: "Ratio de solvabilité",
    shortLabel: "Solvabilité",
    category: "financement",
    formula: "Capitaux propres / Total passif",
    formulaCode: "total_cp / total_passif",
    unit: "ratio",
    tooltip: {
      explanation:
        "La solvabilité mesure la part du bilan financée par les actionnaires (vs la dette). Elle dit si l'entreprise est capable d'absorber des pertes sans faire défaut.",
      goodSign: "> 0.30 (30%) = structure financière équilibrée, banques rassurées.",
      badSign: "< 0.15 (15%) = sur-endettement, accès au crédit compromis.",
      benchmark: "PME France : 35% médiane (Banque de France 2022).",
    },
    suggestedQuestions: {
      whenGood: "Mon profil de solvabilité me permet-il un emprunt supplémentaire ?",
      whenBad: "Comment renforcer mes capitaux propres ?",
    },
    thresholds: { danger: 0.15, warning: 0.25, good: 0.35 },
    dependencies: ["total_cp", "total_passif"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  gearing: {
    id: "gearing",
    label: "Ratio d'endettement net",
    shortLabel: "Gearing",
    category: "financement",
    formula: "(Emprunts - Disponibilités) / EBITDA",
    formulaCode: "(emprunts - dispo) / ebitda",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le gearing exprime la dette nette en multiple d'EBITDA — combien d'années d'EBITDA il faudrait pour rembourser la dette restante.",
      goodSign: "< 2x est confortable.",
      badSign: "> 4x = endettement très lourd, risque de défaut en cas de baisse de l'activité.",
    },
    suggestedQuestions: {
      whenGood: "Quelle marge supplémentaire pour de la dette ?",
      whenBad: "Quel plan de désendettement réaliste ?",
    },
    thresholds: { good: 2, warning: 3, danger: 4 },
    dependencies: ["emprunts", "dispo", "ebitda"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  capacite_remboursement_annees: {
    id: "capacite_remboursement_annees",
    label: "Capacité de remboursement",
    shortLabel: "Cap. remb.",
    category: "financement",
    formula: "Emprunts / CAF",
    formulaCode: "emprunts / caf",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le nombre théorique d'années nécessaires pour rembourser tous les emprunts avec la CAF actuelle. C'est le ratio standard utilisé par les banques.",
      goodSign: "< 3 ans : profil très emprunteur acceptable pour les banques.",
      badSign: "> 6 ans : difficulté à obtenir un nouvel emprunt.",
    },
    suggestedQuestions: {
      whenGood: "Quel volume d'emprunt supplémentaire est compatible ?",
      whenBad: "Faut-il prioriser le désendettement avant tout investissement ?",
    },
    thresholds: { good: 3, warning: 5, danger: 6 },
    dependencies: ["emprunts", "caf"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  // ─── Rentabilité ────────────────────────────────────────────────────────
  roe: {
    id: "roe",
    label: "Rentabilité des capitaux propres",
    shortLabel: "ROE",
    category: "rentabilite",
    formula: "Résultat net / Capitaux propres",
    formulaCode: "res_net / total_cp",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le ROE mesure le rendement pour l'actionnaire — combien rapporte chaque euro investi en capitaux propres.",
      goodSign: "> 10% est attractif pour un actionnaire.",
      badSign: "Négatif ou < 5% = l'argent est mieux placé ailleurs.",
    },
    suggestedQuestions: {
      whenGood: "Comment ma rentabilité actionnariale se compare au CAC 40 ?",
      whenBad: "Comment améliorer le rendement pour les actionnaires ?",
    },
    thresholds: { danger: 0, warning: 5, good: 10 },
    dependencies: ["res_net", "total_cp"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  roce: {
    id: "roce",
    label: "Rentabilité des capitaux employés",
    shortLabel: "ROCE",
    category: "rentabilite",
    formula: "(EBIT × 0.75) / (Actif immobilisé + BFR)",
    formulaCode: "(ebit * 0.75) / (total_actif_immo + bfr)",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le ROCE est le ROE de l'opérationnel — il mesure la rentabilité économique pure, indépendamment de la façon dont l'entreprise est financée.",
      goodSign: "> 8% est un bon signal opérationnel.",
      badSign: "ROCE inférieur au coût de la dette = chaque emprunt détruit de la valeur.",
    },
    suggestedQuestions: {
      whenGood: "Mon ROCE soutient-il une croissance externe ?",
      whenBad: "Quels actifs sous-rentables désinvestir ?",
    },
    thresholds: { danger: 5, warning: 8, good: 12 },
    dependencies: ["ebit", "total_actif_immo", "bfr"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  effet_levier: {
    id: "effet_levier",
    label: "Effet de levier financier",
    shortLabel: "Effet levier",
    category: "rentabilite",
    formula: "ROE - ROCE",
    formulaCode: "roe - roce",
    unit: "ratio",
    tooltip: {
      explanation:
        "L'écart entre ROE et ROCE mesure la contribution de la dette à la rentabilité actionnariale. Positif = la dette amplifie les retours.",
      goodSign: "Effet levier positif = la dette fait travailler l'argent des actionnaires.",
      badSign: "Effet levier négatif = la dette pèse plus qu'elle ne rapporte — endettement contre-productif.",
    },
    suggestedQuestions: {
      whenGood: "Faut-il pousser plus loin l'effet de levier ?",
      whenBad: "Faut-il alléger la dette pour rétablir l'effet de levier ?",
    },
    dependencies: ["roe", "roce"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  // ─── Trésorerie / liquidité court terme ─────────────────────────────────
  disponibilites: {
    id: "disponibilites",
    label: "Disponibilités",
    shortLabel: "Dispo.",
    category: "tresorerie",
    formula: "Solde des comptes 512 (banque) + 53 (caisse)",
    formulaCode: "dispo",
    unit: "currency",
    tooltip: {
      explanation:
        "Le cash immédiatement disponible sur les comptes bancaires et en caisse. C'est l'indicateur de survie à très court terme.",
      goodSign: "Une trésorerie d'au moins 3 mois de charges fixes donne du temps pour réagir.",
      badSign: "Une trésorerie inférieure à 1 mois de charges fixes = situation d'urgence.",
    },
    suggestedQuestions: {
      whenGood: "Comment placer cet excédent sans bloquer la liquidité ?",
      whenBad: "Quelles actions immédiates pour reconstituer la trésorerie ?",
    },
    dependencies: ["dispo"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  tn: {
    id: "tn",
    label: "Trésorerie nette",
    shortLabel: "TN",
    category: "tresorerie",
    formula: "Disponibilités - Emprunts",
    formulaCode: "dispo - emprunts",
    unit: "currency",
    tooltip: {
      explanation:
        "La trésorerie nette retire la dette des disponibilités — c'est le cash réellement disponible si on devait tout rembourser demain.",
      goodSign: "TN positive = pas de dépendance court-terme à la dette.",
      badSign: "TN très négative = dette structurelle pour faire fonctionner l'entreprise.",
    },
    suggestedQuestions: {
      whenGood: "Comment ce coussin couvre mes obligations financières ?",
      whenBad: "Quel plan pour réduire ma dette nette ?",
    },
    dependencies: ["dispo", "emprunts"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  monthlyBurnRate: {
    id: "monthlyBurnRate",
    label: "Consommation mensuelle de trésorerie",
    shortLabel: "Burn rate",
    category: "tresorerie",
    formula: "|Résultat net mensuel| si négatif, sinon 0",
    formulaCode: "netProfit < 0 ? abs(netProfit) / 12 : 0",
    unit: "currency",
    tooltip: {
      explanation:
        "Combien de cash l'entreprise consomme chaque mois quand elle est en perte. Indicateur classique des startups en phase de croissance.",
      goodSign: "Burn = 0 signifie que l'entreprise est rentable.",
      badSign: "Un burn > 50k€/mois sans visibilité de runway = besoin urgent de financement.",
    },
    suggestedQuestions: {
      whenGood: "Comment réinvestir au lieu de consommer ?",
      whenBad: "Quels postes peux-je réduire pour faire baisser le burn ?",
    },
    dependencies: ["netProfit"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  cashRunwayMonths: {
    id: "cashRunwayMonths",
    label: "Autonomie de trésorerie",
    shortLabel: "Runway",
    category: "tresorerie",
    formula: "Disponibilités / Burn rate mensuel",
    formulaCode: "dispo / monthlyBurnRate",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le nombre de mois pendant lesquels l'entreprise peut continuer à fonctionner sans rentrée d'argent supplémentaire.",
      goodSign: "Runway > 12 mois = visibilité confortable pour exécuter le plan.",
      badSign: "Runway < 6 mois = il faut lever ou redresser la rentabilité maintenant.",
    },
    suggestedQuestions: {
      whenGood: "Comment allouer ce runway entre croissance et sécurité ?",
      whenBad: "Faut-il lever, vendre, ou réduire les coûts en priorité ?",
    },
    thresholds: { danger: 6, warning: 12, good: 18 },
    dependencies: ["dispo", "monthlyBurnRate"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  liq_gen: {
    id: "liq_gen",
    label: "Ratio de liquidité générale",
    shortLabel: "Liq. générale",
    category: "tresorerie",
    formula: "Actif circulant / Dettes court terme",
    formulaCode: "total_actif_circ / (fournisseurs + dettes_fisc_soc)",
    unit: "ratio",
    tooltip: {
      explanation:
        "Mesure si l'actif circulant (stocks + créances + cash) couvre les dettes court terme. Indicateur de solvabilité court terme.",
      goodSign: "> 1.5 = couverture confortable.",
      badSign: "< 1 = risque de cessation de paiement à 12 mois.",
    },
    suggestedQuestions: {
      whenGood: "Cette liquidité est-elle bien placée ?",
      whenBad: "Comment renforcer ma position de liquidité court terme ?",
    },
    thresholds: { danger: 1, warning: 1.2, good: 1.5 },
    dependencies: ["total_actif_circ", "fournisseurs", "dettes_fisc_soc"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  liq_red: {
    id: "liq_red",
    label: "Ratio de liquidité réduite",
    shortLabel: "Liq. réduite",
    category: "tresorerie",
    formula: "(Créances + Disponibilités) / Dettes court terme",
    formulaCode: "(creances + dispo) / (fournisseurs + dettes_fisc_soc)",
    unit: "ratio",
    tooltip: {
      explanation:
        "Variante du ratio de liquidité qui exclut les stocks (peu liquides). Plus conservateur.",
      goodSign: "> 1 = on peut couvrir les dettes court terme sans toucher au stock.",
      badSign: "< 0.7 = dépendance critique à l'écoulement du stock.",
    },
    suggestedQuestions: {
      whenGood: "Bonne couverture — comment la maintenir ?",
      whenBad: "Faut-il augmenter le stock ou prioriser le cash ?",
    },
    thresholds: { danger: 0.7, warning: 1, good: 1.2 },
    dependencies: ["creances", "dispo", "fournisseurs", "dettes_fisc_soc"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  liq_imm: {
    id: "liq_imm",
    label: "Ratio de liquidité immédiate",
    shortLabel: "Liq. immédiate",
    category: "tresorerie",
    formula: "Disponibilités / Dettes court terme",
    formulaCode: "dispo / (fournisseurs + dettes_fisc_soc)",
    unit: "ratio",
    tooltip: {
      explanation:
        "Le ratio le plus conservateur : ne compte que le cash et les équivalents immédiats face aux dettes court terme.",
      goodSign: "> 0.3 = bonne autonomie de paiement immédiat.",
      badSign: "< 0.1 = la moindre dette à régler met l'entreprise en difficulté.",
    },
    suggestedQuestions: {
      whenGood: "Comment optimiser cet excédent de cash ?",
      whenBad: "Quels sont les leviers pour libérer du cash sous 30 jours ?",
    },
    thresholds: { danger: 0.1, warning: 0.2, good: 0.3 },
    dependencies: ["dispo", "fournisseurs", "dettes_fisc_soc"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  // ─── Obligations fiscales ───────────────────────────────────────────────
  // KPIs dérivés des soldes comptables qui projettent les sorties de cash
  // fiscales à venir (TVA à reverser, IS à provisionner). Affichés dans le
  // cockpit Synthèse pour aider le dirigeant à anticiper sa trésorerie.

  tva_a_payer: {
    id: "tva_a_payer",
    label: "TVA à reverser",
    shortLabel: "TVA à sortir",
    category: "tresorerie",
    formula: "TVA collectée (4457) − TVA déductible (4456)",
    formulaCode: "tva_collectee - tva_deductible",
    unit: "currency",
    tooltip: {
      explanation:
        "C'est le montant de TVA que vous devrez reverser à l'État. Vous la collectez sur vos ventes et vous la déduisez sur vos achats — la différence c'est ce que vous devez.",
      goodSign:
        "Si vous mettez de côté la part mensuelle dès la facturation, l'échéance se fait sans douleur.",
      badSign:
        "Si la trésorerie ne couvre pas la TVA à reverser, c'est le premier signal d'alerte BFR à traiter.",
      benchmark:
        "Régime réel normal : déclaration CA3 mensuelle. Régime simplifié : acomptes semestriels + CA12 annuelle.",
    },
    suggestedQuestions: {
      whenGood: "Comment optimiser le rythme TVA pour soulager mon BFR ?",
      whenBad: "Quels leviers pour réduire l'écart entre TVA collectée et déductible ?",
    },
    dependencies: ["tva_collectee", "tva_deductible"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  provision_is: {
    id: "provision_is",
    label: "Provision impôt sur les sociétés",
    shortLabel: "Provision IS",
    category: "tresorerie",
    formula: "15 % jusqu'à 42 500 € puis 25 % au-delà du résultat de l'exercice",
    formulaCode: "min(resultat, 42500)*0.15 + max(0, resultat-42500)*0.25",
    unit: "currency",
    tooltip: {
      explanation:
        "C'est l'impôt sur les bénéfices que vous devrez payer si votre entreprise gagne de l'argent. Mettez-le de côté chaque mois pour ne pas être surpris au moment du paiement.",
      goodSign:
        "Provision IS bien identifiée et mise de côté = pas de mauvaise surprise au solde annuel.",
      badSign:
        "Sans provision IS, l'échéance peut consommer une grande part de la trésorerie d'un coup.",
      benchmark:
        "Barème 2024 — taux réduit PME 15 % jusqu'à 42 500 €, taux normal 25 % au-delà (article 219 CGI). Hors crédits d'impôt et intégration fiscale.",
    },
    suggestedQuestions: {
      whenGood: "Quels mécanismes (CIR, JEI, intégration) pourraient réduire mon IS ?",
      whenBad: "Quelles charges déductibles pourrais-je activer pour minorer la base imposable ?",
    },
    dependencies: ["resultat_exercice"],
    sourceLayer: "accounting",
    phase: "CT",
  },

  // ─── Trésorerie bancaire (Bridge Open Banking) ──────────────────────────
  // KPIs dérivés du moteur `lib/treasury/treasuryEngine.ts`. Calculés à partir
  // des données bancaires temps réel (BankingSummary), pas des écritures
  // comptables — donc INDÉPENDANTS de mappedData/computeKpis. Ne s'affichent
  // que quand l'utilisateur a une connexion Bridge active.

  bank_runway: {
    id: "bank_runway",
    label: "Runway bancaire",
    shortLabel: "Runway",
    category: "tresorerie",
    formula: "Solde total / burn rate net mensuel",
    formulaCode: "totalBalance / burnRateNet",
    unit: "ratio",
    tooltip: {
      explanation:
        "Combien de mois votre trésorerie peut tenir au rythme actuel de consommation, si rien ne change. Calculé à partir des comptes bancaires connectés via Bridge — c'est du temps réel, pas un instantané comptable.",
      goodSign: "Au-delà de 12 mois, vous avez le temps de prendre des décisions sans urgence.",
      badSign: "Sous 6 mois, c'est tendu — il faut accélérer les encaissements ou réduire les dépenses.",
      benchmark: "PME équilibrée : 6-12 mois. Hyper-croissance financée : 18-24 mois minimum après une levée.",
    },
    suggestedQuestions: {
      whenGood: "Comment investir mon excédent de trésorerie sans le bloquer ?",
      whenBad: "Quels leviers immédiats pour rallonger mon runway ?",
    },
    thresholds: { danger: 3, warning: 6, good: 12 },
    dependencies: ["bridge_accounts", "bridge_transactions"],
    sourceLayer: "banking",
    phase: "MT",
  },

  bank_burn_net: {
    id: "bank_burn_net",
    label: "Burn rate net",
    shortLabel: "Burn net",
    category: "tresorerie",
    formula: "Sorties moyennes mensuelles − entrées moyennes mensuelles",
    formulaCode: "avg(monthlyOutflows) - avg(monthlyInflows)",
    unit: "currency",
    tooltip: {
      explanation:
        "Combien vous consommez (positif) ou générez (négatif) de cash net chaque mois en moyenne, vu depuis vos comptes bancaires. Sert de base au calcul du runway.",
      goodSign: "Un burn net négatif = vous générez du cash chaque mois — situation idéale.",
      badSign: "Un burn net positif élevé indique une consommation rapide qui doit être justifiée par une croissance.",
    },
    suggestedQuestions: {
      whenGood: "Comment réinvestir ce cash net sans gonfler les charges fixes ?",
      whenBad: "Sur quels postes mensuels puis-je gagner immédiatement ?",
    },
    thresholds: { danger: 10000, warning: 3000 },
    dependencies: ["bridge_transactions"],
    sourceLayer: "banking",
    phase: "MT",
  },

  bank_cashflow_ratio: {
    id: "bank_cashflow_ratio",
    label: "Ratio encaissements / décaissements",
    shortLabel: "Cashflow ratio",
    category: "tresorerie",
    formula: "Encaissements moyens mensuels / décaissements moyens mensuels",
    formulaCode: "avg(monthlyInflows) / avg(monthlyOutflows)",
    unit: "ratio",
    tooltip: {
      explanation:
        "Pour 1 € qui sort de vos comptes, combien rentre. Au-dessus de 1, l'activité génère du cash ; en-dessous, elle en consomme.",
      goodSign: "Un ratio > 1.2 montre une activité qui s'auto-finance largement.",
      badSign: "Un ratio < 1 signifie que chaque mois la trésorerie diminue — pas viable à long terme.",
      benchmark: "PME saine : > 1.05. Phase d'investissement : 0.95-1 toléré 12-18 mois.",
    },
    suggestedQuestions: {
      whenGood: "Comment maintenir ce ratio en cas de hausse des charges ?",
      whenBad: "Quels leviers d'amélioration pour repasser au-dessus de 1 ?",
    },
    thresholds: { danger: 0.95, warning: 1.05, good: 1.2 },
    dependencies: ["bridge_transactions"],
    sourceLayer: "banking",
    phase: "MT",
  },

  bank_income_regularity: {
    id: "bank_income_regularity",
    label: "Indice de régularité des revenus",
    shortLabel: "Régularité",
    category: "tresorerie",
    formula: "1 − (écart-type des inflows / moyenne des inflows)",
    formulaCode: "1 - stddev(inflows) / mean(inflows)",
    unit: "ratio",
    tooltip: {
      explanation:
        "Vos encaissements sont-ils prévisibles (proche de 1) ou volatils (proche de 0). Un indice élevé permet de projeter facilement la trésorerie ; un indice bas demande des coussins de sécurité plus importants.",
      goodSign: "Au-delà de 0.8 : revenus quasi-mensualisés (abonnements, contrats récurrents).",
      badSign: "Sous 0.4 : revenus erratiques — risque de ruptures de cash sur les mois faibles.",
    },
    suggestedQuestions: {
      whenGood: "Comment capitaliser sur cette prédictibilité pour négocier de meilleures conditions banque ?",
      whenBad: "Quels leviers pour lisser les encaissements (acomptes, abonnements, contrats cadres) ?",
    },
    thresholds: { danger: 0.4, warning: 0.6, good: 0.8 },
    dependencies: ["bridge_transactions"],
    sourceLayer: "banking",
    phase: "MT",
  },

  bank_fixed_charges_ratio: {
    id: "bank_fixed_charges_ratio",
    label: "Ratio charges fixes",
    shortLabel: "Charges fixes",
    category: "tresorerie",
    formula: "Charges fixes mensuelles / total des charges mensuelles",
    formulaCode: "fixedCharges / totalMonthlyExpenses",
    unit: "ratio",
    tooltip: {
      explanation:
        "Part de vos dépenses incompressibles (loyer, salaires, abonnements, prélèvements récurrents) dans le total de vos sorties. Plus c'est élevé, moins vous pouvez ajuster en cas de baisse d'activité.",
      goodSign: "Autour de 50 %, vous gardez de la flexibilité tout en couvrant vos engagements stables.",
      badSign: "> 80 % de charges fixes = peu de marge de manœuvre en cas de coup dur.",
    },
    suggestedQuestions: {
      whenGood: "Comment optimiser les 50 % de charges variables (achats opportunistes, sous-traitance ponctuelle) ?",
      whenBad: "Quelles charges fixes peuvent être renégociées ou converties en variables ?",
    },
    thresholds: { good: 0.4, warning: 0.65, danger: 0.85 },
    dependencies: ["bridge_transactions"],
    sourceLayer: "banking",
    phase: "MT",
  },

  bank_treasury_health: {
    id: "bank_treasury_health",
    label: "Score santé trésorerie",
    shortLabel: "Treasury Score",
    category: "score",
    formula: "Composite : runway 40 % + cashFlowRatio 20 % + régularité 15 % + ratio charges fixes 15 % + anomalies 10 %",
    formulaCode: "weighted(runway, cashFlowRatio, regularity, fixedChargesRatio, anomalies)",
    unit: "score",
    tooltip: {
      explanation:
        "Score composite sur 100 calculé à partir de toutes les dimensions trésorerie : durée de visibilité, équilibre entrées/sorties, régularité des revenus, structure des charges, et anomalies détectées.",
      goodSign: "> 75 : trésorerie sereine, capacité à absorber un choc.",
      badSign: "< 40 : situation tendue à plusieurs niveaux — agir maintenant.",
    },
    suggestedQuestions: {
      whenGood: "Sur quelle dimension puis-je encore gagner pour maximiser ma résilience ?",
      whenBad: "Quel est le pilier le plus dégradé et comment le redresser en priorité ?",
    },
    thresholds: { danger: 40, warning: 60, good: 75 },
    dependencies: [
      "bank_runway",
      "bank_cashflow_ratio",
      "bank_income_regularity",
      "bank_fixed_charges_ratio",
    ],
    sourceLayer: "banking",
    phase: "MT",
  },

  // ─── Score synthétique ──────────────────────────────────────────────────
  healthScore: {
    id: "healthScore",
    label: "Indice de santé Vyzor",
    shortLabel: "Score Vyzor",
    category: "score",
    formula: "Score pondéré (35% marge brute, 30% résultat positif, 20% BFR positif, 15% runway)",
    formulaCode: "weighted(grossMarginRate, netProfit, workingCapital, cashRunwayMonths)",
    unit: "score",
    tooltip: {
      explanation:
        "Indice composite sur 100 qui agrège quatre signaux clés : marge brute, rentabilité, BFR et runway. Donne une vue d'ensemble en un coup d'œil.",
      goodSign: "> 80 = entreprise saine sur toutes les dimensions.",
      badSign: "< 40 = au moins deux signaux dégradés simultanément, attention requise.",
    },
    suggestedQuestions: {
      whenGood: "Quelle dimension est la plus solide et laquelle est juste passable ?",
      whenBad: "Sur quel pilier dois-je agir en priorité pour faire remonter le score ?",
    },
    thresholds: { danger: 40, warning: 60, good: 80 },
    dependencies: ["grossMarginRate", "netProfit", "workingCapital", "cashRunwayMonths"],
    sourceLayer: "accounting",
    phase: "CT",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Retourne la définition d'un KPI ou null si l'id n'est pas dans le registre.
 * Préférable à un accès direct `KPI_REGISTRY[id]` qui ne signale rien sur les
 * KPIs absents.
 */
export function getKpiDefinition(id: string): KpiDefinition | null {
  return KPI_REGISTRY[id] ?? null;
}

/**
 * Retourne tous les KPIs d'une catégorie, dans l'ordre du registre.
 * Utilisé par les composants qui rendent un onglet entier (Création de valeur,
 * Investissement, etc.).
 */
export function listKpisByCategory(category: KpiCategory): KpiDefinition[] {
  return Object.values(KPI_REGISTRY).filter((k) => k.category === category);
}

/**
 * Retourne tous les KPIs d'une phase de roadmap. Phase=CT pour les KPIs
 * actuellement calculés, MT/LT pour les KPIs prévus mais pas encore branchés.
 */
export function listKpisByPhase(phase: KpiPhase): KpiDefinition[] {
  return Object.values(KPI_REGISTRY).filter((k) => k.phase === phase);
}
