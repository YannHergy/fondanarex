import { describe, expect, it } from 'vitest';

import { buildTranslatePrompt, parseTranslations, TRANSLATE_SYSTEM } from './translate';

const ITEMS = [
    { id: 'a1', title: 'US Dollar slips as ADP collapse offsets hot services', summary: 'One line.' },
    { id: 'b2', title: 'ECB turns hawkish on services inflation', summary: '' },
];

describe('TRANSLATE_SYSTEM', () => {
    it('protects the symbols that must survive translation', () => {
        // "EUR/USD" turned into "EUR sur USD" would break every tag the reader
        // relies on to recognise the pair.
        expect(TRANSLATE_SYSTEM).toMatch(/EUR\/USD/);
        expect(TRANSLATE_SYSTEM).toMatch(/BCE/);
    });

    it('forbids the model from adding or interpreting', () => {
        expect(TRANSLATE_SYSTEM).toMatch(/N'ajoute rien, n'interprète pas/);
    });
});

describe('buildTranslatePrompt', () => {
    const prompt = buildTranslatePrompt(ITEMS);

    it('sends every item with its identifier', () => {
        expect(prompt).toContain('"id":"a1"');
        expect(prompt).toContain('"id":"b2"');
        expect(prompt).toContain('ADP collapse');
    });

    it('states the count so a truncated answer is detectable', () => {
        expect(prompt).toContain('les 2 entrées');
    });

    it('insists the identifier is carried back unchanged', () => {
        expect(prompt).toMatch(/ne l'invente\s+pas/);
    });
});

describe('parseTranslations', () => {
    it('keys the result by identifier, never by position', () => {
        // The failure this guards: a model dropping one entry from a batch of
        // forty would shift every later headline onto the wrong article.
        const parsed = parseTranslations({
            traductions: [
                { id: 'b2', titre: 'La BCE durcit le ton', resume: '' },
                { id: 'a1', titre: 'Le Dollar recule', resume: 'Une ligne.' },
            ],
        });

        expect(parsed.get('a1')?.titre).toBe('Le Dollar recule');
        expect(parsed.get('b2')?.titre).toBe('La BCE durcit le ton');
    });

    it('drops an entry with no identifier or no title rather than storing a blank', () => {
        const parsed = parseTranslations({
            traductions: [
                { id: '', titre: 'x', resume: '' },
                { id: 'a1', titre: '   ', resume: '' },
                { id: 'b2', titre: 'Bon', resume: '' },
            ],
        });

        expect(parsed.size).toBe(1);
        expect(parsed.has('b2')).toBe(true);
    });

    it('tolerates a missing summary', () => {
        const parsed = parseTranslations({ traductions: [{ id: 'a1', titre: 'Titre' }] });
        expect(parsed.get('a1')?.resume).toBe('');
    });

    it('returns an empty map on anything malformed', () => {
        expect(parseTranslations(null).size).toBe(0);
        expect(parseTranslations({ traductions: 'non' }).size).toBe(0);
        expect(parseTranslations({}).size).toBe(0);
    });
});
