import { describe, expect, it } from 'vitest';

import {
    activeJournalRows,
    activeNewsRows,
    CURRENCY_COLORS,
    escapePineString,
    generateJournalPine,
    generateNewsPine,
    hexToRgb,
    type JournalRow,
    type NewsRow,
} from './generator';

const NOW = new Date('2026-08-05T12:00:00Z');

function news(overrides: Partial<NewsRow> = {}): NewsRow {
    return {
        id: 'n1',
        enabled: true,
        date: '2026-08-05',
        time: '13:30',
        label: 'NFP',
        currency: 'USD',
        color: '#F23645',
        width: 2,
        ...overrides,
    };
}

function journal(overrides: Partial<JournalRow> = {}): JournalRow {
    return {
        id: 'j1',
        enabled: true,
        date: '2026-08-05',
        time: '13:30',
        currency: 'USD',
        category: 'Fondamental',
        title: 'NFP au-dessus du consensus',
        note: 'Marché du travail solide',
        sentiment: 'bullish',
        appreciation: 'like',
        ...overrides,
    };
}

describe('escapePineString', () => {
    it('escapes double quotes', () => {
        expect(escapePineString('dit "oui"')).toBe('dit \\"oui\\"');
    });

    it('escapes backslashes BEFORE quotes', () => {
        // The legacy news generator escaped only quotes, so a backslash in a
        // label produced a script that would not compile. Escaping quotes
        // first would then double-escape the backslashes just inserted.
        expect(escapePineString('a\\b')).toBe('a\\\\b');
        expect(escapePineString('a\\"b')).toBe('a\\\\\\"b');
    });

    it('collapses newlines, which would terminate a Pine string', () => {
        expect(escapePineString('ligne1\nligne2')).toBe('ligne1 ligne2');
        expect(escapePineString('ligne1\r\nligne2')).toBe('ligne1 ligne2');
    });

    it('trims surrounding space', () => {
        expect(escapePineString('  NFP  ')).toBe('NFP');
    });

    it('leaves ordinary text untouched', () => {
        expect(escapePineString('CPI zone euro')).toBe('CPI zone euro');
    });
});

describe('hexToRgb', () => {
    it('converts a six-digit hex colour', () => {
        expect(hexToRgb('#26A69A')).toBe('38, 166, 154');
        expect(hexToRgb('#000000')).toBe('0, 0, 0');
        expect(hexToRgb('#FFFFFF')).toBe('255, 255, 255');
    });

    it('accepts a missing hash and mixed case', () => {
        expect(hexToRgb('26a69a')).toBe('38, 166, 154');
    });

    it('falls back to grey rather than emitting NaN', () => {
        // NaN in the generated source makes the whole script fail to compile.
        expect(hexToRgb('not-a-colour')).toBe('128, 128, 128');
        expect(hexToRgb('#FFF')).toBe('128, 128, 128');
        expect(hexToRgb('')).toBe('128, 128, 128');
    });
});

