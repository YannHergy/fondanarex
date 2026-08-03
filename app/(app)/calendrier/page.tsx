import type { Metadata } from "next";
import Link from "next/link";

import { EventForm } from "@/app/(app)/calendrier/_components/event-form";
import { EventRow } from "@/app/(app)/calendrier/_components/event-row";
import { ExportPineButton } from "@/app/(app)/calendrier/_components/export-pine-button";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { getInterpretation, getWeeklySummary } from "@/domain/events/summary";
import {
  dateToStr,
  getWeekDates,
  getWeekKey,
  nextWeekKey,
  prevWeekKey,
  weekKeysEndingAt,
} from "@/domain/events/week";
import { getScoredCurrencies } from "@/lib/currencies";
import { requireUserId } from "@/lib/session";
import { CURRENCY_CODES, cn, isCurrencyCode } from "@/lib/utils";
import {
  getEventsForWeek,
  getEventsForWeeks,
  toSummarisable,
  type WeeklyEventRow,
} from "@/lib/weekly-events";

export const metadata: Metadata = { title: "Calendrier" };

/** Renders a stored instant as HH:MM UTC — the clock events are entered in. */
function displayTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/** "Lundi 3 août 2026" — French locale lower-cases both words by default. */
function frenchLongDate(date: Date): string {
  const formatted = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return formatted.replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

function toFormValues(event: WeeklyEventRow) {
  return {
    id: event.id,
    currencyCode: event.currencyCode,
    name: event.name,
    date: dateToStr(event.scheduledAt),
    time: displayTime(event.scheduledAt),
    importance: event.importance,
    forecast: event.forecast ?? "",
    previous: event.previous ?? "",
    actual: event.actual ?? "",
    impact: (event.impact ?? "") as "" | NonNullable<WeeklyEventRow["impact"]>,
    pipsVariation: event.pipsVariation === null ? "" : String(event.pipsVariation),
    notes: event.notes ?? "",
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string; devise?: string }>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  // The displayed week lives in the URL, so a week is linkable and the back
  // button steps through history. The legacy screen held it in component state.
  const weekKey = /^\d{4}-W\d{2}$/.test(params.semaine ?? "")
    ? params.semaine!
    : getWeekKey(new Date());

  const filterCurrency =
    params.devise && isCurrencyCode(params.devise.toUpperCase())
      ? params.devise.toUpperCase()
      : undefined;

  const historyKeys = weekKeysEndingAt(weekKey, 12);

  const [currencies, events, history] = await Promise.all([
    getScoredCurrencies(userId),
    getEventsForWeek(userId, weekKey, filterCurrency),
    getEventsForWeeks(userId, historyKeys, filterCurrency),
  ]);

  const summary = getWeeklySummary(events.map(toSummarisable));

  // Interpretation needs a fundamental score to compare against; without a
  // currency filter there is no single score, so the divergence check is only
  // meaningful when one currency is selected.
  const focusScore = filterCurrency ? (currencies[filterCurrency]?.scores.total ?? 50) : 50;
  const interpretation = filterCurrency ? getInterpretation(summary, focusScore) : null;

  const pineEvents = events.map((event) => ({
    currencyCode: event.currencyCode,
    name: event.name,
    date: dateToStr(event.scheduledAt),
    time: displayTime(event.scheduledAt),
  }));

  const weekDates = getWeekDates(weekKey);
  const byDay = new Map<string, WeeklyEventRow[]>();
  for (const date of weekDates) byDay.set(dateToStr(date), []);
  for (const event of events) {
    byDay.get(dateToStr(event.scheduledAt))?.push(event);
  }

  const historySeries = historyKeys.map((key) => {
    const weekSummary = getWeeklySummary((history.get(key) ?? []).map(toSummarisable));
    return { weekKey: key, score: weekSummary.totalScore, count: weekSummary.totalEvents };
  });
  const maxAbs = Math.max(1, ...historySeries.map((h) => Math.abs(h.score)));

  const query = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { semaine: weekKey, devise: filterCurrency, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/calendrier?${next.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader title="Calendrier économique" subtitle={`Semaine ${weekKey}`}>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className="border-brand-blue/40 bg-brand-blue/10 text-brand-blue flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold">
              <Icon name="filter_alt" size={13} />
              Filtre actif : {filterCurrency ?? "Toutes devises"}
            </span>
            <ExportPineButton events={pineEvents} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Link
              href={query({ semaine: prevWeekKey(weekKey) })}
              aria-label="Semaine précédente"
              className="border-border-app text-muted hover:text-fg rounded-lg border p-1.5 transition-colors"
            >
              <Icon name="chevron_left" size={16} />
            </Link>
            <Link
              href={query({ semaine: getWeekKey(new Date()) })}
              className="border-border-app text-muted hover:text-fg rounded-lg border px-3 py-1.5 text-xs transition-colors"
            >
              Cette semaine
            </Link>
            <Link
              href={query({ semaine: nextWeekKey(weekKey) })}
              aria-label="Semaine suivante"
              className="border-border-app text-muted hover:text-fg rounded-lg border p-1.5 transition-colors"
            >
              <Icon name="chevron_right" size={16} />
            </Link>
          </div>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={query({ devise: undefined })}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            !filterCurrency
              ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
              : "border-border-app text-muted hover:text-fg",
          )}
        >
          Toutes
        </Link>
        {CURRENCY_CODES.map((code) => (
          <Link
            key={code}
            href={query({ devise: code })}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors",
              filterCurrency === code
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-border-app text-muted hover:text-fg",
            )}
          >
            {code}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: "Événements", value: summary.totalEvents, tone: "text-fg" },
          { label: "Publiés", value: summary.publishedEvents, tone: "text-fg" },
          { label: "Haussiers", value: summary.bullishCount, tone: "text-brand-green" },
          { label: "Baissiers", value: summary.bearishCount, tone: "text-brand-red" },
          {
            label: "Score semaine",
            value: `${summary.totalScore > 0 ? "+" : ""}${summary.totalScore}`,
            tone:
              summary.totalScore > 0
                ? "text-brand-green"
                : summary.totalScore < 0
                  ? "text-brand-red"
                  : "text-muted",
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

      {interpretation ? (
        <Card
          className={cn(
            interpretation.divergence ? "border-brand-amber/40 bg-brand-amber/5" : undefined,
          )}
        >
          <div className="flex items-start gap-2.5">
            <Icon
              name={interpretation.divergence ? "warning" : "insights"}
              size={16}
              className={cn(
                "mt-0.5 shrink-0",
                interpretation.divergence ? "text-brand-amber" : "text-brand-blue",
              )}
            />
            <div>
              <p className="text-fg text-sm font-semibold">{interpretation.verdict}</p>
              {interpretation.divergence ? (
                <p className="text-brand-amber mt-1 text-sm">{interpretation.divergence}</p>
              ) : null}
              <p className="text-subtle mt-1 text-xs">
                Score fondamental {filterCurrency} : {focusScore}/100 · {summary.totalPips} pips
                cumulés
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {weekDates.map((date) => {
            const key = dateToStr(date);
            const dayEvents = byDay.get(key) ?? [];
            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="border-border-app text-fg flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold">
                    <Icon name="calendar_month" size={15} className="text-brand-blue" />
                    {frenchLongDate(date)}
                  </span>
                  <div className="bg-border-app h-px flex-1" />
                  <span className="text-subtle shrink-0 text-[10px]">
                    {dayEvents.length} événement{dayEvents.length > 1 ? "s" : ""}
                  </span>
                </div>

                {dayEvents.length === 0 ? (
                  <p className="text-subtle px-1 text-xs">Aucun événement.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        values={toFormValues(event)}
                        currencies={CURRENCY_CODES}
                        displayTime={displayTime(event.scheduledAt)}
                        published={event.impact !== null}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle icon="add_circle">Ajouter un événement</CardTitle>
            <EventForm
              currencies={CURRENCY_CODES}
              defaultCurrency={filterCurrency ?? CURRENCY_CODES[0]}
              defaultDate={dateToStr(weekDates[0] ?? new Date())}
            />
          </Card>

          <Card>
            <CardTitle icon="bar_chart">12 dernières semaines</CardTitle>
            <div className="space-y-1">
              {historySeries.map((week) => (
                <Link
                  key={week.weekKey}
                  href={query({ semaine: week.weekKey })}
                  className={cn(
                    "hover:bg-panel flex items-center gap-2 rounded px-1 py-1 transition-colors",
                    week.weekKey === weekKey && "bg-panel",
                  )}
                >
                  <span className="text-subtle w-16 shrink-0 font-mono text-[10px]">
                    {week.weekKey}
                  </span>
                  <div className="bg-panel relative h-1.5 flex-1 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "absolute top-0 h-full",
                        week.score > 0
                          ? "bg-brand-green"
                          : week.score < 0
                            ? "bg-brand-red"
                            : "bg-border-strong",
                      )}
                      style={{
                        width: `${(Math.abs(week.score) / maxAbs) * 50}%`,
                        ...(week.score < 0 ? { right: "50%" } : { left: "50%" }),
                      }}
                    />
                    <div className="bg-border-strong absolute top-0 left-1/2 h-full w-px" />
                  </div>
                  <span className="tabular text-muted w-8 shrink-0 text-right font-mono text-[10px]">
                    {week.score > 0 ? "+" : ""}
                    {week.score}
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          {!filterCurrency ? (
            <Card>
              <CardTitle icon="filter_alt">Interprétation</CardTitle>
              <p className="text-subtle text-xs leading-relaxed">
                Sélectionnez une devise pour comparer le score des publications de la semaine à son
                score fondamental et détecter une divergence.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CURRENCY_CODES.map((code) => (
                  <Link key={code} href={query({ devise: code })}>
                    <CurrencyBadge code={code} size="sm" />
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
