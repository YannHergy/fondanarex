// ================================================================
// PONT CALENDRIER -> ENGRENAGE
//
// Le calendrier parle en `indicatorKey` (nfp, cpi, corePce) et
// l'engrenage en identifiants de nœuds (usd_nfp, usd_cpi, usd_pce).
// Ce module relie les deux, et convertit une publication en une
// SURPRISE exploitable par propagateCascade.
//
// Pur : publications en entrée, nœuds allumés en sortie.
// ================================================================

/**
 * Les clés dont le nom diffère de celui du nœud.
 *
 * Le cas général est `{devise}_{clé}` — `nfp` devient `usd_nfp`. Seules les
 * exceptions sont listées ici, pour que l'ajout d'un indicateur qui suit la
 * convention ne demande aucune ligne de plus.
 */
const KEY_ALIASES: Record<string, string> = {
    corePce: 'pce',
    coreCpi: 'cpi',
    gdpQoQ: 'growth',
    unemployment: 'labour_market',
    employmentChange: 'labour_market',
    wagePPI: 'wages',
    retailSales: 'consumption',
    consumerConfidence: 'consumer_confidence',
    pmiManufacturing: 'pmi_manufacturing',
    pmiServices: 'pmi_services',
    tradeBalance: 'trade_balance',
    interestRate: 'monetary_policy',
    tokyoCpi: 'cpi',
};

/** Identifiant du nœud correspondant à une publication, ou null. */
export function nodeIdFor(currencyCode: string, indicatorKey: string): string | null {
    const suffix = KEY_ALIASES[indicatorKey] ?? indicatorKey;
    if (!suffix) return null;
    return `${currencyCode.toLowerCase()}_${suffix}`;
}

export interface ReleasedIndicator {
    currencyCode: string;
    indicatorKey: string;
    label: string;
    at: Date;
    previous: number | null;
    actual: number | null;
}

export interface LitNode {
    nodeId: string;
    label: string;
    at: string;
    actual: number | null;
    previous: number | null;
    /** Écart normalisé -5..+5, ou null quand il n'est pas calculable. */
    surprise: number | null;
}

/**
 * Écart entre le chiffre publié et le précédent, ramené sur -5..+5.
 *
 * Le VRAI écart se mesure contre la prévision de marché, pas contre le
 * précédent — c'est la surprise qui déplace les prix. Nous n'avons pas de
 * consensus, donc on se rabat sur la variation, en le disant plutôt qu'en
 * faisant passer l'un pour l'autre : une publication conforme aux attentes
 * mais très différente du mois dernier sortira ici comme une grosse surprise
 * alors que le marché ne bougera pas.
 *
 * Normalisé en RELATIF, pas en absolu : deux dixièmes sur une inflation à 2 %
 * sont un événement, deux dixièmes sur un NFP à 150k ne sont rien.
 */
export function changeScore(actual: number | null, previous: number | null): number | null {
    if (actual === null || previous === null) return null;

    const base = Math.abs(previous);
    // Un précédent nul ou minuscule rend le ratio explosif : on retombe sur
    // l'écart brut, borné, plutôt que de renvoyer un infini déguisé.
    if (base < 0.001) {
        return Math.max(-5, Math.min(5, actual - previous));
    }

    const relative = (actual - previous) / base;
    return Math.max(-5, Math.min(5, Math.round(relative * 10 * 10) / 10));
}

export interface UpcomingRelease {
    label: string;
    at: string;
}

/**
 * La PROCHAINE publication de chaque nœud, toutes devises confondues.
 *
 * C'est ce qui rend une cascade actionnable. Dire « le NFP pousse l'inflation
 * à la baisse » n'engage à rien ; dire « et l'inflation sort le 3 septembre »
 * donne une date à laquelle l'effet sera confirmé ou démenti. Sans cela, une
 * conséquence à trois mois se lit comme une conséquence immédiate.
 *
 * Les publications déjà sorties sont exclues : on cherche le prochain
 * rendez-vous, pas le dernier.
 */
export function upcomingByNode(
    releases: readonly ReleasedIndicator[],
    now: Date,
): Map<string, UpcomingRelease> {
    const byNode = new Map<string, UpcomingRelease>();

    for (const release of releases) {
        if (release.at.getTime() <= now.getTime()) continue;

        const nodeId = nodeIdFor(release.currencyCode, release.indicatorKey);
        if (!nodeId) continue;

        const held = byNode.get(nodeId);
        // La plus PROCHE l'emporte : c'est le prochain rendez-vous qui compte.
        if (held && new Date(held.at).getTime() <= release.at.getTime()) continue;

        byNode.set(nodeId, { label: release.label, at: release.at.toISOString() });
    }

    return byNode;
}

/**
 * Les nœuds à allumer sur l'engrenage, pour une devise et une fenêtre.
 *
 * Ne garde que les publications DÉJÀ SORTIES — celles qui portent un chiffre.
 * Une publication à venir n'a rien propagé encore ; l'allumer laisserait
 * croire qu'un événement a eu lieu.
 *
 * Quand un même nœud reçoit plusieurs publications (le CPI et le CPI core
 * pointent au même endroit), la plus RÉCENTE gagne : c'est celle qui décrit
 * l'état courant.
 */
export function litNodesFor(
    releases: readonly ReleasedIndicator[],
    currencyCode: string,
    since: Date,
    now: Date,
): LitNode[] {
    const byNode = new Map<string, LitNode>();

    for (const release of releases) {
        if (release.currencyCode !== currencyCode) continue;
        if (release.actual === null) continue;
        if (release.at.getTime() > now.getTime()) continue;
        if (release.at.getTime() < since.getTime()) continue;

        const nodeId = nodeIdFor(release.currencyCode, release.indicatorKey);
        if (!nodeId) continue;

        const held = byNode.get(nodeId);
        if (held && new Date(held.at).getTime() >= release.at.getTime()) continue;

        byNode.set(nodeId, {
            nodeId,
            label: release.label,
            at: release.at.toISOString(),
            actual: release.actual,
            previous: release.previous,
            surprise: changeScore(release.actual, release.previous),
        });
    }

    return [...byNode.values()].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
}
