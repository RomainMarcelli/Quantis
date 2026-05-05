// File: lib/ai/promptBuilder.test.ts
// Role: tests unitaires de `buildSystemPrompt` — vérifie que les données
// réelles sont injectées, que le niveau utilisateur change le ton, et que
// les garde-fous + format de sortie sont systématiquement présents.

import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/promptBuilder";
import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";

function emptyMapped(): MappedFinancialData {
  // On réplique la liste des champs nullables sans avoir à importer
  // l'helper interne d'analysisStore (qui dépendrait de Firestore).
  // Tous à null sauf ceux explicitement renseignés dans le test.
  return Object.fromEntries(
    [
      "immob_incorp", "immob_corp", "immob_fin", "total_actif_immo",
      "total_actif_immo_brut", "total_actif_immo_net", "stocks_mp",
      "stocks_march", "total_stocks", "avances_vers_actif", "clients",
      "autres_creances", "creances", "vmp", "dispo", "cca",
      "total_actif_circ", "total_actif", "capital", "ecarts_reeval",
      "reserve_legale", "reserves_reglem", "autres_reserves", "ran",
      "res_net", "subv_invest", "prov_reglem", "total_cp", "total_prov",
      "emprunts", "avances_recues_passif", "fournisseurs",
      "dettes_fisc_soc", "cca_passif", "autres_dettes", "pca",
      "total_dettes", "total_passif", "ventes_march", "prod_biens",
      "prod_serv", "prod_vendue", "prod_stockee", "prod_immo",
      "subv_expl", "autres_prod_expl", "total_prod_expl", "achats_march",
      "var_stock_march", "achats_mp", "var_stock_mp", "ace",
      "impots_taxes", "salaires", "charges_soc", "dap", "dprov",
      "autres_charges_expl", "total_charges_expl", "ebit", "prod_fin",
      "charges_fin", "prod_excep", "charges_excep", "is_impot",
      "resultat_exercice", "ca_n_minus_1", "n", "delta_bfr",
    ].map((k) => [k, null])
  ) as MappedFinancialData;
}

function emptyKpis(): CalculatedKpis {
  return {
    tcam: null, va: null, ebitda: null, ebe: null, marge_ebitda: null,
    charges_var: null, mscv: null, tmscv: null, ca: null,
    charges_fixes: null, point_mort: null, ratio_immo: null,
    bfr: null, rot_bfr: null, dso: null, dpo: null, rot_stocks: null,
    caf: null, fte: null, tn: null, solvabilite: null, gearing: null,
    liq_gen: null, liq_red: null, liq_imm: null, disponibilites: null,
    roce: null, roe: null, effet_levier: null, resultat_net: null,
    grossMarginRate: null, netProfit: null, workingCapital: null,
    monthlyBurnRate: null, cashRunwayMonths: null,
    capacite_remboursement_annees: null, etat_materiel_indice: null,
    healthScore: null,
  };
}

function buildAnalysis(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: "analysis-1",
    userId: "user-1",
    folderName: "Dossier Acme 2025",
    createdAt: "2026-04-30T00:00:00.000Z",
    fiscalYear: 2025,
    sourceFiles: [],
    parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData: emptyMapped(),
    financialFacts: {
      revenue: null, expenses: null, payroll: null, treasury: null,
      receivables: null, payables: null, inventory: null,
    },
    kpis: emptyKpis(),
    quantisScore: null,
    uploadContext: {
      companySize: "10-49",
      sector: "Services BtoB",
      source: "upload",
    },
    ...overrides,
  };
}

