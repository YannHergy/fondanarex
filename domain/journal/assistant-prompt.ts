// ================================================================
// ASSISTANT PROMPT
//
// A real conversation, grounded in figures the code computed.
//
// The whole design rests on one line of the system prompt: when a
// number is not in the context, the assistant says it cannot
// answer. A model that invents a plausible Sharpe ratio is worse
// than one that has none — the first is trusted and wrong, the
// second is merely limited.
//
// What is pre-computed is therefore not the ANSWERS but what the
// assistant KNOWS. It is the difference between a list of canned
// replies and an adviser handed the full file before the meeting.
//
// Pure — no I/O.
// ================================================================

export interface AssistantContext {
    /** Today, ISO date. Everything projected is counted from it. */
    today: string;
    trades: number;
    expectancy: number;
    observedPace: number;
    capital: number;
    targetPct: number;
    maxLossPct: number;
    size: number;
    pace: number;
    projection: {
        passRate: number;
        failRate: number;
        /** ISO date the target is reached on, at the current pace. */
        targetDate: string | null;
        monthsToTarget: number | null;
        tradesToTarget: number | null;
        p95MaxDrawdown: number;
    };
    sweep: {
        size: number;
        passRate: number;
        failRate: number;
        months: number | null;
        drawdown: number;
    }[];
    recommendations: {
        label: string;
        evidence: string;
        sampleSize: number | null;
        months: number | null;
        passRate: number;
        failRate: number;
    }[];
    segments: { key: string; trades: number; meanNet: number }[];
}

export interface AssistantTurn {
    role: "user" | "assistant";
    content: string;
}

/** Turns kept when the conversation is sent back. */
export const MAX_HISTORY_TURNS = 20;

export const ASSISTANT_SYSTEM = `Tu es l'assistant du journal de trading de ton interlocuteur. Il te
parle de SON compte, avec SES chiffres, que tu reçois calculés.

RÈGLE ABSOLUE, sans exception : tu ne calcules JAMAIS et tu n'inventes JAMAIS un
chiffre. Tous ceux dont tu disposes sont dans le contexte fourni. Si une question
exige un nombre qui ne s'y trouve pas, tu réponds explicitement que tu ne peux pas
le calculer, et tu dis lequel il te faudrait. Un assistant qui invente un ratio
plausible est plus dangereux qu'un assistant qui reconnaît sa limite.

Tu peux en revanche COMPARER et INTERPRÉTER librement les chiffres fournis : dire
lequel est meilleur, ce qu'un écart implique, quel compromis se cache derrière deux
options. C'est ton travail.

CE QUE TU NE SAIS PAS et ne dois jamais supposer : sa stratégie, son état d'esprit,
le contexte de marché, ses raisons d'entrer ou de sortir. Tu observes des traces
chiffrées, pas des intentions.

L'HYPOTHÈSE DE FOND, à rappeler quand elle porte à conséquence : toute projection
suppose que le futur ressemble au passé. Elle ne vaut que tant que sa méthode ne
change pas.

PRUDENCE D'ÉCHANTILLON : ces chiffres reposent sur un nombre fini de trades, indiqué
dans le contexte. Quand il est faible, dis-le à l'endroit où tu t'en sers. Un segment
appuyé sur deux trades ne démontre rien, et le moteur refuse d'ailleurs d'en tirer
une recommandation en dessous de cinq.

Réponds en français, à la deuxième personne du singulier, brièvement et
concrètement. Pas de préambule, pas de flatterie. Quand un chiffre répond à la
question, cite-le.`;

function money(value: number): string {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

/** The figures the assistant is allowed to speak about. */
export function buildAssistantContext(context: AssistantContext): string {
    const p = context.projection;

    const sweep = context.sweep
        .map(
            (point) =>
                `  taille ×${point.size} : validation ${point.passRate} %, élimination ${point.failRate} %, ${point.months === null ? "objectif jamais atteint" : `${point.months} mois`}, drawdown 95e −${money(point.drawdown)}`,
        )
        .join("\n");

    const recos = context.recommendations
        .map((entry) => {
            const evidence =
                entry.evidence === "arithmetic"
                    ? "arithmétique, aucune hypothèse"
                    : entry.evidence === "observed"
                      ? `observé sur ${entry.sampleSize} trades, hypothèse sur le futur`
                      : `ÉCARTÉ, seulement ${entry.sampleSize} trades`;

            return `  ${entry.label} : ${entry.months === null ? "—" : `${entry.months} mois`}, validation ${entry.passRate} %, élimination ${entry.failRate} % (${evidence})`;
        })
        .join("\n");

    const segments = context.segments
        .map(
            (segment) =>
                `  ${segment.key} : ${segment.trades} trades, ${segment.meanNet > 0 ? "+" : ""}${money(segment.meanNet)} par trade en moyenne`,
        )
        .join("\n");

    return `CONTEXTE — chiffres calculés, à ne jamais recalculer.

SON JOURNAL
- Trades clôturés : ${context.trades}
- Espérance par trade : ${money(context.expectancy)} (devise du compte)
- Rythme réellement observé : ${context.observedPace} trades par semaine

RÉGLAGES ACTUELS DE LA PROJECTION
- Capital : ${money(context.capital)}
- Objectif : ${context.targetPct} % (soit ${money(context.capital * (context.targetPct / 100))})
- Perte maximale autorisée : ${context.maxLossPct} % (soit ${money(context.capital * (context.maxLossPct / 100))})
- Taille de position simulée : ×${context.size}
- Rythme simulé : ${context.pace} trades par semaine

RÉSULTAT DE LA PROJECTION À CES RÉGLAGES
- Date d'aujourd'hui : ${context.today}
- Probabilité de validation : ${p.passRate} %
- Probabilité d'élimination : ${p.failRate} %
- Objectif atteint vers le : ${p.targetDate ?? "jamais atteint dans l'horizon simulé"}
- Délai médian : ${p.monthsToTarget === null ? "objectif jamais atteint" : `${p.monthsToTarget} mois`}
- Trades médians jusqu'à l'objectif : ${p.tradesToTarget ?? "—"}
- Drawdown au 95e centile : −${money(p.p95MaxDrawdown)}

EFFET DE LA TAILLE DE POSITION
${sweep}

RECOMMANDATIONS CLASSÉES
${recos || "  aucune"}

RÉSULTAT PAR PAIRE
${segments || "  aucun"}

MÉTHODE, si on te le demande : la projection tire au sort de nouveaux trades parmi
ses résultats réels, avec remise, 4 000 fois. Elle ne remélange pas ses trades
passés — elle en tire de nouveaux dans la même distribution. Elle travaille en
devise du compte et non en multiples de risque, parce que le rapport MetaTrader
enregistre le stop À LA CLÔTURE et non à l'entrée : chez lui, quatre trades sur
vingt-cinq portent un stop de moins de 5 pips, remonté au point d'équilibre, ce qui
ferait passer le R moyen de 0,29 à 1,00 et rendrait toute projection en R fausse.`;
}
