// File: components/pdf/KPISection.tsx
// Role: section piliers et KPI principaux avec codes couleur métier.

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfReportData } from "@/lib/synthese/pdfReportModel";

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12,
    color: "#141418",
    fontWeight: 700,
    marginBottom: 6
  },
  gridTwo: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10
  },
  pillarCard: {
    width: "48.7%",
    borderWidth: 1,
    borderColor: "#DFDFE8",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 8
  },
  pillarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  pillarLabel: {
    color: "#27272A",
    fontSize: 9,
    fontWeight: 700
  },
  pillarValue: {
    fontSize: 9,
    fontWeight: 700
  },
  barTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "#ECECF2"
  },
  barFill: {
    height: 5,
    borderRadius: 999
  },
  kpiRow: {
    flexDirection: "row",
    gap: 6
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DFDFE8",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 8
  },
  kpiTitle: {
    fontSize: 9.4,
    color: "#111827",
    fontWeight: 700
  },
  kpiSubtitle: {
    marginTop: 2,
    fontSize: 8,
    color: "#71717A"
  },
  kpiValue: {
    marginTop: 6,
    fontSize: 13,
    color: "#141418",
    fontWeight: 700
  },
  trendBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 2.5,
    paddingHorizontal: 7
  },
  trendText: {
    fontSize: 8,
    fontWeight: 700
  },
  benchmark: {
    marginTop: 5,
    fontSize: 7.7,
    color: "#6B7280",
    lineHeight: 1.3
  }
});

type KPISectionProps = {
  pillars: PdfReportData["cover"]["pillars"];
  kpis: PdfReportData["kpis"];
};

export function KPISection({ pillars, kpis }: KPISectionProps) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Piliers</Text>
      <View style={styles.gridTwo}>
        {pillars.map((pillar) => (
          <View key={pillar.id} style={styles.pillarCard}>
            <View style={styles.pillarHeader}>
              <Text style={styles.pillarLabel}>{pillar.label}</Text>
              <Text style={{ ...styles.pillarValue, color: pillar.color }}>{pillar.valueLabel}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={{
                  ...styles.barFill,
                  width: `${Math.max(0, Math.min(100, pillar.value ?? 0))}%`,
                  backgroundColor: pillar.color
                }}
              />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>KPI principaux</Text>
      <View style={styles.kpiRow}>
        {kpis.map((kpi) => {
          const trend = trendStyle(kpi.trendTone);
          return (
            <View key={kpi.id} style={styles.kpiCard}>
              <Text style={styles.kpiTitle}>{kpi.title}</Text>
              <Text style={styles.kpiSubtitle}>{kpi.subtitle}</Text>
              <Text style={styles.kpiValue}>{kpi.valueLabel}</Text>

              <View style={{ ...styles.trendBadge, backgroundColor: trend.background }}>
                <Text style={{ ...styles.trendText, color: trend.color }}>{kpi.trendLabel}</Text>
              </View>

              <Text style={styles.benchmark}>{kpi.benchmarkLabel}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function trendStyle(
  tone: PdfReportData["kpis"][number]["trendTone"]
): { color: string; background: string } {
  if (tone === "positive") {
    return { color: "#15803D", background: "#DCFCE7" };
  }
  if (tone === "negative") {
    return { color: "#BE123C", background: "#FFE4E6" };
  }
  return { color: "#4B5563", background: "#E5E7EB" };
}

