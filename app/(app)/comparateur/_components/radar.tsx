import { Card, CardTitle } from "@/components/ui/card";
import { pointsToSvg, radarPoints, radarRing } from "@/domain/scoring/comparison";
import { CURRENCY_COLOR_VAR } from "@/lib/utils";

const SIZE = 320;
const CENTRE = SIZE / 2;
const RADIUS = CENTRE * 0.68;
const RINGS = [0.25, 0.5, 0.75, 1];

export interface RadarAxis {
  key: string;
  label: string;
  base: number;
  quote: number;
}

/**
 * Seven-axis score radar for the pair.
 *
 * The two polygons overlap deliberately: the shape of the gap is the
 * comparison. A table of the same numbers says which is larger; the radar says
 * WHERE the advantage sits, which is the question the screen exists to answer.
 */
export function ScoreRadar({
  axes,
  base,
  quote,
}: {
  axes: RadarAxis[];
  base: string;
  quote: string;
}) {
  const baseColor = CURRENCY_COLOR_VAR[base as never] ?? "var(--color-brand-blue)";
  const quoteColor = CURRENCY_COLOR_VAR[quote as never] ?? "var(--color-brand-amber)";

  const spokes = radarRing(axes.length, CENTRE, RADIUS, 1);
  const labels = radarRing(axes.length, CENTRE, RADIUS + 22, 1);

  const basePolygon = pointsToSvg(
    radarPoints(
      axes.map((a) => ({ key: a.key, label: a.label, value: a.base })),
      CENTRE,
      RADIUS,
    ),
  );
  const quotePolygon = pointsToSvg(
    radarPoints(
      axes.map((a) => ({ key: a.key, label: a.label, value: a.quote })),
      CENTRE,
      RADIUS,
    ),
  );

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="radar" className="mb-0">
          Radar des scores
        </CardTitle>
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          {[
            { code: base, color: baseColor },
            { code: quote, color: quoteColor },
          ].map((entry) => (
            <span key={entry.code} className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.code}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full max-w-sm overflow-visible"
          role="img"
          aria-label={`Radar comparant ${base} et ${quote} sur ${axes.length} familles d'indicateurs`}
        >
          {RINGS.map((fraction) => (
            <polygon
              key={fraction}
              points={pointsToSvg(radarRing(axes.length, CENTRE, RADIUS, fraction))}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              className="text-border-app"
            />
          ))}

          {spokes.map((end, index) => (
            <line
              key={axes[index]?.key ?? index}
              x1={CENTRE}
              y1={CENTRE}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border-app"
            />
          ))}

          {labels.map((point, index) => (
            <text
              key={axes[index]?.key ?? index}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-subtle text-[9px] font-bold tracking-tight uppercase"
            >
              {axes[index]?.label}
            </text>
          ))}

          {/* Quote first so the base polygon reads on top — the base currency
           * is the subject of the comparison. */}
          <polygon
            points={quotePolygon}
            fill={quoteColor}
            fillOpacity={0.18}
            stroke={quoteColor}
            strokeWidth={2}
          />
          <polygon
            points={basePolygon}
            fill={baseColor}
            fillOpacity={0.18}
            stroke={baseColor}
            strokeWidth={2}
          />
        </svg>
      </div>

      <p className="text-subtle mt-2 text-center text-[11px]">
        Le centre vaut -10, le bord extérieur +10. Une devise neutre dessine un polygone à
        mi-chemin, pas un point.
      </p>
    </Card>
  );
}
