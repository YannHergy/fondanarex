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
 */

/** MPC decision dates — always a Thursday, eight per year. */
const BOE_DECISIONS = [
  "2026-02-05",
  "2026-03-19",
  "2026-04-30",
  "2026-06-18",
  "2026-07-30",
  "2026-09-17",
  "2026-11-05",
  "2026-12-17",
  // 2027 dates are still "provisional" per the Bank's own page, not
  // "confirmed" — included anyway since a provisional date the Bank has
  // already published is still far better than none, and the Bank's provisional
  // dates have historically held.
  "2027-02-04",
  "2027-03-18",
  "2027-04-29",
  "2027-06-17",
  "2027-07-29",
  "2027-09-16",
  "2027-11-04",
  "2027-12-16",
];

function nextAfter(dates: readonly string[], after: Date): Date | null {
  const cutoff = after.getTime();
  for (const iso of dates) {
    const d = new Date(`${iso}T00:00:00Z`);
    if (d.getTime() > cutoff) return d;
  }
  return null;
}

/** The MPC's next decision after the given date, or null past the known calendar. */
export function nextBoeDecision(after: Date): Date | null {
  return nextAfter(BOE_DECISIONS, after);
}
