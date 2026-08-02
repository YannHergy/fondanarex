import type { Metadata } from "next";

import { WeekPlanView } from "@/app/(app)/previsions/_components/week-plan-view";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { weekEventsFor, weekStartOf } from "@/domain/plan/week-plan";
import { getScoredCurrencyList } from "@/lib/currencies";
import { requireUserId } from "@/lib/session";
import { storageConfigured } from "@/lib/storage";
import {
  getForecastInstruments,
  getOrCreateWeekPlan,
  getWeekTradeStats,
  listPlanWeeks,
} from "@/lib/week-plan";

export const metadata: Metadata = { title: "Prévisions" };
export const dynamic = "force-dynamic";

/** Latest published value per indicator, keyed to match the event keys. */
function currentValuesFor(
  currencies: Awaited<ReturnType<typeof getScoredCurrencyList>>,
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const currency of currencies) {
    const readings: Record<string, string> = {
      interestRate: `${currency.interestRate} %`,
      cpi: `${currency.cpi} %`,
      coreCpi: `${currency.coreCpi} %`,
      gdpQoQ: `${currency.gdpQoQ} %`,
      unemployment: `${currency.unemployment} %`,
      pmiManufacturing: `${currency.pmiManufacturing}`,
      pmiServices: `${currency.pmiServices}`,
      wagePPI: `${currency.wagePPI} %`,
      tradeBalance: `${currency.tradeBalance} Md`,
      retailSales: `${currency.retailSales} %`,
      consumerConfidence: `${currency.consumerConfidence}`,
      stance: currency.stance,
    };

    for (const [key, value] of Object.entries(readings)) {
      values[`${currency.code}-${key}`] = value;
    }
  }

  return values;
}

export default async function PrevisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  const userId = await requireUserId();
  const { semaine } = await searchParams;

  const thisWeek = weekStartOf(new Date());

  // The week comes from the URL so it is bookmarkable and survives a refresh.
  // Anything that is not a Monday falls back to the current week rather than
  // creating a plan under a key nothing else will ever resolve to.
  const requested =
    semaine && /^\d{4}-\d{2}-\d{2}$/.test(semaine) && !Number.isNaN(Date.parse(semaine))
      ? weekStartOf(new Date(`${semaine}T00:00:00Z`))
      : thisWeek;

  const [plan, currencies, instruments, planWeeks, tradeStats] = await Promise.all([
    getOrCreateWeekPlan(userId, requested),
    getScoredCurrencyList(userId),
    getForecastInstruments(),
    listPlanWeeks(userId),
    getWeekTradeStats(userId, requested),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Prévisions"
        subtitle="Le plan de la semaine : setups, contexte macro, puis la revue de ce qui s'est réellement passé"
      />

      {storageConfigured() ? null : (
        <Card className="border-brand-amber/30 bg-brand-amber/5">
          <div className="flex items-start gap-2.5">
            <Icon name="warning" size={16} className="text-brand-amber mt-0.5 shrink-0" />
            <p className="text-muted text-sm leading-relaxed">
              Stockage des captures non configuré — le reste du plan fonctionne normalement.
              Renseignez <code className="font-mono text-xs">NETLIFY_SITE_ID</code> et{" "}
              <code className="font-mono text-xs">NETLIFY_API_TOKEN</code> pour activer les
              téléversements.
            </p>
          </div>
        </Card>
      )}

      <WeekPlanView
        plan={plan}
        currencies={currencies}
        events={weekEventsFor(currencies, requested)}
        instruments={instruments}
        planWeeks={planWeeks}
        tradeStats={tradeStats}
        currentValues={currentValuesFor(currencies)}
        isCurrentWeek={requested === thisWeek}
      />
    </div>
  );
}