describe("buildSystemPrompt — données réelles", () => {
  it("injecte le secteur et la taille de l'entreprise", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).toContain("Services BtoB");
    expect(prompt).toContain("10-49");
    expect(prompt).toContain("2025");
  });

  it("liste les KPIs non-null avec leur valeur formatée", () => {
    const analysis = buildAnalysis({
      kpis: {
        ...emptyKpis(),
        ca: 1_200_000,
        ebitda: -50_000,
        dso: 87,
      },
    });
    const prompt = buildSystemPrompt({
      analysis,
      kpiId: null,
      userLevel: "intermediate",
    });
    // KPI listés avec id + label
    expect(prompt).toContain("ca (Chiffre d'affaires)");
    expect(prompt).toContain("ebitda");
    expect(prompt).toContain("dso");
    // Valeurs formatées en français (séparateurs)
    expect(prompt).toMatch(/1[\s ]200[\s ]000/);
    expect(prompt).toContain("87 jours");
    // Diagnostic présent (EBITDA négatif → danger)
    expect(prompt).toContain("[danger]");
  });

  it("ignore les KPIs null pour ne pas polluer le prompt", () => {
    const analysis = buildAnalysis({
      kpis: { ...emptyKpis(), ca: 100_000 },
    });
    const prompt = buildSystemPrompt({
      analysis,
      kpiId: null,
      userLevel: "intermediate",
    });
    // ca présent…
    expect(prompt).toContain("ca (Chiffre d'affaires)");
    // …mais pas dso (null)
    expect(prompt).not.toMatch(/^- dso /m);
  });

  it("expose les postes mappedData (compte de résultat / bilan)", () => {
    const analysis = buildAnalysis({
      mappedData: {
        ...emptyMapped(),
        total_prod_expl: 800_000,
        salaires: 350_000,
        dispo: 50_000,
      },
    });
    const prompt = buildSystemPrompt({
      analysis,
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).toContain("Total production exploitation");
    expect(prompt).toContain("Salaires");
    expect(prompt).toContain("Disponibilités");
  });

  it("inclut le contexte focus quand un kpiId est fourni", () => {
    const analysis = buildAnalysis({
      kpis: { ...emptyKpis(), ebitda: -50_000 },
    });
    const prompt = buildSystemPrompt({
      analysis,
      kpiId: "ebitda",
      userLevel: "intermediate",
    });
    expect(prompt).toContain("<contexte_focus>");
    expect(prompt).toContain("ebitda");
    expect(prompt).toContain("Diagnostic vs. seuils : danger");
  });

  it("omet le contexte focus si aucun kpiId", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).not.toContain("<contexte_focus>");
  });

  it("supporte un kpiId inconnu sans crasher (pas de focus généré)", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: "kpi-inexistant",
      userLevel: "intermediate",
    });
    expect(prompt).not.toContain("<contexte_focus>");
  });

  it("gère le cas analysis null (chat libre sans données)", () => {
    const prompt = buildSystemPrompt({
      analysis: null,
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).toContain("<entreprise>");
    expect(prompt).toContain("Aucune analyse disponible");
    expect(prompt).toContain("Aucune donnée chiffrée disponible");
  });
});

describe("buildSystemPrompt — niveau utilisateur", () => {
  it("adapte le rôle pour un débutant (vulgarisation)", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "beginner",
    });
    expect(prompt).toContain("découvre la finance");
    expect(prompt).toContain("Vulgarise");
  });

  it("adapte le rôle pour un expert (technique)", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "expert",
    });
    expect(prompt).toContain("fort background financier");
    expect(prompt).toContain("technique");
  });

  it("adapte le rôle pour un intermédiaire (essentiel)", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).toContain("à l'aise avec les notions");
    expect(prompt).toContain("Va à l'essentiel");
  });

  it("réinjecte le niveau dans la section format_reponse", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "expert",
    });
    expect(prompt).toContain('niveau "expert"');
  });
});

describe("buildSystemPrompt — garde-fous et format", () => {
  it("contient toujours la section garde_fous (vouvoiement, pas de juridique)", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).toContain("<garde_fous>");
    expect(prompt).toContain("Vouvoiement");
    expect(prompt).toMatch(/conseil juridique/i);
    expect(prompt).toMatch(/expert-comptable/i);
  });

  it("contient toujours la section format_reponse (200 mots max, markdown)", () => {
    const prompt = buildSystemPrompt({
      analysis: buildAnalysis(),
      kpiId: null,
      userLevel: "intermediate",
    });
    expect(prompt).toContain("<format_reponse>");
    expect(prompt).toContain("200 mots");
    expect(prompt).toContain("markdown");
    expect(prompt).toContain("action");
  });

  it("ne laisse fuiter aucun chiffre quand il n'y a pas d'analyse", () => {
    const prompt = buildSystemPrompt({
      analysis: null,
      kpiId: null,
      userLevel: "intermediate",
    });
    // Pas d'euro inattendu dans la section donnees_kpi quand il n'y en a pas.
    expect(prompt).toContain("Aucune donnée chiffrée disponible");
  });
});
