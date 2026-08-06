"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CapturePanel } from "@/app/(app)/graphiques/_components/capture-panel";
import { TradingViewChart } from "@/app/(app)/graphiques/_components/tv-chart";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { scoreVerdict, TIMEFRAMES } from "@/domain/charts/timeframes";
import { getCorrelation } from "@/domain/data/correlations";
import { pairFundamentalBias } from "@/domain/plan/week-plan";
import type { CurrencyWithScore } from "@/domain/types";
import type { CaptureRow } from "@/lib/chart-captures";
import { cn } from "@/lib/utils";

export interface OpenTrade {
  id: string;
  pair: string;
  direction: "buy" | "sell";
}

const BIAS_TONE = {
  Bullish: "text-brand-green",
  Bearish: "text-brand-red",
  Neutral: "text-brand-amber",
} as const;

/** Correlation strong enough to be worth warning about. */
const ALERT_THRESHOLD = 60;

export function ChartsView({
  pairs,
  currencies,
  openTrades,
  captures,
  capturePair,
  stagedCounts,
  lastConsensus,
}: {
  pairs: string[];
  currencies: CurrencyWithScore[];
  openTrades: OpenTrade[];
  captures: CaptureRow[];
  capturePair: string;
  stagedCounts: Record<string, number>;
  lastConsensus: { code: string; bias: string; confidence: number }[] | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pair, setPair] = useState(pairs[0] ?? "EUR/USD");
  const [interval, setInterval] = useState("60");
  const [panelOpen, setPanelOpen] = useState(true);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // TradingView needs the theme at mount, and it is not a React value — read
  // the same signal the stylesheet uses.
  //
  // THE SIGNAL IS THE `dark` CLASS ON <html>, set by the theme provider and
  // consumed by `@custom-variant dark` in globals.css. This used to read
  // `dataset.theme`, an attribute nothing ever sets, so it always fell through
  // to `prefers-color-scheme` — and asked TradingView for a WHITE chart inside
  // a dark page on any browser defaulting to light. Worse, resolving to
  // "light" after the first paint re-ran the mount effect below and tore down
  // the container while the widget script was still loading, which crashed it
  // outright and left a blank rectangle.
  //
  // MutationObserver rather than a media query alone: the class flips when the
  // reader uses the in-app theme toggle, which no media query reports.
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");

    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const fundamental = useMemo(() => pairFundamentalBias(pair, currencies), [pair, currencies]);

  /**
   * Open trades on pairs correlated with the one on screen.
   *
   * This is the double-exposure warning: taking the same direction on two
   * strongly correlated pairs is one position at twice the size, and the risk
   * calculator on each of them says otherwise.
   */
  const correlationAlerts = useMemo(
    () =>
      openTrades
        .map((trade) => ({ trade, correlation: getCorrelation(pair, trade.pair) }))
        .filter(({ trade, correlation }) => trade.pair !== pair && Math.abs(correlation) >= ALERT_THRESHOLD)
        .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
    [pair, openTrades],
  );

  const consensusForPair = useMemo(() => {
    if (!lastConsensus) return [];
    return [fundamental.base, fundamental.quote]
      .map((code) => lastConsensus.find((entry) => entry.code === code))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  }, [lastConsensus, fundamental]);

  function openCapturePanel(nextPair: string) {
    setCaptureOpen(true);
    if (nextPair !== capturePair) {
      // The staged captures come from the server, so switching pair is a URL
      // change rather than client state that would have to refetch by hand.
      const params = new URLSearchParams(searchParams.toString());
      params.set("captures", nextPair);
      router.replace(`/graphiques?${params.toString()}`, { scroll: false });
    }
  }

  return (
    <div className="flex h-[calc(100vh-1px)] flex-col overflow-hidden">
      {correlationAlerts.length > 0 ? (
        <div className="border-brand-amber/30 bg-brand-amber/10 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-1.5 text-xs">
          <Icon name="warning" size={13} className="text-brand-amber shrink-0" />
          <span className="text-brand-amber font-semibold">Double exposition</span>
          {correlationAlerts.map(({ trade, correlation }) => (
            <span key={trade.id} className="text-muted">
              {trade.pair} ({trade.direction === "buy" ? "achat" : "vente"}) — corrélation{" "}
              {correlation > 0 ? "+" : ""}
              {correlation}
            </span>
          ))}
        </div>
      ) : null}

      <div className="border-border-app bg-surface flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <select
          aria-label="Paire"
          value={pair}
          onChange={(event) => setPair(event.target.value)}
          className="bg-panel border-border-app text-fg focus:border-brand-blue rounded-lg border px-3 py-1.5 font-mono text-sm font-bold focus:outline-none"
        >
          {pairs.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
              {stagedCounts[symbol] ? ` (${stagedCounts[symbol]})` : ""}
            </option>
          ))}
        </select>

        <div className="bg-border-app h-5 w-px" />

        <div className="flex flex-wrap gap-1">
          {TIMEFRAMES.map((timeframe) => (
            <button
              key={timeframe.value}
              type="button"
              onClick={() => setInterval(timeframe.value)}
              className={cn(
                "rounded px-2 py-1 text-xs font-bold transition-colors",
                interval === timeframe.value
                  ? "bg-brand-blue text-white"
                  : "border-border-app text-subtle hover:text-fg border",
              )}
            >
              {timeframe.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => openCapturePanel(pair)}
          className="bg-brand-violet/10 text-brand-violet border-brand-violet/20 hover:bg-brand-violet/20 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
        >
          <Icon name="layers" size={13} />
          Multi-TF
          {stagedCounts[pair] ? (
            <span className="bg-brand-violet rounded-full px-1.5 text-[10px] text-white">
              {stagedCounts[pair]}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-label={panelOpen ? "Masquer le contexte" : "Afficher le contexte"}
          className="border-border-app text-subtle hover:text-fg rounded-lg border p-1.5"
        >
          <Icon
            name="chevron_right"
            size={14}
            className={cn("transition-transform", panelOpen && "rotate-180")}
          />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1">
            <TradingViewChart pair={pair} interval={interval} theme={theme} />
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-1.5 text-xs",
              fundamental.bias === "Bullish"
                ? "border-brand-green/30 bg-brand-green/10"
                : fundamental.bias === "Bearish"
                  ? "border-brand-red/30 bg-brand-red/10"
                  : "border-brand-amber/30 bg-brand-amber/10",
            )}
          >
            <span className="text-subtle">Biais fondamental</span>
            <span className="text-muted">
              {fundamental.base} {scoreVerdict(fundamental.baseScore)} ({fundamental.baseScore})
            </span>
            <span className="text-subtle">contre</span>
            <span className="text-muted">
              {fundamental.quote} {scoreVerdict(fundamental.quoteScore)} ({fundamental.quoteScore})
            </span>
            <Icon name="arrow_forward" size={12} className="text-subtle" />
            <span className={cn("font-bold", BIAS_TONE[fundamental.bias])}>
              {fundamental.bias}
            </span>
          </div>
        </div>

        {panelOpen ? (
          <aside className="border-border-app bg-surface w-64 shrink-0 overflow-y-auto border-l">
            <div className="border-border-app border-b px-4 py-3">
              <p className="text-subtle text-[10px] font-bold tracking-widest uppercase">
                Scores macro
              </p>
              {[
                { code: fundamental.base, score: fundamental.baseScore },
                { code: fundamental.quote, score: fundamental.quoteScore },
              ].map((entry) => (
                <div key={entry.code} className="mt-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <CurrencyBadge code={entry.code} size="sm" />
                    <span className="text-muted font-mono">
                      {entry.score} · {scoreVerdict(entry.score)}
                    </span>
                  </div>
                  <div className="bg-panel h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        entry.score >= 65
                          ? "bg-brand-green"
                          : entry.score >= 45
                            ? "bg-brand-amber"
                            : "bg-brand-red",
                      )}
                      style={{ width: `${Math.max(0, Math.min(100, entry.score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-border-app border-b px-4 py-3">
              <p className="text-subtle mb-2 text-[10px] font-bold tracking-widest uppercase">
                Dernier briefing IA
              </p>
              {consensusForPair.length === 0 ? (
                <p className="text-subtle text-xs italic">Aucun briefing enregistré.</p>
              ) : (
                consensusForPair.map((entry) => (
                  <div key={entry.code} className="mb-1 flex items-center justify-between text-xs">
                    <CurrencyBadge code={entry.code} size="sm" />
                    <span
                      className={cn(
                        "font-semibold",
                        entry.bias === "Bullish"
                          ? "text-brand-green"
                          : entry.bias === "Bearish"
                            ? "text-brand-red"
                            : "text-subtle",
                      )}
                    >
                      {entry.bias} {entry.confidence} %
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="border-border-app border-b px-4 py-3">
              <p className="text-subtle mb-2 text-[10px] font-bold tracking-widest uppercase">
                Corrélations
              </p>
              {correlationAlerts.length === 0 ? (
                <p className="text-subtle text-xs italic">
                  {openTrades.length === 0
                    ? "Aucune position ouverte."
                    : "Aucune double exposition."}
                </p>
              ) : (
                correlationAlerts.map(({ trade, correlation }) => (
                  <p key={trade.id} className="text-brand-amber mb-1 text-xs">
                    {trade.pair} {correlation > 0 ? "+" : ""}
                    {correlation}
                  </p>
                ))
              )}
            </div>

            <div className="px-4 py-3">
              <p className="text-subtle mb-2 text-[10px] font-bold tracking-widest uppercase">
                Positions ouvertes
              </p>
              {openTrades.length === 0 ? (
                <p className="text-subtle text-xs italic">Aucune.</p>
              ) : (
                openTrades.map((trade) => (
                  <div key={trade.id} className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted font-mono">{trade.pair}</span>
                    <span
                      className={cn(
                        "font-semibold",
                        trade.direction === "buy" ? "text-brand-green" : "text-brand-red",
                      )}
                    >
                      {trade.direction === "buy" ? "Achat" : "Vente"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {captureOpen ? (
        <CapturePanel
          pair={capturePair}
          pairs={pairs}
          captures={captures}
          onPairChange={openCapturePanel}
          onClose={() => setCaptureOpen(false)}
        />
      ) : null}
    </div>
  );
}
