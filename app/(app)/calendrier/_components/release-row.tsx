import Link from "next/link";

import { FlagIcon } from "@/components/ui/flag-icon";
import type { Release } from "@/lib/releases";
import { cn } from "@/lib/utils";

const IMPACT_LABEL = { high: "Fort", medium: "Moyen", low: "Faible" } as const;

const IMPACT_CLASS = {
  high: "border-brand-red/40 bg-brand-red/10 text-brand-red",
  medium: "border-brand-amber/40 bg-brand-amber/10 text-brand-amber",
  low: "border-border-app text-subtle",
} as const;

// Brazzaville local time (WAT, UTC+1 year-round), explicit — without a
// `timeZone`, Intl falls back to the server's own clock (UTC on Vercel),
// which is not the zone this app is read in.
const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Brazzaville",
});

/** Two decimals only when the value actually has them — 4 rather than 4.00. */
function fmt(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * One scheduled publication.
 *
 * `actual` is empty until the release has happened, which is what an economic
 * calendar shows: before the print you have the previous figure, after it you
 * have both. Filling the cell early would invent a number.
 */
export function ReleaseRow({ release }: { release: Release }) {
  const published = release.actual !== null;

  return (
    <Link
      href={`/devise/${release.currencyCode.toLowerCase()}`}
      className={cn(
        "border-border-app hover:border-brand-blue/40 hover:bg-panel flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
      )}
    >
      <span className="tabular text-subtle w-12 shrink-0 font-mono text-xs">
        {release.hasTime ? timeFmt.format(release.at) : "—"}
      </span>

      <span className="flex w-16 shrink-0 items-center gap-1.5">
        <FlagIcon code={release.currencyCode} style={{ width: 18, height: 12 }} />
        <span className="text-fg font-mono text-[11px] font-bold">{release.currencyCode}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="text-fg block truncate text-sm">{release.label}</span>
        <span
          className={cn(
            "mt-0.5 inline-flex items-center rounded border px-1.5 py-px text-[9px] font-bold uppercase",
            IMPACT_CLASS[release.impact],
          )}
        >
          {IMPACT_LABEL[release.impact]}
        </span>
      </span>

      <span className="border-border-app flex shrink-0 divide-x divide-[var(--color-border-app)] rounded-md border text-right">
        <span className="px-2.5 py-1">
          <span className="text-subtle block text-[9px] tracking-wide uppercase">Précédent</span>
          <span className="tabular text-muted block font-mono text-xs">{fmt(release.previous)}</span>
        </span>
        <span className="px-2.5 py-1">
          <span className="text-subtle block text-[9px] tracking-wide uppercase">Réel</span>
          <span
            className={cn(
              "tabular block font-mono text-xs font-bold",
              published ? "text-fg" : "text-subtle",
            )}
          >
            {published ? fmt(release.actual) : "en attente"}
          </span>
        </span>
      </span>
    </Link>
  );
}
