// ================================================================
// DEEP STATISTICS PROMPT
//
// Same contract as the behavioural coach: the model may not
// compute. It receives finished figures and produces, for each,
// three things in a fixed order — what the measure IS, what the
// trader's own number says, and what to do about it.
//
// The concept comes first on purpose. A trader who does not know
// what SQN measures cannot act on "your SQN is 1.8", and a number
// nobody can act on is decoration.
//
// Pure — no I/O.
// ================================================================

import type { DeepStats } from './deep-stats';

export interface QuantBlock {
    /** The measure's name, as the trader will see it. */
    mesure: string;
    /** What it measures, in plain French, independent of this journal. */
    concept: string;
    /** What THIS trader's figure says. */
    lecture: string;
    /** One concrete thing to do. */
    conseil: string;
}

export interface QuantVerdict {
    synthese: string;
    blocs: QuantBlock[];
    verdict_systeme: string;
}

export const QUANT_SCHEMA = {
    type: 'object',
    properties: {
        synthese: { type: 'string' },
        blocs: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    mesure: { type: 'string' },
                    concept: { type: 'string' },
                    lecture: { type: 'string' },
                    conseil: { type: 'string' },
                },
                required: ['mesure', 'concept', 'lecture', 'conseil'],
            },
        },
        verdict_systeme: { type: 'string' },
    },
    required: ['synthese', 'blocs', 'verdict_systeme'],
} as const;

export const QUANT_SYSTEM = `Tu es un analyste quantitatif qui explique des statistiques de trading
à leur propriétaire.

RÈGLE ABSOLUE : tu ne calcules JAMAIS. Chaque chiffre te sera donné, déjà calculé et
vérifié. Tu ne recalcules rien, tu n'en dérives rien, tu n'additionnes rien. Si une
valeur est marquée « non disponible », tu dis qu'elle n'est pas disponible et tu
expliques pourquoi elle le serait utile — tu ne l'estimes pas.

Pour CHAQUE mesure demandée, tu produis un bloc en trois temps, dans cet ordre :
1. "concept" : ce que la mesure signifie, en français simple, SANS parler de ce
   trader. Deux à trois phrases. Quelqu'un qui n'a jamais entendu le terme doit
   comprendre. Donne les repères usuels quand ils existent (par exemple : un SQN
   sous 1,5 désigne un système difficile à suivre, au-dessus de 2,5 un bon système).
2. "lecture" : ce que SON chiffre dit. Cite-le. Situe-le par rapport aux repères.
3. "conseil" : une seule action concrète. Pas de généralité du type « sois
   discipliné ».

PRUDENCE OBLIGATOIRE : ces mesures reposent sur un échantillon fini. Quand un chiffre
s'appuie sur peu d'observations, dis-le dans la lecture. Un ratio de Sharpe sur trente
trades est une indication, pas une preuve.

Tu ne connais ni la stratégie du trader, ni son état d'esprit, ni le contexte de
marché. Tu ne commentes que les nombres fournis.

Écris en français, à la deuxième personne du singulier, sobrement, sans jargon
anglais inutile.`;

function num(value: number | null, suffix = ''): string {
    return value === null ? 'non disponible' : `${value}${suffix}`;
}

/**
 * The statistics, rendered for the model.
 *
 * Each line carries its unit and, where the measure has conventional
 * thresholds, those thresholds too — so the model grades against the
 * discipline's scale rather than inventing one.
 */
