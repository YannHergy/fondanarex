import "server-only";

/**
 * The Bank of Canada's own published interest-rate announcement calendar.
 *
 * The BoC's Valet API supplies the rate itself (see boc.ts) but carries no
 * forecast calendar, and StatCan does not set monetary policy so it has
 * nothing to say about it either. The only thing that had ever supplied a
 * "prochaine" date for CAD's policy rate was FXMacroData's paid feed, which
 * returns nothing for this field — so the card showed "Prochaine : —" on the
 * indicator carrying 13% of the currency's score.
 *
 * The Bank publishes its schedule itself, a year ahead, on
 * bankofcanada.ca/press/upcoming-events — verified there on 2026-08-17, which
 * is also where the 09:45 announcement time comes from. Same approach as
 * uk-calendar.ts, ch-calendar.ts and jp-calendar.ts.
 *
 * TIMES: 09:45 Eastern, stored as the correct UTC instant per date rather
 * than a fixed offset — Canada moves between EST and EDT (second Sunday of
 * March to first Sunday of November), so 09:45 local is 13:45 UTC in summer
 * and 14:45 UTC in winter. Computed per date so a wrong rule shows up in a
 * diff rather than silently shifting an hour.
 *
 * Extend the list once the Bank confirms the next year; a date past the end
 * correctly falls through to `null` (shown as "—") rather than guessing.
 */

/** Interest rate announcement instants (UTC) — eight per year, 09:45 Eastern. */
const BOC_DECISIONS = [
  "2026-09-02T13:45:00Z", // EDT
  "2026-10-28T13:45:00Z", // EDT (ends 2026-11-01)
  "2026-12-09T14:45:00Z", // EST
];

function nextAfter(instants: readonly string[], after: Date): Date | null {
  const cutoff = after.getTime();
  for (const iso of instants) {
    const d = new Date(iso);
    if (d.getTime() > cutoff) return d;
  }
  return null;
}

/** The Bank's next rate announcement after the given date, or null past the known calendar. */
export function nextBocDecision(after: Date): Date | null {
  return nextAfter(BOC_DECISIONS, after);
}
