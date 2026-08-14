// ================================================================
// BRIEFING PROMPTS
//
// The debate runs in rounds, per correlated currency pair:
//
//   0  Perplexity  research    — current facts, no opinion
//   1  Claude      analysis    — a first directional read
//   2  Groq        contradiction — adversarial, must find the flaw
//   3  Claude      defence     — answer the objection or concede
//   4  Claude      verdict     — final call with conviction
//
// Pairs are grouped by what actually links them (central-bank
// contrast, commodity exposure, safe-haven behaviour) so each round
// can reason about a real relationship rather than eight unrelated
// currencies at once.
//
// Pure string building — no I/O.
// ================================================================

import type { CurrencyWithScore } from '../types';

export interface CurrencyGroup {
    codes: readonly string[];
    label: string;
    theme: string;
}

export const CURRENCY_GROUPS: readonly CurrencyGroup[] = [
    {
        codes: ['EUR', 'GBP'],
        label: 'EUR / GBP',
        theme: 'Européennes — BCE vs Bank of England, inflation zone euro vs UK, politiques monétaires divergentes, livre sterling',
    },
    {
        codes: ['CAD', 'USD'],
        label: 'CAD / USD',
        theme: 'Amérique du Nord — Fed vs Banque du Canada, corrélation pétrolière du CAD, NFP et chômage US, tarifs douaniers et commerce bilatéral',
    },
    {
        codes: ['AUD', 'NZD'],
        label: 'AUD / NZD',
        theme: 'Pacifique-Sud — RBA vs RBNZ, matières premières (minerai de fer, produits laitiers), dépendance à la Chine, forte corrélation AUD/NZD',
    },
    {
        codes: ['JPY', 'CHF'],
        label: 'JPY / CHF',
        theme: 'Valeurs refuges — Banque du Japon vs BNS, carry trade sur le yen, franc suisse, aversion au risque, inflation structurellement faible',
    },
];

export const CLAUDE_SYSTEM_PROMPT =
    "Tu es un analyste macro forex rigoureux et méthodique. Tu analyses les données fondamentales avec précision et tu appuies chaque conclusion sur des faits concrets. Tu ne suis pas le consensus de marché : tu suis la logique macro. Réponds en français.";

export const GROQ_SYSTEM_PROMPT =
    "Tu es un trader contrarian. Ton rôle est de chercher les failles et de NE PAS être d'accord facilement. Pour chaque devise, tu dois trouver au moins un argument contre la vision dominante. Si après analyse tu finis par être d'accord, explique précisément pourquoi les contre-arguments ne tiennent pas. Ne reprends jamais les conclusions d'un autre modèle sans les avoir challengées. Réponds en français.";

/**
 * Groq's system prompt for the FINAL round only.
 *
 * Its debating prompt (GROQ_SYSTEM_PROMPT) instructs it to disagree and find a
 * flaw in every currency — deliberately, because that is what makes the debate
 * adversarial. But a model told to always disagree cannot cast a meaningful
 * vote: using its challenge round as its verdict deadlocked every currency.
 * At the verdict stage it is asked for its honest post-debate position instead.
 */
export const GROQ_VERDICT_SYSTEM_PROMPT =
    "Tu as challengé cette analyse. Donne maintenant ta position finale honnête, en tenant compte des réponses apportées à tes objections. Si les contre-arguments t'ont convaincu, dis-le : ton rôle de contradicteur est terminé, on te demande ton vrai avis. Réponds en français.";

/**
 * Groq as an INDEPENDENT second analyst rather than a contrarian.
 *
 * The five-round debate could not finish inside a serverless function, so the
 * shortened run has the two models analyse the same evidence SEPARATELY and
 * only then read each other. That changes what Groq must be told: a model
 * instructed to always disagree produces a challenge, not a belief, and its
 * vote would deadlock every currency by construction — which is exactly what a
 * verified run showed before the verdict round was split out.
 *
 * Two independent readings that converge is a real signal, and arguably a
 * cleaner one than agreement reached after one model has seen the other's
 * conclusion.
 */
export const GROQ_ANALYSIS_SYSTEM_PROMPT =
    "Tu es un analyste macro forex indépendant, sceptique par tempérament. Tu formes ton propre avis à partir des faits, sans complaisance : si les données sont faibles ou contradictoires, tu conclus Neutral plutôt que d'inventer une direction. Tu n'as vu l'avis d'aucun autre analyste. Réponds en français.";

