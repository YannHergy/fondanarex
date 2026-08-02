"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Confidence } from "@/app/(app)/predictions/_components/confidence";
import { recordEvent, removeEvent } from "@/app/(app)/predictions/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import {
  FUNDAMENTAL_INDICATORS,
  type FundamentalIndicator,
  type IndicatorLevel,
} from "@/domain/data/fundamental-indicators";
import { calculateSurprise, propagateCascade, TRACKED_CURRENCIES } from "@/domain/fundamental/cascade";
import { predictionsFromEvent } from "@/domain/fundamental/predictions";
import type { FundamentalEventRow } from "@/lib/fundamental";
import { cn } from "@/lib/utils";

/**
 * Entry point of the whole engine: a published figure against its consensus.
 *
 * The preview is computed in the browser with the SAME pure functions the
 * server uses to write, so the cascade and the prediction list shown before
 * saving are the ones that get stored — not an approximation of them.
 */

const LEVEL_LABELS: Record<string, string> = {
  root: "Racines",
  signal: "Signaux",
  driver: "Moteurs",
  pillar: "Piliers",
};

const ENTRY_LEVELS: IndicatorLevel[] = ["root", "signal", "driver", "pillar"];

function entryIndicators(currency: string): FundamentalIndicator[] {
  return FUNDAMENTAL_INDICATORS.filter(
    (indicator) =>
      (indicator.currency === currency || indicator.currency === "GLOBAL") &&
      indicator.level !== "king",
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EventEntry({ events }: { events: FundamentalEventRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [currency, setCurrency] = useState("USD");
  const [indicatorId, setIndicatorId] = useState("");
  const [date, setDate] = useState(todayIso);
  const [previous, setPrevious] = useState("");
  const [forecast, setForecast] = useState("");
  const [actual, setActual] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const indicators = useMemo(() => entryIndicators(currency), [currency]);
  const indicator = indicators.find((i) => i.id === indicatorId);

  // Recomputed as you type — no "Calculer" button. The legacy form required
  // pressing Calculate before Save would do anything, and silently did nothing
  // if you edited a field afterwards.
  const preview = useMemo(() => {
    const a = Number.parseFloat(actual);
    const f = Number.parseFloat(forecast);
    if (!indicator || !Number.isFinite(a) || !Number.isFinite(f)) return null;

    const p = Number.parseFloat(previous);
    const surprise = calculateSurprise(a, f, Number.isFinite(p) ? p : f);

    return {
      surprise,
      cascade: propagateCascade(indicator.id, surprise).slice(0, 12),
      predictions: predictionsFromEvent(
        indicator.id,
        indicator.name,
        indicator.currency,
        surprise,
        new Date(`${date}T12:00:00Z`),
      ),
    };
  }, [indicator, actual, forecast, previous, date]);

  function save() {
    if (!indicator || !preview) return;
    setError(null);
    setSaved(null);

    startTransition(async () => {
      try {
        const result = await recordEvent({
          indicatorId: indicator.id,
          date,
          previous: Number.parseFloat(previous) || 0,
          forecast: Number.parseFloat(forecast) || 0,
          actual: Number.parseFloat(actual) || 0,
          unit: unit || null,
          notes: notes || null,
        });

        setSaved(
          `Enregistré · ${result.predictionsCreated} prédiction(s) créée(s) · ${result.predictionsResolved} résolue(s)`,
        );
        setPrevious("");
        setForecast("");
        setActual("");
        setNotes("");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeEvent(id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardTitle icon="newspaper">Saisie d&apos;une publication</CardTitle>
      <p className="text-subtle -mt-2 mb-4 text-xs">
        Le résultat face au consensus. La surprise se propage dans le graphe et déclenche les
        règles de prédiction.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="text-subtle mb-1.5 block text-[10px] font-bold tracking-widest uppercase">
              Devise
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TRACKED_CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setCurrency(code);
                    setIndicatorId("");
                  }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors",
                    currency === code
                      ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan"
                      : "border-border-app text-subtle hover:text-fg",
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="fe-indicator"
              className="text-subtle mb-1.5 block text-[10px] font-bold tracking-widest uppercase"
            >
              Indicateur
            </label>
            <select
              id="fe-indicator"
              value={indicatorId}
              onChange={(event) => setIndicatorId(event.target.value)}
              className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">— Sélectionner —</option>
              {ENTRY_LEVELS.map((level) => {
                const items = indicators.filter((i) => i.level === level);
                if (items.length === 0) return null;
                return (
                  <optgroup key={level} label={LEVEL_LABELS[level] ?? level}>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.fullName})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {indicator ? (
              <p className="text-subtle mt-1.5 text-[11px] leading-relaxed">
                {indicator.description}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field id="fe-date" label="Date" type="date" value={date} onChange={setDate} />
            <Field id="fe-unit" label="Unité" value={unit} onChange={setUnit} placeholder="%, K, B" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field
              id="fe-previous"
              label="Précédent"
              type="number"
              value={previous}
              onChange={setPrevious}
            />
            <Field
              id="fe-forecast"
              label="Consensus"
              type="number"
              value={forecast}
              onChange={setForecast}
            />
            <Field id="fe-actual" label="Réel" type="number" value={actual} onChange={setActual} />
          </div>

          <Field id="fe-notes" label="Notes" value={notes} onChange={setNotes} />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!preview || pending}
              className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon
                name={pending ? "progress_activity" : "save"}
                size={15}
                className={pending ? "animate-spin" : undefined}
              />
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saved ? <span className="text-brand-green text-xs">{saved}</span> : null}
            {error ? <span className="text-brand-red text-xs">{error}</span> : null}
          </div>
        </div>

        <div className="border-border-app bg-panel rounded-lg border p-3">
          {!preview ? (
            <p className="text-subtle py-8 text-center text-xs">
              Choisissez un indicateur puis renseignez le consensus et le résultat pour voir
              l&apos;impact.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <span className="text-subtle text-[10px] font-bold tracking-widest uppercase">
                  Surprise normalisée
                </span>
                <span
                  className={cn(
                    "font-mono text-2xl font-black",
                    preview.surprise > 0.1
                      ? "text-brand-green"
                      : preview.surprise < -0.1
                        ? "text-brand-red"
                        : "text-subtle",
                  )}
                >
                  {preview.surprise > 0 ? "+" : ""}
                  {preview.surprise.toFixed(2)}
                </span>
              </div>

              {Math.abs(preview.surprise) <= 0.1 ? (
                <p className="text-subtle mb-3 text-[11px] leading-relaxed">
                  Le chiffre est sur le consensus : aucune règle ne se déclenche. Une publication
                  sans information ne doit pas produire de prédictions.
                </p>
              ) : null}

              <p className="text-subtle mb-1.5 text-[10px] font-bold tracking-widest uppercase">
                Propagation ({preview.cascade.length})
              </p>
              {preview.cascade.length === 0 ? (
                <p className="text-subtle mb-3 text-xs">Aucun impact au-dessus du seuil de bruit.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {preview.cascade.map((impact) => (
                    <li
                      key={impact.targetId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-muted flex min-w-0 items-center gap-1.5">
                        <CurrencyBadge code={impact.targetCurrency} size="sm" />
                        <span className="truncate">{impact.targetName}</span>
                        <span className="text-subtle font-mono text-[10px]">
                          n{impact.depth}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-mono font-bold",
                          impact.impact > 0 ? "text-brand-green" : "text-brand-red",
                        )}
                      >
                        {impact.impact > 0 ? "+" : ""}
                        {impact.impact.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-subtle mb-1.5 text-[10px] font-bold tracking-widest uppercase">
                Prédictions déclenchées ({preview.predictions.length})
              </p>
              {preview.predictions.length === 0 ? (
                <p className="text-subtle text-xs">Aucune règle configurée pour cet indicateur.</p>
              ) : (
                <ul className="space-y-1">
                  {preview.predictions.map((prediction) => (
                    <li
                      key={prediction.targetIndicatorId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-muted truncate">
                        {prediction.targetIndicatorName}
                        <Icon
                          name={
                            prediction.predictedDirection === "bullish"
                              ? "arrow_upward"
                              : "arrow_downward"
                          }
                          size={12}
                          className={cn(
                            "ml-1 inline align-text-bottom",
                            prediction.predictedDirection === "bullish"
                              ? "text-brand-green"
                              : "text-brand-red",
                          )}
                          aria-label={
                            prediction.predictedDirection === "bullish" ? "hausse" : "baisse"
                          }
                        />
                      </span>
                      <Confidence value={prediction.confidence} className="shrink-0" />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {events.length > 0 ? (
        <div className="border-border-app mt-4 border-t pt-3">
          <button
            type="button"
            onClick={() => setShowHistory((open) => !open)}
            className="text-subtle hover:text-fg flex items-center gap-1.5 text-xs font-semibold"
          >
            <Icon name={showHistory ? "expand_less" : "expand_more"} size={14} />
            Publications enregistrées ({events.length})
          </button>

          {showHistory ? (
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="border-border-app flex items-center gap-2 rounded-lg border p-2 text-xs"
                >
                  <CurrencyBadge code={event.currencyCode} size="sm" />
                  <span className="text-fg min-w-0 flex-1 truncate font-medium">
                    {event.indicatorName}
                  </span>
                  <span className="text-subtle font-mono text-[10px]">
                    {event.occurredAt.toISOString().slice(0, 10)}
                  </span>
                  <span
                    className={cn(
                      "w-12 shrink-0 text-right font-mono font-bold",
                      event.surpriseNormalized > 0 ? "text-brand-green" : "text-brand-red",
                    )}
                  >
                    {event.surpriseNormalized > 0 ? "+" : ""}
                    {event.surpriseNormalized.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(event.id)}
                    disabled={pending}
                    title="Supprimer cette publication et ses prédictions"
                    className="text-subtle hover:text-brand-red shrink-0 disabled:opacity-40"
                  >
                    <Icon name="delete" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-subtle mb-1.5 block text-[10px] font-bold tracking-widest uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        step={type === "number" ? "any" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="bg-surface border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none"
      />
    </div>
  );
}
