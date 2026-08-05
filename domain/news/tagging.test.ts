import { describe, expect, it } from 'vitest';

import { tagArticle } from './tagging';

function leanFor(currency: string, title: string, summary = '') {
    return tagArticle(title, summary).find((tag) => tag.currency === currency)?.lean;
}

function currencies(title: string, summary = '') {
    return tagArticle(title, summary)
        .map((tag) => tag.currency)
        .sort();
}

describe('tagArticle', () => {
    describe('word boundaries', () => {
        it('does not file a Boeing story under the pound', () => {
            // The legacy filter used bare substring tests, so 'boe' — for Bank
            // of England — matched inside "Boeing" and an FAA certification of
            // a 737 was shown as sterling news.
            expect(currencies('US FAA certifies Boeing 737 MAX 7 in win for planemaker')).not.toContain(
                'GBP',
            );
        });

        it('still catches the real Bank of England', () => {
            expect(currencies('BoE holds rates as Bailey signals caution')).toContain('GBP');
        });

        it('does not match a term buried inside a longer word', () => {
            // "AUDio", "CADence", "EURope" — each contains a currency code.
            expect(currencies('Audio streaming giant reports record quarter')).toEqual([]);
            expect(currencies('Cadence Design Systems beats estimates')).toEqual([]);
        });

        it('reads a term ending in a full stop', () => {
            expect(currencies('U.S. Dollar steady before payrolls')).toContain('USD');
        });
    });

    describe('direction per currency', () => {
        it('gives two currencies opposite leans in one sentence', () => {
            // A single article-level sentiment would have to be wrong about one
            // of them. This is the headline that forced per-currency direction.
            const title = 'British Pound rises as soft ADP jobs report weighs on Dollar';

            expect(leanFor('GBP', title)).toBe('bullish');
            expect(leanFor('USD', title)).toBe('bearish');
        });

        it('reads a verb that follows the currency', () => {
            expect(leanFor('USD', 'US Dollar slips as ADP collapse offsets hot services')).toBe(
                'bearish',
            );
            expect(leanFor('AUD', 'Australian Dollar climbs as softer US data lifts risk')).toBe(
                'bullish',
            );
        });

        it('reads a verb that precedes the currency', () => {
            expect(leanFor('JPY', 'Intervention fears pressured the Yen overnight')).toBe('bearish');
        });

        it('takes the nearest direction word, not the first in the sentence', () => {
            // "rises" sits beside the euro, "falls" beside the yen.
            const title = 'Euro rises while Japanese Yen falls after the release';

            expect(leanFor('EUR', title)).toBe('bullish');
            expect(leanFor('JPY', title)).toBe('bearish');
        });

        it('reads central-bank tone as direction', () => {
            expect(leanFor('EUR', 'ECB turns hawkish on services inflation')).toBe('bullish');
            expect(leanFor('CHF', 'SNB seen dovish as franc strength bites')).toBe('bearish');
        });

        it('stays neutral when nothing directional is near', () => {
            expect(leanFor('CAD', 'Bank of Canada decision due Wednesday')).toBe('neutral');
        });

        it('stays neutral rather than guessing on "against"', () => {
            // Honest limitation, asserted so it is a known state and not a
            // surprise: nothing here understands that A against B is two
            // opposite claims.
            const title = 'Euro steadies against Japanese Yen as Eurozone PMIs beat forecasts';

            expect(leanFor('EUR', title)).toBe('neutral');
            expect(leanFor('JPY', title)).toBe('neutral');
        });
    });

    describe('coverage', () => {
        it('tags every currency the headline actually names', () => {
            expect(currencies('Canadian Dollar firms as Oil rebounds, USD softens')).toEqual([
                'CAD',
                'USD',
            ]);
        });

        it('reads the summary as well as the title', () => {
            expect(
                currencies('Central bank watch', 'The Reserve Bank of New Zealand meets Wednesday'),
            ).toContain('NZD');
        });

        it('returns nothing on an unrelated headline', () => {
            // The caller must show this as "no news" rather than falling back to
            // a general feed: a trader shown three irrelevant articles under a
            // currency stops trusting the fourth.
            expect(currencies('SpaceX gives Nvidia a much-needed boost')).toEqual([]);
        });

        it('handles an empty input', () => {
            expect(tagArticle('')).toEqual([]);
        });
    });
});

describe('bare "dollar"', () => {
    it('reads it as the American one', () => {
        // Half the greenback's coverage lives in this form: a forex feed writes
        // "weighs on Dollar" as often as it writes "US Dollar".
        expect(currencies('Gold retreats as Dollar firms before payrolls')).toContain('USD');
    });

    it('does not steal it from the other dollars', () => {
        // The mirror image of the Boeing mistake: without the lookbehind, every
        // Canadian, Australian and New Zealand headline would also read USD.
        expect(currencies('Canadian Dollar firms as Oil rebounds')).toEqual(['CAD']);
        expect(currencies('Australian Dollar climbs on risk appetite')).toEqual(['AUD']);
        expect(currencies('New Zealand Dollar steadies after jobs data')).toEqual(['NZD']);
    });

    it('keeps both when both are named', () => {
        expect(currencies('Canadian Dollar firms as the Dollar softens')).toEqual(['CAD', 'USD']);
    });
});
