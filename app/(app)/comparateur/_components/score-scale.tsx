import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import type { CurrencyWithScore } from "@/domain/types";
import { CURRENCY_COLOR_VAR, isCurrencyCode } from "@/lib/utils";

/**
 * The eight currencies as points on a single 0–100 scale.
 *
 * Answers in one glance what the relative-strength matrix answers in 64 cells:
 * who leads, who trails, and — more useful — how BIG the gaps are. A matrix
 * shows every pairwise difference but flattens the distribution; here a cluster
 * of six currencies inside five points is immediately visible, and so is a
 * lone outlier worth trading against the rest.
 */

const WIDTH = 760;
const HEIGHT = 128;
const PAD_X = 40;
const AXIS_Y = 84;

/**
 * Vertical offset so two currencies with near-identical scores do not draw on
 * top of each other. Points are walked in score order and nudged up a row
 * whenever the previous one is closer than this many score points.
 */
const COLLISION_GAP = 6;

export function ScoreScale({ currencies }: { currencies: CurrencyWithScore[] }) {
  const sorted = [...currencies].sort((a, b) => a.scores.total - b.scores.total);

  const x = (score: number) => PAD_X + (score / 100) * (WIDTH - PAD_X * 2);

  // Assign each point a "lane" above the axis, reusing lane 0 whenever there
  // is room, so labels stay readable without moving the points themselves.
  const placed = sorted.reduce<Array<{ currency: CurrencyWithScore; lane: number }>>(
    (acc, currency) => {
      const previous = acc.at(-1);
      const crowded =
        previous !== undefined && currency.scores.total - previous.currency.scores.total < COLLISION_GAP;
      acc.push({ currency, lane: crowded ? previous.lane + 1 : 0 });
      return acc;
    },
    [],
  );

  return (
    <Card className="overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="scatter_plot" className="mb-0">
          Position des devises
        </CardTitle>
        <span className="text-subtle text-[11px]">Score sur 100 · vente à gauche, achat à droite</span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[128px] w-full min-w-[34rem]"
        role="img"
        aria-label="Score de chaque devise sur une échelle de 0 à 100"
      >
        {/* Zones de verdict, pour situer un point sans lire l'axe */}
        <rect x={x(0)} y={AXIS_Y - 5} width={x(45) - x(0)} height="10" fill="var(--color-brand-red)" opacity="0.10" />
        <rect x={x(45)} y={AXIS_Y - 5} width={x(60) - x(45)} height="10" fill="var(--color-brand-amber)" opacity="0.10" />
        <rect x={x(60)} y={AXIS_Y - 5} width={x(100) - x(60)} height="10" fill="var(--color-brand-green)" opacity="0.10" />

        <line x1={PAD_X} x2={WIDTH - PAD_X} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--color-border-app)" strokeWidth="1" />

        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={AXIS_Y - 5}
              y2={AXIS_Y + 5}
              stroke="var(--color-border-app)"
              strokeWidth="1"
            />
            <text
              x={x(tick)}
              y={AXIS_Y + 18}
              textAnchor="middle"
              className="fill-[var(--color-subtle)] font-mono text-[9px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {placed.map(({ currency, lane: row }) => {
          const colour = isCurrencyCode(currency.code)
            ? CURRENCY_COLOR_VAR[currency.code]
            : "var(--color-brand-steel)";
          const cx = x(currency.scores.total);
          const cy = AXIS_Y - 22 - row * 20;

          return (
            <g key={currency.code}>
              <line x1={cx} x2={cx} y1={cy + 5} y2={AXIS_Y - 5} stroke={colour} strokeWidth="1" opacity="0.35" />
              <circle cx={cx} cy={cy} r="5" fill={colour} />
              <text
                x={cx}
                y={cy - 9}
                textAnchor="middle"
                className="font-mono text-[10px] font-bold"
                fill={colour}
              >
                {currency.code} {currency.scores.total.toFixed(0)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
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