/**
 * Each model's final position after reading the other's.
 *
 * This is the whole debate compressed into one exchange: both takes were
 * formed independently, each model now sees where the other landed and why,
 * and either holds its ground with a reason or moves. `changed` is what makes
 * a move visible instead of silent.
 */
export function buildPeerReviewPrompt(
    group: CurrencyGroup,
    macroSummary: string,
    ownTake: string,
    peerTake: string,
    focus?: string,
): string {
    return [
        `${group.label} — ${group.theme}`,
        '',
        '=== DONNÉES MACRO ===',
        macroSummary,
        '',
        '=== TON ANALYSE INDÉPENDANTE ===',
        ownTake || '(indisponible)',
        '',
        "=== L'ANALYSE D'UN AUTRE MODÈLE, FORMÉE SANS VOIR LA TIENNE ===",
        peerTake || '(indisponible)',
        '',
        'Les deux analyses ont été produites séparément sur les mêmes faits.',
        "Là où vous divergez, dis lequel des deux raisonnements tient et pourquoi.",
        "Là où vous convergez, vérifie que ce n'est pas la même erreur commise deux fois.",
        ...(focus?.trim()
            ? ['', "=== QUESTION DE L'UTILISATEUR, toujours à traiter ===", focus.trim()]
            : []),
        '',
        'Donne ta position FINALE. Si tu changes d\'avis, mets "changed": true et dis ce qui t\'a fait bouger.',
        '',
        jsonInstruction(group.codes, true),
    ].join('\n');
}

/** Compact macro table the models reason over. */
export function buildMacroSummary(currencies: readonly CurrencyWithScore[]): string {
    const rows = currencies.map(currency => {
        const s = currency.scores;
        return [
            `${currency.code}: score ${s.total}/100 (brut ${s.rawTotal})`,
            `taux ${currency.interestRate}%`,
            `inflation ${currency.cpi}%`,
            `taux réel ${s.realRate}%`,
            `PIB ${currency.gdpQoQ}%`,
            `chômage ${currency.unemployment}%`,
            `PMI ${currency.pmiManufacturing}/${currency.pmiServices}`,
            `orientation ${currency.stance}`,
            s.moteurN1 ? `moteur ${s.moteurN1}` : '',
        ]
            .filter(Boolean)
            .join(' · ');
    });

    return rows.join('\n');
}

function jsonInstruction(codes: readonly string[], withConviction = false): string {
    const fields = withConviction
        ? '{"bias": "Bullish|Bearish|Neutral", "explanation": "...", "conviction": "Haute|Moyenne|Basse", "changed": true|false}'
        : '{"bias": "Bullish|Bearish|Neutral", "explanation": "..."}';

    const entries = codes.map(code => `  "${code}": ${fields}`).join(',\n');
    return `Réponds avec cet objet JSON :\n{\n  "summary": "synthèse en 3 phrases",\n${entries}\n}`;
}

/**
 * Research brief for the online-search model.
 *
 * Deliberately asks for what our own database does NOT hold. The first version
 * asked for "les dernières publications macro (inflation, emploi, croissance,
 * PMI)" — which is exactly the set of figures the dashboards already track, so
 * the research round came back restating our own numbers and added nothing to
 * the debate.
 *
 * The chiffres are handed to Claude separately, in the analysis prompt. What is
 * missing there, and what only a live search can supply, is everything AROUND
 * the numbers: what officials actually said, what happened politically, what
 * the market is positioned for, and whether a print surprised expectations.
 */
