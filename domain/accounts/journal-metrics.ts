// ================================================================
// MÉTRIQUES DE COMPTE, MESURÉES SUR LE JOURNAL
//
// Les mêmes chiffres que domain/accounts/metrics.ts — taux de
// réussite, ratio gain/risque, espérance — mais tirés des trades
// réellement pris plutôt que de constantes.
//
// metrics.ts lit ENTRY_WIN_RATES et ENTRY_RR, qui décrivent
// l'historique d'UN trader et sont figés. Un compte appartenant à
// quelqu'un d'autre y trouvait donc des statistiques qui n'étaient
// pas les siennes. Ici tout vient de son journal.
//
// Pur : setups autorisés + statistiques en entrée, chiffres en sortie.
// ================================================================

import type { SetupStat } from '../journal/setup-stats';
import { MIN_TRADES_FOR_RATE } from '../journal/setup-stats';

export interface JournalMetrics {
    /** Trades clôturés sur les setups autorisés. */
    closed: number;
    /** Pourcentage, ou null tant que l'échantillon est trop maigre. */
    winRatePct: number | null;
    /** Gain moyen d'un gagnant rapporté à la perte moyenne d'un perdant. */
    rr: number | null;
    /** Espérance par trade, en devise du compte. */
    expectancy: number | null;
    /** Vrai quand l'échantillon atteint le minimum exigé. */
    reliable: boolean;
}

/**
 * Agrège les setups autorisés d'un compte.
 *
 * POOLÉ, pas moyenné : on additionne les gains bruts et les pertes brutes
 * avant de diviser. Faire la moyenne des moyennes donnerait le même poids à un
 * setup pris deux fois et à un setup pris cinquante fois — c'est la façon la
 * plus courante de produire un ratio faux avec des données justes.
 *
 * Un setup autorisé mais jamais joué n'apporte rien et ne retire rien : il est
 * simplement absent du calcul, comme un indicateur sans donnée dans le moteur
 * de score.
 */
export function journalMetrics(
    allowedSetups: readonly string[],
    stats: readonly SetupStat[],
): JournalMetrics {
    const allowed = new Set(allowedSetups);
    const kept = stats.filter(stat => allowed.has(stat.setup));

    let closed = 0;
    let wins = 0;
    let losses = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let netPnl = 0;

    for (const stat of kept) {
        closed += stat.closed;
        wins += stat.wins;
        losses += stat.losses;
        grossWin += stat.grossWin;
        grossLoss += stat.grossLoss;
        netPnl += stat.netPnl;
    }

    const reliable = closed >= MIN_TRADES_FOR_RATE;

    // Le RR demande des gagnants ET des perdants : sans perte mesurée, il n'y
    // a pas de risque à rapporter le gain à quoi que ce soit, et renvoyer un
    // ratio infini serait pire que ne rien renvoyer.
    const rr =
        wins > 0 && losses > 0 && grossLoss > 0
            ? Math.round((grossWin / wins / (grossLoss / losses)) * 10) / 10
            : null;

    return {
        closed,
        winRatePct: reliable ? Math.round((wins / closed) * 1000) / 10 : null,
        rr,
        expectancy: closed > 0 ? Math.round((netPnl / closed) * 100) / 100 : null,
        reliable,
    };
}

/**
 * L'espérance rapportée au capital, en pourcentage.
 *
 * C'est la forme comparable entre comptes de tailles différentes : gagner 40 $
 * par trade ne veut pas dire la même chose sur 5 000 $ et sur 100 000 $.
 */
export function journalExpectancyPct(
    metrics: JournalMetrics,
    capital: number,
): number | null {
    if (metrics.expectancy === null || capital <= 0) return null;
    return Math.round((metrics.expectancy / capital) * 100 * 100) / 100;
}

// ── Zone d'alerte ───────────────────────────────────────────────

export type AlertState = 'ok' | 'warning' | 'breached';

export interface AlertInput {
    initialCapital: number;
    currentCapital: number;
    maxDDPct: number;
    /** Seuil choisi par le trader, en % du capital initial. Null = pas d'alerte. */
    alertThresholdPct: number | null;
}

export interface AlertVerdict {
    state: AlertState;
    /** Perte actuelle en % du capital initial. Négatif si le compte est en gain. */
    lossPct: number;
    /** Le seuil franchi, quand il y en a un. */
    thresholdPct: number | null;
}

/**
 * Où en est le compte par rapport à la limite que le trader s'est fixée.
 *
 * Deux limites distinctes, et c'est le point : `maxDDPct` est la règle du prop
 * firm — franchie, le compte est mort. `alertThresholdPct` est la limite de
 * CONFORT du trader, placée volontairement avant, pour l'obliger à s'arrêter
 * et revoir sa façon de trader pendant qu'il en a encore les moyens.
 */
export function alertVerdict(input: AlertInput): AlertVerdict {
    const lossPct =
        input.initialCapital > 0
            ? Math.round(
                  ((input.initialCapital - input.currentCapital) / input.initialCapital) *
                      100 *
                      100,
              ) / 100
            : 0;

    if (lossPct >= input.maxDDPct) {
        return { state: 'breached', lossPct, thresholdPct: input.maxDDPct };
    }

    if (input.alertThresholdPct !== null && lossPct >= input.alertThresholdPct) {
        return { state: 'warning', lossPct, thresholdPct: input.alertThresholdPct };
    }

    return { state: 'ok', lossPct, thresholdPct: input.alertThresholdPct };
}
