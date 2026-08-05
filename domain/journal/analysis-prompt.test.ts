import { describe, expect, it } from 'vitest';

import { analyseJournal, type AnalysedTrade } from './analytics';
import {
    ANALYSIS_SYSTEM,
    buildAnalysisPrompt,
    validateAnalysisVerdict,
} from './analysis-prompt';
import { computeDeepStats } from './deep-stats';

const ORIGIN = Date.UTC(2026, 2, 2, 8, 0, 0);

function trade(index: number, pnl: number, extra: Partial<AnalysedTrade> = {}): AnalysedTrade {
    const openedAt = new Date(ORIGIN + index * 3_600_000);
    return {
        instrument: 'EUR/USD',
        direction: 'Sell',
        openedAt,
        closedAt: new Date(openedAt.getTime() + 30 * 60_000),
        entryPrice: 1.1,
        exitPrice: pnl >= 0 ? 1.098 : 1.102,
        stopLoss: 1.102,
        takeProfit: 1.094,
        lotSize: 0.1,
        pips: pnl / 5,
        pnl,
        pipSize: 0.0001,
        ...extra,
    };
}

function corpus(count: number): AnalysedTrade[] {
    return Array.from({ length: count }, (_, index) => trade(index, index % 3 === 0 ? 180 : -55));
}

function promptFor(count: number): string {
    const trades = corpus(count);
    return buildAnalysisPrompt(analyseJournal(trades), computeDeepStats(trades), 'toute la période');
}

describe('ANALYSIS_SYSTEM', () => {
    it('forbids computing and forbids estimating a missing value', () => {
        expect(ANALYSIS_SYSTEM).toMatch(/ne calcules JAMAIS/);
        expect(ANALYSIS_SYSTEM).toMatch(/tu ne l'estimes pas/);
    });

    it('orders concept before reading before advice', () => {
        expect(ANALYSIS_SYSTEM.indexOf('"concept"')).toBeLessThan(ANALYSIS_SYSTEM.indexOf('"lecture"'));
        expect(ANALYSIS_SYSTEM.indexOf('"lecture"')).toBeLessThan(ANALYSIS_SYSTEM.indexOf('"conseil"'));
    });

    it('separates observed behaviour from supposed intent', () => {
        expect(ANALYSIS_SYSTEM).toMatch(/COMPORTEMENTS, jamais des intentions/);
        expect(ANALYSIS_SYSTEM).toMatch(/jamais « tu as peur après une perte »/);
    });

    it('names what the journal cannot tell it', () => {
        expect(ANALYSIS_SYSTEM).toMatch(/stratégie/);
        expect(ANALYSIS_SYSTEM).toMatch(/émotionnel/);
    });

    it('asks explicitly for links between the two halves', () => {
        // The whole reason this is one call rather than two: the sentence worth
        // reading spans both sets and neither half could write it alone.
        expect(ANALYSIS_SYSTEM).toMatch(/rapprochements ENTRE les deux parties/);
    });
});

describe('buildAnalysisPrompt', () => {
    const prompt = promptFor(40);

    it('carries both halves in one message', () => {
        expect(prompt).toContain('PARTIE 1 : MESURES STATISTIQUES');
        expect(prompt).toContain('PARTIE 2 : TRACES DE COMPORTEMENT');
    });

    it('supplies every statistical figure so none has to be derived', () => {
        for (const label of [
            'Espérance par trade',
            'SQN',
            'Ratio de Sharpe',
            'Ratio de Sortino',
            'VaR 95',
            'CVaR 99',
            'Drawdown maximal',
        ]) {
            expect(prompt).toContain(label);
        }
    });

    it('supplies every behavioural figure', () => {
        for (const label of [
            'suivant une PERTE',
            'suivant un GAIN',
            'Durée médiane des trades GAGNANTS',
            'Plus longue série de pertes',
        ]) {
            expect(prompt).toContain(label);
        }
    });

    it('forbids reading the win rate on its own', () => {
        // 27% is excellent at 3:1 and ruinous at 1:1, so the figure is shipped
        // welded to the payoff ratio it only means anything beside.
        expect(prompt).toMatch(/ne se juge JAMAIS seul/);
    });

    it('forbids comparing the autocorrelation to 50%', () => {
        // The trap that produced a wrong conclusion on the real journal: 71%
        // looks high until you see that 72% of all trades lose anyway.
        expect(prompt).toMatch(/Ne compare JAMAIS ces parts à 50 %/);
        expect(prompt).toMatch(/seul l'ÉCART au taux de référence/);
    });

    it('states plainly that this is not MAE/MFE and why', () => {
        expect(prompt).toMatch(/PAS le MAE\/MFE classique/);
        expect(prompt).toMatch(/ticks/);
    });

    it('explains what reshuffling can and cannot test', () => {
        expect(prompt).toMatch(/ne teste pas\s+l'avantage, elle teste le CHEMIN/);
    });

    it('warns on a thin sample and stays quiet on a full one', () => {
        expect(promptFor(22)).toMatch(/AVERTISSEMENT D'ÉCHANTILLON/);
        expect(promptFor(22)).toMatch(/22 trades seulement/);
        expect(prompt).not.toMatch(/AVERTISSEMENT D'ÉCHANTILLON/);
    });

    it('marks a missing figure as unavailable instead of printing null', () => {
        const one = [trade(0, 100)];
        const text = buildAnalysisPrompt(analyseJournal(one), computeDeepStats(one), 'test');

        expect(text).toContain('non disponible');
        expect(text).not.toContain('null');
    });

    it('names the period so the model does not describe the wrong window', () => {
        expect(prompt).toContain('Période : toute la période');
    });
});

describe('validateAnalysisVerdict', () => {
    const valid = {
        synthese: 'Un système à faible taux de réussite mais fort rapport gain/perte.',
        mesures: [{ mesure: 'SQN', concept: 'a', lecture: 'b', conseil: 'c' }],
        comportement: [{ titre: 'Modération', constat: 'x', consequence: 'y' }],
        force_principale: 'a',
        risque_principal: 'b',
        action_prioritaire: 'c',
        verdict_systeme: 'd',
    };

    it('accepts a complete verdict', () => {
        const parsed = validateAnalysisVerdict(valid);

        expect(parsed?.mesures).toHaveLength(1);
        expect(parsed?.comportement).toHaveLength(1);
    });

    it('rejects a verdict missing a field the page renders', () => {
        const incomplete: Record<string, unknown> = { ...valid };
        delete incomplete.verdict_systeme;

        expect(validateAnalysisVerdict(incomplete)).toBeNull();
    });

    it('rejects a measure block missing one of its three parts', () => {
        expect(
            validateAnalysisVerdict({
                ...valid,
                mesures: [{ mesure: 'SQN', concept: 'a', lecture: 'b' }],
            }),
        ).toBeNull();
    });

    it('rejects a blank field, which renders as an empty card', () => {
        expect(
            validateAnalysisVerdict({
                ...valid,
                comportement: [{ titre: '  ', constat: 'x', consequence: 'y' }],
            }),
        ).toBeNull();
    });

    it('rejects an empty list on either half', () => {
        expect(validateAnalysisVerdict({ ...valid, mesures: [] })).toBeNull();
        expect(validateAnalysisVerdict({ ...valid, comportement: [] })).toBeNull();
    });

    it('rejects anything that is not an object', () => {
        expect(validateAnalysisVerdict(null)).toBeNull();
        expect(validateAnalysisVerdict('texte')).toBeNull();
    });
});
