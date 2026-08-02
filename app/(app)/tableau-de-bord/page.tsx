import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { getIndicatorDisplay } from "@/domain/scoring";
import type { CurrencyWithScore, MarketContext } from "@/domain/types";
import { getMarketContext, getScoredCurrencyList } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { scoreVerdict } from "@/lib/score-display";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

/**
 * Macro dashboard — one card per currency, ranked by score.
 *
 * The card colour ramps below use different thresholds from the shared
 * score-display helpers (65/55/45/35 rather than 70/60/45/30). That is not an
 * oversight: it is what the legacy dashboard used, and changing it would shift
 * the colour of cards read every day. The verdict text still comes from the
 * domain thresholds, so label and colour disagree at the margins exactly as
 * they did before.
 */

function scoreTextColor(score: number): string {
  if (score >= 65) return "text-brand-cyan";
  if (score >= 55) return "text-brand-green";
  if (score >= 45) return "text-brand-amber";
  if (score >= 35) return "text-brand-red/80";
  return "text-brand-red";
}

function scoreBarClass(score: number): string {
  if (score >= 65) return "from-brand-green to-brand-cyan bg-gradient-to-r";
  if (score >= 45) return "bg-brand-amber";
  return "from-brand-red/70 to-brand-red bg-gradient-to-r";
}

function scoreStripClass(score: number): string {
  if (score >= 65) return "from-brand-green via-brand-cyan to-brand-blue bg-gradient-to-r";
  if (score >= 45) return "bg-brand-amber/70";
  return "from-brand-red to-brand-red/50 bg-gradient-to-r";
}

function verdictBadgeClass(score: number): string {
  if (score >= 80) return "text-brand-cyan border-brand-cyan/40 bg-brand-cyan/10";
  if (score >= 65) return "text-brand-green border-brand-green/40 bg-brand-green/10";
  if (score >= 45) return "text-brand-amber border-brand-amber/40 bg-brand-amber/10";
  if (score >= 30) return "text-brand-red/80 border-brand-red/30 bg-brand-red/10";
  return "text-brand-red border-brand-red/50 bg-brand-red/10";
}

function stanceColor(stance: string): string {
  if (stance === "Very Hawkish") return "text-brand-cyan";
  if (stance === "Hawkish") return "text-brand-green/70";
  if (stance === "Very Dovish") return "text-brand-red";
  if (stance === "Dovish") return "text-brand-red/70";
  return "text-subtle";
}

/** French label for a stance. The legacy card showed the raw English enum. */
const STANCE_FR: Record<string, string> = {
  "Very Hawkish": "Très restrictive",
  Hawkish: "Restrictive",
  Neutral: "Neutre",
  Dovish: "Accommodante",
  "Very Dovish": "Très accommodante",
};

function verdictIcon(score: number): string {
  if (score >= 55) return "trending_up";
  if (score >= 45) return "trending_flat";
  return "trending_down";
}

/** Colour of a driver's value, by its contribution to the score. */
function driverColor(score: number | null, available: boolean): string {
  if (!available || score === null) return "text-subtle";
  if (score >= 4) return "text-brand-green";
  if (score > 0) return "text-brand-green/70";
  if (score === 0) return "text-muted";
  if (score > -4) return "text-brand-red/70";
  return "text-brand-red";
}

/**
 * The four highest-weighted indicators of the currency's OWN profile — the
 * point of the per-currency scoring model. The engine already sorts
 * `breakdown` by descending weight.
 */
function topDrivers(currency: CurrencyWithScore, ctx: MarketContext) {
  return (currency.scores.breakdown ?? []).slice(0, 4).map((indicator) => {
    const display = getIndicatorDisplay(indicator.id, currency, ctx, indicator.score);
    return {
      id: indicator.id,
      label: display.label,
      value: display.value,
      poids: indicator.poids,
      score: indicator.score,
      available: display.available && indicator.disponible,
    };
  });
}

