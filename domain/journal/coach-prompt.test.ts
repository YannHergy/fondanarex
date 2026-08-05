import { describe, expect, it } from 'vitest';

import { analyseJournal, type AnalysedTrade } from './analytics';
import { buildCoachPrompt, COACH_SYSTEM, validateCoachVerdict } from './coach-prompt';

const ORIGIN = Date.UTC(2026, 2, 2, 8, 0, 0);

function trade(minutes: number, pnl: number, extra: Partial<AnalysedTrade> = {}): AnalysedTrade {
    const openedAt = new Date(ORIGIN + minutes * 60_000);
    return {
        instrument: 'EUR/USD',
        direction: 'Sell',
        openedAt,
        closedAt: new Date(openedAt.getTime() + 60 * 60_000),
        entryPrice: 1.1,
        exitPrice: null,
        stopLoss: 1.102,
        takeProfit: null,
        lotSize: 0.1,
        pips: pnl / 10,
        pnl,
        pipSize: 0.0001,
        ...extra,
    };
}

const ANALYTICS = analyseJournal([trade(0, 100), trade(120, -40), trade(240, -60)]);

describe('COACH_SYSTEM', () => {
    it('forbids the model from computing anything', () => {
        expect(COACH_SYSTEM).toMatch(/ne calcules JAMAIS/);
    });

    it('names what the journal cannot tell it', () => {
        // Without these the model reliably invents motive from outcome —
        // "you panicked" from a run of losses it has no way of knowing about.
        expect(COACH_SYSTEM).toMatch(/stratégie/);
        expect(COACH_SYSTEM).toMatch(/émotionnel/);
        expect(COACH_SYSTEM).toMatch(/comportement, pas des intentions/);
    });
});

describe('buildCoachPrompt', () => {
    const prompt = buildCoachPrompt(ANALYTICS, 'toute la période');

    it('carries every headline figure, so nothing has to be derived', () => {
        expect(prompt).toContain('Trades clôturés : 3');
        expect(prompt).toContain('Taux de réussite : 33 %');
        expect(prompt).toContain('Gain moyen : 100');
        expect(prompt).toContain('Perte moyenne : 50');
        expect(prompt).toContain('Plus longue série de pertes : 2');
    });

    it('labels the sign convention on R multiples rather than leaving a bare number', () => {
        expect(prompt).toContain('−1R');
        expect(prompt).toMatch(/la perte a dépassé le plan/);
    });

    it('states that the hour buckets are broker time, not UTC', () => {
        // The report stamps history in broker server time and never says the
        // offset, so a claim about "the London session" would be unfounded.
        expect(prompt).toMatch(/horloge du serveur du courtier, pas UTC/);
    });

    it('renders durations in readable units', () => {
        const slow = analyseJournal([
            trade(0, 100, { closedAt: new Date(ORIGIN + 30 * 60_000) }),
            trade(120, -40, { closedAt: new Date(ORIGIN + (120 + 600) * 60_000) }),
        ]);
        const text = buildCoachPrompt(slow, 'test');

        expect(text).toContain('30 minutes');
        expect(text).toContain('10.0 heures');
    });

    it('marks a missing figure as unavailable instead of printing null', () => {
        const noLosses = analyseJournal([trade(0, 100)]);
        const text = buildCoachPrompt(noLosses, 'test');

        expect(text).toContain('non disponible');
        expect(text).not.toContain('null');
    });

    it('includes the period so the model does not describe the wrong window', () => {
        expect(prompt).toContain('Période : toute la période');
    });
});

describe('validateCoachVerdict', () => {
    const valid = {
        synthese: 'Un journal court, dominé par la vente.',
        sections: [{ titre: 'Biais', constat: 'x', consequence: 'y' }],
        force_principale: 'a',
        risque_principal: 'b',
        action_prioritaire: 'c',
    };

    it('accepts a complete verdict', () => {
        expect(validateCoachVerdict(valid)).toMatchObject({ synthese: valid.synthese });
    });

    it('rejects a verdict missing a field the page renders', () => {
        const incomplete: Record<string, unknown> = { ...valid };
        delete incomplete.action_prioritaire;

        expect(validateCoachVerdict(incomplete)).toBeNull();
    });

    it('rejects blank text, which renders as an empty card', () => {
        expect(validateCoachVerdict({ ...valid, synthese: '   ' })).toBeNull();
    });

    it('rejects a malformed section rather than rendering undefined', () => {
        expect(validateCoachVerdict({ ...valid, sections: [{ titre: 'x' }] })).toBeNull();
        expect(validateCoachVerdict({ ...valid, sections: [] })).toBeNull();
    });

    it('rejects anything that is not an object', () => {
        expect(validateCoachVerdict(null)).toBeNull();
        expect(validateCoachVerdict('texte')).toBeNull();
    });
});
