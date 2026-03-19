import type { CalculatedKpis } from "@/types/analysis";

export type DashboardSeverity = "green" | "orange" | "red" | "neutral";
export type DashboardMetricFormat =
  | "currency"
  | "percent"
  | "days"
  | "ratio"
  | "years"
  | "months"
  | "number";

export type DashboardMetricItem = {
  key: keyof CalculatedKpis | "ecart_dso_dpo";
  label: string;
  value: number | null;
  format: DashboardMetricFormat;
};

export type DashboardSection = {
  id: "creation-valeur" | "investissement-bfr" | "financement" | "rentabilite";
  title: string;
  metrics: DashboardMetricItem[];
};

export type DashboardAlert = {
  id: string;
  title: string;
  description: string;
  severity: Exclude<DashboardSeverity, "neutral">;
};

export type DashboardTopCard = {
  id: "cash" | "health" | "alerts" | "runway";
  label: string;
  value: number | null;
  format: DashboardMetricFormat;
  severity: DashboardSeverity;
};

export type DashboardScore = {
  value: number | null;
  severity: DashboardSeverity;
  label: string;
};

export type AnalysisDashboardViewModel = {
  topCards: DashboardTopCard[];
  score: DashboardScore;
  suggestions: string[];
  alerts: {
    count: number;
    items: DashboardAlert[];
    hasRed: boolean;
  };
  sections: DashboardSection[];
};

export function buildAnalysisDashboardViewModel(
  kpis: CalculatedKpis
): AnalysisDashboardViewModel {
  const alerts = buildAlerts(kpis);
  const score = buildScore(kpis.healthScore);

  const topCards: DashboardTopCard[] = [
    {
      id: "cash",
      label: "Cash disponible",
      value: kpis.disponibilites,
      format: "currency",
      severity: getCashSeverity(kpis.disponibilites)
    },
    {
      id: "health",
      label: "Sante globale",
      value: kpis.healthScore,
      format: "percent",
      severity: score.severity
    },
    {
      id: "alerts",
      label: "Nombre d'alertes",
      value: alerts.count,
      format: "number",
      severity: getAlertCardSeverity(alerts.count, alerts.hasRed)
    },
    {
      id: "runway",
      label: "Runway / autonomie",
      value: kpis.cashRunwayMonths,
      format: "months",
      severity: getRunwaySeverity(kpis.cashRunwayMonths)
    }
  ];

  return {
    topCards,
    score,
    suggestions: ["Puis-je investir 80k€ ?", "Optimiser stock", "Retards clients", "Cash flow projete"],
    alerts,
    sections: buildSections(kpis)
  };
}

function buildSections(kpis: CalculatedKpis): DashboardSection[] {
  return [
    {
      id: "creation-valeur",
      title: "Creation de valeur",
      metrics: [
        metric("ca", "Chiffre d'affaires", kpis.ca, "currency"),
        metric("tcam", "TCAM", kpis.tcam, "percent"),
        metric("ebe", "EBE", kpis.ebe, "currency"),
        metric("tmscv", "TMSCV", kpis.tmscv, "percent"),
        metric("resultat_net", "Resultat net", kpis.resultat_net, "currency")
      ]
    },
    {
      id: "investissement-bfr",
      title: "Investissement / BFR",
      metrics: [
        metric("bfr", "BFR", kpis.bfr, "currency"),
        metric("rot_bfr", "Rotation BFR", kpis.rot_bfr, "days"),
        metric("rot_stocks", "Stocks", kpis.rot_stocks, "days"),
        metric("dso", "DSO clients", kpis.dso, "days"),
        metric("dpo", "DPO fournisseurs", kpis.dpo, "days"),
        metric("ecart_dso_dpo", "Ecart cycle clients/fournisseurs", computeCycleGap(kpis), "days"),
        metric("etat_materiel_indice", "Etat du materiel", kpis.etat_materiel_indice, "percent")
      ]
    },
    {
      id: "financement",
      title: "Financement",
      metrics: [
        metric("caf", "CAF", kpis.caf, "currency"),
        metric(
          "capacite_remboursement_annees",
          "Capacite remboursement",
          kpis.capacite_remboursement_annees,
          "years"
        ),
        metric("fte", "Flux de tresorerie", kpis.fte, "currency"),
        metric("liq_gen", "Liquidite generale", kpis.liq_gen, "ratio"),
        metric("liq_red", "Liquidite reduite", kpis.liq_red, "ratio"),
        metric("liq_imm", "Liquidite immediate", kpis.liq_imm, "ratio")
      ]
    },
    {
      id: "rentabilite",
      title: "Rentabilite",
      metrics: [
        metric("roe", "ROE", kpis.roe, "percent"),
        metric("roce", "ROCE", kpis.roce, "percent"),
        metric("effet_levier", "Levier financier", kpis.effet_levier, "ratio")
      ]
    }
  ];
}