describe('currency colours', () => {
    it('gives every currency a colour', () => {
        for (const code of ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF']) {
            expect(CURRENCY_COLORS[code]).toMatch(/^#[0-9A-F]{6}$/i);
        }
    });

    it('does not use pure white, which is invisible on a light chart', () => {
        // GBP was #FFFFFF in the legacy palette.
        expect(Object.values(CURRENCY_COLORS)).not.toContain('#FFFFFF');
    });
});

describe('activeNewsRows', () => {
    it('keeps only complete, enabled rows', () => {
        const rows = [
            news(),
            news({ id: 'n2', enabled: false }),
            news({ id: 'n3', date: '' }),
            news({ id: 'n4', time: '' }),
            news({ id: 'n5', label: '   ' }),
        ];
        expect(activeNewsRows(rows).map((row) => row.id)).toEqual(['n1']);
    });
});

describe('activeJournalRows', () => {
    it('requires a title', () => {
        expect(activeJournalRows([journal({ title: '  ' })])).toEqual([]);
        expect(activeJournalRows([journal()])).toHaveLength(1);
    });
});

describe('generateNewsPine', () => {
    it('declares the Pine version and the indicator', () => {
        const code = generateNewsPine([news()], NOW);
        expect(code.startsWith('//@version=6')).toBe(true);
        expect(code).toContain('indicator("News Lines", overlay=true');
    });

    it('emits a line and a label per row', () => {
        const code = generateNewsPine([news(), news({ id: 'n2', label: 'CPI' })], NOW);
        expect(code.match(/line\.new\(/g)).toHaveLength(2);
        expect(code.match(/label\.new\(/g)).toHaveLength(2);
    });

    it('timestamps in UTC', () => {
        const code = generateNewsPine([news()], NOW);
        expect(code).toContain('timestamp("2026-08-05 13:30 +0000")');
    });

    it('carries the row colour and width', () => {
        const code = generateNewsPine([news({ color: '#2962FF', width: 4 })], NOW);
        expect(code).toContain('color=#2962FF');
        expect(code).toContain('width=4');
    });

    it('clamps a width Pine would reject', () => {
        expect(generateNewsPine([news({ width: 99 })], NOW)).toContain('width=5');
        expect(generateNewsPine([news({ width: 0 })], NOW)).toContain('width=1');
        expect(generateNewsPine([news({ width: Number.NaN })], NOW)).toContain('width=2');
    });

    it('escapes a label that would otherwise break the string literal', () => {
        const code = generateNewsPine([news({ label: 'Fed "dovish" \\ hawkish' })], NOW);
        expect(code).toContain('text="Fed \\"dovish\\" \\\\ hawkish"');
        // Nothing unescaped survives into the literal.
        expect(code).not.toMatch(/text="[^"]*[^\\]"[^,)]/);
    });

    it('says so rather than emitting a broken script when nothing is active', () => {
        const code = generateNewsPine([news({ enabled: false })], NOW);
        expect(code).toContain('Aucune news activee');
        expect(code).not.toContain('line.new(');
    });

    it('still produces a valid shell with no rows at all', () => {
        const code = generateNewsPine([], NOW);
        expect(code).toContain('indicator("News Lines"');
        expect(code).toContain('barstate.islast');
    });

    it('deletes previous drawings before redrawing', () => {
        // Without this every recalculation stacks lines until the 500-object
        // ceiling silently truncates the newest.
        const code = generateNewsPine([news()], NOW);
        expect(code).toContain('line.delete(');
        expect(code).toContain('label.delete(');
        expect(code).toContain('array.clear(_l)');
    });

    it('contains no emoji', () => {
        const code = generateNewsPine([news()], NOW);
        expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('dates the header from the first active row, not the clock', () => {
        const code = generateNewsPine([news({ date: '2026-03-02' })], NOW);
        expect(code).toContain('semaine du 2 mars 2026');
    });

    it('falls back to today when nothing is active', () => {
        expect(generateNewsPine([], NOW)).toContain('semaine du 5 août 2026');
    });

    it('tolerates a malformed date without producing NaN', () => {
        const code = generateNewsPine([news({ date: 'not-a-date' })], NOW);
        expect(code).not.toContain('NaN');
        expect(code).not.toContain('Invalid Date');
    });
});

describe('generateJournalPine', () => {
    it('declares the indicator', () => {
        const code = generateJournalPine([journal()]);
        expect(code.startsWith('//@version=6')).toBe(true);
        expect(code).toContain('indicator("Event Journal", overlay=true');
    });

    it('writes the sentiment and verdict as words', () => {
        const code = generateJournalPine([journal()]);
        expect(code).toContain('Haussier · Favorable · USD');
    });

    it('colours the line by sentiment', () => {
        expect(generateJournalPine([journal({ sentiment: 'bullish' })])).toContain('38, 166, 154');
        expect(generateJournalPine([journal({ sentiment: 'bearish' })])).toContain('239, 83, 80');
        expect(generateJournalPine([journal({ sentiment: 'neutral' })])).toContain('120, 144, 156');
    });

    it('escapes the title and the note', () => {
        const code = generateJournalPine([
            journal({ title: 'BCE "prudente"', note: 'chemin\\risque' }),
        ]);
        expect(code).toContain('BCE \\"prudente\\"');
        expect(code).toContain('chemin\\\\risque');
    });

    it('collapses a multi-line note onto one line', () => {
        const code = generateJournalPine([journal({ note: 'premiere\nseconde' })]);
        expect(code).toContain('premiere seconde');
    });

    it('truncates a very long note', () => {
        const code = generateJournalPine([journal({ note: 'x'.repeat(400) })]);
        expect(code).not.toContain('x'.repeat(200));
    });

    it('omits the separator when there is no note', () => {
        const withNote = generateJournalPine([journal({ note: 'solide' })]);
        expect(withNote).toContain('Fondamental — solide');

        const without = generateJournalPine([journal({ note: '' })]);
        // A literal backslash-n in the generated source, which Pine renders as
        // a line break inside the label.
        expect(without).toContain('\\nFondamental"');
        expect(without).not.toContain('Fondamental —');
    });

    it('contains no emoji', () => {
        // Pine renders emoji inconsistently across platforms and they are
        // illegible at size.small, which a chart annotation has to be.
        const code = generateJournalPine([journal()]);
        expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('says so when nothing is active', () => {
        const code = generateJournalPine([journal({ enabled: false })]);
        expect(code).toContain('Aucun evenement active');
        expect(code).not.toContain('line.new(');
    });

    it('emits one line per active entry', () => {
        const code = generateJournalPine([journal(), journal({ id: 'j2', title: 'BCE' })]);
        expect(code.match(/line\.new\(/g)).toHaveLength(2);
    });
});

describe('generated source integrity', () => {
    it('never leaves an odd number of unescaped quotes on a line', () => {
        // An unbalanced quote is the failure mode that makes TradingView
        // refuse the whole script with an unhelpful error.
        const code = generateNewsPine(
            [news({ label: 'a"b' }), news({ id: 'n2', label: 'c\\"d' })],
            NOW,
        );

        for (const line of code.split('\n')) {
            if (line.trim().startsWith('//')) continue;
            const unescaped = line.replace(/\\\\/g, '').replace(/\\"/g, '');
            expect((unescaped.match(/"/g) ?? []).length % 2).toBe(0);
        }
    });

    it('produces the same output for the same input', () => {
        const rows = [news(), news({ id: 'n2', label: 'CPI' })];
        expect(generateNewsPine(rows, NOW)).toBe(generateNewsPine(rows, NOW));
    });
});
