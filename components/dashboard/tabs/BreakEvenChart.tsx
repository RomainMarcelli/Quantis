// File: components/dashboard/tabs/BreakEvenChart.tsx
// Role: trace le graphique point mort (CA, coûts, marge) avec axes lisibles, point mort visible et lecture pertes/bénéfices claire.
"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";
import type { BreakEvenModel } from "@/lib/dashboard/tabs/valueCreationData";

type BreakEvenChartProps = {
  model: BreakEvenModel;
};

export function BreakEvenChart({ model }: BreakEvenChartProps) {
  // Le dernier point représente le volume max présent dans la série.
  const rawMaxVolume = model.points[model.points.length - 1]?.volume ?? model.pointMortVolume;

  // Point mort borné dans le domaine affiché pour éviter tout débordement visuel.
  const splitVolume = Math.min(Math.max(model.pointMortVolume, 0), rawMaxVolume);

  // Axe X en fourchettes lisibles (paliers arrondis).
  const xMax = computeNiceUpperBound(Math.max(rawMaxVolume, splitVolume * 1.15), 5);
  const xTicks = buildTickArray(0, xMax, 5);

  // Axe Y en fourchettes lisibles (paliers arrondis) avec marge de sécurité.
  const allYValues = model.points.flatMap((point) => [point.ca, point.couts, point.marge, model.pointMortValeur]);
  const minYRaw = Math.min(...allYValues);
  const maxYRaw = Math.max(...allYValues);
  const yPadding = Math.max((maxYRaw - minYRaw) * 0.14, 5000);
  const yMin = computeNiceLowerBound(minYRaw - yPadding, 5);
  const yMax = computeNiceUpperBound(maxYRaw + yPadding, 5);
  const yTicks = buildTickArray(yMin, yMax, 5);

  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* Info contextuelle: explique lecture du point mort et logique d'interprétation pertes/bénéfices. */}
      <InfoPopover
        title="Point mort"
        purpose="Identifier le niveau d'activité à partir duquel l'entreprise couvre ses coûts."
        displayedData="Les courbes CA, coûts, marge, le point d'intersection et les zones pertes/bénéfices."
        formula="Point mort ≈ charges fixes / taux de marge sur coûts variables."
      />

      {/* Point mort: intersection entre CA et coûts.
          Avant le point: zone de perte, après: zone de bénéfice. */}
      <h3 className="pr-10 text-sm uppercase tracking-[0.18em] text-white/55">Graphique point mort</h3>
      <p className="mt-2 text-sm text-white/70">
        Volume de point mort:{" "}
        <span className="font-semibold text-white">{formatEuroFull(splitVolume)}</span>
      </p>

      <div className="mt-4 h-80 rounded-xl border border-white/10 bg-black/25 px-2 pb-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={model.points} margin={{ top: 14, right: 18, left: 12, bottom: 20 }}>
            <CartesianGrid stroke="#2d2f36" strokeDasharray="4 4" />

            {/* Zones visuelles de lecture: rouge = pertes, vert = bénéfices. */}
            <ReferenceArea x1={0} x2={splitVolume} y1={yMin} y2={yMax} fill="#ef4444" fillOpacity={0.2} />
            <ReferenceArea x1={splitVolume} x2={xMax} y1={yMin} y2={yMax} fill="#22c55e" fillOpacity={0.16} />

            <XAxis
              dataKey="volume"
              type="number"
              domain={[0, xMax]}
              ticks={xTicks}
              stroke="#a1a1aa"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickMargin={8}
              tickFormatter={(value) => formatAxisTick(Number(value ?? 0))}
            />
            <YAxis
              type="number"
              domain={[yMin, yMax]}
              ticks={yTicks}
              stroke="#a1a1aa"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              width={82}
              tickFormatter={(value) => formatAxisTick(Number(value ?? 0))}
            />

            <Tooltip
              contentStyle={{ backgroundColor: "#111216", border: "1px solid #2a2a30", borderRadius: "10px" }}
              formatter={(value) => `${Math.round(Number(value ?? 0)).toLocaleString("fr-FR")} €`}
              labelFormatter={(value) => `Volume: ${Math.round(Number(value ?? 0)).toLocaleString("fr-FR")} €`}
            />

            <Line type="monotone" dataKey="ca" stroke="#3b82f6" strokeWidth={2.6} dot={false} name="CA" />
            <Line type="monotone" dataKey="couts" stroke="#ef4444" strokeWidth={2.6} dot={false} name="Coûts" />
            <Line type="monotone" dataKey="marge" stroke="#f59e0b" strokeWidth={2.6} dot={false} name="Marge" />

            <ReferenceLine
              x={splitVolume}
              stroke="#facc15"
              strokeDasharray="6 4"
              strokeWidth={1.8}
              label={{ value: "Point mort", position: "insideTopLeft", fill: "#facc15", fontSize: 12 }}
            />

            <ReferenceDot
              x={splitVolume}
              y={model.pointMortValeur}
              r={8}
              fill="#facc15"
              stroke="#ffffff"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Libellé d'axe externe pour éviter la coupe en bas du graphique. */}
      <p className="mt-2 text-center text-xs text-white/55">Axe X: Volume / CA (€) • Axe Y: Valeur (€)</p>

      {/* Légende métier simplifiée pour la lecture des courbes. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/75">
        <span className="inline-flex items-center gap-2 rounded-md border border-blue-400/30 bg-blue-400/10 px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" />
          CA
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-red-400/30 bg-red-400/10 px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden="true" />
          Coûts
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          Marge
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-yellow-300/30 bg-yellow-300/10 px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-yellow-300" aria-hidden="true" />
          Point mort
        </span>
      </div>

      {/* Lecture explicite avant/après: rend l'information lisible même si la zone visuelle est étroite. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-rose-400/35 bg-rose-500/12 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-200">Pertes</p>
          <p className="mt-1 text-xs text-white/80">Zone d'activité non rentable.</p>
          <p className="mt-1 text-xs text-white/60">De 0 € à {formatEuroFull(splitVolume)}</p>
        </div>
        <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/12 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200">Bénéfices</p>
          <p className="mt-1 text-xs text-white/80">Zone d'activité rentable.</p>
          <p className="mt-1 text-xs text-white/60">Au-delà de {formatEuroFull(splitVolume)}</p>
        </div>
      </div>
    </article>
  );
}

function computeNiceUpperBound(value: number, targetTicks: number): number {
  if (value <= 0) {
    return 10_000;
  }
  const step = computeNiceStep(value / targetTicks);
  return Math.ceil(value / step) * step;
}

function computeNiceLowerBound(value: number, targetTicks: number): number {
  if (value >= 0) {
    return 0;
  }
  const step = computeNiceStep(Math.abs(value) / targetTicks);
  return Math.floor(value / step) * step;
}

function buildTickArray(min: number, max: number, count: number): number[] {
  if (max <= min) {
    return [min, max];
  }
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, index) => min + step * index);
}

function computeNiceStep(rawStep: number): number {
  if (rawStep <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;

  let niceFraction = 1;
  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }

  return niceFraction * 10 ** exponent;
}

function formatAxisTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} M€`;
  }
  if (abs >= 1_000) {
    const precision = abs >= 10_000 ? 0 : 1;
    return `${(value / 1_000).toFixed(precision)} k€`;
  }
  return `${Math.round(value)} €`;
}

function formatEuroFull(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}
