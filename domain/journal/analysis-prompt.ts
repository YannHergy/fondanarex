// ================================================================
// COMBINED JOURNAL ANALYSIS PROMPT
//
// One pass over everything: the statistical measures AND the
// behavioural traces, in that order, producing concepts, readings,
// advice and a verdict.
//
// One call rather than two because the interesting statements sit
// ACROSS the two sets. "Your SQN is low but you cut size after a
// loss" is a sentence neither half could write alone, and two
// separate calls could not reach it without one of them guessing
// at the other's numbers.
//
// The contract is unchanged and absolute: the model computes
// nothing. Every figure arrives finished. A model asked for a win
// rate can return two different answers to the same journal, and
// nothing in the output would reveal it.
//
// Pure — no I/O.
// ================================================================

import type { JournalAnalytics } from './analytics';
import { RELIABLE_SAMPLE_SIZE, type DeepStats } from './deep-stats';

export interface MeasureBlock {
    /** The measure's name as the trader sees it on the coloured band. */
    mesure: string;
    /** What it measures, in plain French, independent of this journal. */
    concept: string;
    /** What THIS trader's figure says. */
    lecture: string;
    /** One concrete action. */
    conseil: string;
}

export interface BehaviourBlock {
    titre: string;
    constat: string;
    consequence: string;
}

export interface AnalysisVerdict {
    synthese: string;
    mesures: MeasureBlock[];
    comportement: BehaviourBlock[];
    force_principale: string;
    risque_principal: string;
    action_prioritaire: string;
    verdict_systeme: string;
}

export const ANALYSIS_SCHEMA = {
    type: 'object',
    properties: {
        synthese: { type: 'string' },
        mesures: {
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
        comportement: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    titre: { type: 'string' },
                    constat: { type: 'string' },
                    consequence: { type: 'string' },
                },
                required: ['titre', 'constat', 'consequence'],
            },
        },
        force_principale: { type: 'string' },
        risque_principal: { type: 'string' },
        action_prioritaire: { type: 'string' },
        verdict_systeme: { type: 'string' },
    },
    required: [
        'synthese',
        'mesures',
        'comportement',
        'force_principale',
        'risque_principal',
        'action_prioritaire',
        'verdict_systeme',
    ],
} as const;

export const ANALYSIS_SYSTEM = `Tu analyses le journal de trading de son propriétaire. Tu fais deux
choses, dans cet ordre : tu expliques les mesures statistiques, puis tu donnes un avis
comportemental.

RÈGLE ABSOLUE : tu ne calcules JAMAIS. Chaque chiffre te sera donné, déjà calculé et
vérifié. Tu ne recalcules rien, tu n'en dérives rien, tu n'additionnes rien. Si une
valeur est marquée « non disponible », tu dis qu'elle ne l'est pas et pourquoi elle
serait utile — tu ne l'estimes pas.

PARTIE 1 — LES MESURES. Pour chacune, un bloc en trois temps, dans cet ordre :
1. "concept" : ce que la mesure signifie, en français simple, SANS parler de ce
   trader. Deux à trois phrases. Quelqu'un qui n'a jamais entendu le terme doit
   comprendre. Donne les repères usuels quand ils existent.
2. "lecture" : ce que SON chiffre dit, en le citant et en le situant sur ces repères.
3. "conseil" : une seule action concrète. Jamais « sois discipliné ».

PARTIE 2 — LE COMPORTEMENT. Trois à cinq observations sur ce que les traces révèlent
de sa manière de trader. Tu observes des COMPORTEMENTS, jamais des intentions : écris
« la taille de position baisse après une perte », jamais « tu as peur après une perte ».

CE QUE TU NE SAIS PAS, et ne dois donc jamais supposer : sa stratégie, son état
émotionnel, le contexte de marché à ces dates, ses raisons d'entrer ou de sortir.

PRUDENCE STATISTIQUE : quand un chiffre repose sur peu d'observations, dis-le à
l'endroit où tu l'emploies. Deux trades acheteurs perdants ne démontrent rien.

CE QUI A LE PLUS DE VALEUR : les rapprochements ENTRE les deux parties. Un SQN faible
mis en regard d'une taille de position qui baisse après une perte raconte une histoire
qu'aucune des deux moitiés ne dit seule. Cherche ces liens.

Écris en français, à la deuxième personne du singulier, sobrement, sans jargon anglais
inutile.`;

function line(label: string, value: string | number | null, suffix = ''): string {
    if (value === null) return `- ${label} : non disponible`;
    return `- ${label} : ${value}${suffix}`;
}

function breakdown(
    title: string,
    rows: { key: string; trades: number; net: number; winRate: number }[],
): string {
    if (rows.length === 0) return '';

    const body = rows
        .map(
            (row) =>
                `  - ${row.key} : ${row.trades} trades, ${row.net > 0 ? '+' : ''}${row.net}, ${row.winRate}% de réussite`,
        )
        .join('\n');

    return `\n${title}\n${body}`;
}

