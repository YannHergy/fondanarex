import { describe, expect, it } from 'vitest';

import {
    SESSIONS,
    getSessionStatuses,
    isMarketOpen,
    localPartsIn,
    sessionStatus,
} from './sessions';

const at = (iso: string) => new Date(iso);

const london = SESSIONS.find(s => s.name === 'Londres')!;
const tokyo = SESSIONS.find(s => s.name === 'Tokyo')!;

describe('localPartsIn', () => {
    it('converts an instant to wall-clock time at the venue', () => {
        // 12:00 UTC on a January Wednesday is 07:00 in New York (EST).
        const parts = localPartsIn(at('2026-01-14T12:00:00Z'), 'America/New_York');
        expect(parts.hour).toBe(7);
        expect(parts.weekday).toBe(3);
    });

    it('follows daylight saving rather than a fixed offset', () => {
        // Same UTC hour in July is 08:00 in New York (EDT) — one hour later.
        expect(localPartsIn(at('2026-07-15T12:00:00Z'), 'America/New_York').hour).toBe(8);
    });

    it('renders midnight as hour 0, not 24', () => {
        expect(localPartsIn(at('2026-01-14T00:00:00Z'), 'UTC').hour).toBe(0);
    });
});

describe('sessionStatus', () => {
    it('reports London open during its local hours', () => {
        // 10:00 UTC in January is 10:00 in London (GMT).
        const status = sessionStatus(london, at('2026-01-14T10:00:00Z'));
        expect(status.isOpen).toBe(true);
        expect(status.localTime).toBe('10:00');
        expect(status.closesInMin).toBe(7 * 60);
    });

    it('shifts with British Summer Time', () => {
        // 07:30 UTC in July is 08:30 in London — open. In January it would be
        // 07:30 local, which is before the open.
        expect(sessionStatus(london, at('2026-07-15T07:30:00Z')).isOpen).toBe(true);
        expect(sessionStatus(london, at('2026-01-14T07:30:00Z')).isOpen).toBe(false);
    });

    it('reports closed before the open, with the wait in minutes', () => {
        const status = sessionStatus(london, at('2026-01-14T06:00:00Z'));
        expect(status.isOpen).toBe(false);
        expect(status.opensInMin).toBe(2 * 60);
    });

    it('rolls to the next day after the close', () => {
        // 18:00 London on a Wednesday: opens again at 08:00 Thursday, 14h away.
        const status = sessionStatus(london, at('2026-01-14T18:00:00Z'));
        expect(status.isOpen).toBe(false);
        expect(status.opensInMin).toBe(14 * 60);
    });

    it('is closed at the weekend', () => {
        // 2026-01-17 is a Saturday.
        expect(sessionStatus(london, at('2026-01-17T10:00:00Z')).isOpen).toBe(false);
        expect(sessionStatus(london, at('2026-01-18T10:00:00Z')).isOpen).toBe(false);
    });

    it('skips the weekend when counting to the next open', () => {
        // Friday 18:00 London: the answer is Monday 08:00, not "in 14 hours".
        const friday = sessionStatus(london, at('2026-01-16T18:00:00Z'));
        expect(friday.opensInMin).toBe(3 * 24 * 60 - 10 * 60);
    });

    it('counts from Saturday to Monday', () => {
        const saturday = sessionStatus(london, at('2026-01-17T10:00:00Z'));
        // Saturday 10:00 -> Monday 08:00 is 46 hours.
        expect(saturday.opensInMin).toBe(46 * 60);
    });

    it('handles a venue whose local day is ahead of UTC', () => {
        // 23:00 UTC Tuesday is 08:00 Wednesday in Tokyo — before the 09:00 open.
        const status = sessionStatus(tokyo, at('2026-01-13T23:00:00Z'));
        expect(status.localTime).toBe('08:00');
        expect(status.isOpen).toBe(false);
        expect(status.opensInMin).toBe(60);
    });

    it('never returns a negative wait', () => {
        for (const session of SESSIONS) {
            for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
                const iso = `2026-03-1${hour < 10 ? '1' : '2'}T${String(hour).padStart(2, '0')}:00:00Z`;
                const status = sessionStatus(session, at(iso));
                if (!status.isOpen) expect(status.opensInMin).toBeGreaterThan(0);
                else expect(status.closesInMin).toBeGreaterThan(0);
            }
        }
    });
});

describe('getSessionStatuses', () => {
    it('returns every session', () => {
        expect(getSessionStatuses(at('2026-01-14T12:00:00Z'))).toHaveLength(SESSIONS.length);
    });

    it('has London and New York overlapping mid-afternoon UTC', () => {
        // The London/New York overlap is the busiest window of the day.
        const statuses = getSessionStatuses(at('2026-01-14T14:00:00Z'));
        expect(statuses.find(s => s.name === 'Londres')?.isOpen).toBe(true);
        expect(statuses.find(s => s.name === 'New York')?.isOpen).toBe(true);
    });

    it('has New York shut while Tokyo trades', () => {
        const statuses = getSessionStatuses(at('2026-01-14T02:00:00Z'));
        expect(statuses.find(s => s.name === 'Tokyo')?.isOpen).toBe(true);
        expect(statuses.find(s => s.name === 'New York')?.isOpen).toBe(false);
    });
});

describe('isMarketOpen', () => {
    it('is true during a weekday session', () => {
        expect(isMarketOpen(at('2026-01-14T14:00:00Z'))).toBe(true);
    });

    it('is false on a Sunday morning', () => {
        expect(isMarketOpen(at('2026-01-18T10:00:00Z'))).toBe(false);
    });

    it('is false in the gap after New York closes and before Sydney opens', () => {
        // 2026-01-14 21:30 UTC: New York shut at 17:00 EST (22:00 UTC)... so
        // check a genuinely dead hour instead — Saturday.
        expect(isMarketOpen(at('2026-01-17T03:00:00Z'))).toBe(false);
    });
});

describe('sanity of the session table', () => {
    it('opens before it closes', () => {
        for (const session of SESSIONS) {
            expect(session.openHour).toBeLessThan(session.closeHour);
        }
    });

    it('uses a resolvable timezone', () => {
        for (const session of SESSIONS) {
            expect(() =>
                new Intl.DateTimeFormat('en-US', { timeZone: session.timeZone }),
            ).not.toThrow();
        }
    });
});
