// ================================================================
// ANALYSE FONDAMENTALE D'UN SETUP
//
// Confronte un scénario technique — décrit par le trader, illustré
// par ses captures — aux publications économiques qui tombent
// pendant la durée qu'il est censé couvrir.
//
// Pur : setup + publications en entrée, prompt en sortie. Aucun
// accès réseau, pour que la construction du prompt soit testable.
// ================================================================

export interface ReleaseForPrompt {
    currencyCode: string;
    label: string;
    at: Date;
    impact: 'high' | 'medium' | 'low';
    previous: number | null;
}

export interface SetupForPrompt {
    instrument: string;
    /** Bullish | Bearish | Neutral, tel que le trader l'a posé. */
    bias: string;
    entryZone: string | null;
    tp: string | null;
    sl: string | null;
    /** La description du setup par le trader lui-même. */
    notes: string | null;
    horizonDays: number;
    screenshotCount: number;
}

/** Les deux devises d'une paire « EUR/USD ». Vide si le symbole n'est pas une paire. */
export function pairCurrencies(instrument: string): string[] {
    const match = /^([A-Z]{3})\s*\/\s*([A-Z]{3})$/.exec(instrument.toUpperCase());
    return match ? [match[1]!, match[2]!] : [];
}

/**
 * Publications qui tombent dans la fenêtre du scénario, pour les devises de
 * la paire.
 *
 * Les publications DÉJÀ SORTIES sont exclues : le trader veut savoir ce qui
 * peut encore faire bouger son scénario, pas ce qui l'a précédé. Une news
 * passée appartient au contexte, pas aux conditions à remplir.
 */
export function releasesInWindow(
    releases: readonly ReleaseForPrompt[],
    instrument: string,
    horizonDays: number,
    now: Date,
): ReleaseForPrompt[] {
    const codes = new Set(pairCurrencies(instrument));
    if (codes.size === 0) return [];

    const end = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

    return releases
        .filter(r => codes.has(r.currencyCode))
        .filter(r => r.at.getTime() > now.getTime() && r.at.getTime() <= end.getTime())
        .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** La couleur que prendra la bande affichée pour une condition. */
export type ConditionTone = 'favorable' | 'risque' | 'neutre';

export interface SetupCondition {
    /** Nom de la publication, repris de la liste fournie. */
    release: string;
    currency: string;
    /** ISO, repris de la liste fournie. */
    at: string;
    /** Le chiffre qu'il faudrait voir, formulé simplement. */
    requirement: string;
    tone: ConditionTone;
}

export const SETUP_ANALYSIS_SYSTEM = `Tu es analyste macro pour un trader forex. Tu reçois un scénario technique et la liste EXACTE des publications économiques qui tombent pendant sa durée de vie.

Ton rôle est de donner le BIAIS MACRO DE LA SEMAINE et de dire, publication par publication, ce qui doit sortir pour que le scénario du trader tienne. Tu ne donnes JAMAIS de niveau d'entrée, de TP ou de SL : la partie technique appartient au trader, tu ne fais que le fond.

Règles absolues :
- Ne lis JAMAIS de niveau de prix précis sur une capture. Tu peux décrire la structure, la tendance, le sens d'un tracé, mais les chiffres exacts viennent des champs saisis par le trader, pas de l'image.
- N'invente aucune publication. Chaque condition doit reprendre le NOM, la DEVISE et la DATE exacts d'une entrée de la liste fournie. Si une donnée que tu voudrais citer n'y est pas, elle n'existe pas pour cette analyse.
- Pour chaque publication qui compte, formule la condition en une phrase courte et concrète, en te servant du précédent fourni comme repère chiffré. Exemple : « doit sortir sous 150k pour confirmer la faiblesse du dollar ».
- Le ton de chaque condition dit ce qu'elle fait AU SCÉNARIO DU TRADER :
  · "favorable" — un chiffre attendu dans ce sens soutient le scénario
  · "risque"    — cette publication peut le casser
  · "neutre"    — à surveiller, sans effet direct
- Si AUCUNE publication de la liste ne porte le scénario, renvoie une liste de conditions VIDE et dis-le franchement dans l'analyse. C'est une réponse utile, pas un échec.
- Écris en français, au présent, sans jargon inutile.`;

/** Construit la partie textuelle du message. Les captures sont jointes séparément. */
export function buildSetupAnalysisPrompt(
    setup: SetupForPrompt,
    releases: readonly ReleaseForPrompt[],
    now: Date,
): string {
    const dateFmt = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
    });

    const window = `du ${dateFmt.format(now)} au ${dateFmt.format(
        new Date(now.getTime() + setup.horizonDays * 24 * 60 * 60 * 1000),
    )} (UTC)`;

    const calendar =
        releases.length === 0
            ? 'AUCUNE publication économique connue sur cette période pour les devises de la paire.'
            : releases
                  .map(r => {
                      const previous = r.previous === null ? 'précédent inconnu' : `précédent ${r.previous}`;
                      return `- ${dateFmt.format(r.at)} · ${r.currencyCode} · ${r.label} · impact ${r.impact} · ${previous}`;
                  })
                  .join('\n');

    const levels = [
        setup.entryZone ? `zone d'entrée ${setup.entryZone}` : null,
        setup.tp ? `TP ${setup.tp}` : null,
        setup.sl ? `SL ${setup.sl}` : null,
    ]
        .filter(Boolean)
        .join(' · ');

    return [
        `PAIRE : ${setup.instrument}`,
        `BIAIS TECHNIQUE DU TRADER : ${setup.bias}`,
        `DURÉE VISÉE : ${setup.horizonDays} jour(s) — ${window}`,
        levels ? `NIVEAUX SAISIS : ${levels}` : 'NIVEAUX SAISIS : aucun',
        '',
        'DESCRIPTION DU SETUP PAR LE TRADER :',
        setup.notes?.trim() || '(le trader n\'a rien écrit — appuie-toi sur la capture et le biais)',
        '',
        setup.screenshotCount > 0
            ? `${setup.screenshotCount} capture(s) jointe(s) au message.`
            : 'Aucune capture jointe.',
        '',
        'PUBLICATIONS ÉCONOMIQUES SUR LA PÉRIODE :',
        calendar,
        '',
        'Réponds avec cet objet JSON :',
        '{',
        '  "biais_macro": "Haussier" | "Baissier" | "Neutre",',
        '  "analyse": "Le biais macro de la semaine en trois phrases : ce que disent les données à venir pour cette paire, et si elles vont dans le sens du trader ou non. Si aucune publication ne porte le scénario, dis-le.",',
        '  "scenario_favorable": "Le scénario qui VALIDE le setup du trader : si les données sortent dans ce sens, voici ce qui se passe et pourquoi le mouvement va au bout. Trois ou quatre phrases, en citant les publications concernées.",',
        '  "scenario_contraire": "Le scénario qui CASSE le setup : quelles sorties de chiffres le tuent, et ce que fait le prix à la place. Trois ou quatre phrases, en citant les publications concernées.",',
        '  "conditions": [',
        '    {',
        '      "release": "nom EXACT repris de la liste",',
        '      "currency": "devise EXACTE reprise de la liste",',
        '      "at": "date ISO EXACTE reprise de la liste",',
        '      "requirement": "ce que le chiffre doit faire, en une phrase courte",',
        '      "tone": "favorable" | "risque" | "neutre"',
        '    }',
        '  ],',
        '  "verdict": "corrobore" | "contredit" | "aucun_lien"',
        '}',
    ].join('\n');
}
