import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfReportData, PdfKpiItem, PdfScoreLevel } from "@/lib/synthese/pdfReportModel";

const LOGO_PATH = "/images/LogoV3.png";

const C = {
  white: "#FFFFFF",
  text: "#111827",
  textSecondary: "#6B7280",
  gold: "#F59E0B",
  goldDark: "#D97706",
  green: "#10B981",
  red: "#EF4444",
  orange: "#F97316",
  border: "#E5E7EB",
  bgSection: "#F9FAFB"
} as const;

function scoreColor(level: PdfScoreLevel): string {
  if (level === "excellent") return C.green;
  if (level === "bon") return C.gold;
  if (level === "fragile") return C.orange;
  if (level === "critique") return C.red;
  return C.textSecondary;
}

const s = StyleSheet.create({
  page: { backgroundColor: C.white, paddingTop: 40, paddingBottom: 50, paddingHorizontal: 40, fontFamily: "Helvetica" },
  coverPage: { backgroundColor: C.white, paddingTop: 40, paddingBottom: 50, paddingHorizontal: 40, fontFamily: "Helvetica", justifyContent: "flex-start" },

  // Page header (pages 2-6)
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  pageHeaderLogo: { width: 22, height: 22, objectFit: "contain" },
  pageHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  pageHeaderCompany: { fontSize: 9, color: C.textSecondary, fontFamily: "Helvetica" },
  pageHeaderPageNum: { fontSize: 8, color: C.textSecondary },

  // Footer
  footer: { position: "absolute", left: 40, right: 40, bottom: 20, alignItems: "center" },
  footerText: { fontSize: 7, color: C.textSecondary, textAlign: "center" },

  // Cover
  coverLogo: { width: 48, height: 48, objectFit: "contain", marginBottom: 12 },
  coverTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.text, marginBottom: 6 },
  coverSubtitle: { fontSize: 14, color: C.textSecondary, marginBottom: 16 },
  goldLine: { height: 2, backgroundColor: C.gold, marginBottom: 20 },
  scoreBlock: { alignItems: "center", marginBottom: 24, paddingVertical: 20 },
  scoreGaugeOuter: { width: 90, height: 90, borderRadius: 45, borderWidth: 6, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  scoreGaugeValue: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  scoreBadge: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 14, marginTop: 6 },
  scoreBadgeText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.white },
  pillarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  pillarCard: { width: "48%", backgroundColor: C.bgSection, borderRadius: 6, padding: 10 },
  pillarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  pillarLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.text },
  pillarValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: C.border },
  barFill: { height: 6, borderRadius: 3 },
  coverFooter: { fontSize: 8, color: C.textSecondary, textAlign: "center", marginTop: "auto" },

  // Section title
  sectionTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.goldDark, marginBottom: 4 },
  sectionLine: { height: 2, backgroundColor: C.gold, marginBottom: 16 },

  // Hero KPIs
  heroRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  heroCard: { flex: 1, backgroundColor: C.bgSection, borderRadius: 6, padding: 12, borderLeftWidth: 3, borderLeftColor: C.gold },
  heroLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.textSecondary, textTransform: "uppercase", marginBottom: 4 },
  heroValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.text },

  // Summary table
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 6 },
  tableLabel: { flex: 1, fontSize: 10, color: C.text },
  tableValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.text, textAlign: "right", width: 140 },

  // Alerts
  alertsBlock: { marginTop: 14 },
  alertsTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.text, marginBottom: 6 },
  alertRow: { flexDirection: "row", gap: 6, marginBottom: 3 },
  alertBullet: { fontSize: 10 },
  alertText: { fontSize: 9, color: C.text, flex: 1, lineHeight: 1.4 },

  // KPI grid (2 columns)
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { width: "48%", backgroundColor: C.bgSection, borderLeftWidth: 3, borderLeftColor: C.gold, borderRadius: 4, padding: 12, marginBottom: 2 },
  kpiLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.text, textTransform: "uppercase", marginBottom: 4 },
  kpiValue: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.text, marginBottom: 4 },
  kpiValueNd: { fontSize: 22, fontFamily: "Helvetica-Oblique", color: C.textSecondary, marginBottom: 4 },
  kpiInterpretation: { fontSize: 8, color: C.textSecondary, lineHeight: 1.4 },

  // Page 6 extras
  listsRow: { flexDirection: "row", gap: 14, marginTop: 16 },
  listBlock: { flex: 1, backgroundColor: C.bgSection, borderRadius: 6, padding: 12 },
  listTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.text, marginBottom: 8 },
  listItem: { flexDirection: "row", gap: 4, marginBottom: 4 },
  listBullet: { fontSize: 9 },
  listText: { fontSize: 9, color: C.text, flex: 1 },
  conclusionText: { fontSize: 8, color: C.textSecondary, textAlign: "center", marginTop: 20, lineHeight: 1.5, fontFamily: "Helvetica-Oblique" }
});