function minutes(value: number | null): string | null {
    if (value === null) return null;
    if (value < 90) return `${Math.round(value)} minutes`;

    const hours = value / 60;
    if (hours < 48) return `${hours.toFixed(1)} heures`;
    return `${(hours / 24).toFixed(1)} jours`;
}

/**
 * Everything the model is allowed to talk about.
 *
 * Rendered as labelled lines rather than raw JSON, because the labels carry the
 * units and the sign convention — which is what stops "−2.5" being read as a
 * count of something.
 */
export function buildAnalysisPrompt(
    analytics: JournalAnalytics,
    stats: DeepStats,
    periodLabel: string,
): string {
    const a = analytics;
    const s = stats;
    const mc = s.monteCarlo;
    const ac = s.autocorrelation;

    // Stated up front rather than left to the model's judgement: it reads the
    // same two-decimal figures either way, and nothing in them signals how many
    // observations produced them.
    const thin =
        s.trades < RELIABLE_SAMPLE_SIZE
            ? `
AVERTISSEMENT D'ÉCHANTILLON — À RÉPÉTER DANS TA RÉPONSE
Ces chiffres reposent sur ${s.trades} trades seulement, sous le seuil de ${RELIABLE_SAMPLE_SIZE}
à partir duquel ces mesures deviennent fiables. Le SQN, les ratios de Sharpe et de
Sortino et la VaR à 99 % sont particulièrement sensibles à la taille de l'échantillon :
un seul trade exceptionnel les déplace fortement. Dis-le dans la synthèse ET dans la
lecture de chaque bloc concerné. Formule des tendances, jamais des conclusions.
`
            : '';

    return `Statistiques déjà calculées sur ${s.trades} trades clôturés. Période : ${periodLabel}.
${thin}
════════ PARTIE 1 : MESURES STATISTIQUES ════════

ESPÉRANCE ET QUALITÉ DU SYSTÈME
${line('Espérance par trade (devise du compte)', s.expectancy)}
${line('Espérance par trade en R', s.expectancyR)}
${line('SQN (System Quality Number de Van Tharp)', s.sqn)}
  Repères : sous 1,5 système difficile à suivre ; au-dessus de 2,5 bon système ;
  au-dessus de 5 exceptionnel et très rare.
${line('Ratio de Sharpe par trade (moyenne / écart-type des résultats)', s.sharpe)}
${line('Ratio de Sortino par trade (ne pénalise que la volatilité baissière)', s.sortino)}
${line('Rapport gain moyen / perte moyenne', a.payoffRatio)}
${line('Taux de réussite', a.winRate, ' %')}
  Un taux de réussite ne se juge JAMAIS seul : 27 % est excellent avec un rapport de
  3 pour 1 et ruineux avec 1 pour 1. Toujours le lire avec le rapport ci-dessus.

EFFICACITÉ DES SORTIES
${line('Part du mouvement visé réellement encaissée sur les trades GAGNANTS', s.targetEfficiency, ' %')}
  Mesuré sur ${s.targetEfficiencySample} trades gagnants disposant d'un objectif.
  Sous 60 % signifie que tu sors systématiquement avant ton objectif.
  ATTENTION : ce n'est PAS le MAE/MFE classique. Le MAE et le MFE exigent le parcours
  du prix pendant le trade (les ticks), que le rapport MetaTrader ne contient pas. Ici
  la référence est l'objectif que le trader avait lui-même fixé, pas le meilleur point
  atteint. Dis-le clairement dans le bloc concerné.

RISQUE ET STRESS-TEST
${line('Drawdown maximal réellement subi', s.maxDrawdown)}
${line('Trades passés sous le précédent sommet', s.drawdownDurationTrades)}
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
${line('VaR 95 % (perte que seuls 5 % des trades dépassent)', s.var95)}
${line('CVaR 95 % (perte moyenne au-delà de ce seuil)', s.cvar95)}
${line('VaR 99 %', s.var99)}
${line('CVaR 99 %', s.cvar99)}

GESTION DU RISQUE PLANIFIÉ
${line('Part des trades protégés par un stop', a.stopLossCoverage, ' %')}
${line('Résultat médian en multiples du risque planifié au stop (R)', a.medianRMultiple)}
  (+1R = le trade a rapporté exactement ce qui était risqué ; −1R = la perte est restée
  dans le stop prévu ; au-delà de −1R, la perte a dépassé le plan)

AUTOCORRÉLATION DES RÉSULTATS
${line('Part des trades suivant une PERTE qui perdent aussi', ac.lossAfterLoss, ' %')} (sur ${ac.sampleAfterLoss} occasions)
${line('Part des trades suivant un GAIN qui gagnent aussi', ac.winAfterWin, ' %')} (sur ${ac.sampleAfterWin} occasions)
${line('Taux de perte de référence sur l\'ensemble', ac.baseLossRate, ' %')}
${line('Taux de gain de référence sur l\'ensemble', ac.baseWinRate, ' %')}
  Ne compare JAMAIS ces parts à 50 %, mais aux taux de référence ci-dessus. 71 % de
  pertes après une perte n'est pas du regroupement si 72 % des trades perdent de toute
  façon : seul l'ÉCART au taux de référence traduit un comportement.

════════ PARTIE 2 : TRACES DE COMPORTEMENT ════════

APRÈS UN RÉSULTAT
${line('Taille de position médiane sur le trade suivant une PERTE', a.lotAfterLoss, ' lots')}
${line('Taille de position médiane sur le trade suivant un GAIN', a.lotAfterWin, ' lots')}
${line('Délai médian avant de reprendre position après une PERTE', minutes(a.reentryMinutesAfterLoss))}
${line('Délai médian avant de reprendre position après un GAIN', minutes(a.reentryMinutesAfterWin))}

DURÉE DE DÉTENTION
${line('Durée médiane des trades GAGNANTS', minutes(a.holdMinutesOnWin))}
${line('Durée médiane des trades PERDANTS', minutes(a.holdMinutesOnLoss))}

SÉRIES ET CONCENTRATION
${line('Plus longue série de gains', a.maxConsecutiveWins)}
${line('Plus longue série de pertes', a.maxConsecutiveLosses)}
${line('Entrées ouvertes sur la même paire à moins de 2 minutes de la précédente', a.clusteredEntries)}
${breakdown('PAR SENS', a.byDirection)}
${breakdown('PAR PAIRE', a.byInstrument)}
${breakdown('PAR JOUR DE LA SEMAINE', a.byWeekday)}
${breakdown("PAR HEURE D'OUVERTURE (horloge du serveur du courtier, pas UTC)", a.byServerHour)}

════════ CE QUE TU PRODUIS ════════

- "synthese" : 3 à 4 phrases sur ce que ce journal dit du trader et de son système.
- "mesures" : un bloc pour CHACUNE de ces mesures, dans cet ordre — Espérance
  mathématique, SQN, Sharpe et Sortino, Rapport gain/perte, Efficacité des sorties,
  Drawdown, Monte-Carlo, VaR et CVaR, Résultat en R, Autocorrélation. Chaque bloc
  respecte les trois temps : concept, lecture, conseil.
- "comportement" : 3 à 5 observations issues de la PARTIE 2. Chacune a un "titre"
  court, un "constat" ancré sur les chiffres, une "consequence" concrète.
- "force_principale" : une phrase.
- "risque_principal" : une phrase.
- "action_prioritaire" : la seule chose à changer en premier, formulée concrètement.
- "verdict_systeme" : une phrase tranchée sur la viabilité à long terme, avec la
  réserve d'échantillon qui s'impose.`;
}

