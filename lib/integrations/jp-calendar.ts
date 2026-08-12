import "server-only";

/**
 * Japan's own published release calendars — the Bank of Japan's monetary
 * policy meetings, the Statistics Bureau's CPI releases (national and Tokyo)
 * and the Ministry of Finance's balance of payments.
 *
 * Same reasoning as ch-calendar.ts: FXMacroData is paid and its forecast
 * calendar is the only thing that was supplying JPY dates, while every one of
 * these institutions publishes its own schedule publicly, months ahead, for
 * free. None offers a machine-readable feed (all are HTML tables or PDFs), so
 * the confirmed dates are recorded here — verified against boj.or.jp,
 * stat.go.jp and mof.go.jp on 2026-08-13.
 *
 * Extend each list once the next year's calendar is published; a date past
 * the end of a list correctly falls through to `null` (shown as "—") rather
 * than guessing.
 */

/**
 * BoJ monetary policy meetings — the date the DECISION is announced, i.e. the
 * second day of each two-day meeting. Eight per year.
 */
const BOJ_DECISIONS = [
  "2026-01-23",
  "2026-03-19",
  "2026-04-28",
  "2026-06-16",
  "2026-07-31",
  "2026-09-18",
  "2026-10-30",
  "2026-12-18",
  "2027-01-22",
  "2027-03-18",
  "2027-04-28",
  "2027-06-11",
  "2027-07-22",
  "2027-09-22",
  "2027-10-29",
  "2027-12-17",
];

/** Statistics Bureau — national CPI (the ex-fresh-food measure the profile scores). */
const JP_NATIONAL_CPI_RELEASES = [
  "2026-02-20",
  "2026-03-24",
  "2026-04-24",
  "2026-05-22",
  "2026-06-19",
  "2026-07-24",
  "2026-08-21",
  "2026-09-18",
  "2026-10-23",
  "2026-11-20",
  "2026-12-18",
  "2027-01-22",
  "2027-02-19",
];

/** Statistics Bureau — Tokyo CPI, the leading indicator, ~3 weeks ahead of the national print. */
const JP_TOKYO_CPI_RELEASES = [
  "2026-01-30",
  "2026-02-27",
  "2026-03-31",
  "2026-05-01",
  "2026-05-29",
  "2026-06-26",
  "2026-07-31",
  "2026-08-28",
  "2026-10-02",
  "2026-10-30",
  "2026-11-27",
  "2026-12-25",
  "2027-01-29",
];

/**
 * Balance of payments, released jointly by the MoF and the BoJ.
 *
 * Derived rather than listed, because the MoF publishes its BoP release dates
 * only a few months ahead — as of 2026-08-13 its calendar stopped at the
 * 10 August release and had nothing for the rest of the year, so a static
 * list would leave the field dateless for months at a time.
 *
 * The rule is the MoF's own and holds across every 2026 release checked:
 * reference month M is published on the 8th of month M+2, moved to the next
 * Monday when the 8th falls on a weekend. Verified against the published
 * dates: Feb 9 (8th = Sunday), Mar 9 (Sunday), Apr 8, Jun 8, Jul 8, Aug 10
 * (8th = Saturday) — six for six.
 *
 * Two documented exceptions this rule does NOT model, both harmless here
 * because they only ever push the real date LATER than the estimate: the
 * January release slips past the New Year holidays (13 Jan 2026, not the
 * 8th), and the March reference month is folded into a fiscal-year release
 * in May. Japanese public holidays falling on the 8th are not modelled
 * either — same one-day-early direction.
 */
function derivedBopRelease(year: number, month: number): Date {
  const eighth = new Date(Date.UTC(year, month - 1, 8));
  const day = eighth.getUTCDay();
  if (day === 6) eighth.setUTCDate(10); // Saturday -> Monday
  else if (day === 0) eighth.setUTCDate(9); // Sunday -> Monday
  return eighth;
}

function nextAfter(dates: readonly string[], after: Date): Date | null {
  const cutoff = after.getTime();
  for (const iso of dates) {
    const d = new Date(`${iso}T00:00:00Z`);
    if (d.getTime() > cutoff) return d;
  }
  return null;
}

/** The BoJ's next policy decision after the given date, or null past the known calendar. */
export function nextBojDecision(after: Date): Date | null {
  return nextAfter(BOJ_DECISIONS, after);
}

/** The next national CPI release after the given date, or null past the known calendar. */
export function nextJpNationalCpiRelease(after: Date): Date | null {
  return nextAfter(JP_NATIONAL_CPI_RELEASES, after);
}

/** The next Tokyo CPI release after the given date, or null past the known calendar. */
export function nextJpTokyoCpiRelease(after: Date): Date | null {
  return nextAfter(JP_TOKYO_CPI_RELEASES, after);
}

/** The next MoF/BoJ balance-of-payments release after the given date. */
export function nextJpBopRelease(after: Date): Date | null {
  // Start a month back, since this month's release may already have passed,
  // and walk forward until one lands in the future.
  const firstMonthIndex = after.getUTCFullYear() * 12 + after.getUTCMonth() - 1;
  for (let i = 0; i < 14; i += 1) {
    const monthIndex = firstMonthIndex + i;
    const release = derivedBopRelease(Math.floor(monthIndex / 12), (monthIndex % 12) + 1);
    if (release.getTime() > after.getTime()) return release;
  }
  return null;
}
