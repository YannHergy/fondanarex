// ================================================================
// ISO WEEK ARITHMETIC
//
// Events are grouped by ISO week ("2026-W17"), which is also the
// denormalised `weekKey` column on WeeklyEvent.
//
// Everything here works in UTC. The legacy implementation read the
// local calendar date (getFullYear/getMonth/getDate) and then fed it
// into Date.UTC, mixing two clocks: for anyone west of Greenwich
// after 00:00 local, that resolves to the previous day and can land
// an event in the wrong week.
// ================================================================

const DAY_MS = 86_400_000;

/** ISO-8601 week key for a date, e.g. "2026-W17". */
export function getWeekKey(date: Date): string {
    // Thursday of the same week decides the year: ISO weeks belong to the year
    // containing their Thursday.
    const d = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));

    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);

    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday of the given ISO week, at 00:00 UTC. */
export function getMondayOfWeek(weekKey: string): Date {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
    if (!match) throw new Error(`Clé de semaine invalide : ${weekKey}`);

    const year = Number(match[1]);
    const week = Number(match[2]);

    // 4 January is always in ISO week 1.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week1Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS);

    return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

/** Monday to Friday of a week. Weekends carry no scheduled releases. */
export function getWeekDates(weekKey: string): Date[] {
    const monday = getMondayOfWeek(weekKey);
    return Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * DAY_MS));
}

/** Monday to Sunday, for range queries that must not miss a weekend entry. */
export function getWeekRange(weekKey: string): { start: Date; end: Date } {
    const start = getMondayOfWeek(weekKey);
    const end = new Date(start.getTime() + 7 * DAY_MS - 1);
    return { start, end };
}

export function dateToStr(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function prevWeekKey(weekKey: string): string {
    return getWeekKey(new Date(getMondayOfWeek(weekKey).getTime() - 7 * DAY_MS));
}

export function nextWeekKey(weekKey: string): string {
    return getWeekKey(new Date(getMondayOfWeek(weekKey).getTime() + 7 * DAY_MS));
}

/** The `count` weeks ending at `weekKey`, oldest first. */
export function weekKeysEndingAt(weekKey: string, count: number): string[] {
    const keys: string[] = [];
    let current = weekKey;
    for (let i = 0; i < count; i += 1) {
        keys.unshift(current);
        current = prevWeekKey(current);
    }
    return keys;
}