function buildAlerts(kpis: CalculatedKpis): AnalysisDashboardViewModel["alerts"] {
  const items: DashboardAlert[] = [];

  if (kpis.healthScore !== null) {
    if (kpis.healthScore < 50) {
      items.push({
        id: "health-score",
        title: "Sante globale critique",
        description: "Le score global est inferieur a 50%.",
        severity: "red"
      });
    } else if (kpis.healthScore < 70) {
      items.push({
        id: "health-score",
        title: "Sante globale a surveiller",
        description: "Le score global est entre 50% et 69%.",
        severity: "orange"
      });
    }
  }

  if (kpis.liq_imm !== null) {
    if (kpis.liq_imm < 0.5) {
      items.push({
        id: "liq-imm",
        title: "Faible liquidite immediate",
        description: "La liquidite immediate est inferieure a 0.5.",
        severity: "red"
      });
    } else if (kpis.liq_imm < 1) {
      items.push({
        id: "liq-imm",
        title: "Liquidite immediate fragile",
        description: "La liquidite immediate est comprise entre 0.5 et 1.",
        severity: "orange"
      });
    }
  }

  if (kpis.dso !== null) {
    if (kpis.dso > 90) {
      items.push({
        id: "dso",
        title: "Retards clients eleves",
        description: "Le DSO depasse 90 jours.",
        severity: "red"
      });
    } else if (kpis.dso > 60) {
      items.push({
        id: "dso",
        title: "Retards clients a surveiller",
        description: "Le DSO est compris entre 61 et 90 jours.",
        severity: "orange"
      });
    }
  }

  const cycleGap = computeCycleGap(kpis);
  if (cycleGap !== null) {
    if (cycleGap > 60) {
      items.push({
        id: "cycle-gap",
        title: "Ecart cycle clients/fournisseurs critique",
        description: "L'ecart DSO-DPO depasse 60 jours.",
        severity: "red"
      });
    } else if (cycleGap > 30) {
      items.push({
        id: "cycle-gap",
        title: "Ecart cycle clients/fournisseurs eleve",
        description: "L'ecart DSO-DPO est entre 31 et 60 jours.",
        severity: "orange"
      });
    }
  }

  if (kpis.rot_bfr !== null) {
    if (kpis.rot_bfr > 180) {
      items.push({
        id: "rot-bfr",
        title: "BFR eleve",
        description: "La rotation BFR depasse 180 jours.",
        severity: "red"
      });
    } else if (kpis.rot_bfr > 120) {
      items.push({
        id: "rot-bfr",
        title: "BFR a surveiller",
        description: "La rotation BFR est comprise entre 121 et 180 jours.",
        severity: "orange"
      });
    }
  }

  const ordered = [...items].sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));

  return {
    count: ordered.length,
    items: ordered,
    hasRed: ordered.some((item) => item.severity === "red")
  };
}

function buildScore(value: number | null): DashboardScore {
  if (value === null) {
    return {
      value: null,
      severity: "neutral",
      label: "Non disponible"
    };
  }
  if (value < 50) {
    return {
      value,
      severity: "red",
      label: "Critique"
    };
  }
  if (value < 70) {
    return {
      value,
      severity: "orange",
      label: "Sous surveillance"
    };
  }
  if (value < 85) {
    return {
      value,
      severity: "green",
      label: "Solide"
    };
  }
  return {
    value,
    severity: "green",
    label: "Tres solide"
  };
}

function computeCycleGap(kpis: CalculatedKpis): number | null {
  if (kpis.dso === null || kpis.dpo === null) {
    return null;
  }
  return kpis.dso - kpis.dpo;
}

function metric(
  key: DashboardMetricItem["key"],
  label: string,
  value: number | null,
  format: DashboardMetricFormat
): DashboardMetricItem {
  return { key, label, value, format };
}

function getCashSeverity(value: number | null): DashboardSeverity {
  if (value === null) {
    return "neutral";
  }
  if (value < 0) {
    return "red";
  }
  if (value === 0) {
    return "orange";
  }
  return "green";
}

function getRunwaySeverity(value: number | null): DashboardSeverity {
  if (value === null) {
    return "neutral";
  }
  if (value < 3) {
    return "red";
  }
  if (value < 6) {
    return "orange";
  }
  return "green";
}

function getAlertCardSeverity(count: number, hasRed: boolean): DashboardSeverity {
  if (count === 0) {
    return "green";
  }
  return hasRed ? "red" : "orange";
}

function severityWeight(severity: DashboardAlert["severity"]): number {
  switch (severity) {
    case "red":
      return 3;
    case "orange":
      return 2;
    case "green":
      return 1;
    default:
      return 0;
  }
}