export function buildResearchPrompt(group: CurrencyGroup, focus?: string): string {
    const lines = [
        `Recherche d'actualité sur ${group.label} — ${group.theme}.`,
        '',
        'Nous disposons DÉJÀ des chiffres macro (taux directeurs, inflation, PIB,',
        'chômage, balance commerciale). Ne les redonne PAS : ils sont fournis',
        "séparément à l'analyste.",
        '',
        'Cherche en ligne ce que ces chiffres ne disent pas :',
        '',
        "1. PAROLE DES BANQUES CENTRALES — discours, minutes, auditions, votes",
        "   dissidents, changements de ton. Ce qui a été DIT, pas le niveau du taux.",
        '2. POLITIQUE ET COMMERCE — élections, budgets, tensions, tarifs, sanctions,',
        '   accords, crises gouvernementales.',
        "3. SURPRISES — publications sorties AU-DESSUS ou EN DESSOUS du consensus,",
        "   et de combien. C'est l'écart aux attentes qui fait bouger un cours.",
        '4. MARCHÉ — positionnement, flux, révisions de prévisions par les banques,',
        '   narratif dominant du moment.',
        '',
        'Priorité aux deux dernières semaines, puis élargis si nécessaire.',
        "Si tu ne trouves rien sur un axe, passe au suivant sans t'excuser : mieux",
        'vaut trois faits solides que quatre rubriques creuses.',
        '',
        'Chaque fait doit porter sa DATE et sa source. Aucune opinion directionnelle,',
        'aucune prévision personnelle — tu documentes, tu ne juges pas.',
    ];

    // Ajouté à la fin plutôt qu'en tête : les quatre axes restent la base de
    // toute recherche, la question de l'utilisateur ne les remplace pas, elle
    // leur donne juste une priorité quand le temps de recherche est limité.
    if (focus?.trim()) {
        lines.push(
            '',
            "=== QUESTION PRIORITAIRE DE L'UTILISATEUR ===",
            focus.trim(),
            "Traite-la en priorité, en plus des quatre axes ci-dessus — pas à leur place.",
        );
    }

    return lines.join('\n');
}

export function buildAnalysisPrompt(
    group: CurrencyGroup,
    macroSummary: string,
    research: string,
    focus?: string,
): string {
    return [
        `Analyse fondamentale de ${group.label}.`,
        `Angle : ${group.theme}.`,
        '',
        '=== DONNÉES MACRO INTERNES ===',
        macroSummary,
        '',
        '=== RECHERCHE RÉCENTE ===',
        research || '(aucune recherche disponible — appuie-toi sur les données internes)',
        '',
        "Pour chaque devise du groupe, donne un biais directionnel motivé par les données ci-dessus.",
        'Sois précis sur le mécanisme : quel indicateur pousse dans quel sens et pourquoi.',
        ...(focus?.trim()
            ? [
                  '',
                  "=== QUESTION DE L'UTILISATEUR — à traiter explicitement dans \"explanation\" ===",
                  focus.trim(),
              ]
            : []),
        '',
        jsonInstruction(group.codes),
    ].join('\n');
}

export function buildContradictionPrompt(
    group: CurrencyGroup,
    macroSummary: string,
    claudeSummary: string,
    claudeBiases: string,
): string {
    return [
        `Challenge cette analyse de ${group.label}.`,
        '',
        '=== ANALYSE À CONTREDIRE ===',
        claudeSummary,
        claudeBiases,
        '',
        '=== DONNÉES MACRO ===',
        macroSummary,
        '',
        "Pour chaque devise : trouve la faille. Qu'est-ce que cette analyse ignore ? Quel scénario alternatif est plausible ? Quel indicateur contredit la conclusion ?",
        "Si après examen tu maintiens le même biais, justifie pourquoi les contre-arguments ne tiennent pas.",
        '',
        jsonInstruction(group.codes),
    ].join('\n');
}

export function buildDefencePrompt(
    group: CurrencyGroup,
    macroSummary: string,
    objections: string,
): string {
    return [
        `Réponds aux objections sur ${group.label}.`,
        '',
        '=== OBJECTIONS ===',
        objections,
        '',
        '=== DONNÉES MACRO ===',
        macroSummary,
        '',
        "Pour chaque devise : soit tu réfutes l'objection avec un argument factuel, soit tu reconnais qu'elle est valide et tu ajustes ton biais.",
        "Changer d'avis face à un bon argument est attendu, pas pénalisé. Indique `changed: true` si ton biais a évolué.",
        '',
        jsonInstruction(group.codes, true),
    ].join('\n');
}

export function buildVerdictPrompt(
    group: CurrencyGroup,
    debateSummary: string,
): string {
    return [
        `Verdict final sur ${group.label}.`,
        '',
        '=== DÉBAT COMPLET ===',
        debateSummary,
        '',
        "Tranche pour chaque devise en tenant compte de tout le débat. Indique une conviction : Haute si les arguments convergent, Basse si le débat a révélé une vraie incertitude.",
        '',
        jsonInstruction(group.codes, true),
    ].join('\n');
}

/** Compact rendering of a round's verdicts, for feeding into the next round. */
export function summariseBiases(
    codes: readonly string[],
    biases: Record<string, { bias: string; explanation: string }>,
): string {
    return codes
        .map(code => {
            const entry = biases[code];
            if (!entry) return `${code}: (pas d'avis)`;
            return `${code}: ${entry.bias} — ${entry.explanation.slice(0, 200)}`;
        })
        .join('\n');
}
