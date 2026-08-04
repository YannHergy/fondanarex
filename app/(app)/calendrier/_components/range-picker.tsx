"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { RANGES, RANGE_LABELS, type RangeKey } from "@/domain/events/range";
import { cn } from "@/lib/utils";

/**
 * Period selector for the calendar.
 *
 * State lives in the URL rather than in the component so a chosen period
 * survives a reload and can be linked to — the page is a server component and
 * re-renders from the query string.
 */
export function RangePicker({ value }: { value: RangeKey }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  function pick(next: RangeKey) {
    const query = new URLSearchParams(params.toString());
    query.set("periode", next);
    setOpen(false);
    router.push(`/calendrier?${query.toString()}`);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "border-border-app bg-panel text-fg flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold",
          "hover:border-brand-blue/40 transition-colors",
        )}
      >
        <Icon name="event" size={14} />
        {RANGE_LABELS[value]}
        <Icon name={open ? "expand_less" : "expand_more"} size={14} />
      </button>

      {open ? (
        <>
          {/* Fermeture au clic extérieur, sans écouteur global sur document. */}
          <button
            type="button"
            aria-label="Fermer"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="border-border-app bg-surface absolute left-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-lg border shadow-lg"
          >
            {RANGES.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={key === value}
                  onClick={() => pick(key)}
                  className={cn(
                    "hover:bg-panel flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                    key === value ? "text-brand-blue font-semibold" : "text-muted",
                  )}
                >
                  <span className="w-3.5 shrink-0">
                    {key === value ? <Icon name="check" size={13} /> : null}
                  </span>
                  {RANGE_LABELS[key]}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