type PDFLayoutProps = {
  data: PdfReportData;
  logoSrc?: string;
};

export function PDFLayout({ data, logoSrc }: PDFLayoutProps) {
  const resolvedLogo = logoSrc ?? (typeof window !== "undefined" ? `${window.location.origin}${LOGO_PATH}` : undefined);

  return (
    <Document title={`Rapport Quantis - ${data.meta.companyName}`} author="Quantis" subject="Analyse financière">
      <CoverPage data={data} logoSrc={resolvedLogo} />
      <SynthesePage data={data} logoSrc={resolvedLogo} />
      <KpiPage
        title="Création de valeur & Rentabilité opérationnelle"
        items={data.valueCreation.items}
        logoSrc={resolvedLogo}
        companyName={data.meta.companyName}
        pageNum={3}
      />
      <KpiPage
        title="Investissement & Gestion du Besoin en Fonds de Roulement"
        items={data.investment.items}
        logoSrc={resolvedLogo}
        companyName={data.meta.companyName}
        pageNum={4}
      />
      <KpiPage
        title="Financement & Structure Financière"
        items={data.financing.items}
        logoSrc={resolvedLogo}
        companyName={data.meta.companyName}
        pageNum={5}
      />
      <ProfitabilityPage data={data} logoSrc={resolvedLogo} />
    </Document>
  );
}

// --- Page 1: Cover ---

function CoverPage({ data, logoSrc }: { data: PdfReportData; logoSrc?: string }) {
  const sc = scoreColor(data.cover.scoreLevel);
  return (
    <Page size="A4" style={s.coverPage}>
      {logoSrc ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={logoSrc} style={s.coverLogo} />
      ) : (
        <View style={{ width: 48, height: 48, marginBottom: 12 }} />
      )}

      <Text style={s.coverTitle}>Rapport d&apos;analyse financière</Text>
      <Text style={s.coverSubtitle}>{data.meta.companyName}</Text>
      <View style={s.goldLine} />

      <View style={s.scoreBlock}>
        <View style={{ ...s.scoreGaugeOuter, borderColor: sc }}>
          <Text style={{ ...s.scoreGaugeValue, color: sc }}>
            {data.cover.scoreValue === null ? "N/D" : Math.round(data.cover.scoreValue)}
          </Text>
        </View>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: C.text }}>
          {data.cover.scoreValueLabel}
        </Text>
        <View style={{ ...s.scoreBadge, backgroundColor: sc }}>
          <Text style={s.scoreBadgeText}>{data.cover.scoreLevelLabel}</Text>
        </View>
      </View>

      <View style={s.pillarGrid}>
        {data.cover.pillars.map((p) => (
          <View key={p.id} style={s.pillarCard}>
            <View style={s.pillarHeader}>
              <Text style={s.pillarLabel}>{p.label}</Text>
              <Text style={{ ...s.pillarValue, color: p.color }}>{p.valueLabel}</Text>
            </View>
            <View style={s.barTrack}>
              <View style={{ ...s.barFill, backgroundColor: p.color, width: `${Math.max(0, Math.min(100, p.value ?? 0))}%` }} />
            </View>
          </View>
        ))}
      </View>

      <Text style={s.coverFooter}>
        Période fiscale : {data.meta.periodLabel} · Généré le {data.meta.generatedAtLabel} · Confidentiel
      </Text>

      <PageFooter />
    </Page>
  );
}

// --- Page 2: Synthèse ---

