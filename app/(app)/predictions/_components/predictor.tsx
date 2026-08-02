"use client";

import { useMemo, useState } from "react";

import { Confidence } from "@/app/(app)/predictions/_components/confidence";
import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { TRACKED_CURRENCIES } from "@/domain/fundamental/cascade";
import {
  FUNDAMENTAL_INDICATORS,
  type FundamentalIndicator,
} from "@/domain/data/fundamental-indicators";
import { getRulesFor, type PredictionDirection } from "@/domain/data/prediction-rules";
import { cn } from "@/lib/utils";

/**
 * "If this figure lands this way, what moves next?"
 *
 * A read-only exploration of the rule set — nothing here writes. It answers the
 * question before the release, which is when it is useful.
 */

const CATEGORY_LABELS: Record<string, string> = {
  monetary: "Politique monétaire",
  inflation: "Inflation et prix",
  employment: "Emploi",
  growth: "Croissance et PIB",
  trade: "Commerce et balance",
  risk: "Risque et sentiment",
  flows: "Flux de capitaux",
  commodities: "Matières premières",
  direction: "Direction générale",
  geopolitics: "Géopolitique",
};

/** Most concrete first — a trader picks a release, not an abstraction. */
const LEVEL_ORDER = ["root", "signal", "driver", "pillar", "king"];

function selectableIndicators(currency: string): FundamentalIndicator[] {
  return FUNDAMENTAL_INDICATORS.filter(
    (indicator) =>
      (indicator.currency === currency || indicator.currency === "GLOBAL") &&
      // Kings and pillars are computed aggregates, not published figures —
      // nothing ever "releases" them, so they cannot be a source.
      indicator.level !== "king" &&
      indicator.level !== "pillar",
  ).sort((a, b) => {
    const byLevel = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
    return byLevel !== 0 ? byLevel : b.importance - a.importance;
  });
}

export function Predictor() {
  const [currency, setCurrency] = useState<string>("USD");
  const [indicatorId, setIndicatorId] = useState("usd_nfp");
  const [direction, setDirection] = useState<PredictionDirection>("bullish");

  const indicators = useMemo(() => selectableIndicators(currency), [currency]);
  const indicator = useMemo(
    () => FUNDAMENTAL_INDICATORS.find((i) => i.id === indicatorId),
    [indicatorId],
  );
  const rules = useMemo(() => getRulesFor(indicatorId, direction), [indicatorId, direction]);

  const grouped = useMemo(
    () => [
      { key: "high", label: "Haute confiance", rules: rules.filter((r) => r.confidence >= 4) },
      { key: "medium", label: "Confiance modérée", rules: rules.filter((r) => r.confidence === 3) },
      { key: "low", label: "Faible confiance", rules: rules.filter((r) => r.confidence <= 2) },
    ],
    [rules],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, FundamentalIndicator[]>();
    for (const item of indicators) {
      const label = CATEGORY_LABELS[item.category] ?? item.category;
      const bucket = map.get(label);
      if (bucket) bucket.push(item);
      else map.set(label, [item]);
    }
    return [...map];
  }, [indicators]);

  function changeCurrency(code: string) {
    setCurrency(code);
    const first = selectableIndicators(code)[0];
    if (first) setIndicatorId(first.id);
  }

  return (
    <Card>
      <CardTitle icon="target">Prédicteur de news</CardTitle>
      <p className="text-subtle -mt-2 mb-4 text-xs">
        Si cette publication sort dans cette direction, qu&apos;est-ce qui bouge ensuite ?
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TRACKED_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => changeCurrency(code)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
              currency === code
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-border-app text-subtle hover:text-fg",
            )}
          >
            {code}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          aria-label="Indicateur source"
          value={indicatorId}
          onChange={(event) => setIndicatorId(event.target.value)}
          className="bg-panel border-border-app text-fg focus:border-brand-blue min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
        >
          {byCategory.map(([label, items]) => (
            <optgroup key={label} label={label}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="border-border-app flex overflow-hidden rounded-lg border">
          {(
            [
              { value: "bullish", label: "Meilleur que prévu", icon: "trending_up" },
              { value: "bearish", label: "Moins bon que prévu", icon: "trending_down" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDirection(option.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors",
                direction === option.value
                  ? option.value === "bullish"
                    ? "bg-brand-green/15 text-brand-green"
                    : "bg-brand-red/15 text-brand-red"
                  : "text-subtle hover:text-fg",
              )}
            >
              <Icon name={option.icon} size={14} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {indicator ? (
        <div
          className={cn(
            "mb-4 rounded-lg border p-3",
            direction === "bullish"
              ? "border-brand-green/25 bg-brand-green/5"
              : "border-brand-red/25 bg-brand-red/5",
          )}
        >
          <p className="text-muted text-sm">
            <CurrencyBadge code={indicator.currency} size="sm" className="mr-1.5 align-middle" />
            <span className="text-fg font-semibold">{indicator.name}</span> ({indicator.fullName}){" "}
            {direction === "bullish" ? "sort au-dessus" : "sort en dessous"} du consensus —{" "}
            {rules.length === 0
              ? "aucune règle de propagation définie"
              : `${rules.length} impact${rules.length > 1 ? "s" : ""} attendu${rules.length > 1 ? "s" : ""}`}
            .
          </p>
          <p className="text-subtle mt-1 text-xs italic">{indicator.description}</p>
        </div>
      ) : null}

      {rules.length === 0 ? (
        <p className="text-subtle py-6 text-center text-sm">
          Cet indicateur n&apos;a pas encore de chaîne de prédiction configurée.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped
            .filter((group) => group.rules.length > 0)
            .map((group) => (
              <div key={group.key}>
                <p className="text-subtle mb-2 text-[11px] font-bold tracking-widest uppercase">
                  {group.label}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {group.rules.map((rule) => {
                    const target = FUNDAMENTAL_INDICATORS.find(
                      (i) => i.id === rule.targetIndicatorId,
                    );
                    const up = rule.predictedDirection === "bullish";

                    return (
                      <div
                        key={`${rule.targetIndicatorId}-${rule.reason}`}
                        className="border-border-app bg-panel rounded-lg border p-3"
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <p className="text-fg text-sm leading-tight font-semibold">
                            <CurrencyBadge
                              code={target?.currency ?? "GLOBAL"}
                              size="sm"
                              className="mr-1.5 align-middle"
                            />
                            {target?.name ?? rule.targetIndicatorId}
                          </p>
                          <Icon
                            name={up ? "arrow_upward" : "arrow_downward"}
                            size={16}
                            className={cn("shrink-0", up ? "text-brand-green" : "text-brand-red")}
                          />
                        </div>
                        <p className="text-muted mb-2 text-xs leading-relaxed italic">
                          {rule.reason}
                        </p>
                        <div className="flex items-center justify-between">
                          <Confidence value={rule.confidence} />
                          <span className="text-subtle font-mono text-[10px]">
                            {rule.delayLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
