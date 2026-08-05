// ================================================================
// BEHAVIOURAL COACH PROMPT
//
// Turns the computed analytics into the text the model reads.
//
// Two rules drive everything here:
//
//   1. The model is told, repeatedly, that it may not compute.
//      Every figure it needs is already in the message. Asked to
//      derive one it would sometimes get it right, which is worse
//      than always getting it wrong — the failures would hide.
//   2. It is told what it CANNOT know. The journal carries no
//      strategy, no emotion and no market context yet, so any
//      claim about intent would be invention dressed as insight.
//
// Pure — no I/O.
// ================================================================

import type { JournalAnalytics } from './analytics';

export interface CoachSection {
    titre: string;
    constat: string;
    consequence: string;
}

export interface CoachVerdict {
    synthese: string;
    sections: CoachSection[];
    force_principale: string;
    risque_principal: string;
    action_prioritaire: string;
}

/** Response schema, shared by the API call and the validator. */
export const COACH_SCHEMA = {
    type: 'object',
    properties: {
        synthese: { type: 'string' },
        sections: {
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
    },
    required: ['synthese', 'sections', 'force_principale', 'risque_principal', 'action_prioritaire'],
} as const;

export const COACH_SYSTEM = `Tu es un coach de trading qui analyse le journal d'un trader.

RÈGLE ABSOLUE : tu ne calcules JAMAIS. Tous les chiffres dont tu as besoin te sont
fournis, déjà calculés et vérifiés. Tu ne dois ni les recalculer, ni en dériver de
nouveaux, ni additionner deux valeurs entre elles. Si un chiffre ne t'est pas donné,
il n'existe pas pour toi et tu n'en parles pas.

Ton rôle est d'INTERPRÉTER : dire ce que ces nombres révèlent du comportement du
trader, pas les répéter. Un constat comme « ton taux de réussite est de 27 % » n'a
aucune valeur, il le voit déjà. Ce qu'il attend, c'est ce que ce 27 % implique
lorsqu'on le met en regard du rapport gain/perte et des séries de pertes.

CE QUE TU NE SAIS PAS, et que tu ne dois donc jamais supposer :
- la stratégie suivie sur chaque trade
- l'état émotionnel du trader
- le contexte de marché à ces dates
- ses raisons d'entrer ou de sortir

Tu observes des traces de comportement, pas des intentions. Écris « la taille de
position double après une perte », jamais « tu paniques après une perte ».

PRUDENCE STATISTIQUE : quand un découpage repose sur très peu de trades, dis-le.
Deux trades acheteurs perdants ne démontrent rien sur les achats.

Écris en français, à la deuxième personne du singulier, sobrement. Pas de flatterie,
pas de jargon anglais inutile. Chaque section doit apporter une information que le
tableau de chiffres ne donne pas déjà.`;

function line(label: string, value: string | number | null, suffix = ''): string {
    if (value === null) return `- ${label} : non disponible`;
    return `- ${label} : ${value}${suffix}`;
}

function breakdown(title: string, rows: { key: string; trades: number; net: number; winRate: number }[]): string {
    if (rows.length === 0) return '';

    const body = rows
        .map((row) => `  - ${row.key} : ${row.trades} trades, ${row.net > 0 ? '+' : ''}${row.net}, ${row.winRate}% de réussite`)
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
 * The analytics, rendered for the model.
 *
 * Written as labelled lines rather than raw JSON: the labels carry the units
 * and the sign convention, which is what stops "−2.5" being read as a count.
 */
export function buildCoachPrompt(analytics: JournalAnalytics, periodLabel: string): string {
    const a = analytics;

    return `Voici les statistiques du journal, déjà calculées. Période : ${periodLabel}.

RÉSULTAT GLOBAL
${line('Trades clôturés', a.trades)}
${line('Gagnants', a.wins)}
${line('Perdants', a.losses)}
${line('Neutres (résultat exactement nul)', a.breakeven)}
${line('Taux de réussite', a.winRate, ' %')}
${line('Résultat net', a.net)}
${line('Gain moyen', a.averageWin)}
${line('Perte moyenne', a.averageLoss)}
${line('Rapport gain moyen / perte moyenne', a.payoffRatio)}
${line('Plus longue série de gains', a.maxConsecutiveWins)}
${line('Plus longue série de pertes', a.maxConsecutiveLosses)}

GESTION DU RISQUE
${line('Part des trades protégés par un stop', a.stopLossCoverage, ' %')}
${line('Résultat médian en multiples du risque planifié au stop (R)', a.medianRMultiple)}
  (+1R = le trade a rapporté exactement ce qui était risqué ; −1R = la perte est
  restée dans le stop prévu ; au-delà de −1R, la perte a dépassé le plan)

COMPORTEMENT APRÈS UN RÉSULTAT
${line('Taille de position médiane sur le trade suivant une PERTE', a.lotAfterLoss, ' lots')}
${line('Taille de position médiane sur le trade suivant un GAIN', a.lotAfterWin, ' lots')}
${line('Délai médian avant de reprendre position après une PERTE', minutes(a.reentryMinutesAfterLoss))}
${line('Délai médian avant de reprendre position après un GAIN', minutes(a.reentryMinutesAfterWin))}

DURÉE DE DÉTENTION
${line('Durée médiane des trades GAGNANTS', minutes(a.holdMinutesOnWin))}
${line('Durée médiane des trades PERDANTS', minutes(a.holdMinutesOnLoss))}

ENTRÉES RAPPROCHÉES
${line('Entrées ouvertes sur la même paire à moins de 2 minutes de la précédente', a.clusteredEntries)}
${breakdown('PAR SENS', a.byDirection)}
${breakdown('PAR PAIRE', a.byInstrument)}
${breakdown('PAR JOUR DE LA SEMAINE', a.byWeekday)}
${breakdown("PAR HEURE D'OUVERTURE (horloge du serveur du courtier, pas UTC)", a.byServerHour)}

Produis :
- "synthese" : 2 à 3 phrases sur ce que ce journal dit du trader.
- "sections" : 3 à 5 observations. Chacune a un "titre" court, un "constat"
  ancré sur les chiffres fournis, et une "consequence" expliquant ce que cela
  coûte ou rapporte concrètement.
- "force_principale" : une phrase.
- "risque_principal" : une phrase.
- "action_prioritaire" : une seule chose à changer, formulée concrètement.`;
}

/** Runtime check that the model returned the shape the UI renders. */
export function validateCoachVerdict(value: unknown): CoachVerdict | null {
    if (typeof value !== 'object' || value === null) return null;
    const raw = value as Record<string, unknown>;

    const text = (key: string): string | null =>
        typeof raw[key] === 'string' && raw[key].trim().length > 0 ? (raw[key] as string) : null;

    const synthese = text('synthese');
    const force = text('force_principale');
    const risque = text('risque_principal');
    const action = text('action_prioritaire');
    if (!synthese || !force || !risque || !action) return null;

    if (!Array.isArray(raw.sections)) return null;

    const sections: CoachSection[] = [];
    for (const entry of raw.sections) {
        if (typeof entry !== 'object' || entry === null) return null;
        const section = entry as Record<string, unknown>;
        if (
            typeof section.titre !== 'string' ||
            typeof section.constat !== 'string' ||
            typeof section.consequence !== 'string'
        ) {
            return null;
        }
        sections.push({
            titre: section.titre,
            constat: section.constat,
            consequence: section.consequence,
        });
    }

    if (sections.length === 0) return null;

    return {
        synthese,
        sections,
        force_principale: force,
        risque_principal: risque,
        action_prioritaire: action,
    };
}
