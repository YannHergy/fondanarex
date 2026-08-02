import { describe, expect, it } from 'vitest';

import {
    calculateConsensus,
    strongestSignals,
    type AIBias,
    type AnalysisVote,
} from './consensus';

const CODES = ['EUR', 'USD'];

function vote(ai: AnalysisVote['ai'], biases: Record<string, AIBias>, error?: string): AnalysisVote {
    return {
        ai,
        error: error ?? null,
        biases: Object.fromEntries(
            Object.entries(biases).map(([code, bias]) => [code, { bias, explanation: '' }]),
        ),
    };
}

describe('calculateConsensus', () => {
    it('reports unanimity as a strong signal', () => {
        const [eur] = calculateConsensus(['EUR'], [
            vote('Claude', { EUR: 'Bullish' }),
            vote('Groq', { EUR: 'Bullish' }),
        ]);
        expect(eur).toMatchObject({
            bias: 'Bullish',
            strength: 'strong',
            confidence: 100,
            contested: false,
        });
    });

    it('resolves a Bullish/Bearish deadlock to NEUTRAL, not Bearish', () => {
        // The legacy implementation reported this as Bearish: its Bullish branch
        // required `Bullish > Bearish`, so an even split fell through to the
        // Bearish branch. Two models disagreeing completely is no signal.
        const [eur] = calculateConsensus(['EUR'], [
            vote('Claude', { EUR: 'Bullish' }),
            vote('Groq', { EUR: 'Bearish' }),
        ]);
        expect(eur?.bias).toBe('Neutral');
        expect(eur?.contested).toBe(true);
        expect(eur?.strength).toBe('mixed');
    });

    it('marks a deadlock as contested with 50% confidence', () => {
        const [eur] = calculateConsensus(['EUR'], [
            vote('Claude', { EUR: 'Bullish' }),
            vote('Groq', { EUR: 'Bearish' }),
        ]);
        expect(eur?.confidence).toBe(50);
    });

    it('reports genuine unanimous Neutral as strong', () => {
        const [eur] = calculateConsensus(['EUR'], [
            vote('Claude', { EUR: 'Neutral' }),
            vote('Groq', { EUR: 'Neutral' }),
        ]);
        expect(eur).toMatchObject({ bias: 'Neutral', strength: 'strong', contested: false });
    });

    it('excludes Perplexity — the researcher does not vote', () => {
        const [eur] = calculateConsensus(['EUR'], [
            vote('Perplexity', { EUR: 'Bearish' }),
            vote('Claude', { EUR: 'Bullish' }),
            vote('Groq', { EUR: 'Bullish' }),
        ]);
        expect(eur?.votes).toHaveLength(2);
        expect(eur?.bias).toBe('Bullish');
    });

    it('excludes a failed analysis rather than counting it as neutral', () => {
        const [eur] = calculateConsensus(['EUR'], [
            vote('Claude', { EUR: 'Bullish' }),
            vote('Groq', { EUR: 'Bearish' }, 'timeout'),
        ]);
        expect(eur?.votes).toHaveLength(1);
        expect(eur?.bias).toBe('Bullish');
        expect(eur?.strength).toBe('strong');
    });

    it('returns a neutral placeholder when nothing voted', () => {
        const [eur] = calculateConsensus(['EUR'], [vote('Claude', {}, 'failed')]);
        expect(eur).toMatchObject({ bias: 'Neutral', confidence: 0, votes: [] });
    });

    it('ignores a currency a model did not cover', () => {
        const result = calculateConsensus(CODES, [vote('Claude', { EUR: 'Bullish' })]);
        expect(result.find(c => c.code === 'USD')?.votes).toHaveLength(0);
    });

    it('produces one entry per requested currency', () => {
        expect(calculateConsensus(CODES, [])).toHaveLength(2);
    });

    it('reports a majority short of unanimity as medium', () => {
        const [eur] = calculateConsensus(['EUR'], [
            vote('Claude', { EUR: 'Bullish' }),
            vote('Groq', { EUR: 'Bullish' }),
            { ...vote('Claude', { EUR: 'Neutral' }), ai: 'Claude' },
        ]);
        expect(eur?.strength).toBe('medium');
        expect(eur?.bias).toBe('Bullish');
    });
});

describe('strongestSignals', () => {
    it('keeps only unanimous, directional verdicts', () => {
        const consensus = calculateConsensus(['EUR', 'USD', 'GBP'], [
            vote('Claude', { EUR: 'Bullish', USD: 'Neutral', GBP: 'Bullish' }),
            vote('Groq', { EUR: 'Bullish', USD: 'Neutral', GBP: 'Bearish' }),
        ]);
        const strong = strongestSignals(consensus);
        // EUR is unanimous and directional; USD is unanimous but neutral;
        // GBP is contested.
        expect(strong.map(s => s.code)).toEqual(['EUR']);
    });
});
