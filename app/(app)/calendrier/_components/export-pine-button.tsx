"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { CURRENCY_COLORS, generateNewsPine, type NewsRow } from "@/domain/pine/generator";
import { cn } from "@/lib/utils";

export interface ExportableEvent {
  currencyCode: string;
  name: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM", UTC */
  time: string;
}

/**
 * One-click Pine Script export for the week currently on screen.
 *
 * Reuses the same generator that already powers the Indicateurs screen —
 * this just skips its manual-entry step by building the rows straight from
 * the events already displayed here, since retyping dates that are already
 * on screen is how a line ends up on the wrong day.
 */
export function ExportPineButton({ events }: { events: ExportableEvent[] }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  if (events.length === 0) return null;

  const rows: NewsRow[] = events.map((event, index) => ({
    id: `cal-${index}`,
    enabled: true,
    date: event.date,
    time: event.time,
    label: `${event.currencyCode} ${event.name}`,
    currency: event.currencyCode,
    color: CURRENCY_COLORS[event.currencyCode] ?? "#90A4AE",
    width: 2,
  }));

  async function handleClick() {
    const code = generateNewsPine(rows, new Date());
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Copie un script TradingView qui trace une ligne verticale à chaque publication de cette semaine"
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
        failed
          ? "border-brand-red/40 bg-brand-red/10 text-brand-red"
          : "border-brand-green/40 bg-brand-green/10 text-brand-green hover:bg-brand-green/20",
      )}
    >
      <Icon name={copied ? "check" : failed ? "error" : "code"} size={14} />
      {copied ? "Copié dans le presse-papier" : failed ? "Copie impossible" : "Exporter vers Pine Script"}
    </button>
  );
}
