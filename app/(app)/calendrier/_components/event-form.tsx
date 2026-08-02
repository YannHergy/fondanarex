"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteWeeklyEvent, saveWeeklyEvent } from "@/app/(app)/calendrier/actions";
import { Icon } from "@/components/ui/icon";
import { commonEventsFor } from "@/domain/data/common-events";
import { cn } from "@/lib/utils";

export interface EventFormValues {
  id?: string;
  currencyCode: string;
  name: string;
  date: string;
  time: string;
  importance: "HIGH" | "MEDIUM" | "LOW";
  forecast: string;
  previous: string;
  actual: string;
  impact: "" | "BULLISH_STRONG" | "BULLISH" | "NEUTRAL" | "BEARISH" | "BEARISH_STRONG";
  pipsVariation: string;
  notes: string;
}

const IMPORTANCES = [
  { value: "HIGH", label: "Haute" },
  { value: "MEDIUM", label: "Moyenne" },
  { value: "LOW", label: "Basse" },
] as const;

export const IMPACTS = [
  { value: "", label: "Non publié" },
  { value: "BULLISH_STRONG", label: "Haussier fort" },
  { value: "BULLISH", label: "Haussier" },
  { value: "NEUTRAL", label: "Neutre" },
  { value: "BEARISH", label: "Baissier" },
  { value: "BEARISH_STRONG", label: "Baissier fort" },
] as const;

function emptyValues(currencyCode: string, date: string): EventFormValues {
  return {
    currencyCode,
    name: "",
    date,
    time: "14:30",
    importance: "MEDIUM",
    forecast: "",
    previous: "",
    actual: "",
    impact: "",
    pipsVariation: "",
    notes: "",
  };
}

const inputClass =
  "bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none";

export function EventForm({
  currencies,
  defaultCurrency,
  defaultDate,
  initial,
  onDone,
}: {
  currencies: readonly string[];
  defaultCurrency: string;
  defaultDate: string;
  initial?: EventFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<EventFormValues>(
    initial ?? emptyValues(defaultCurrency, defaultDate),
  );
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    if (!values.name.trim()) {
      setError("Le nom de l'événement est requis");
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        const pips = values.pipsVariation.trim();
        await saveWeeklyEvent({
          id: values.id,
          currencyCode: values.currencyCode,
          name: values.name.trim(),
          date: values.date,
          time: values.time,
          importance: values.importance,
          forecast: values.forecast.trim() || null,
          previous: values.previous.trim() || null,
          actual: values.actual.trim() || null,
          impact: values.impact === "" ? null : values.impact,
          pipsVariation: pips === "" ? null : Number.parseFloat(pips),
          notes: values.notes.trim() || null,
        });
        if (!values.id) setValues(emptyValues(values.currencyCode, values.date));
        router.refresh();
        onDone?.();
      } catch {
        setError("Échec de l'enregistrement");
      }
    });
  }

  function remove() {
    if (!values.id) return;
    startTransition(async () => {
      await deleteWeeklyEvent(values.id);
      router.refresh();
      onDone?.();
    });
  }

  const suggestions = commonEventsFor(values.currencyCode);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="ev-ccy" className="text-muted mb-1 block text-xs">
            Devise
          </label>
          <select
            id="ev-ccy"
            value={values.currencyCode}
            onChange={(e) => set("currencyCode", e.target.value)}
            className={inputClass}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ev-date" className="text-muted mb-1 block text-xs">
            Date
          </label>
          <input
            id="ev-date"
            type="date"
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ev-time" className="text-muted mb-1 block text-xs">
            Heure (UTC)
          </label>
          <input
            id="ev-time"
            type="time"
            value={values.time}
            onChange={(e) => set("time", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="ev-imp" className="text-muted mb-1 block text-xs">
            Importance
          </label>
          <select
            id="ev-imp"
            value={values.importance}
            onChange={(e) => set("importance", e.target.value as EventFormValues["importance"])}
            className={inputClass}
          >
            {IMPORTANCES.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="ev-name" className="text-muted mb-1 block text-xs">
          Événement
        </label>
        <input
          id="ev-name"
          list="ev-suggestions"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="CPI, NFP, décision de taux…"
          className={inputClass}
        />
        <datalist id="ev-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["previous", "Précédent"],
            ["forecast", "Prévision"],
            ["actual", "Réel"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`ev-${key}`} className="text-muted mb-1 block text-xs">
              {label}
            </label>
            <input
              id={`ev-${key}`}
              value={values[key]}
              onChange={(e) => set(key, e.target.value)}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ev-impact" className="text-muted mb-1 block text-xs">
            Impact observé
          </label>
          <select
            id="ev-impact"
            value={values.impact}
            onChange={(e) => set("impact", e.target.value as EventFormValues["impact"])}
            className={inputClass}
          >
            {IMPACTS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          <p className="text-subtle mt-0.5 text-[10px]">
            Laisser « non publié » tant que la donnée n&apos;est pas sortie.
          </p>
        </div>

        <div>
          <label htmlFor="ev-pips" className="text-muted mb-1 block text-xs">
            Variation (pips)
          </label>
          <input
            id="ev-pips"
            type="number"
            step="0.1"
            value={values.pipsVariation}
            onChange={(e) => set("pipsVariation", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="ev-notes" className="text-muted mb-1 block text-xs">
          Notes
        </label>
        <textarea
          id="ev-notes"
          rows={2}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="text-brand-red text-xs">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className={cn(
            "bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors",
            pending && "opacity-50",
          )}
        >
          <Icon name="check" size={14} />
          {values.id ? "Mettre à jour" : "Ajouter"}
        </button>

        {values.id ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="border-border-app text-muted hover:text-brand-red hover:border-brand-red/30 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors"
          >
            <Icon name="delete" size={14} /> Supprimer
          </button>
        ) : null}

        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="text-muted hover:text-fg px-2 py-1.5 text-xs transition-colors"
          >
            Annuler
          </button>
        ) : null}
      </div>
    </div>
  );
}
