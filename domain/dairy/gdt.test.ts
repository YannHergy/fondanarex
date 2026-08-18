import { describe, expect, it } from 'vitest';

import {
    gdtVerdict,
    isStale,
    nextGdtAuction,
    parseEventDate,
    parseEventSummary,
    parseTwelveEvents,
    STALE_AFTER_DAYS,
} from './gdt';

/** The real payload served for Event 409, copied verbatim. */
const EVENT_409 = {
    EventSummary: {
        EventNumber: '409.00',
        EventDate: 'August 4, 2026 12:00:00',
        EventLabel: 'Event',
        QuantitySold: '40504',
        AveragePublishedPrice: '3778',
        ChangeInPriceIndex: '0.1',
    },
};

describe('parseEventDate', () => {
    it('reads the published format', () => {
        expect(parseEventDate('August 4, 2026 12:00:00')?.toISOString()).toBe(
            '2026-08-04T12:00:00.000Z',
        );
        expect(parseEventDate('February 17, 2026 12:00:00')?.toISOString()).toBe(
            '2026-02-17T12:00:00.000Z',
        );
    });

    it('refuses a date that does not exist rather than rolling it forward', () => {
        // Date.UTC would happily turn this into 1 July.
        expect(parseEventDate('June 31, 2026 12:00:00')).toBeNull();
        expect(parseEventDate('February 30, 2026')).toBeNull();
    });

    it('refuses what it cannot read', () => {
        expect(parseEventDate('Août 4, 2026')).toBeNull();
        expect(parseEventDate('2026-08-04')).toBeNull();
        expect(parseEventDate('')).toBeNull();
        expect(parseEventDate(null)).toBeNull();
        expect(parseEventDate(42)).toBeNull();
    });
});

describe('parseEventSummary', () => {
    it('reads the real Event 409 payload', () => {
        const event = parseEventSummary(EVENT_409);

        expect(event).not.toBeNull();
        expect(event!.eventNumber).toBe(409);
        expect(event!.changePct).toBe(0.1);
        expect(event!.averagePrice).toBe(3778);
        expect(event!.eventDate.toISOString()).toBe('2026-08-04T12:00:00.000Z');
    });

    it('keeps the sign on a fall', () => {
        const event = parseEventSummary({
            EventSummary: { ...EVENT_409.EventSummary, ChangeInPriceIndex: '-3.4' },
        });
        expect(event!.changePct).toBe(-3.4);
    });

    it('accepts a flat auction, which is a reading and not a gap', () => {
        const event = parseEventSummary({
            EventSummary: { ...EVENT_409.EventSummary, ChangeInPriceIndex: '0' },
        });
        expect(event!.changePct).toBe(0);
    });

    it('refuses an implausible move instead of pegging the NZD score', () => {
        for (const absurd of ['103.55', '-40', '999']) {
            expect(
                parseEventSummary({
                    EventSummary: { ...EVENT_409.EventSummary, ChangeInPriceIndex: absurd },
                }),
            ).toBeNull();
        }
    });

    it('refuses a partial event', () => {
        const { ChangeInPriceIndex, ...withoutChange } = EVENT_409.EventSummary;
        void ChangeInPriceIndex;
        expect(parseEventSummary({ EventSummary: withoutChange })).toBeNull();

        const { EventDate, ...withoutDate } = EVENT_409.EventSummary;
        void EventDate;
        expect(parseEventSummary({ EventSummary: withoutDate })).toBeNull();
    });

    it('keeps the event when only the average price is missing', () => {
        const { AveragePublishedPrice, ...rest } = EVENT_409.EventSummary;
        void AveragePublishedPrice;
        const event = parseEventSummary({ EventSummary: rest });

        expect(event).not.toBeNull();
        expect(event!.averagePrice).toBeNull();
        expect(event!.changePct).toBe(0.1);
    });

    it('survives an empty or malformed payload', () => {
        expect(parseEventSummary(null)).toBeNull();
        expect(parseEventSummary(undefined)).toBeNull();
        expect(parseEventSummary({})).toBeNull();
        expect(parseEventSummary({ EventSummary: {} })).toBeNull();
    });
});

describe('parseTwelveEvents', () => {
    const HISTORY = {
        PriceIndicesTwelveMonths: {
            Events: {
                EventDetails: [
                    { EventNumber: '400.00', EventDate: 'March 17, 2026 12:00:00', PriceIndexPercentageChange: '0.1', PriceIndex: '1273' },
                    { EventNumber: '398.00', EventDate: 'February 17, 2026 12:00:00', PriceIndexPercentageChange: '3.6', PriceIndex: '1202' },
                    { EventNumber: '401.00', EventDate: 'April 7, 2026 12:00:00', PriceIndexPercentageChange: '-3.4', PriceIndex: '1230' },
                ],
            },
        },
    };

    it('returns the events oldest first whatever order they arrived in', () => {
        const points = parseTwelveEvents(HISTORY);
        expect(points.map((p) => p.eventNumber)).toEqual([398, 400, 401]);
    });

    it('keeps signs and index levels', () => {
        const points = parseTwelveEvents(HISTORY);
        expect(points.map((p) => p.changePct)).toEqual([3.6, 0.1, -3.4]);
        expect(points.map((p) => p.priceIndex)).toEqual([1202, 1273, 1230]);
    });

    it('agrees with the index levels it reports', () => {
        // 1273 -> 1230 is -3.38%, published as -3.4. If the sign convention
        // were ever inverted upstream, this is the test that would catch it.
        const points = parseTwelveEvents(HISTORY);
        const [, previous, latest] = points;
        const derived = ((latest!.priceIndex! - previous!.priceIndex!) / previous!.priceIndex!) * 100;
        expect(derived).toBeCloseTo(latest!.changePct, 1);
    });

    it('skips a malformed entry rather than losing the series', () => {
        const points = parseTwelveEvents({
            PriceIndicesTwelveMonths: {
                Events: {
                    EventDetails: [
                        ...HISTORY.PriceIndicesTwelveMonths.Events.EventDetails,
                        { EventNumber: 'oops', EventDate: 'nonsense', PriceIndexPercentageChange: 'x' },
                    ],
                },
            },
        });
        expect(points).toHaveLength(3);
    });

    it('survives an empty payload', () => {
        expect(parseTwelveEvents(null)).toEqual([]);
        expect(parseTwelveEvents({})).toEqual([]);
    });
});

