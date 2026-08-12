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
 */

/** SNB monetary policy assessments — always a Thursday, quarterly. */
const SNB_ASSESSMENTS = ["2026-03-19", "2026-06-18", "2026-09-24", "2026-12-10"];

/** BFS Landesindex der Konsumentenpreise (LIK) release dates, 2026. */
const BFS_CPI_RELEASES = [
  "2026-01-13",
  "2026-02-04",
  "2026-03-02",
  "2026-04-05",
  "2026-05-05",
  "2026-06-04",
  "2026-07-02",
  "2026-08-03",
  "2026-09-03",
  "2026-10-01",
  "2026-11-03",
  "2026-12-02",
  "2027-01-05",
];

function nextAfter(dates: readonly string[], after: Date): Date | null {
  const cutoff = after.getTime();
  for (const iso of dates) {
    const d = new Date(`${iso}T00:00:00Z`);
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
