import { Card } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import {
  dispersionLabel,
  dispersionReading,
  marketState,
  stateLabel,
  type ScoredCode,
} from "@/domain/signals/market-state";
import { cn } from "@/lib/utils";

/**
 * The regime, read from the board rather than from a volatility index.
 *
 * When the yen and franc outscore the Australian and New Zealand dollars, the
 * model is describing the conditions that DEFINE risk-off — whether or not the
 * VIX has caught up. That makes this readable with no external data at all,
 * which matters given FXMacroData is unavailable.
 */
export function MarketBanner({ currencies }: { currencies: ScoredCode[] }) {
  const state = marketState(currencies);

  const tone =
    state.state === "risk-off"
      ? { text: "text-brand-red", panel: "border-brand-red/30 bg-brand-red/10", icon: "shield" }
      : state.state === "risk-on"
        ? {
            text: "text-brand-green",
            panel: "border-brand-green/30 bg-brand-green/10",
            icon: "trending_up",
          }
        : { text: "text-muted", panel: "border-border-app bg-panel", icon: "balance" };

  return (
    <Card className={cn("border", tone.panel)}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div>
          <p className="text-subtle mb-0.5 font-mono text-[9px] tracking-widest uppercase">
            État du marché
          </p>
          <p className={cn("flex items-center gap-1.5 text-xl font-bold", tone.text)}>
            <Icon name={tone.icon} size={20} />
            {stateLabel(state.state)}
          </p>
          <p className="text-subtle mt-0.5 font-mono text-[10px]">
            refuges {state.safeHavenAvg} · cycliques {state.proCyclicalAvg} · écart{" "}
            {state.spread > 0 ? "+" : ""}
            {state.spread}
          </p>
        </div>

        <div>
          <p className="text-subtle mb-1 font-mono text-[9px] tracking-widest uppercase">
            Les plus fortes
          </p>
          <div className="flex gap-1.5">
            {state.strongest.map((entry) => (
              <span key={entry.code} className="flex items-center gap-1">
                <CurrencyBadge code={entry.code} size="sm" />
                <span className="text-brand-green font-mono text-[11px] font-bold">
                  {Math.round(entry.score)}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-subtle mb-1 font-mono text-[9px] tracking-widest uppercase">
            Les plus faibles
          </p>
          <div className="flex gap-1.5">
            {state.weakest.map((entry) => (
              <span key={entry.code} className="flex items-center gap-1">
                <CurrencyBadge code={entry.code} size="sm" />
                <span className="text-brand-red font-mono text-[11px] font-bold">
                  {Math.round(entry.score)}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="ml-auto">
          <p className="text-subtle mb-0.5 font-mono text-[9px] tracking-widest uppercase">
            Dispersion
          </p>
          <p
            className={cn(
              "font-mono text-lg font-bold",
              state.dispersion === "high"
                ? "text-brand-green"
                : state.dispersion === "medium"
                  ? "text-brand-amber"
                  : "text-brand-red",
            )}
          >
            {dispersionLabel(state.dispersion)}
          </p>
          <p className="text-subtle font-mono text-[10px]">amplitude {state.range} pts</p>
        </div>
      </div>

      <p className="text-subtle border-border-app mt-3 border-t pt-2 text-[11px] leading-relaxed">
        {dispersionReading(state.dispersion)}
      </p>
    </Card>
  );
}