describe('isStale', () => {
    const event = parseEventSummary(EVENT_409)!;

    it('accepts a fresh auction', () => {
        expect(isStale(event, new Date('2026-08-06T00:00:00Z'))).toBe(false);
        expect(isStale(event, new Date('2026-08-20T00:00:00Z'))).toBe(false);
    });

    it('flags one the fortnightly cadence should have replaced', () => {
        expect(isStale(event, new Date('2026-09-20T00:00:00Z'))).toBe(true);
    });

    it('turns over exactly at the threshold', () => {
        const boundary = new Date(event.eventDate.getTime() + STALE_AFTER_DAYS * 86_400_000);
        expect(isStale(event, boundary)).toBe(false);
        expect(isStale(event, new Date(boundary.getTime() + 1000))).toBe(true);
    });
});

describe('gdtVerdict', () => {
    it('reads the move the way a trader would', () => {
        expect(gdtVerdict(5.7)).toBe('Enchères laitières en forte hausse');
        expect(gdtVerdict(1.5)).toBe('Enchères laitières en hausse');
        expect(gdtVerdict(0.1)).toBe('Enchères laitières stables');
        expect(gdtVerdict(-2.7)).toBe('Enchères laitières en baisse');
        expect(gdtVerdict(-5.1)).toBe('Enchères laitières en forte baisse');
    });
});

describe('nextGdtAuction', () => {
    /**
     * Les treize enchères servies par la source le 2026-08-18, dans l'ordre.
     * Elles portent la règle : chacune doit prédire la suivante.
     */
    const SERVED = [
        '2026-02-03', '2026-02-17', '2026-03-03', '2026-03-17', '2026-04-07',
        '2026-04-21', '2026-05-05', '2026-05-19', '2026-06-02', '2026-06-16',
        '2026-07-07', '2026-07-21', '2026-08-04',
    ];

    it('predit chaque enchere reellement tenue a partir de la precedente', () => {
        for (let i = 0; i < SERVED.length - 1; i += 1) {
            // Minuit le lendemain de l'enchère : la publication du jour même
            // est passée, la suivante ne l'est pas.
            const after = new Date(`${SERVED[i]}T23:59:59Z`);
            expect(nextGdtAuction(after).toISOString().slice(0, 10)).toBe(SERVED[i + 1]);
        }
    });

    it('couvre les ecarts de 21 jours, qui ne sont pas des irregularites', () => {
        // 1er mars 2026 = dimanche -> 1er mardi le 3. 1er avril = mercredi ->
        // 1er mardi le 7. D'où trois semaines entre le 17/03 et le 07/04, là
        // où « +14 jours » tombait sur le 31/03, un mardi sans enchère.
        expect(nextGdtAuction(new Date('2026-03-17T23:59:59Z')).toISOString().slice(0, 10))
            .toBe('2026-04-07');
        expect(nextGdtAuction(new Date('2026-06-16T23:59:59Z')).toISOString().slice(0, 10))
            .toBe('2026-07-07');
    });

    it('vise APRES la mise en ligne, pas l ouverture de l enchere', () => {
        // Le repère doit tomber après 15h14 UTC, heure relevée de publication
        // de l'enchère 409 : un repère plus tôt fait consommer le déclencheur
        // par un rafraîchissement lancé avant que GDT n'ait rien publié.
        const next = nextGdtAuction(new Date('2026-08-04T23:59:59Z'));
        expect(next.toISOString()).toBe('2026-08-18T16:00:00.000Z');
    });

    it('franchit le changement d annee', () => {
        expect(nextGdtAuction(new Date('2026-12-15T23:59:59Z')).toISOString().slice(0, 10))
            .toBe('2027-01-05');
    });

    it('rend la prochaine du mois quand on interroge avant la premiere', () => {
        expect(nextGdtAuction(new Date('2026-08-01T00:00:00Z')).toISOString().slice(0, 10))
            .toBe('2026-08-04');
    });

    it('ne rend jamais un instant deja passe', () => {
        // Le jour même de l'enchère, mais AVANT la mise en ligne : c'est bien
        // celle du jour qui est attendue, pas la suivante.
        expect(nextGdtAuction(new Date('2026-08-18T09:00:00Z')).toISOString())
            .toBe('2026-08-18T16:00:00.000Z');
    });
});
