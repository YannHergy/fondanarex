"use client";

import { useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  gaugeShare,
  indicatorPct,
  indicatorWinner,
  type ComparedIndicator,
} from "@/domain/scoring/comparison";
import { CURRENCY_COLOR_VAR, cn } from "@/lib/utils";

/**
 * The compared indicators, drawn three ways.
 *
 * Same numbers in every mode — nothing is recomputed when the view changes.
 * Bars rank, gauges show the balance of a single indicator, and the histogram
 * puts every indicator on one shared axis so outliers stand out.
 */

type Mode = "bars" | "gauges" | "histogram";

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: "bars", label: "Barres", icon: "bar_chart" },
  { id: "gauges", label: "Jauges", icon: "speed" },
  { id: "histogram", label: "Histogramme", icon: "equalizer" },
];

export function IndicatorViews({
  indicators,
  base,
  quote,
}: {
  indicators: ComparedIndicator[];
  base: string;
  quote: string;
}) {
  const [mode, setMode] = useState<Mode>("bars");

  const baseColor = CURRENCY_COLOR_VAR[base as never] ?? "var(--color-brand-blue)";
  const quoteColor = CURRENCY_COLOR_VAR[quote as never] ?? "var(--color-brand-amber)";

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="insights" className="mb-0">
          Indicateurs comparés
        </CardTitle>

        <div className="border-border-app bg-panel flex items-center gap-0.5 rounded-lg border p-0.5">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMode(entry.id)}
              aria-pressed={mode === entry.id}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                mode === entry.id
                  ? "bg-surface text-brand-blue shadow-sm"
                  : "text-subtle hover:text-fg",
              )}
            >
              <Icon name={entry.icon} size={13} />
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
        {[
          { code: base, color: baseColor },
          { code: quote, color: quoteColor },
        ].map((entry) => (
          <span key={entry.code} className="flex items-center gap-1.5" style={{ color: entry.color }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.code}
          </span>
        ))}
        <span className="text-subtle ml-auto font-normal">
          La devise gagnante est mise en avant ; une valeur plus basse gagne quand c&apos;est
          l&apos;objectif (inflation, chômage).
        </span>
      </div>

      {mode === "bars" ? (
        <Bars indicators={indicators} baseColor={baseColor} quoteColor={quoteColor} />
      ) : mode === "gauges" ? (
        <Gauges
          indicators={indicators}
          base={base}
          quote={quote}
          baseColor={baseColor}
          quoteColor={quoteColor}
        />
      ) : (
        <Histogram indicators={indicators} baseColor={baseColor} quoteColor={quoteColor} />
      )}
    </Card>
  );
}

