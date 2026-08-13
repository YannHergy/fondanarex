// ================================================================
// METAAPI DEALS -> POSITIONS
//
// MetaApi ne renvoie pas des positions mais des OPÉRATIONS : une à
// l'entrée, une (ou plusieurs, en cas de sortie partielle) à la
// sortie, reliées par leur positionId. Le journal, lui, raisonne en
// positions — une ligne par trade, du prix d'entrée au prix de
// sortie.
//
// Pur : opérations en entrée, positions en sortie. Aucun accès
// réseau ni base, pour que la logique de repli soit testable seule.
// ================================================================

export interface RawDeal {
    id?: string;
    positionId?: string;
    symbol?: string;
    /** DEAL_TYPE_BUY | DEAL_TYPE_SELL | DEAL_TYPE_BALANCE ... */
    type?: string;
    /** DEAL_ENTRY_IN | DEAL_ENTRY_OUT | DEAL_ENTRY_INOUT */
    entryType?: string;
    volume?: number;
    price?: number;
    profit?: number;
    commission?: number;
    swap?: number;
    time?: string;
}

export interface FoldedPosition {
    positionId: string;
    symbol: string;
    direction: 'Buy' | 'Sell';
    openedAt: Date;
    closedAt: Date;
    entryPrice: number;
    exitPrice: number;
    lotSize: number;
    /** Somme des opérations de sortie, brut de frais. */
    profit: number;
    commission: number;
    swap: number;
}

function parseTime(value: string | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Replie les opérations en positions CLÔTURÉES.
 *
 * Une position encore ouverte n'a pas d'opération de sortie : elle est
 * ignorée plutôt que rendue avec un prix de sortie inventé. Le journal la
 * verra quand elle se fermera, au prochain passage.
 *
 * Les opérations de solde (dépôt, retrait, crédit) portent un type
 * DEAL_TYPE_BALANCE et aucun symbole : elles bougent le capital mais ne sont
 * pas des trades, et les compter en fausserait chaque statistique.
 *
 * Sorties PARTIELLES : plusieurs opérations de sortie partagent un positionId.
 * Le profit, la commission et le swap sont SOMMÉS — c'est ce dont le solde a
 * réellement bougé — tandis que le prix de sortie retenu est celui de la
 * dernière, et la date de clôture la plus tardive. Retenir la première aurait
 * daté la position à sa sortie partielle, avant qu'elle soit réellement close.
 */
export function foldDealsIntoPositions(deals: readonly RawDeal[]): FoldedPosition[] {
    const byPosition = new Map<string, RawDeal[]>();

    for (const deal of deals) {
        if (!deal.positionId) continue;
        // Ni un trade, ni rattachable à un instrument.
        if (deal.type === 'DEAL_TYPE_BALANCE' || !deal.symbol) continue;

        const group = byPosition.get(deal.positionId) ?? [];
        group.push(deal);
        byPosition.set(deal.positionId, group);
    }

    const positions: FoldedPosition[] = [];

    for (const [positionId, group] of byPosition) {
        const ordered = [...group].sort(
            (a, b) => (parseTime(a.time)?.getTime() ?? 0) - (parseTime(b.time)?.getTime() ?? 0),
        );

        const entry = ordered.find(d => d.entryType === 'DEAL_ENTRY_IN');
        const exits = ordered.filter(d => d.entryType === 'DEAL_ENTRY_OUT');
        if (!entry || exits.length === 0) continue;

        const openedAt = parseTime(entry.time);
        const lastExit = exits[exits.length - 1]!;
        const closedAt = parseTime(lastExit.time);
        if (!openedAt || !closedAt) continue;

        const entryPrice = entry.price;
        const exitPrice = lastExit.price;
        if (typeof entryPrice !== 'number' || typeof exitPrice !== 'number') continue;

        // Le sens de la POSITION est celui de son entrée : une entrée à l'achat
        // ouvre un long, quelle que soit l'opération qui la referme (laquelle
        // est nécessairement de sens inverse).
        const direction: 'Buy' | 'Sell' = entry.type === 'DEAL_TYPE_SELL' ? 'Sell' : 'Buy';

        const sum = (pick: (d: RawDeal) => number | undefined): number =>
            ordered.reduce((total, d) => total + (pick(d) ?? 0), 0);

        positions.push({
            positionId,
            symbol: entry.symbol!,
            direction,
            openedAt,
            closedAt,
            entryPrice,
            exitPrice,
            lotSize: entry.volume ?? 0,
            profit: exits.reduce((total, d) => total + (d.profit ?? 0), 0),
            // Frais pris sur TOUTES les opérations : la commission d'entrée
            // compte autant que celle de sortie.
            commission: sum(d => d.commission),
            swap: sum(d => d.swap),
        });
    }

    return positions.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
}