function SynthesePage({ data, logoSrc }: { data: PdfReportData; logoSrc?: string }) {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader logoSrc={logoSrc} companyName={data.meta.companyName} pageNum={2} />

      <Text style={s.sectionTitle}>Synthèse financière</Text>
      <View style={s.sectionLine} />

      <View style={s.heroRow}>
        {data.synthese.heroKpis.map((kpi, i) => (
          <View key={`hero-${i}`} style={s.heroCard}>
            <Text style={s.heroLabel}>{kpi.label}</Text>
            <Text style={kpi.valueLabel === "N/D" ? { ...s.heroValue, color: C.textSecondary, fontFamily: "Helvetica-Oblique" } : s.heroValue}>
              {kpi.valueLabel}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginBottom: 14 }}>
        {data.synthese.summaryRows.map((row, i) => (
          <View key={`summary-${i}`} style={s.tableRow}>
            <Text style={s.tableLabel}>{row.label}</Text>
            <Text style={row.valueLabel === "N/D" ? { ...s.tableValue, color: C.textSecondary, fontFamily: "Helvetica-Oblique" } : s.tableValue}>
              {row.valueLabel}
            </Text>
          </View>
        ))}
      </View>

      <View style={s.alertsBlock}>
        <Text style={s.alertsTitle}>Alertes</Text>
        {data.synthese.alerts.map((alert, i) => {
          const color = alert.severity === "high" ? C.red : alert.severity === "medium" ? C.orange : C.green;
          return (
            <View key={`alert-${i}`} style={s.alertRow}>
              <Text style={{ ...s.alertBullet, color }}>●</Text>
              <Text style={s.alertText}>{alert.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={s.alertsBlock}>
        <Text style={s.alertsTitle}>Recommandations</Text>
        {data.synthese.recommendations.map((rec, i) => (
          <View key={`rec-${i}`} style={s.alertRow}>
            <Text style={{ ...s.alertBullet, color: C.gold }}>▸</Text>
            <Text style={s.alertText}>{rec}</Text>
          </View>
        ))}
      </View>

      <PageFooter />
    </Page>
  );
}

// --- Pages 3-5: KPI pages ---

function KpiPage({ title, items, logoSrc, companyName, pageNum }: {
  title: string;
  items: PdfKpiItem[];
  logoSrc?: string;
  companyName: string;
  pageNum: number;
}) {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader logoSrc={logoSrc} companyName={companyName} pageNum={pageNum} />

      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionLine} />

      <View style={s.kpiGrid}>
        {items.map((item, i) => (
          <KpiCard key={`kpi-${i}`} item={item} />
        ))}
      </View>

      <PageFooter />
    </Page>
  );
}

// --- Page 6: Profitability + Conclusion ---

function ProfitabilityPage({ data, logoSrc }: { data: PdfReportData; logoSrc?: string }) {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader logoSrc={logoSrc} companyName={data.meta.companyName} pageNum={6} />

      <Text style={s.sectionTitle}>Rentabilité & Performance</Text>
      <View style={s.sectionLine} />

      <View style={s.kpiGrid}>
        {data.profitability.items.map((item, i) => (
          <KpiCard key={`rent-${i}`} item={item} />
        ))}
      </View>

      <View style={s.listsRow}>
        <View style={s.listBlock}>
          <Text style={{ ...s.listTitle, color: C.green }}>Points forts</Text>
          {data.profitability.strengths.map((item, i) => (
            <View key={`str-${i}`} style={s.listItem}>
              <Text style={{ ...s.listBullet, color: C.green }}>✓</Text>
              <Text style={s.listText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={s.listBlock}>
          <Text style={{ ...s.listTitle, color: C.orange }}>Axes d&apos;amélioration</Text>
          {data.profitability.improvements.map((item, i) => (
            <View key={`imp-${i}`} style={s.listItem}>
              <Text style={{ ...s.listBullet, color: C.orange }}>→</Text>
              <Text style={s.listText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={s.conclusionText}>
        Ce rapport a été généré automatiquement par Quantis. Les données proviennent des documents financiers fournis et sont présentées à titre informatif.
      </Text>

      <PageFooter />
    </Page>
  );
}

// --- Shared components ---

function PageHeader({ logoSrc, companyName, pageNum }: { logoSrc?: string; companyName: string; pageNum: number }) {
  return (
    <View style={s.pageHeader}>
      <View style={s.pageHeaderLeft}>
        {logoSrc ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logoSrc} style={s.pageHeaderLogo} />
        ) : null}
        <Text style={s.pageHeaderCompany}>{companyName}</Text>
      </View>
      <Text style={s.pageHeaderPageNum}>Page {pageNum} / 6</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Rapport confidentiel — Quantis</Text>
    </View>
  );
}

function KpiCard({ item }: { item: PdfKpiItem }) {
  const isNd = item.valueLabel === "N/D";
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{item.label}</Text>
      <Text style={isNd ? s.kpiValueNd : s.kpiValue}>{item.valueLabel}</Text>
      <Text style={s.kpiInterpretation}>{item.interpretation}</Text>
    </View>
  );
}