function Bars({
  indicators,
  baseColor,
  quoteColor,
}: {
  indicators: ComparedIndicator[];
  baseColor: string;
  quoteColor: string;
}) {
  return (
    <div className="space-y-3">
      {indicators.map((indicator) => {
        const winner = indicatorWinner(indicator);
        const basePct = indicatorPct(indicator.base, indicator.max);
        const quotePct = indicatorPct(indicator.quote, indicator.max);

        return (
          <div key={indicator.label}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span
                className="tabular w-14 font-mono font-semibold"
                style={{ color: baseColor, opacity: winner === "quote" ? 0.5 : 1 }}
              >
                {indicator.base}
                {indicator.unit ?? ""}
              </span>
              <span className="text-muted">{indicator.label}</span>
              <span
                className="tabular w-14 text-right font-mono font-semibold"
                style={{ color: quoteColor, opacity: winner === "base" ? 0.5 : 1 }}
              >
                {indicator.quote}
                {indicator.unit ?? ""}
              </span>
            </div>
            <div className="flex items-center gap-px">
              <div className="bg-panel flex h-2 flex-1 justify-end overflow-hidden rounded-l-full">
                <div
                  className="h-full rounded-l-full"
                  style={{ width: `${basePct}%`, backgroundColor: baseColor }}
                />
              </div>
              <div className="bg-panel h-2 flex-1 overflow-hidden rounded-r-full">
                <div
                  className="h-full rounded-r-full"
                  style={{ width: `${quotePct}%`, backgroundColor: quoteColor }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const GAUGE_SIZE = 116;
const GAUGE_RADIUS = 44;
const GAUGE_CX = GAUGE_SIZE / 2;
const GAUGE_CY = GAUGE_SIZE / 2 + 4;
const HALF_CIRCUMFERENCE = Math.PI * GAUGE_RADIUS;

function Gauges({
  indicators,
  base,
  quote,
  baseColor,
  quoteColor,
}: {
  indicators: ComparedIndicator[];
  base: string;
  quote: string;
  baseColor: string;
  quoteColor: string;
}) {
  return (
    <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {indicators.map((indicator) => {
        const share = gaugeShare(indicator);
        const baseLength = share.base * HALF_CIRCUMFERENCE;
        const winner = indicatorWinner(indicator);

        return (
          <div key={indicator.label} className="flex flex-col items-center">
            <svg
              viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE / 2 + 14}`}
              className="w-full max-w-28"
              role="img"
              aria-label={`${indicator.label} : ${base} ${indicator.base}${indicator.unit ?? ""} contre ${quote} ${indicator.quote}${indicator.unit ?? ""}`}
            >
              <circle
                cx={GAUGE_CX}
                cy={GAUGE_CY}
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth={11}
                stroke="currentColor"
                className="text-panel"
                strokeDasharray={`${HALF_CIRCUMFERENCE} ${HALF_CIRCUMFERENCE}`}
                transform={`rotate(-180 ${GAUGE_CX} ${GAUGE_CY})`}
              />
              <circle
                cx={GAUGE_CX}
                cy={GAUGE_CY}
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth={11}
                strokeLinecap="butt"
                stroke={baseColor}
                strokeDasharray={`${baseLength} ${HALF_CIRCUMFERENCE * 2}`}
                transform={`rotate(-180 ${GAUGE_CX} ${GAUGE_CY})`}
              />
              <circle
                cx={GAUGE_CX}
                cy={GAUGE_CY}
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth={11}
                strokeLinecap="butt"
                stroke={quoteColor}
                strokeDasharray={`${HALF_CIRCUMFERENCE - baseLength} ${HALF_CIRCUMFERENCE * 2}`}
                strokeDashoffset={-baseLength}
                transform={`rotate(-180 ${GAUGE_CX} ${GAUGE_CY})`}
              />
              <text
                x={GAUGE_CX}
                y={GAUGE_CY - 6}
                textAnchor="middle"
                className="fill-subtle text-[8px] font-bold tracking-tight uppercase"
              >
                {indicator.label.slice(0, 16)}
              </text>
            </svg>

            <div className="-mt-1 flex items-center gap-1.5 font-mono text-[11px] font-bold">
              <span style={{ color: baseColor, opacity: winner === "quote" ? 0.45 : 1 }}>
                {indicator.base}
                {indicator.unit ?? ""}
              </span>
              <span className="text-subtle">/</span>
              <span style={{ color: quoteColor, opacity: winner === "base" ? 0.45 : 1 }}>
                {indicator.quote}
                {indicator.unit ?? ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Histogram({
  indicators,
  baseColor,
  quoteColor,
}: {
  indicators: ComparedIndicator[];
  baseColor: string;
  quoteColor: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div
        className="border-border-app grid h-52 items-end gap-4 border-b-2 pb-0"
        style={{ gridTemplateColumns: `repeat(${indicators.length}, minmax(2.5rem, 1fr))` }}
      >
        {indicators.map((indicator) => {
          const basePct = indicatorPct(indicator.base, indicator.max);
          const quotePct = indicatorPct(indicator.quote, indicator.max);
          const winner = indicatorWinner(indicator);

          return (
            <div key={indicator.label} className="flex h-full flex-col justify-end">
              <div className="flex h-40 items-end justify-center gap-1">
                <div
                  className="w-1/2 max-w-5 rounded-t"
                  style={{
                    height: `${Math.max(2, basePct)}%`,
                    backgroundColor: baseColor,
                    opacity: winner === "quote" ? 0.45 : 1,
                  }}
                  title={`${indicator.base}${indicator.unit ?? ""}`}
                />
                <div
                  className="w-1/2 max-w-5 rounded-t"
                  style={{
                    height: `${Math.max(2, quotePct)}%`,
                    backgroundColor: quoteColor,
                    opacity: winner === "base" ? 0.45 : 1,
                  }}
                  title={`${indicator.quote}${indicator.unit ?? ""}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-2 grid gap-4"
        style={{ gridTemplateColumns: `repeat(${indicators.length}, minmax(2.5rem, 1fr))` }}
      >
        {indicators.map((indicator) => (
          <p
            key={indicator.label}
            className="text-subtle text-center text-[9px] leading-tight"
            title={indicator.label}
          >
            {indicator.label}
          </p>
        ))}
      </div>

      <p className="text-subtle mt-3 text-[11px]">
        Toutes les barres partagent la même échelle relative à leur propre maximum, ce qui met en
        évidence les écarts inhabituels plutôt que les grandeurs absolues.
      </p>
    </div>
  );
}
