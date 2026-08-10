import { describe, expect, it } from 'vitest';

import { buildCommentaryPrompt, parseCommentaryResponse, type CommentaryInput } from './comment';

const BASE: CommentaryInput = {
    label: 'Inflation (IPCH)',
    currency: 'EUR',
    value: 2.9,
    unit: '%',
    period: 'juillet 2026',
    previousValue: 2.8,
    previousPeriod: 'juin 2026',
    source: 'Eurostat',
    context: null,
};

describe('buildCommentaryPrompt', () => {
    it('inclut la valeur, la precedente et la source', () => {
        const prompt = buildCommentaryPrompt(BASE);
        expect(prompt).toContain('Inflation (IPCH)');
        expect(prompt).toContain('2.9% pour la période juillet 2026');
        expect(prompt).toContain('2.8%');
        expect(prompt).toContain('juin 2026');
        expect(prompt).toContain('Eurostat');
    });

    it("dit explicitement qu'il n'y a pas de precedent plutot que d'en inventer un", () => {
        const prompt = buildCommentaryPrompt({ ...BASE, previousValue: null, previousPeriod: null });
        expect(prompt).toContain('première lecture');
        expect(prompt).not.toContain('Valeur précédente');
    });

    it('omet la periode precedente si elle est inconnue mais que la valeur existe', () => {
        const prompt = buildCommentaryPrompt({ ...BASE, previousPeriod: null });
        expect(prompt).toContain('Valeur précédente : 2.8%');
        expect(prompt).not.toContain('(juin 2026)');
    });

    it('inclut le contexte quand il est fourni, pour situer la valeur par rapport a un objectif', () => {
        const prompt = buildCommentaryPrompt({
            ...BASE,
            context: "L'objectif de la BCE est une inflation proche de 2% à moyen terme.",
        });
        expect(prompt).toContain('Contexte : ');
        expect(prompt).toContain("L'objectif de la BCE est une inflation proche de 2% à moyen terme.");
    });

    it("n'ajoute aucune ligne de contexte quand il est absent, plutot que d'en inventer un", () => {
        const prompt = buildCommentaryPrompt({ ...BASE, context: null });
        expect(prompt).not.toContain('Contexte : ');
    });
});

describe('parseCommentaryResponse', () => {
    it('accepte une reponse bien formee et la nettoie', () => {
        expect(parseCommentaryResponse({ comment: '  Une phrase.  ' })).toBe('Une phrase.');
    });

    it('refuse une reponse vide ou du mauvais type', () => {
        expect(parseCommentaryResponse({ comment: '' })).toBeNull();
        expect(parseCommentaryResponse({ comment: '   ' })).toBeNull();
        expect(parseCommentaryResponse({ comment: 42 })).toBeNull();
        expect(parseCommentaryResponse({})).toBeNull();
        expect(parseCommentaryResponse(null)).toBeNull();
        expect(parseCommentaryResponse('juste une chaine')).toBeNull();
    });

    it('tronque un commentaire qui ignore la consigne "une phrase"', () => {
        const long = 'x'.repeat(500);
        const result = parseCommentaryResponse({ comment: long });
        expect(result).not.toBeNull();
        expect(result!.length).toBeLessThanOrEqual(400);
        expect(result!.endsWith('…')).toBe(true);
    });

    it('ne tronque pas un commentaire de longueur normale', () => {
        const normal = 'Une phrase parfaitement raisonnable de longueur normale.';
        expect(parseCommentaryResponse({ comment: normal })).toBe(normal);
    });
});
