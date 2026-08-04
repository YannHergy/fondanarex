import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import type { CurrencyWithScore } from "@/domain/types";
import { CURRENCY_COLOR_VAR, isCurrencyCode } from "@/lib/utils";

/**
 * The eight currencies as points on a vertical 0–100 scale.
 *
 * Vertical rather than horizontal because "higher is stronger" needs no
 * explaining, while a left-to-right score has to be read off an axis first.
 * It also gives each currency its own column, so labels never collide however
 * close two scores are — the horizontal version needed a lane-stacking
 * workaround for exactly that.
 *
 * Answers in one glance what the relative-strength matrix answers in 64 cells,
 * and shows something the matrix cannot: the DISTRIBUTION. Six currencies
 * bunched inside five points is immediately visible, and so is a lone outlier
 * worth trading against the rest.
 */

const WIDTH = 720;
const HEIGHT = 300;
const PAD_TOP = 22;
const PAD_BOTTOM = 34;
const PAD_LEFT = 34;

export function ScoreScale({ currencies }: { currencies: CurrencyWithScore[] }) {
  // Strongest on the right, so the eye reads the ranking left to right while
  // the height carries the value.
  const sorted = [...currencies].sort((a, b) => a.scores.total - b.scores.total);

  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const y = (score: number) => PAD_TOP + (1 - score / 100) * plotHeight;
  const columnWidth = (WIDTH - PAD_LEFT) / sorted.length;
  const x = (i: number) => PAD_LEFT + columnWidth * (i + 0.5);

  return (
    <Card className="overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="leaderboard" className="mb-0">
          Position des devises
        </CardTitle>
        <span className="text-subtle text-[11px]">Score sur 100 · plus haut = plus fort</span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[300px] w-full min-w-[30rem]"
        role="img"
        aria-label="Score de chaque devise sur une échelle verticale de 0 à 100"
      >
        {/* Zones de verdict en bandes horizontales, pour situer une devise
         * sans avoir à lire la graduation. */}
        <rect x={PAD_LEFT} y={y(100)} width={WIDTH - PAD_LEFT} height={y(60) - y(100)} fill="var(--color-brand-green)" opacity="0.07" />
        <rect x={PAD_LEFT} y={y(60)} width={WIDTH - PAD_LEFT} height={y(45) - y(60)} fill="var(--color-brand-amber)" opacity="0.07" />
        <rect x={PAD_LEFT} y={y(45)} width={WIDTH - PAD_LEFT} height={y(0) - y(45)} fill="var(--color-brand-red)" opacity="0.07" />

        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-border-app)"
              strokeWidth="1"
              strokeDasharray={tick === 50 ? "4 3" : undefined}
            />
            <text
              x={PAD_LEFT - 7}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-[var(--color-subtle)] font-mono text-[9px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {sorted.map((currency, i) => {
          const colour = isCurrencyCode(currency.code)
            ? CURRENCY_COLOR_VAR[currency.code]
            : "var(--color-brand-steel)";
          const cx = x(i);
          const cy = y(currency.scores.total);

          return (
            <g key={currency.code}>
              {/* Tige jusqu'au bas du graphique : elle relie le point à son
               * étiquette et rend la hauteur lisible sans suivre la grille. */}
              <line
                x1={cx}
                x2={cx}
                y1={cy}
                y2={y(0)}
                stroke={colour}
                strokeWidth="1.5"
                opacity="0.3"
              />
              <circle cx={cx} cy={cy} r="6" fill={colour} />
              <text
                x={cx}
                y={cy - 12}
                textAnchor="middle"
                className="font-mono text-[12px] font-bold"
                fill={colour}
              >
                {currency.scores.total.toFixed(0)}
              </text>
              <text
                x={cx}
                y={HEIGHT - 14}
                textAnchor="middle"
                className="font-mono text-[11px] font-bold"
                fill={colour}
              >
                {currency.code}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {[...currencies]
          .sort((a, b) => b.scores.total - a.scores.total)
          .map((c) => (
            <Link
              key={c.code}
              href={`/devise/${c.code.toLowerCase()}`}
              className="text-muted hover:text-fg flex items-center gap-1.5 text-[11px] transition-colors"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: isCurrencyCode(c.code)
                    ? CURRENCY_COLOR_VAR[c.code]
                    : "var(--color-brand-steel)",
                }}
              />
              <span className="font-mono font-bold">{c.code}</span>
              <span className="tabular font-mono">{c.scores.total.toFixed(0)}</span>
            </Link>
          ))}
      </div>
    </Card>
  );
}