function formatLastSync(date: Date | null): string {
  if (!date) return "Jamais synchronisé";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

export default async function DashboardPage() {
  const userId = await requireUserId();

  const [currencies, marketContext, lastSync] = await Promise.all([
    getScoredCurrencyList(userId),
    getMarketContext(userId),
    prisma.indicatorValue.aggregate({ _max: { fetchedAt: true } }),
  ]);

  const sorted = [...currencies].sort((a, b) => b.scores.total - a.scores.total);

  return (
    <div className="space-y-8 p-6 pb-16 md:p-10">
      <div className="border-border-app border-b pb-5">
        <PageHeader
          title="Tableau de bord macro"
          subtitle="Scoring institutionnel G10 · 8 devises · 0 – 100"
        >
          <div className="text-subtle flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase">
            <span className="bg-brand-cyan h-1.5 w-1.5 rounded-full" />
            {formatLastSync(lastSync._max.fetchedAt)}
          </div>
        </PageHeader>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <p className="text-muted text-sm">
            Aucune devise chargée. Vérifiez que les données de référence ont été insérées (
            <code className="font-mono text-xs">pnpm db:seed</code>).
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((currency, rank) => {
          const total = currency.scores.total;
          const drivers = topDrivers(currency, marketContext);

          return (
            <article
              key={currency.code}
              className="bg-surface border-border-app relative overflow-hidden rounded-xl border transition-all duration-300"
            >
              <div className={cn("h-[2px] w-full", scoreStripClass(total))} />

              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <CurrencyBadge code={currency.code} size="lg" />
                    <div>
                      <div className="text-fg text-lg leading-none font-bold tracking-[0.1em]">
                        {currency.code}
                      </div>
                      <div className="text-subtle mt-1.5 text-[10px] tracking-widest uppercase">
                        {currency.name}
                      </div>
                      {currency.scores.moteurN1 ? (
                        <div className="bg-brand-cyan/10 border-brand-cyan/25 text-brand-cyan/90 mt-2 inline-flex max-w-[150px] items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[8px] tracking-wider uppercase">
                          <Icon name="bolt" size={8} className="shrink-0" />
                          <span className="truncate">{currency.scores.moteurN1}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold tracking-wider uppercase",
                      verdictBadgeClass(total),
                    )}
                  >
                    <Icon name={verdictIcon(total)} size={11} />
                    {scoreVerdict(total)}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-subtle font-mono text-[10px] tracking-widest uppercase">
                      Baissier
                    </span>
                    <span
                      className={cn(
                        "tabular font-mono text-2xl leading-none font-bold",
                        scoreTextColor(total),
                      )}
                    >
                      {total}
                      <span className="text-subtle ml-0.5 text-sm font-normal">/100</span>
                    </span>
                    <span className="text-subtle font-mono text-[10px] tracking-widest uppercase">
                      Haussier
                    </span>
                  </div>
                  <div className="bg-panel h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn("h-full rounded-full", scoreBarClass(total))}
                      style={{ width: `${total}%` }}
                    />
                  </div>
                </div>

                <div className="border-border-app grid grid-cols-4 gap-0 border-t pt-4">
                  {drivers.map((d, i) => (
                    <div
                      key={d.id}
                      className={cn(
                        "px-0.5 text-center",
                        i < drivers.length - 1 && "border-border-app border-r",
                      )}
                    >
                      <p className="text-subtle mb-1.5 truncate font-mono text-[8px] tracking-wider uppercase">
                        {d.label}
                        <span className="ml-0.5 opacity-60">{d.poids}%</span>
                      </p>
                      <p
                        className={cn(
                          "tabular truncate font-mono text-[12px] font-semibold",
                          driverColor(d.score, d.available),
                        )}
                      >
                        {d.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-border-app flex items-center justify-between border-t pt-3 font-mono text-[10px]">
                  <span className="text-subtle">
                    #{rank + 1}
                    <span className="opacity-60">/{sorted.length}</span>
                  </span>
                  <span className={cn("tracking-widest uppercase", stanceColor(currency.stance))}>
                    {STANCE_FR[currency.stance] ?? currency.stance}
                  </span>
                </div>

                <div className="border-border-app flex gap-2 border-t pt-3">
                  <Link
                    href={`/devise/${currency.code}`}
                    className="border-border-app text-muted hover:text-fg hover:border-border-strong flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 font-mono text-[10px] tracking-wide uppercase transition-all"
                  >
                    <Icon name="open_in_new" size={10} /> Analyse
                  </Link>
                  <Link
                    href={`/profils?devise=${currency.code}`}
                    className="border-border-app text-muted hover:text-brand-blue hover:border-brand-blue/30 flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 font-mono text-[10px] tracking-wide uppercase transition-all"
                  >
                    <Icon name="public" size={10} /> Profil
                  </Link>
                  <Link
                    href={`/calendrier?devise=${currency.code}`}
                    className="border-border-app text-muted hover:text-brand-cyan hover:border-brand-cyan/30 flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 font-mono text-[10px] tracking-wide uppercase transition-all"
                  >
                    <Icon name="calendar_month" size={10} /> News
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
