// ================================================================
// STATISTIQUES PAR SETUP
//
// Le taux de réussite de chaque entrée, MESURÉ sur le journal du
// trader au lieu d'être lu dans une constante.
//
// Les taux codés en dur (domain/data/entry-types.ts) sont ceux d'un
// seul trader, figés au jour où ils ont été écrits. Ici chaque
// utilisateur voit les siens, et ils bougent à mesure que son
// journal se remplit.
//
// Pur : trades en entrée, statistiques en sortie.
// ================================================================

export interface SetupTrade {
    strategy: string | null;
    closedAt: Date | null;
    pnl: number | null;
}

export interface SetupStat {
    setup: string;
    /** Trades clôturés — seuls ceux-là ont un résultat. */
    closed: number;
    wins: number;
    losses: number;
    breakeven: number;
    /** Pourcentage, ou null tant que l'échantillon est trop maigre. */
    winRatePct: number | null;
    /** Somme des P&L clôturés. */
    netPnl: number;
    /** Gain moyen par trade clôturé, ou null sans échantillon. */
    expectancy: number | null;
    /** Vrai quand l'échantillon atteint le minimum exigé. */
    reliable: boolean;
}

/**
 * En dessous de ce nombre de trades clôturés, aucun taux n'est affiché.
 *
 * Trois trades gagnants d'affilée donnent 100 %, ce qui est vrai et
 * parfaitement trompeur. Un taux sur un échantillon minuscule invite à
 * abandonner un bon setup ou à surcharger un mauvais ; mieux vaut afficher
 * « pas assez de données » et laisser le journal se remplir.
 */
export const MIN_TRADES_FOR_RATE = 10;

function outcome(trade: SetupTrade): 'win' | 'loss' | 'breakeven' | 'open' {
    if (trade.closedAt === null) return 'open';
    if (trade.pnl === null) return 'open';
    if (trade.pnl > 0) return 'win';
    if (trade.pnl < 0) return 'loss';
    return 'breakeven';
}

function summarise(setup: string, trades: readonly SetupTrade[]): SetupStat {
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let netPnl = 0;
    let closed = 0;

    for (const trade of trades) {
        const result = outcome(trade);
        if (result === 'open') continue;

        closed += 1;
        netPnl += trade.pnl ?? 0;
        if (result === 'win') wins += 1;
        else if (result === 'loss') losses += 1;
        else breakeven += 1;
    }

    const reliable = closed >= MIN_TRADES_FOR_RATE;

    // Le nul ne compte NI en gagnant NI en perdant, mais reste au dénominateur :
    // un setup qui finit sans cesse à l'équilibre n'a pas un taux de réussite
    // de 100 %, il a un taux faible et beaucoup de nuls.
    return {
        setup,
        closed,
        wins,
        losses,
        breakeven,
        winRatePct: reliable ? Math.round((wins / closed) * 1000) / 10 : null,
        netPnl: Math.round(netPnl * 100) / 100,
        expectancy: closed > 0 ? Math.round((netPnl / closed) * 100) / 100 : null,
        reliable,
    };
}

/**
 * Une ligne par setup effectivement joué, la plus rentable d'abord.
 *
 * Les trades sans setup renseigné sont regroupés à part plutôt qu'ignorés :
 * « quarante trades sans étiquette » est une information sur la tenue du
 * journal, et les cacher ferait croire que tout est catégorisé.
 */
export const UNLABELLED = 'Sans setup';

export function setupStats(trades: readonly SetupTrade[]): SetupStat[] {
    const groups = new Map<string, SetupTrade[]>();

    for (const trade of trades) {
        const key = trade.strategy?.trim() || UNLABELLED;
        const bucket = groups.get(key);
        if (bucket) bucket.push(trade);
        else groups.set(key, [trade]);
    }

    return [...groups]
        .map(([setup, group]) => summarise(setup, group))
        .sort((a, b) => b.netPnl - a.netPnl);
}

/** Le taux de réussite global, toutes entrées confondues. */
export function overallStat(trades: readonly SetupTrade[]): SetupStat {
    return summarise('Global', trades);
}

/**
 * Les setups déjà présents dans le journal.
 *
 * Sert à alimenter la liste de choix sans rien imposer : un trader qui a
 * étiqueté ses trades avant de déclarer ses setups les retrouve, au lieu de
 * voir sa propre nomenclature disparaître du menu.
 */
export function setupsUsedInJournal(trades: readonly SetupTrade[]): string[] {
    const seen = new Set<string>();
    for (const trade of trades) {
        const name = trade.strategy?.trim();
        if (name) seen.add(name);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'fr'));
}