export function buildQuantPrompt(stats: DeepStats, periodLabel: string): string {
    const s = stats;
    const mc = s.monteCarlo;
    const ac = s.autocorrelation;

    return `Statistiques déjà calculées sur ${s.trades} trades clôturés. Période : ${periodLabel}.

1. ESPÉRANCE ET QUALITÉ DU SYSTÈME
- Espérance par trade (devise du compte) : ${s.expectancy}
- Espérance par trade en R : ${num(s.expectancyR)}
- SQN (System Quality Number de Van Tharp) : ${num(s.sqn)}
  Repères : sous 1,5 système difficile à suivre ; au-dessus de 2,5 bon système ;
  au-dessus de 5 exceptionnel et très rare.
- Ratio de Sharpe par trade (moyenne / écart-type des résultats) : ${num(s.sharpe)}
- Ratio de Sortino par trade (ne pénalise que la volatilité baissière) : ${num(s.sortino)}

2. EFFICACITÉ DES SORTIES
- Part du mouvement visé réellement encaissée sur les trades GAGNANTS : ${num(s.targetEfficiency, ' %')}
  Mesuré sur ${s.targetEfficiencySample} trades gagnants disposant d'un objectif.
  Sous 60 % signifie que tu sors systématiquement avant ton objectif.
  ATTENTION : ce n'est PAS le MAE/MFE classique. Le MAE et le MFE exigent le parcours
  du prix pendant le trade (les ticks), que le rapport MetaTrader ne contient pas. Ici
  la référence est l'objectif que le trader avait lui-même fixé, pas le meilleur point
  atteint. Dis-le clairement dans le bloc concerné.

3. RISQUE ET STRESS-TEST
- Drawdown maximal réellement subi : ${s.maxDrawdown}
- Trades passés sous le précédent sommet : ${s.drawdownDurationTrades}
- Sommet regagné depuis : ${s.drawdownRecovered ? 'oui' : 'non, le compte est encore sous son plus haut'}
${
    mc
        ? `- Simulation de Monte-Carlo, ${mc.iterations} tirages en remélangeant l'ORDRE des mêmes trades :
    médiane du drawdown maximal : ${mc.medianMaxDrawdown}
    drawdown dépassé par seulement 5 % des tirages : ${mc.p95MaxDrawdown}
    pire tirage : ${mc.worstMaxDrawdown}
    durée médiane sous le sommet : ${mc.medianUnderwaterTrades} trades
  Remélanger l'ordre ne change pas la somme des gains : la simulation ne teste pas
  l'avantage, elle teste le CHEMIN. Elle répond à « avec exactement ces trades, jusqu'où
  aurais-je pu descendre si l'ordre avait été différent ».`
        : '- Simulation de Monte-Carlo : non disponible'
}
- VaR 95 % (perte que seuls 5 % des trades dépassent) : ${num(s.var95)}
- CVaR 95 % (perte moyenne au-delà de ce seuil) : ${num(s.cvar95)}
- VaR 99 % : ${num(s.var99)}
- CVaR 99 % : ${num(s.cvar99)}

4. AUTOCORRÉLATION DES RÉSULTATS
- Part des trades suivant une PERTE qui perdent aussi : ${num(ac.lossAfterLoss, ' %')} (sur ${ac.sampleAfterLoss} occasions)
- Part des trades suivant un GAIN qui gagnent aussi : ${num(ac.winAfterWin, ' %')} (sur ${ac.sampleAfterWin} occasions)
- Taux de perte de référence sur l'ensemble : ${ac.baseLossRate} %
- Taux de gain de référence sur l'ensemble : ${ac.baseWinRate} %
  Si la perte après une perte dépasse nettement le taux de référence, les résultats se
  regroupent : cela peut indiquer une reprise impulsive ou de la fatigue décisionnelle.
  Si l'écart est faible, les trades sont indépendants et c'est plutôt bon signe.

Produis :
- "synthese" : 2 à 3 phrases sur la solidité statistique de ce système.
- "blocs" : un bloc pour CHACUNE de ces mesures, dans cet ordre — Espérance
  mathématique, SQN, Sharpe et Sortino, Efficacité des sorties, Drawdown,
  Monte-Carlo, VaR et CVaR, Autocorrélation. Chaque bloc suit les trois temps
  imposés : concept, lecture, conseil.
- "verdict_systeme" : une phrase tranchée sur la viabilité du système à long terme,
  assortie de la réserve d'échantillon qui s'impose.`;
}

/** Runtime check that the model returned the shape the page renders. */
export function validateQuantVerdict(value: unknown): QuantVerdict | null {
    if (typeof value !== 'object' || value === null) return null;
    const raw = value as Record<string, unknown>;

    const filled = (key: string): string | null =>
        typeof raw[key] === 'string' && raw[key].trim().length > 0 ? (raw[key] as string) : null;

    const synthese = filled('synthese');
    const verdict = filled('verdict_systeme');
    if (!synthese || !verdict) return null;

    if (!Array.isArray(raw.blocs)) return null;

    const blocs: QuantBlock[] = [];
    for (const entry of raw.blocs) {
        if (typeof entry !== 'object' || entry === null) return null;
        const block = entry as Record<string, unknown>;

        const fields = ['mesure', 'concept', 'lecture', 'conseil'] as const;
        if (fields.some((field) => typeof block[field] !== 'string' || !(block[field] as string).trim())) {
            return null;
        }

        blocs.push({
            mesure: block.mesure as string,
            concept: block.concept as string,
            lecture: block.lecture as string,
            conseil: block.conseil as string,
        });
    }

    if (blocs.length === 0) return null;

    return { synthese, blocs, verdict_systeme: verdict };
}
