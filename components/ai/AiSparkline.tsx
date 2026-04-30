// File: components/ai/AiSparkline.tsx
// Role: mini-graphe SVG (sparkline) inline pour visualiser la tendance
// d'un KPI sur les derniers points fournis. Volontairement minimaliste :
// une polyline + une aire dégradée en dessous, hauteur 32 px par défaut.
//
// Couleur : or (#C5A059) si tendance positive, rouge (#EF4444) sinon. La
// décision se base sur la pente entre le premier et le dernier point.
//
// Renvoie `null` si moins de 2 points — pas de placeholder vide pour
// éviter de polluer la card quand la série n'est pas calculable (cas
// fréquent : KPI bilan instantané, série mensuelle pas encore agrégée).
"use client";

type AiSparklineProps = {
  points: number[];
  width?: number;
  height?: number;
  /** Override la couleur si tu veux forcer un ton (sinon auto up/down). */
  color?: string;
};

export function AiSparkline({
  points,
  width = 120,
  height = 32,
  color,
}: AiSparklineProps) {
  if (!Array.isArray(points) || points.length < 2) return null;

  // Détecte la tendance : compare premier vs dernier point.
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const isUp = last >= first;
  const stroke = color ?? (isUp ? "#C5A059" : "#EF4444");
  const fillId = `vyzor-spark-${isUp ? "up" : "down"}`;

  // Normalisation des points dans la viewBox. On laisse 1 px de padding
  // vertical pour que la ligne ne soit pas collée aux bords.
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const padY = 1;
  const usableH = height - 2 * padY;

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = padY + usableH - ((p - min) / range) * usableH;
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`))
    .join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const trendLabel = isUp
    ? `Tendance haussière sur ${points.length} points`
    : `Tendance baissière sur ${points.length} points`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={trendLabel}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
