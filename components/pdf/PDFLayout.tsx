// File: components/pdf/PDFLayout.tsx
// Role: composition globale du PDF A4 (header, score, KPI, actions/alertes, footer).

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { Header } from "@/components/pdf/Header";
import { ScoreSection } from "@/components/pdf/ScoreSection";
import { KPISection } from "@/components/pdf/KPISection";
import { AlertsSection } from "@/components/pdf/AlertsSection";
import type { PdfReportData } from "@/lib/synthese/pdfReportModel";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#F6F6F9",
    paddingTop: 18,
    paddingBottom: 24,
    paddingHorizontal: 18,
    fontFamily: "Helvetica"
  },
  section: {
    marginBottom: 8
  },
  footer: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#DFDFE8",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  footerText: {
    color: "#71717A",
    fontSize: 8
  }
});

type PDFLayoutProps = {
  data: PdfReportData;
  logoSrc?: string;
};

export function PDFLayout({ data, logoSrc }: PDFLayoutProps) {
  return (
    <Document title={`Rapport Quantis - ${data.meta.companyName}`} author="Quantis" subject="Synthèse financière">
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Header data={data.meta} logoSrc={logoSrc} />
        </View>

        <View style={styles.section}>
          <ScoreSection score={data.score} />
        </View>

        <View style={styles.section}>
          <KPISection pillars={data.pillars} kpis={data.kpis} />
        </View>

        <View style={styles.section}>
          <AlertsSection recommendations={data.recommendations} alerts={data.alerts} />
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Rapport confidentiel - Quantis</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

