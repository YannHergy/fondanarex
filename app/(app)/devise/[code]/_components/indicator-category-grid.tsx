import Link from "next/link";

import { MANUAL_CHECK_TITLE, needsManualCheck } from "@/app/(app)/devise/[code]/_lib/data-source-flag";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getCurrencyProfile, indicatorKind } from "@/domain/data/currency-weights";
import { getIndicatorDisplay } from "@/domain/scoring";
import type { CurrencyWithScore, MarketContext } from "@/domain/types";
import { hasIndicatorHistory } from "@/lib/integrations/fxmacrodata";
import { cn } from "@/lib/utils";

/**
 * Four fixed buckets, currency-specific contents.
 *
 * Every currency keeps its OWN weighted indicators (see currency-weights.ts) —
 * JPY and CHF have no PMI or employment indicator at all, AUD/NZD carry a
 * commodity and a China-demand indicator that USD/EUR/GBP never show. A
 * category card that would be empty for this currency is simply omitted
 * rather than rendered with nothing in it.
 */
const CATEGORIES = [
  { key: "monetary", label: "Politique monétaire", icon: "percent", kinds: ["taux", "orientation", "interventions"] },
  { key: "growth", label: "Croissance & Activité", icon: "trending_up", kinds: ["pib", "pmi_manu", "pmi_serv", "chine", "risque", "zew", "ifo"] },
  { key: "inflation", label: "Inflation & Prix", icon: "payments", kinds: ["cpi", "core_cpi", "hicp", "core_hicp", "cpi_tokyo"] },
  { key: "trade", label: "Emploi & Trade", icon: "work", kinds: ["emploi", "nfp", "chomage", "salaires", "balance", "retail", "eurchf", "fer", "petrole", "laitiers", "us"] },
] as const;

/**
 * Indicator kind -> the CurrencyData field carrying its previous value and
 * next release date. Kinds with no entry here (risque, chine, fer, orientation,
 * interventions...) have no such field in the domain model yet — their cards
 * show the current value only, honestly, rather than a fabricated "Prev".
 */
const FIELD_FOR_KIND: Record<string, string> = {
  taux: "interestRate",
  cpi: "cpi",
  hicp: "cpi",
  core_cpi: "coreCpi",
  core_hicp: "coreCpi",
  pib: "gdpQoQ",
  chomage: "unemployment",
  salaires: "wagePPI",
  pmi_manu: "pmiManufacturing",
  pmi_serv: "pmiServices",
  retail: "retailSales",
  balance: "tradeBalance",
  nfp: "nfp",
  zew: "zew",
  ifo: "ifo",
  cpi_tokyo: "tokyoCpi",
  emploi: "employmentChange",
};

function isStale(dateStr: string | undefined, now: Date): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime()) && date < now;
}

export function IndicatorCategoryGrid({
  currency,
  marketContext,
}: {
  currency: CurrencyWithScore;
  marketContext: MarketContext;
}) {
  const profile = getCurrencyProfile(currency.code);
  if (!profile) return null;

  const now = new Date();
  const scoreById = new Map((currency.scores.breakdown ?? []).map((b) => [b.id, b.score]));

  const populated = CATEGORIES.map((category) => {
    const kinds: readonly string[] = category.kinds;
    const indicators = profile.indicateurs.filter((indicator) =>
      kinds.includes(indicatorKind(indicator.id)),
    );
    return { ...category, indicators };
  }).filter((category) => category.indicators.length > 0);

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
      {populated.map((category) => (
        <Card key={category.key}>
          <CardTitle icon={category.icon}>{category.label}</CardTitle>
          <div className="space-y-2.5">
            {category.indicators.map((indicator) => {
              const kind = indicatorKind(indicator.id);
              const display = getIndicatorDisplay(
                indicator.id,
                currency,
                marketContext,
                scoreById.get(indicator.id) ?? null,
              );
              const field = FIELD_FOR_KIND[kind];
              const previous = field ? currency.previousData[field] : undefined;
              const nextDate = field ? currency.nextReleases[field] : undefined;
              const stale = isStale(nextDate, now);
              const clickable = field && hasIndicatorHistory(field);
              const manualCheck = needsManualCheck(field, currency.dataSources);

              const content = (
                <>
                  <p className="text-subtle flex items-center justify-between gap-1 text-[10px] font-bold tracking-wide uppercase">
                    <span className="flex items-center gap-1">
                      {indicator.nom}
                      {manualCheck ? (
                        <span title={MANUAL_CHECK_TITLE} className="text-brand-amber shrink-0">
                          ★
                        </span>
                      ) : null}
                    </span>
                    {clickable ? <Icon name="show_chart" size={11} className="text-brand-blue shrink-0" /> : null}
                  </p>
                  <p
                    className={cn(
                      "tabular mt-1 font-mono text-lg font-bold",
                      display.available ? "text-fg" : "text-subtle",
                    )}
                  >
                    {display.value}
                  </p>
                  <p className="text-subtle mt-0.5 flex items-center gap-1 text-[10px]">
                    <span className="bg-border-strong h-1.5 w-1.5 rounded-full" />
                    Prev : {typeof previous === "number" ? previous : "—"}
                  </p>
                  <span
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold",
                      stale
                        ? "border-brand-red/40 bg-brand-red/10 text-brand-red"
                        : "border-border-app text-subtle",
                    )}
                  >
                    <Icon name="event" size={9} />
                    Prochaine : {nextDate ?? "—"}
                    {stale ? " ⚠ À MAJ" : ""}
                  </span>
                </>
              );

              // Only clickable when FXMacroData actually has a historical
              // series for this field (see HISTORY_SLUGS in fxmacrodata.ts) —
              // PMI and the currency-specific indicators (fer, chine, risque...)
              // have none, so their cards stay plain rather than link to a
              // page with nothing to show.
              return clickable ? (
                <Link
                  key={indicator.id}
                  href={`/devise/${currency.code.toLowerCase()}/indicateur/${field}`}
                  className="border-border-app hover:border-brand-blue/40 hover:bg-panel block rounded-lg border p-3 transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <div key={indicator.id} className="border-border-app rounded-lg border p-3">
                  {content}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
