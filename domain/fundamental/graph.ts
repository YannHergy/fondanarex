// ================================================================
// FUNDAMENTAL GRAPH — layout and traversal
//
// The indicator catalogue is a directed graph: a root indicator
// (oil, China PMI) feeds signals, which feed drivers, which feed the
// three pillars, which feed the currency's directional "king".
//
// This module computes where the nodes sit and which ones a
// selection touches. Pure — no SVG, no React — so the traversal is
// testable without rendering anything.
// ================================================================

import {
    FUNDAMENTAL_INDICATORS,
    type FundamentalIndicator,
    type IndicatorLevel,
} from '../data/fundamental-indicators';
import {
    FUNDAMENTAL_CONNECTIONS,
    type FundamentalConnection,
} from '../data/fundamental-connections';

/** Top to bottom: causes at the bottom, the currency's verdict at the top. */
export const LEVEL_ORDER: readonly IndicatorLevel[] = [
    'king',
    'pillar',
    'driver',
    'signal',
    'root',
];

export const LEVEL_LABELS: Record<IndicatorLevel, string> = {
    king: 'Direction',
    pillar: 'Piliers',
    driver: 'Moteurs',
    signal: 'Signaux',
    root: 'Racines',
};

export interface NodePosition {
    id: string;
    indicator: FundamentalIndicator;
    level: IndicatorLevel;
    /** 0..1 across the width of the row. */
    x: number;
    /** Row index, 0 = king. */
    row: number;
}

/**
 * Indicators shown for a currency: its own, plus the GLOBAL ones, which feed
 * several currencies and would otherwise leave dangling edges on every graph.
 */
export function indicatorsForCurrency(currency: string): FundamentalIndicator[] {
    return FUNDAMENTAL_INDICATORS.filter(
        i => i.currency === currency || i.currency === 'GLOBAL',
    );
}

/**
 * Lays out one currency's subgraph in rows by level, spreading each row evenly.
 *
 * Positions are normalised to 0..1 rather than pixels so the renderer owns the
 * viewport — the same layout serves a wide desktop SVG and a narrow one.
 */
export function computeLayout(currency: string): NodePosition[] {
    const indicators = indicatorsForCurrency(currency);
    const positions: NodePosition[] = [];

    LEVEL_ORDER.forEach((level, row) => {
        const inLevel = indicators.filter(i => i.level === level);

        inLevel.forEach((indicator, index) => {
            // Spread across the row with half-step insets, so a single node
            // centres and a full row does not touch the edges.
            const x = inLevel.length === 1 ? 0.5 : (index + 0.5) / inLevel.length;
            positions.push({ id: indicator.id, indicator, level, x, row });
        });
    });

    return positions;
}

/** Connections with both endpoints inside the given node set. */
export function connectionsWithin(nodeIds: ReadonlySet<string>): FundamentalConnection[] {
    return FUNDAMENTAL_CONNECTIONS.filter(c => nodeIds.has(c.from) && nodeIds.has(c.to));
}

export type FilterMode = 'both' | 'downstream' | 'upstream';

/**
 * Nodes reachable from a selection, following edges to the given depth.
 *
 * Depth matters: a first-order view answers "what does this touch", while
 * depth 2+ shows the cascade — which is the point of the screen, since the
 * interesting effects are rarely the direct ones.
 *
 * Cycles are handled by the visited set; the graph is not guaranteed acyclic
 * (inflation feeds rates, rates feed inflation).
 */
export function reachableFrom(
    startId: string,
    mode: FilterMode = 'both',
    depth = 1,
    connections: readonly FundamentalConnection[] = FUNDAMENTAL_CONNECTIONS,
): Set<string> {
    const visited = new Set<string>([startId]);
    let frontier = [startId];

    for (let step = 0; step < depth; step += 1) {
        const next: string[] = [];

        for (const id of frontier) {
            if (mode === 'both' || mode === 'downstream') {
                for (const c of connections) {
                    if (c.from === id && !visited.has(c.to)) {
                        visited.add(c.to);
                        next.push(c.to);
                    }
                }
            }
            if (mode === 'both' || mode === 'upstream') {
                for (const c of connections) {
                    if (c.to === id && !visited.has(c.from)) {
                        visited.add(c.from);
                        next.push(c.from);
                    }
                }
            }
        }

        if (next.length === 0) break;
        frontier = next;
    }

    return visited;
}

/** Edges touching the selection, in the direction the filter allows. */
export function activeConnections(
    startId: string,
    mode: FilterMode,
    connections: readonly FundamentalConnection[] = FUNDAMENTAL_CONNECTIONS,
): FundamentalConnection[] {
    return connections.filter(c => {
        if (mode === 'downstream') return c.from === startId;
        if (mode === 'upstream') return c.to === startId;
        return c.from === startId || c.to === startId;
    });
}

/**
 * Whether every connection points at an indicator that exists.
 *
 * A dangling edge renders as a line to nowhere and, more importantly, breaks
 * cascade propagation silently. Exposed so it can be asserted in a test rather
 * than discovered on screen.
 */
export function findDanglingConnections(): FundamentalConnection[] {
    const ids = new Set(FUNDAMENTAL_INDICATORS.map(i => i.id));
    return FUNDAMENTAL_CONNECTIONS.filter(c => !ids.has(c.from) || !ids.has(c.to));
}
