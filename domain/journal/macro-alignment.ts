// ================================================================
// LE SCORE MACRO SERT-IL À QUELQUE CHOSE ?
//
// Confronte chaque trade clôturé au biais macro de sa paire AU JOUR
// OÙ IL A ÉTÉ OUVERT, et compare ce que rapportent les trades pris
// dans le sens du score à ceux pris contre.
//
// C'est la seule mesure qui dise si tout l'édifice de scoring aide
// réellement, ou s'il décore. Trois issues, toutes utiles : il aide
// (on sait combien le pondérer), il ne change rien (on arrête d'y
// passer du temps), ou il nuit (information encore plus précieuse).
//
// Pur : trades + historique de score en entrée, verdict en sortie.
// ================================================================

export interface AlignmentTradeInput {
    /** « EUR/USD ». Les instruments qui ne sont pas une paire sont ignorés. */
    instrument: string;
    direction: 'Buy' | 'Sell';
    openedAt: Date;
    closedAt: Date | null;
    pnl: number | null;
}

export interface ScorePoint {
    currencyCode: string;
    computedAt: Date;
    total: number;
}

export interface SideStats {
    trades: number;
    wins: number;
    winRatePct: number | null;
    netPnl: number;
    expectancy: number | null;
}

export interface AlignmentReport {
    /** Trades pris dans le sens du score macro. */
    aligned: SideStats;
    /** Trades pris à contresens. */
    against: SideStats;
    /**
     * Trades écartés faute de signal macro net à la date d'ouverture, ou
     * faute d'historique de score. Comptés à part : ils ne disent rien sur
     * l'utilité du score, et les inclure tirerait tout vers la moyenne.
     */
    skipped: number;
    /** Vrai quand les DEUX côtés ont assez de trades pour être comparés. */
    reliable: boolean;
}

/**
 * Écart de score en dessous duquel on considère qu'il n'y a pas de signal.
 *
 * Deux devises à 54 et 52 ne disent rien : l'écart est dans le bruit du
 * modèle. Compter ces trades comme « alignés » ou « contre » remplirait les
 * deux colonnes de hasard et noierait l'effet qu'on cherche à mesurer.
 */
export const MIN_GAP = 10;

/**
 * Nombre de trades exigé DE CHAQUE CÔTÉ avant de comparer.
 *
 * Une comparaison entre 12 trades alignés et 2 à contresens n'est pas une
 * comparaison. Le seuil vaut pour les deux colonnes, pas pour le total.
 */
export const MIN_PER_SIDE = 8;

function pairOf(instrument: string): [string, string] | null {
    const match = /^([A-Z]{3})\s*\/\s*([A-Z]{3})$/.exec(instrument.toUpperCase());
    return match ? [match[1]!, match[2]!] : null;
}

/**
 * Le score d'une devise tel qu'il était à une date donnée.
 *
 * Le relevé le plus récent À OU AVANT la date, jamais après : utiliser un
 * score postérieur ferait juger la décision avec une information que le
 * trader n'avait pas. C'est la faute classique de ce genre de mesure, et elle
 * transforme n'importe quel modèle en oracle.
 */
function scoreAt(history: readonly ScorePoint[], code: string, when: Date): number | null {
    let best: ScorePoint | null = null;

    for (const point of history) {
        if (point.currencyCode !== code) continue;
        if (point.computedAt.getTime() > when.getTime()) continue;
        if (!best || point.computedAt.getTime() > best.computedAt.getTime()) best = point;
    }

    return best ? best.total : null;
}

function summarise(trades: ReadonlyArray<{ pnl: number }>): SideStats {
    const count = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

    return {
        trades: count,
        wins,
        winRatePct: count > 0 ? Math.round((wins / count) * 1000) / 10 : null,
        netPnl: Math.round(netPnl * 100) / 100,
        expectancy: count > 0 ? Math.round((netPnl / count) * 100) / 100 : null,
    };
}

export function macroAlignment(
    trades: readonly AlignmentTradeInput[],
    history: readonly ScorePoint[],
): AlignmentReport {
    const aligned: Array<{ pnl: number }> = [];
    const against: Array<{ pnl: number }> = [];
    let skipped = 0;

    for (const trade of trades) {
        // Seul un trade clôturé porte un résultat à corréler.
        if (trade.closedAt === null || trade.pnl === null) {
            skipped += 1;
            continue;
        }

        const pair = pairOf(trade.instrument);
        if (!pair) {
            skipped += 1;
            continue;
        }

        const base = scoreAt(history, pair[0], trade.openedAt);
        const quote = scoreAt(history, pair[1], trade.openedAt);
        if (base === null || quote === null) {
            skipped += 1;
            continue;
        }

        const gap = base - quote;
        if (Math.abs(gap) < MIN_GAP) {
            skipped += 1;
            continue;
        }

        // Le score dit d'acheter la paire quand la base est la plus forte.
        const macroSaysBuy = gap > 0;
        const tradedBuy = trade.direction === 'Buy';

        if (macroSaysBuy === tradedBuy) aligned.push({ pnl: trade.pnl });
        else against.push({ pnl: trade.pnl });
    }

    return {
        aligned: summarise(aligned),
        against: summarise(against),
        skipped,
        reliable: aligned.length >= MIN_PER_SIDE && against.length >= MIN_PER_SIDE,
    };
}

/**
 * Ce que la comparaison permet de conclure — ou pas.
 *
 * Rend explicitement « indécidable » tant que les deux côtés n'ont pas assez
 * de trades. C'est le cas de figure le plus probable au début, et le pire
 * serait d'annoncer que le score marche sur six trades.
 */
export type AlignmentVerdict = 'aide' | 'neutre' | 'nuit' | 'indecidable';

export function alignmentVerdict(report: AlignmentReport): AlignmentVerdict {
    if (!report.reliable) return 'indecidable';

    const a = report.aligned.expectancy;
    const b = report.against.expectancy;
    if (a === null || b === null) return 'indecidable';

    // On compare les ESPÉRANCES, pas les taux de réussite : un score qui
    // améliore le gain moyen sans changer le taux de réussite aide quand même.
    const delta = a - b;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1);
    // Moins de 15 % d'écart relatif : trop faible pour être distingué du bruit.
    if (Math.abs(delta) / scale < 0.15) return 'neutre';
    return delta > 0 ? 'aide' : 'nuit';
}
