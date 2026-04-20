// File: components/pdf/Header.tsx
// Role: en-tête du rapport PDF (branding + métadonnées principales).

import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfReportData } from "@/lib/synthese/pdfReportModel";

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111218",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  left: {
    flexDirection: "row",
    gap: 10,
    maxWidth: "62%"
  },
  logo: {
    width: 30,
    height: 30,
    objectFit: "contain"
  },
  logoFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#C5A059",
    alignItems: "center",
    justifyContent: "center"
  },
  logoFallbackText: {
    fontSize: 12,
    color: "#111218",
    fontWeight: 700
  },
  brand: {
    color: "#C5A059",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 3
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4
  },
  subtitle: {
    color: "#E4E4E7",
    fontSize: 9,
    lineHeight: 1.35
  },
  meta: {
    maxWidth: "36%",
    alignItems: "flex-end",
    gap: 3
  },
  metaText: {
    color: "#D4D4D8",
    fontSize: 8.4,
    textAlign: "right"
  }
});

type HeaderProps = {
  data: PdfReportData["meta"];
  logoSrc?: string;
};

export function Header({ data, logoSrc }: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {logoSrc ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logoSrc} style={styles.logo} />
        ) : (
          <View style={styles.logoFallback}>
            <Text style={styles.logoFallbackText}>Q</Text>
          </View>
        )}

        <View>
          <Text style={styles.brand}>Quantis</Text>
          <Text style={styles.title}>Rapport de synthèse financière</Text>
          <Text style={styles.subtitle}>Entreprise : {data.companyName}</Text>
          {data.userName && (
            <Text style={styles.subtitle}>Utilisateur : {data.userName}</Text>
          )}
        </View>
      </View>

      <View style={styles.meta}>
        {data.analysisDateLabel && (
          <Text style={styles.metaText}>Date de l&apos;analyse : {data.analysisDateLabel}</Text>
        )}
        <Text style={styles.metaText}>Période : {data.periodLabel}</Text>
        <Text style={styles.metaText}>Généré le : {data.generatedAtLabel}</Text>
      </View>
    </View>
  );
}
