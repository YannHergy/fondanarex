// ================================================================
// BRIEFING CONSENSUS
//
// Merges the per-currency verdicts of the debating models into one
// view, with a strength that reflects whether they actually agreed.
//
// Perplexity does not vote. It is the researcher in this debate —
// it gathers facts, it does not form a directional opinion — so
// counting it would dilute the signal from the two models that do.
//
// Pure: votes in, consensus out.
// ================================================================

export type AIBias = 'Bullish' | 'Bearish' | 'Neutral';
export type ConsensusStrength = 'strong' | 'medium' | 'mixed';
export type AIName = 'Perplexity' | 'Claude' | 'Groq';

export interface CurrencyBias {
    bias: AIBias;
    explanation: string;
    conviction?: 'Haute' | 'Moyenne' | 'Basse';
    changedOpinion?: boolean;
}

export interface AnalysisVote {
    ai: AIName;
    /** Per-currency verdicts from one model. */
    biases: Record<string, CurrencyBias>;
    /** Set when the call failed — the analysis is excluded entirely. */
    error?: string | null;
}

export interface CurrencyConsensus {
    code: string;
    bias: AIBias;
    strength: ConsensusStrength;
    /** Share of votes backing the winning bias, 0–100. */
    confidence: number;
    votes: Array<{ ai: AIName; bias: AIBias }>;
    /** True when the models genuinely disagreed rather than being unanimous. */
    contested: boolean;
}

/** Models whose opinion counts towards the verdict. */
const VOTING_MODELS: readonly AIName[] = ['Claude', 'Groq'];

/**
 * Consensus for every currency.
 *
 * A failed analysis contributes nothing — an errored call must not be read as
 * a neutral opinion, which is what silently counting it would amount to.
 */
export function calculateConsensus(
    codes: readonly string[],
    analyses: readonly AnalysisVote[],
): CurrencyConsensus[] {
    return codes.map(code => {
        const votes: Array<{ ai: AIName; bias: AIBias }> = [];

        for (const analysis of analyses) {
            if (analysis.error) continue;
            if (!VOTING_MODELS.includes(analysis.ai)) continue;

            const entry = analysis.biases[code];
            if (entry) votes.push({ ai: analysis.ai, bias: entry.bias });
        }

        return resolveVotes(code, votes);
    });
}

/**
 * Resolves a set of votes into a verdict.
 *
 * A tie between Bullish and Bearish is NEUTRAL, and flagged as contested.
 *
 * The legacy implementation got this wrong in a way that always favoured one
 * side: it tested `Bullish === max && Bullish > Bearish`, then fell through to
 * `Bearish === max`. With one vote each way, the Bullish branch failed its
 * second condition, the Bearish branch matched, and a genuine deadlock was
 * reported as a BEARISH consensus. Two models disagreeing completely is the
 * one case where the honest answer is "no signal".
 */
function resolveVotes(
    code: string,
    votes: Array<{ ai: AIName; bias: AIBias }>,
): CurrencyConsensus {
    const counts: Record<AIBias, number> = { Bullish: 0, Bearish: 0, Neutral: 0 };
    for (const vote of votes) counts[vote.bias] += 1;

    const total = votes.length;
    if (total === 0) {
        return { code, bias: 'Neutral', strength: 'mixed', confidence: 0, votes, contested: false };
    }

    const max = Math.max(counts.Bullish, counts.Bearish, counts.Neutral);
    const leaders = (Object.keys(counts) as AIBias[]).filter(b => counts[b] === max);

    // A single leader wins outright; a tie resolves to Neutral.
    const bias: AIBias = leaders.length === 1 ? leaders[0]! : 'Neutral';
    const contested = leaders.length > 1;

    const confidence = Math.round((max / total) * 100);

    // Unanimity after a full adversarial round means the models challenged each
    // other and still agreed — that is the strong signal. Anything short of
    // unanimous is treated as divergence, i.e. a reason for caution.
    let strength: ConsensusStrength;
    if (contested) strength = 'mixed';
    else if (max === total) strength = 'strong';
    else strength = 'medium';

    return { code, bias, strength, confidence, votes, contested };
}

/** Currencies where the models agreed unanimously, strongest first. */
export function strongestSignals(
    consensus: readonly CurrencyConsensus[],
): CurrencyConsensus[] {
    return consensus
        .filter(c => c.strength === 'strong' && c.bias !== 'Neutral')
        .sort((a, b) => b.confidence - a.confidence);
}
