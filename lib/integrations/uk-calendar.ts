import "server-only";

/**
 * The Bank of England's own published MPC meeting calendar.
 *
 * The IADB CSV that supplies the Bank Rate itself (see boe.ts) carries no
 * forecast calendar, and the ONS does not set monetary policy so it has
 * nothing to say about it either — the only thing that had ever supplied a
 * "prochaine" date for GBP's policy rate was FXMacroData's paid forecast feed,
 * which was returning nothing for it (the field sat null in the database).
 * The Bank publishes its full-year MPC schedule itself, a year or more ahead,
 * so the confirmed dates are recorded here instead — same approach as
 * ch-calendar.ts and jp-calendar.ts — verified against
 * bankofengland.co.uk/monetary-policy/upcoming-mpc-dates on 2026-08-13.
 *
 * Extend the list once the next year's calendar is confirmed; a date past the
 * end of it correctly falls through to `null` (shown as "—") rather than
 * guessing.
 *
 * TIMES: the Bank publishes its decision at 12:00 UK time on the day itself
 * — confirmed against its own site (a September 2026 page was titled "to be
 * published at 12pm"). Stored below as the correct UTC instant for EACH
 * date, not a bare date + a fixed offset: the UK moves between GMT and BST
 * (last Sunday of March to last Sunday of October), so 12:00 local is 12:00
 * UTC in February but 11:00 UTC in June. Computed by hand per date rather
 * than at read time, so a wrong DST rule can be spotted in a diff.
 */

/** MPC decision instants (UTC) — always a Thursday, eight per year, 12:00 UK time. */
const BOE_DECISIONS = [
  "2026-02-05T12:00:00Z", // GMT
  "2026-03-19T12:00:00Z", // GMT (BST starts 2026-03-29)
  "2026-04-30T11:00:00Z", // BST
  "2026-06-18T11:00:00Z", // BST
  "2026-07-30T11:00:00Z", // BST
  "2026-09-17T11:00:00Z", // BST (ends 2026-10-25)
  "2026-11-05T12:00:00Z", // GMT
  "2026-12-17T12:00:00Z", // GMT
  // 2027 dates are still "provisional" per the Bank's own page, not
  // "confirmed" — included anyway since a provisional date the Bank has
  // already published is still far better than none, and the Bank's provisional
  // dates have historically held.
  "2027-02-04T12:00:00Z", // GMT
  "2027-03-18T12:00:00Z", // GMT (BST starts 2027-03-28)
  "2027-04-29T11:00:00Z", // BST
  "2027-06-17T11:00:00Z", // BST
  "2027-07-29T11:00:00Z", // BST
  "2027-09-16T11:00:00Z", // BST (ends 2027-10-31)
  "2027-11-04T12:00:00Z", // GMT
  "2027-12-16T12:00:00Z", // GMT
];

function nextAfter(instants: readonly string[], after: Date): Date | null {
  const cutoff = after.getTime();
  for (const iso of instants) {
    const d = new Date(iso);
    if (d.getTime() > cutoff) return d;
  }
  return null;
}

/** The MPC's next decision after the given date, or null past the known calendar. */
export function nextBoeDecision(after: Date): Date | null {
  return nextAfter(BOE_DECISIONS, after);
}
