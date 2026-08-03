// ================================================================
// COMPARATOR — "EXPERT AI INSIGHT" PROMPT
//
// A single, one-shot narrative for the pair currently open in the
// Comparator — not the multi-round debate in domain/briefing/, which
// argues per currency group rather than per pair on demand.
//
// Pure string building — no I/O.
// ================================================================

export interface PairInsightSubject {
    code: string;
    category: string;
    gdpQoQ: number;
    cpi: number;
    unemployment: number;
    wagePPI: number;
    stance: string;
    interestRate: number;
    pmiManufacturing: number;
    pmiServices: number;
}

/** System prompt: keeps the answer short, French, and grounded in the figures given. */
export const PAIR_INSIGHT_SYSTEM =
    'Tu es un analyste macroéconomique spécialisé en forex institutionnel. Tu es direct, concis, et tu appuies chaque affirmation sur les chiffres fournis — jamais sur un a priori de marché. Réponds en français, en 150 mots maximum, format Markdown.';

function subjectBlock(subject: PairInsightSubject): string {
    return [
        `- Croissance (PIB QoQ) : ${subject.gdpQoQ}%`,
        `- Inflation (CPI) : ${subject.cpi}% (cible généralement 2%)`,
        `- Chômage : ${subject.unemployment}% (salaires : ${subject.wagePPI}%)`,
        `- Politique monétaire : ${subject.stance} (taux directeur ${subject.interestRate}%)`,
        `- PMI : Manuf ${subject.pmiManufacturing} / Services ${subject.pmiServices}`,
    ].join('\n');
}

/**
 * Builds the user prompt for one pair.
 *
 * `pairScore` is the same 0-100 lean already shown in the Pair Alpha Verdict —
 * the prompt asks the model to explain that number, not recompute its own.
 */
export function buildPairInsightPrompt(
    base: PairInsightSubject,
    quote: PairInsightSubject,
    pairScore: number,
): string {
    const leaderCode = pairScore > 50 ? base.code : quote.code;

    return `Compare la devise ${base.code} (${base.category}) contre ${quote.code} (${quote.category}).

Le score de la paire est de ${pairScore.toFixed(1)}/100 en faveur de ${leaderCode} (50 = neutre).

Données ${base.code} :
${subjectBlock(base)}

Données ${quote.code} :
${subjectBlock(quote)}

Rédige une analyse "Institutional Alpha" en 3 parties :
1. Résumé du rapport de force en une phrase.
2. Le différentiel de croissance et d'inflation qui explique le score.
3. Un verdict sur la direction probable de la paire ${base.code}/${quote.code}.`;
}
