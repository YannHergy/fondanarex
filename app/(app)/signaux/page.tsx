import type { Metadata } from "next";
import Link from "next/link";

import { FavoriteToggle } from "@/app/(app)/signaux/_components/favorite-toggle";
import { MarketBanner } from "@/app/(app)/signaux/_components/market-banner";
import { SignalFilters } from "@/app/(app)/signaux/_components/signal-filters";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { buildPairSignals, type PairSignal, type Recommendation } from "@/domain/signals/pairs";
import { getScoredCurrencies } from "@/lib/currencies";
import { getCurrenciesWithUpcomingNews } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { CURRENCY_COLOR_VAR, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Signaux live" };

const RECO_STYLES: Record<Recommendation, { border: string; badge: string; icon: string }> = {
  ACHETEUR: {
    border: "border-l-brand-green",
    badge: "bg-brand-green/15 text-brand-green border-brand-green/30",
    icon: "trending_up",
  },
  VENDEUR: {
    border: "border-l-brand-red",
    badge: "bg-brand-red/15 text-brand-red border-brand-red/30",
    icon: "trending_down",
  },
  NEUTRE: {
    border: "border-l-border-strong",
    badge: "bg-panel text-muted border-border-app",
    icon: "trending_flat",
  },
  ATTENDRE: {
    border: "border-l-brand-amber",
    badge: "bg-brand-amber/15 text-brand-amber border-brand-amber/30",
    icon: "schedule",
  },
};

const GROUPS = ["Majeurs", "EUR", "GBP", "Croix"] as const;

function SignalRow({ signal, favorite }: { signal: PairSignal; favorite: boolean }) {
  const style = RECO_STYLES[signal.recommendation];

  return (
    <div
      className={cn(
        "bg-surface border-border-app flex items-center gap-3 rounded-lg border border-l-4 p-3",
        style.border,
      )}
    >
      <FavoriteToggle pair={signal.pair} favorite={favorite} />

      <div className="w-24 shrink-0">
        <p className="text-fg font-mono text-sm font-bold">
          <span style={{ color: CURRENCY_COLOR_VAR[signal.base as never] }}>{signal.base}</span>
          <span className="text-subtle">/</span>
          <span style={{ color: CURRENCY_COLOR_VAR[signal.quote as never] }}>{signal.quote}</span>
        </p>
        <p className="text-subtle text-[10px]">{signal.group}</p>
      </div>

      <div className="text-subtle hidden w-28 shrink-0 font-mono text-[11px] sm:block">
        {signal.baseScore} vs {signal.quoteScore}
      </div>

      <div className="min-w-0 flex-1">
        {/* Bar grows from the centre: right for a buy, left for a sell. */}
        <div className="bg-panel relative h-1.5 overflow-hidden rounded-full">
          <div
            className={cn(
              "absolute top-0 h-full",
              signal.diff > 0 ? "bg-brand-green" : signal.diff < 0 ? "bg-brand-red" : "bg-brand-steel",
            )}
            style={{
              width: `${Math.min(50, (Math.abs(signal.diff) / 60) * 50)}%`,
              ...(signal.diff < 0 ? { right: "50%" } : { left: "50%" }),
            }}
          />
          <div className="bg-border-strong absolute top-0 left-1/2 h-full w-px" />
        </div>
      </div>

      <div className="tabular w-14 shrink-0 text-right font-mono text-sm font-bold">
        <span
          className={
            signal.diff > 0 ? "text-brand-green" : signal.diff < 0 ? "text-brand-red" : "text-muted"
          }
        >
          {signal.diff > 0 ? "+" : ""}
          {signal.diff}
        </span>
      </div>

      <div className="hidden w-16 shrink-0 items-center gap-0.5 md:flex" title={`Conviction ${signal.conviction}/5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              i < signal.conviction ? "bg-brand-blue" : "bg-panel",
            )}
          />
        ))}
      </div>

      {signal.hasUpcomingNews ? (
        <Icon
          name="campaign"
          size={14}
          className="text-brand-amber shrink-0"
          label="Publication à fort impact dans les 24 h"
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}

      <span
        className={cn(
          "flex w-24 shrink-0 items-center justify-center gap-1 rounded border px-1.5 py-1 text-[10px] font-bold tracking-wide",
          style.badge,
        )}
      >
        <Icon name={style.icon} size={11} />
        {signal.recommendation}
      </span>
    </div>
  );
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filtre?: string;
    devise?: string;
    direction?: string;
    conviction?: string;
    groupe?: string;
  }>;
}) {
  const userId = await requireUserId();
  const [{ filtre, devise, direction, conviction, groupe }, currencies, favorites, pairsWithNews] =
    await Promise.all([
      searchParams,
      getScoredCurrencies(userId),
      prisma.favoritePair.findMany({ where: { userId }, select: { instrument: true } }),
      // High-impact releases in the next 24 h downgrade a marginal signal to
      // "wait" — the release can move the pair further than the edge is worth.
      getCurrenciesWithUpcomingNews(userId),
    ]);

  const scores: Record<string, number> = {};
  for (const currency of Object.values(currencies)) {
    scores[currency.code] = currency.scores.total;
  }

  const favoriteSet = new Set(favorites.map((f) => f.instrument));
  const signals = buildPairSignals(scores, { pairsWithNews });

  const showFavorites = filtre === "favoris";
  const actionable = signals.filter(
    (s) => s.recommendation === "ACHETEUR" || s.recommendation === "VENDEUR",
  );
  const minConviction = conviction ? Number(conviction) : 0;

  const filtered = signals.filter((s) => {
    if (devise && s.base !== devise && s.quote !== devise) return false;
    if (direction && s.recommendation !== direction) return false;
    if (minConviction && s.conviction < minConviction) return false;
    if (groupe && s.group !== groupe) return false;
    return true;
  });
  const visible = showFavorites ? filtered.filter((s) => favoriteSet.has(s.pair)) : filtered;

  // Preserves the devise/direction/conviction/groupe filters when toggling
  // "Toutes les paires" / "Favoris" — otherwise switching the favourites view
  // silently discarded whatever else was selected above it.
  function hrefFor(nextFiltre: "all" | "favoris") {
    const params = new URLSearchParams();
    if (devise) params.set("devise", devise);
    if (direction) params.set("direction", direction);
    if (conviction) params.set("conviction", conviction);
    if (groupe) params.set("groupe", groupe);
    if (nextFiltre === "favoris") params.set("filtre", "favoris");
    const qs = params.toString();
    return qs ? `/signaux?${qs}` : "/signaux";
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Signaux live"
        subtitle="Écart de score fondamental entre les deux jambes de chaque paire"
      />

      <MarketBanner
        currencies={Object.values(currencies).map((currency) => ({
          code: currency.code,
          score: currency.scores.total,
        }))}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Paires suivies", value: signals.length, tone: "text-fg" },
          {
            label: "Acheteur",
            value: signals.filter((s) => s.recommendation === "ACHETEUR").length,
            tone: "text-brand-green",
          },
          {
            label: "Vendeur",
            value: signals.filter((s) => s.recommendation === "VENDEUR").length,
            tone: "text-brand-red",
          },
          {
            label: "À attendre",
            value: signals.filter((s) => s.recommendation === "ATTENDRE").length,
            tone: "text-brand-amber",
          },
          {
            label: "Neutre",
            value: signals.filter((s) => s.recommendation === "NEUTRE").length,
            tone: "text-muted",
          },
          {
            label: "4★+ conviction",
            value: signals.filter((s) => s.conviction >= 4).length,
            tone: "text-brand-blue",
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
              {stat.label}
            </p>
            <p className={cn("tabular mt-1 font-mono text-2xl font-bold", stat.tone)}>
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={hrefFor("all")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              !showFavorites
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-border-app text-muted hover:text-fg",
            )}
          >
            Toutes les paires
          </Link>
          <Link
            href={hrefFor("favoris")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              showFavorites
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-border-app text-muted hover:text-fg",
            )}
          >
            <Icon name="star" size={13} filled={showFavorites} />
            Favoris ({favoriteSet.size})
          </Link>
        </div>

        <SignalFilters />
      </div>

      {actionable.length > 0 && !showFavorites ? (
        <Card>
          <CardTitle icon="bolt">Signaux les plus convaincants</CardTitle>
          <div className="space-y-2">
            {actionable.slice(0, 5).map((signal) => (
              <SignalRow
                key={signal.pair}
                signal={signal}
                favorite={favoriteSet.has(signal.pair)}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {showFavorites ? (
        <Card>
          <CardTitle icon="star">Favoris</CardTitle>
          {visible.length > 0 ? (
            <div className="space-y-2">
              {visible.map((signal) => (
                <SignalRow key={signal.pair} signal={signal} favorite />
              ))}
            </div>
          ) : (
            <p className="text-subtle text-sm">
              Aucune paire en favori. Cliquez sur l&apos;étoile d&apos;une paire pour l&apos;ajouter.
            </p>
          )}
        </Card>
      ) : (
        GROUPS.map((group) => {
          const rows = visible.filter((s) => s.group === group);
          if (rows.length === 0) return null;
          return (
            <Card key={group}>
              <CardTitle>{group}</CardTitle>
              <div className="space-y-2">
                {rows.map((signal) => (
                  <SignalRow
                    key={signal.pair}
                    signal={signal}
                    favorite={favoriteSet.has(signal.pair)}
                  />
                ))}
              </div>
            </Card>
          );
        })
      )}

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Un signal mesure l&apos;<strong>écart</strong> entre les deux devises, pas leur force
            absolue : deux devises également fortes ne donnent aucun signal. Un écart inférieur à 5
            points est traité comme neutre, et un écart marginal juste avant une publication à fort
            impact passe en « attendre ».
          </p>
        </div>
      </Card>
    </div>
  );
}
