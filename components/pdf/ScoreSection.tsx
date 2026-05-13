// File: components/pdf/ScoreSection.tsx
// Role: section hero du Vyzor Score avec badge circulaire et interprétation.

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfReportData } from "@/lib/synthese/pdfReportModel";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DFDFE8",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12
  },
  title: {
    fontSize: 12.5,
    color: "#141418",
    fontWeight: 700
  },
  body: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  gaugeOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center"
  },
  gaugeValue: {
    fontSize: 13,
    fontWeight: 700
  },
  scoreLabel: {
    marginTop: 2,
    fontSize: 9.5,
    color: "#71717A"
  },
  right: {
    flex: 1
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
    marginBottom: 7
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 8.8,
    fontWeight: 700
  },
  description: {
    fontSize: 9.2,
    color: "#3F3F46",
    lineHeight: 1.4
  }
});

type ScoreSectionProps = {
  score: PdfReportData["score"];
};

export function ScoreSection({ score }: ScoreSectionProps) {
  const tone = colorByLevel(score.level);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Vyzor Score</Text>
      <View style={styles.body}>
        <View style={styles.left}>
          <View style={{ ...styles.gaugeOuter, borderColor: tone.main }}>
            <Text style={{ ...styles.gaugeValue, color: tone.main }}>{score.value === null ? "N/A" : Math.round(score.value)}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 20, fontWeight: 700, color: tone.main }}>{score.valueLabel}</Text>
            <Text style={styles.scoreLabel}>Santé globale</Text>
          </View>
        </View>

        <View style={styles.right}>
          <View style={{ ...styles.badge, backgroundColor: tone.main }}>
            <Text style={styles.badgeText}>{score.levelLabel}</Text>
          </View>
          <Text style={styles.description}>{score.description}</Text>
        </View>
      </View>
    </View>
  );
}

function colorByLevel(level: PdfReportData["score"]["level"]): { main: string } {
  if (level === "excellent") {
    return { main: "#22C55E" };
  }
  if (level === "bon") {
    return { main: "#16A34A" };
  }
  if (level === "fragile") {
    return { main: "#F59E0B" };
  }
  if (level === "critique") {
    return { main: "#F43F5E" };
  }
  return { main: "#71717A" };
}

