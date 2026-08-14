import "server-only";

/**
 * Switzerland's own published release calendars — the SNB's quarterly
 * monetary policy assessment dates and the BFS's monthly CPI release dates.
 *
 * Neither institution offers a machine-readable feed: the SNB's decisions
 * page is plain HTML with no calendar file, and the BFS's "Landesindex der
 * Konsumentenpreise" release calendar (see the dataset on opendata.swiss) is
 * published as PDF/XLS only. Both institutions DO announce their full-year
 * calendar publicly, months in advance, so the confirmed dates are recorded
 * here instead of paying for FXMacroData's forecast calendar just for these
 * two CHF fields — verified against snb.ch and bfs.admin.ch on 2026-08-13.
 *
 * Extend each list once the next year's calendar is published; a date past
 * the end of the list correctly falls through to `null` (shown as "—")
 * rather than guessing.
 *
 * TIME on the SNB assessments: the press release goes out at 09:30 local
 * time — confirmed against snb.ch's own description of the process ("At
 * 9.30 am on the Thursday... a press release on the monetary policy decision
 * is published"). Stored as the correct UTC instant per date rather than a
 * bare date + a fixed offset, since Switzerland moves between CET and CEST
 * (last Sunday of March to last Sunday of October) and 09:30 local is not
 * the same UTC hour year-round.
 *
 * The BFS CPI dates carry NO verified time — unlike the SNB, no fixed
 * publication hour was confirmed for these, so they stay at midnight UTC
 * (shown as a date, not a moment) rather than guessing one.
 */

/** SNB monetary policy assessment instants (UTC) — always a Thursday, quarterly, 09:30 local. */
const SNB_ASSESSMENTS = [
  "2026-03-19T08:30:00Z", // CET
  "2026-06-18T07:30:00Z", // CEST
  "2026-09-24T07:30:00Z", // CEST (ends 2026-10-25)
  "2026-12-10T08:30:00Z", // CET
];

/** BFS Landesindex der Konsumentenpreise (LIK) release dates, 2026 — no verified time. */
const BFS_CPI_RELEASES = [
  "2026-01-13T00:00:00Z",
  "2026-02-04T00:00:00Z",
  "2026-03-02T00:00:00Z",
  "2026-04-05T00:00:00Z",
  "2026-05-05T00:00:00Z",
  "2026-06-04T00:00:00Z",
  "2026-07-02T00:00:00Z",
  "2026-08-03T00:00:00Z",
  "2026-09-03T00:00:00Z",
  "2026-10-01T00:00:00Z",
  "2026-11-03T00:00:00Z",
  "2026-12-02T00:00:00Z",
  "2027-01-05T00:00:00Z",
];

function nextAfter(instants: readonly string[], after: Date): Date | null {
  const cutoff = after.getTime();
  for (const iso of instants) {
    const d = new Date(iso);
    if (d.getTime() > cutoff) return d;
  }
  return null;
}

/** The SNB's next monetary policy assessment after the given date, or null past the known calendar. */
export function nextSnbAssessment(after: Date): Date | null {
  return nextAfter(SNB_ASSESSMENTS, after);
}

/** The BFS's next CPI release after the given date, or null past the known calendar. */
export function nextBfsCpiRelease(after: Date): Date | null {
  return nextAfter(BFS_CPI_RELEASES, after);
}
