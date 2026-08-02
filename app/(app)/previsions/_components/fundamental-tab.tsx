"use client";

import { useMemo, useState, useTransition } from "react";

import { SavedField } from "@/app/(app)/previsions/_components/saved-field";
import {
  requestEventScenario,
  requestGeoEvents,
  requestWeekAhead,
  saveNewsImpact,
  savePlan,
} from "@/app/(app)/previsions/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import {
  currenciesInSetups,
  eventsByDay,
  filterEventsByPair,
  setupBiasSummary,
  type EventImpact,
  type WeekEvent,
} from "@/domain/plan/week-plan";
import type { EventScenario, GeoEvent, WeekAheadEvent } from "@/lib/plan-research";
import type { SetupRow } from "@/lib/week-plan";
import { cn } from "@/lib/utils";

const IMPACT_STYLE: Record<EventImpact, string> = {
  High: "bg-brand-red/15 text-brand-red",
  Medium: "bg-brand-amber/15 text-brand-amber",
  Low: "bg-panel text-subtle",
};

const CONCLUSION_STYLE: Record<string, string> = {
  bullish: "text-brand-green",
  bearish: "text-brand-red",
  neutral: "text-subtle",
};

export function FundamentalTab({
  weekStart,
  weekLabel,
  events,
  setups,
  newsImpacts,
  fundamentalContext,
  currentValues,
}: {
  weekStart: string;
  weekLabel: string;
  events: WeekEvent[];
  setups: SetupRow[];
  newsImpacts: Record<string, string>;
  fundamentalContext: string | null;
  /** Latest published value per event key, so a scenario is grounded in a number. */
  currentValues: Record<string, string>;
}) {
  const [pair, setPair] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, EventScenario | { error: string }>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  const [geo, setGeo] = useState<{ events: GeoEvent[]; error: string | null } | null>(null);
  const [geoPending, startGeo] = useTransition();

  const [weekAhead, setWeekAhead] = useState<
    Record<string, { events: WeekAheadEvent[]; error: string | null; researchFailed: boolean }>
  >({});
  const [weekAheadPending, startWeekAhead] = useTransition();

  const pairs = useMemo(() => [...new Set(setups.map((s) => s.instrument))], [setups]);
  const visible = useMemo(() => filterEventsByPair(events, pair), [events, pair]);
  const byDay = useMemo(() => eventsByDay(visible, weekStart), [visible, weekStart]);

  function generateScenario(event: WeekEvent) {
    setLoadingKeys((keys) => new Set(keys).add(event.key));

    void (async () => {
      const result = await requestEventScenario({
        label: event.label,
        currency: event.currency,
        currentValue: currentValues[event.key] ?? "non disponible",
      });

      setScenarios((current) => ({
        ...current,
        [event.key]: result.scenario ?? { error: result.error ?? "Échec" },
      }));
      setLoadingKeys((keys) => {
        const next = new Set(keys);
        next.delete(event.key);
        return next;
      });
    })();
  }

  function generateWeekAhead() {
    const codes = currenciesInSetups(pairs);
    if (codes.length === 0) return;

    startWeekAhead(async () => {
      const results = await Promise.all(
        codes.map(async (currency) => {
          const result = await requestWeekAhead({
            currency,
            weekLabel,
            setupBias: setupBiasSummary(setups, currency),
          });
          return [currency, result] as const;
        }),
      );
      setWeekAhead(Object.fromEntries(results));
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon="notes">Contexte fondamental de la semaine</CardTitle>
        <SavedField
          value={fundamentalContext ?? ""}
          onSave={(value) => savePlan({ weekStart, fundamentalContext: value })}
          multiline
          rows={4}
          placeholder="Le thème macro qui domine la semaine, et pourquoi"
        />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle icon="event" className="mb-0">
            Publications de la semaine ({visible.length})
          </CardTitle>
          {pairs.length > 0 ? (
            <select
              aria-label="Filtrer par paire"
              value={pair ?? ""}
              onChange={(event) => setPair(event.target.value || null)}
              className="bg-panel border-border-app text-fg focus:border-brand-blue rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Toutes les devises</option>
              {pairs.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {byDay.length === 0 ? (
          <p className="text-subtle text-sm">
            Aucune publication programmée cette semaine pour les devises suivies.
          </p>
        ) : (
          <div className="space-y-4">
            {byDay.map((day) => (
              <div key={day.date}>
                <p className="text-subtle mb-2 text-[11px] font-bold tracking-widest uppercase">
                  {day.day} {day.date.slice(8)}/{day.date.slice(5, 7)}
                </p>
                <div className="space-y-2">
                  {day.events.map((event) => {
                    const scenario = scenarios[event.key];
                    const loading = loadingKeys.has(event.key);

                    return (
                      <div
                        key={event.key}
                        className="border-border-app bg-panel rounded-lg border p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <CurrencyBadge code={event.currency} size="sm" />
                          <span className="text-fg text-sm font-semibold">{event.label}</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                              IMPACT_STYLE[event.impact],
                            )}
                          >
                            {event.impact}
                          </span>
                          {currentValues[event.key] ? (
                            <span className="text-subtle font-mono text-[11px]">
                              actuel {currentValues[event.key]}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => generateScenario(event)}
                            disabled={loading}
                            className="text-brand-blue hover:text-brand-blue/80 ml-auto flex items-center gap-1 text-[11px] font-semibold disabled:opacity-40"
                          >
                            <Icon
                              name={loading ? "progress_activity" : "auto_awesome"}
                              size={13}
                              className={loading ? "animate-spin" : undefined}
                            />
                            {scenario ? "Régénérer" : "Scénarios"}
                          </button>
                        </div>

                        {scenario && "error" in scenario ? (
                          <p className="text-brand-red mb-2 text-xs">{scenario.error}</p>
                        ) : scenario ? (
                          <div className="mb-2 space-y-1.5 text-xs">
                            <p className="text-muted">
                              <span className="text-brand-green font-bold">Haussier — </span>
                              {scenario.scenarioBullish}
                            </p>
                            <p className="text-muted">
                              <span className="text-brand-red font-bold">Baissier — </span>
                              {scenario.scenarioBearish}
                            </p>
                            <p
                              className={cn(
                                "font-semibold",
                                CONCLUSION_STYLE[scenario.conclusionType],
                              )}
                            >
                              {scenario.conclusion}
                            </p>
                          </div>
                        ) : null}

                        <SavedField
                          label="Votre lecture"
                          value={newsImpacts[event.key] ?? ""}
                          onSave={(note) =>
                            saveNewsImpact({ weekStart, eventKey: event.key, note })
                          }
                          placeholder="Ce que vous ferez si ça sort dans un sens ou dans l'autre"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle icon="calendar_month" className="mb-0">
            Semaine à venir par devise
          </CardTitle>
          <button
            type="button"
            onClick={generateWeekAhead}
            disabled={weekAheadPending || pairs.length === 0}
            title={pairs.length === 0 ? "Ajoutez d'abord un setup" : undefined}
            className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon
              name={weekAheadPending ? "progress_activity" : "travel_explore"}
              size={13}
              className={weekAheadPending ? "animate-spin" : undefined}
            />
            {weekAheadPending ? "Analyse…" : "Analyser"}
          </button>
        </div>

        {Object.keys(weekAhead).length === 0 ? (
          <p className="text-subtle text-sm">
            {pairs.length === 0
              ? "Ajoutez un setup dans l'onglet Technique — l'analyse porte sur les devises que vous tradez."
              : "Recherche du calendrier de chaque devise, puis scénarios par publication."}
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(weekAhead).map(([currency, result]) => (
              <div key={currency} className="border-border-app rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <CurrencyBadge code={currency} size="sm" />
                  {setupBiasSummary(setups, currency) ? (
                    <span className="text-subtle text-[11px]">
                      {setupBiasSummary(setups, currency)}
                    </span>
                  ) : null}
                  {result.researchFailed ? (
                    <span className="text-brand-amber flex items-center gap-1 text-[11px]">
                      <Icon name="warning" size={12} />
                      recherche indisponible — analyse sur données internes
                    </span>
                  ) : null}
                </div>

                {result.error ? (
                  <p className="text-brand-red text-xs">{result.error}</p>
                ) : result.events.length === 0 ? (
                  <p className="text-subtle text-xs">Aucune publication identifiée.</p>
                ) : (
                  <ul className="space-y-2">
                    {result.events.map((event, index) => (
                      <li key={`${event.day}-${event.name}-${index}`} className="text-xs">
                        <p className="text-fg font-semibold">
                          {event.day} · {event.name}
                          {event.currentValue ? (
                            <span className="text-subtle ml-1.5 font-mono font-normal">
                              {event.currentValue}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-muted">
                          <span className="text-brand-green">↑ </span>
                          {event.scenarioBullish}
                        </p>
                        <p className="text-muted">
                          <span className="text-brand-red">↓ </span>
                          {event.scenarioBearish}
                        </p>
                        <p className={cn("font-semibold", CONCLUSION_STYLE[event.conclusionType])}>
                          {event.conclusion}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle icon="public" className="mb-0">
            Contexte géopolitique
          </CardTitle>
          <button
            type="button"
            onClick={() => startGeo(async () => setGeo(await requestGeoEvents()))}
            disabled={geoPending}
            className="text-brand-blue hover:text-brand-blue/80 flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
          >
            <Icon
              name={geoPending ? "progress_activity" : "refresh"}
              size={13}
              className={geoPending ? "animate-spin" : undefined}
            />
            {geo ? "Actualiser" : "Rechercher"}
          </button>
        </div>

        {!geo ? (
          <p className="text-subtle text-sm">
            Conflits, tensions commerciales, élections — et leur effet sur l&apos;appétit pour le
            risque.
          </p>
        ) : geo.error ? (
          <p className="text-brand-red text-sm">{geo.error}</p>
        ) : geo.events.length === 0 ? (
          <p className="text-subtle text-sm">Aucun événement rapporté.</p>
        ) : (
          <ul className="space-y-2">
            {geo.events.map((event, index) => (
              <li key={index} className="border-border-app rounded-lg border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-fg text-sm font-semibold">{event.title}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      event.impact === "risk-off"
                        ? "bg-brand-red/15 text-brand-red"
                        : event.impact === "risk-on"
                          ? "bg-brand-green/15 text-brand-green"
                          : "bg-panel text-subtle",
                    )}
                  >
                    {event.impact}
                  </span>
                </div>
                <p className="text-muted text-xs leading-relaxed">{event.description}</p>
                {event.url ? (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue mt-1 inline-flex items-center gap-1 text-[11px]"
                  >
                    <Icon name="open_in_new" size={11} />
                    {event.source}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
