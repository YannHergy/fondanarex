// ================================================================
// FX TRADING SESSIONS
//
// Session open/close is pure clock arithmetic — it needs no API.
// The legacy app fetched it from FXMacroData, which made a panel
// that cannot fail depend on a subscription that can.
//
// Sessions are defined by their LOCAL hours in their own timezone,
// not by fixed UTC offsets. London opens at 08:00 London time all
// year; in UTC that is 08:00 in winter and 07:00 under British
// Summer Time. Hardcoding UTC hours is correct for roughly half the
// year and silently an hour out for the other half.
// ================================================================

export interface SessionDefinition {
    name: string;
    /** IANA timezone — the source of truth for DST. */
    timeZone: string;
    /** Local opening hour, 24h. */
    openHour: number;
    /** Local closing hour, 24h. */
    closeHour: number;
}

/** The four majors, in the order the market opens through the day. */
export const SESSIONS: readonly SessionDefinition[] = [
    { name: 'Sydney', timeZone: 'Australia/Sydney', openHour: 8, closeHour: 17 },
    { name: 'Tokyo', timeZone: 'Asia/Tokyo', openHour: 9, closeHour: 18 },
    { name: 'Londres', timeZone: 'Europe/London', openHour: 8, closeHour: 17 },
    { name: 'New York', timeZone: 'America/New_York', openHour: 8, closeHour: 17 },
];

export interface SessionStatus {
    name: string;
    timeZone: string;
    isOpen: boolean;
    /** Local time at the venue, "HH:MM". */
    localTime: string;
    /** Minutes until it closes, when open. */
    closesInMin?: number;
    /** Minutes until it next opens, when closed. */
    opensInMin?: number;
}

const MINUTES_PER_DAY = 24 * 60;

interface LocalParts {
    hour: number;
    minute: number;
    /** 0 = Sunday, 6 = Saturday. */
    weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

/**
 * Wall-clock time at a venue for a given instant.
 *
 * Uses Intl rather than a fixed offset so daylight saving is handled by the
 * platform's timezone database instead of being approximated here.
 */
export function localPartsIn(date: Date, timeZone: string): LocalParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

    // Intl renders midnight as "24" in some environments under hour12: false.
    const rawHour = Number(get('hour'));
    const hour = rawHour === 24 ? 0 : rawHour;

    return {
        hour,
        minute: Number(get('minute')),
        weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    };
}

/**
 * Status of one session at a given instant.
 *
 * The FX market is shut over the weekend, so a session is only open on its own
 * local weekdays. When closed, `opensInMin` counts forward to the next opening,
 * skipping Saturday and Sunday — the answer on a Friday evening is Monday, not
 * "in 15 hours".
 */
export function sessionStatus(session: SessionDefinition, now: Date): SessionStatus {
    const { hour, minute, weekday } = localPartsIn(now, session.timeZone);

    const nowMinutes = hour * 60 + minute;
    const openMinutes = session.openHour * 60;
    const closeMinutes = session.closeHour * 60;

    const localTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const isWeekend = weekday === 0 || weekday === 6;

    if (!isWeekend && nowMinutes >= openMinutes && nowMinutes < closeMinutes) {
        return {
            name: session.name,
            timeZone: session.timeZone,
            isOpen: true,
            localTime,
            closesInMin: closeMinutes - nowMinutes,
        };
    }

    // Days to wait before the next session day, counting today if the open is
    // still ahead of us.
    let daysAhead = 0;
    let cursor = weekday;

    if (isWeekend || nowMinutes >= closeMinutes) {
        daysAhead = 1;
        cursor = (weekday + 1) % 7;
    }

    while (cursor === 0 || cursor === 6) {
        daysAhead += 1;
        cursor = (cursor + 1) % 7;
    }

    const opensInMin =
        daysAhead * MINUTES_PER_DAY + openMinutes - nowMinutes;

    return {
        name: session.name,
        timeZone: session.timeZone,
        isOpen: false,
        localTime,
        opensInMin,
    };
}

/** Status of every session at a given instant. */
export function getSessionStatuses(now: Date): SessionStatus[] {
    return SESSIONS.map(session => sessionStatus(session, now));
}

/** True when at least one session is trading. */
export function isMarketOpen(now: Date): boolean {
    return getSessionStatuses(now).some(s => s.isOpen);
}
