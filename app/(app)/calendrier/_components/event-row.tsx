"use client";

import { useState } from "react";

import { EventForm, type EventFormValues } from "@/app/(app)/calendrier/_components/event-form";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const IMPORTANCE_STYLE = {
  HIGH: "text-brand-red border-brand-red/40 bg-brand-red/10",
  MEDIUM: "text-brand-amber border-brand-amber/40 bg-brand-amber/10",
  LOW: "text-muted border-border-app bg-panel",
} as const;

const IMPORTANCE_LABEL = { HIGH: "Haute", MEDIUM: "Moyenne", LOW: "Basse" } as const;

const IMPACT_STYLE: Record<string, { label: string; className: string }> = {
  BULLISH_STRONG: { label: "Haussier fort", className: "text-brand-green font-bold" },
  BULLISH: { label: "Haussier", className: "text-brand-green/80" },
  NEUTRAL: { label: "Neutre", className: "text-muted" },
  BEARISH: { label: "Baissier", className: "text-brand-red/80" },
  BEARISH_STRONG: { label: "Baissier fort", className: "text-brand-red font-bold" },
};

export function EventRow({
  values,
  currencies,
  displayTime,
  published,
}: {
  values: EventFormValues;
  currencies: readonly string[];
  displayTime: string;
  published: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="border-brand-blue/40 bg-panel rounded-lg border p-3">
        <EventForm
          currencies={currencies}
          defaultCurrency={values.currencyCode}
          defaultDate={values.date}
          initial={values}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  const impact = values.impact ? IMPACT_STYLE[values.impact] : null;

  return (
    <li
      className={cn(
        "border-border-app hover:bg-panel flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
        !published && "opacity-80",
      )}
    >
      <span className="text-subtle w-12 shrink-0 font-mono text-xs">{displayTime}</span>
      <CurrencyBadge code={values.currencyCode} size="sm" />

      <span
        className={cn(
          "hidden shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase sm:inline",
          IMPORTANCE_STYLE[values.importance],
        )}
      >
        {IMPORTANCE_LABEL[values.importance]}
      </span>

      <span className="text-fg min-w-0 flex-1 truncate text-sm">{values.name}</span>

      <span className="text-subtle hidden shrink-0 font-mono text-[11px] md:inline">
        {values.previous || "—"}
        <Icon name="arrow_right_alt" size={12} className="mx-0.5 inline align-text-bottom" />
        {values.actual || values.forecast || "—"}
      </span>

      {impact ? (
        <span className={cn("hidden w-24 shrink-0 text-right text-xs sm:inline", impact.className)}>
          {impact.label}
        </span>
      ) : (
        <span className="text-subtle hidden w-24 shrink-0 text-right text-xs sm:inline">
          en attente
        </span>
      )}

      {values.pipsVariation ? (
        <span className="tabular text-subtle w-14 shrink-0 text-right font-mono text-xs">
          {values.pipsVariation} p
        </span>
      ) : (
        <span className="w-14 shrink-0" />
      )}

      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Modifier ${values.name}`}
        className="text-subtle hover:text-brand-blue shrink-0 rounded p-1 transition-colors"
      >
        <Icon name="edit" size={14} />
      </button>
    </li>
  );
}