/** Runtime check that the model returned the shape the page renders. */
export function validateAnalysisVerdict(value: unknown): AnalysisVerdict | null {
    if (typeof value !== 'object' || value === null) return null;
    const raw = value as Record<string, unknown>;

    const filled = (key: string): string | null =>
        typeof raw[key] === 'string' && (raw[key] as string).trim().length > 0
            ? (raw[key] as string)
            : null;

    const synthese = filled('synthese');
    const force = filled('force_principale');
    const risque = filled('risque_principal');
    const action = filled('action_prioritaire');
    const verdict = filled('verdict_systeme');
    if (!synthese || !force || !risque || !action || !verdict) return null;

    if (!Array.isArray(raw.mesures) || !Array.isArray(raw.comportement)) return null;

    const blocks = <T extends string>(
        entries: unknown[],
        fields: readonly T[],
    ): Record<T, string>[] | null => {
        const out: Record<T, string>[] = [];

        for (const entry of entries) {
            if (typeof entry !== 'object' || entry === null) return null;
            const block = entry as Record<string, unknown>;

            if (
                fields.some(
                    (field) =>
                        typeof block[field] !== 'string' || !(block[field] as string).trim(),
                )
            ) {
                return null;
            }

            out.push(
                Object.fromEntries(fields.map((field) => [field, block[field]])) as Record<T, string>,
            );
        }

        return out;
    };

    const mesures = blocks(raw.mesures, ['mesure', 'concept', 'lecture', 'conseil'] as const);
    const comportement = blocks(raw.comportement, ['titre', 'constat', 'consequence'] as const);

    if (!mesures || !comportement || mesures.length === 0 || comportement.length === 0) {
        return null;
    }

    return {
        synthese,
        mesures,
        comportement,
        force_principale: force,
        risque_principal: risque,
        action_prioritaire: action,
        verdict_systeme: verdict,
    };
}
