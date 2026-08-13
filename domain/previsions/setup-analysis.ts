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

export const SETUP_ANALYSIS_SYSTEM = `Tu es analyste macro pour un trader forex. Tu reçois un scénario technique et la liste EXACTE des publications économiques qui tombent pendant sa durée de vie.

Ton travail : dire ce qui doit se passer FONDAMENTALEMENT pour que ce scénario se réalise.

Règles absolues :
- Ne lis JAMAIS de niveau de prix précis sur une capture. Tu peux décrire la structure, la tendance, le sens d'un tracé, mais les chiffres exacts viennent des champs saisis par le trader, pas de l'image.
- N'invente aucune publication. Tu ne parles QUE des publications de la liste fournie. Si une donnée que tu voudrais citer n'y est pas, elle n'existe pas pour cette analyse.
- Pour chaque publication qui compte, dis quel type de chiffre soutiendrait le scénario et lequel le tuerait, en te servant du précédent fourni comme point de repère.
- Si AUCUNE publication de la liste ne peut valider ou invalider le scénario, dis-le franchement : « aucune publication de cette période ne porte ce scénario ». C'est une réponse utile, pas un échec.
- Écris en français, au présent, sans jargon inutile. Pas de listes à puces dans les champs : des phrases.`;

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
        '  "analyse": "Ce qui doit se passer fondamentalement pour que le scénario tienne. Cite les publications par leur nom et leur jour, et dis quel type de chiffre il faudrait. Si aucune ne porte le scénario, dis-le.",',
        '  "vents_porteurs": "Ce qui, dans le calendrier et le contexte, soutient le scénario. Vide si rien.",',
        '  "vents_contraires": "Ce qui peut le faire échouer, publication par publication.",',
        '  "verdict": "corrobore" | "contredit" | "aucun_lien"',
        '}',
    ].join('\n');
}
