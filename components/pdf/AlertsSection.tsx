// File: components/pdf/AlertsSection.tsx
// Role: section finale en deux colonnes pour recommandations et alertes.

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfReportData } from "@/lib/synthese/pdfReportModel";

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8
  },
  column: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DFDFE8",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    padding: 10
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    color: "#141418",
    marginBottom: 6
  },
  itemRow: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 4
  },
  bullet: {
    fontSize: 10,
    lineHeight: 1.2
  },
  text: {
    flex: 1,
    fontSize: 8.9,
    color: "#27272A",
    lineHeight: 1.35
  }
});

type AlertsSectionProps = {
  recommendations: PdfReportData["synthese"]["recommendations"];
  alerts: PdfReportData["synthese"]["alerts"];
};

export function AlertsSection({ recommendations, alerts }: AlertsSectionProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.column}>
        <Text style={styles.title}>Actions recommandées</Text>
        {recommendations.map((item, index) => (
          <View key={`reco-${index}`} style={styles.itemRow}>
            <Text style={{ ...styles.bullet, color: "#3B82F6" }}>•</Text>
            <Text style={styles.text}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.column}>
        <Text style={styles.title}>Alertes</Text>
        {alerts.map((alert, index) => {
          const color = alert.severity === "high" ? "#F43F5E" : alert.severity === "medium" ? "#F59E0B" : "#16A34A";
          return (
            <View key={`alert-${index}`} style={styles.itemRow}>
              <Text style={{ ...styles.bullet, color }}>•</Text>
              <Text style={styles.text}>{alert.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

