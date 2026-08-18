// ================================================================
// SENS D'UNE PUBLICATION POUR SA DEVISE
//
// `changeScore` (release-bridge) dit de COMBIEN un chiffre a bougé.
// Il ne dit pas si ce mouvement est une bonne ou une mauvaise
// nouvelle pour la devise — et les deux ne coïncident pas : un
// chômage qui monte de 6,1 à 6,5 donne une variation POSITIVE et
// une nouvelle NÉGATIVE pour le dollar canadien.
//
// Sans cette distinction, empiler un mois de publications ne dit
// rien : on ne peut pas savoir si elles se confirment ou se
// contredisent. C'est précisément la lecture que ce module rend
// possible.
//
// Pur : publications en entrée, sens en sortie. Aucune horloge.
// ================================================================

import type { LitNode } from './release-bridge';

/**
 * Ce que « monter » veut dire pour la devise, indicateur par indicateur.
 *
 * Trois familles, et la troisième n'est pas une commodité :
 *
 *   - `up-good`   : croissance, activité, emploi, excédent commercial.
 *   - `up-bad`    : le chômage, seul de son espèce ici.
 *   - `to-target` : l'inflation, dont la lecture N'EST PAS monotone. Passer
 *     de 1,0 % à 1,5 % est une bonne nouvelle, passer de 3,0 % à 3,5 % en est
 *     une mauvaise, et c'est la MÊME hausse. Les traiter comme `up-good`
 *     ferait applaudir une inflation qui dérape. Le moteur de score raisonne
 *     déjà ainsi (`scoreInflationValue` note l'écart à la cible), ce module
 *     s'aligne dessus plutôt que d'inventer une seconde convention.
 */
export type Polarity = 'up-good' | 'up-bad' | 'to-target';

const POLARITY: Record<string, Polarity> = {
    // Croissance et activité
    gdpQoQ: 'up-good',
    pmiManufacturing: 'up-good',
    pmiServices: 'up-good',
    retailSales: 'up-good',
    consumerConfidence: 'up-good',
    commodityPrice: 'up-good',
    oilPrice: 'up-good',

    // Emploi
    nfp: 'up-good',
    employmentChange: 'up-good',
    unemployment: 'up-bad',

    // Extérieur
    tradeBalance: 'up-good',
    currentAccount: 'up-good',

    // Monétaire : un taux plus élevé attire les capitaux.
    interestRate: 'up-good',

    // Prix — lus par rapport à la cible, jamais en monotone.
    cpi: 'to-target',
    coreCpi: 'to-target',
    corePce: 'to-target',
    tokyoCpi: 'to-target',
    ppi: 'to-target',
    wagePPI: 'to-target',
};

/**
 * Cible d'inflation des banques centrales couvertes.
 *
 * Toutes à 2 % en pratique. La RBA vise une FOURCHETTE de 2-3 %, dont 2,5 %
 * est le milieu — c'est ce chiffre-là qui est utilisé, pas la borne basse,
 * sinon toute la moitié haute de la fourchette officielle serait comptée
 * comme un dérapage.
 */
const INFLATION_TARGET: Record<string, number> = {
    USD: 2, EUR: 2, GBP: 2, JPY: 2, AUD: 2.5, CAD: 2, NZD: 2, CHF: 2,
};

export type ReleaseLean = 'favorable' | 'defavorable' | 'neutre' | 'inconnu';

export interface DirectedRelease extends LitNode {
    lean: ReleaseLean;
    /** Phrase courte expliquant le sens retenu, affichée au survol. */
    why: string;
}

/** Sous ce seuil de variation relative, le mouvement ne dit rien. */
const NOISE = 0.2;

/**
 * Sens d'une publication pour sa devise.
 *
 * `neutre` n'est pas un aveu d'échec : une publication qui ne bouge
 * pratiquement pas ne confirme ni ne contredit rien, et la compter dans un
 * camp fausserait le décompte. `inconnu` couvre l'indicateur absent de la
 * table — mieux vaut le dire que lui prêter un sens par défaut.
 */
export function leanOf(
    node: LitNode,
    currencyCode: string,
): { lean: ReleaseLean; why: string } {
    // La clé D'ORIGINE, jamais l'identifiant du nœud : `unemployment` et
    // `employmentChange` partagent le nœud `labour_market` et ont des sens
    // opposés. Voir le commentaire de LitNode.indicatorKey.
    const polarity = POLARITY[node.indicatorKey] ?? null;
    if (!polarity) {
        return { lean: 'inconnu', why: `Sens non défini pour ${node.indicatorKey}` };
    }

    if (node.actual === null || node.previous === null) {
        return { lean: 'inconnu', why: 'Chiffre ou précédent manquant' };
    }

    if (polarity === 'to-target') {
        const target = INFLATION_TARGET[currencyCode] ?? 2;
        const before = Math.abs(node.previous - target);
        const after = Math.abs(node.actual - target);
        const gap = before - after;
        if (Math.abs(gap) < 0.05) {
            return { lean: 'neutre', why: `Écart à la cible ${target} % inchangé` };
        }
        return gap > 0
            ? { lean: 'favorable', why: `Se rapproche de la cible ${target} %` }
            : { lean: 'defavorable', why: `S'éloigne de la cible ${target} %` };
    }

    const move = node.surprise;
    if (move === null) return { lean: 'inconnu', why: 'Variation non calculable' };
    if (Math.abs(move) < NOISE) return { lean: 'neutre', why: 'Variation négligeable' };

    const rising = move > 0;
    const good = polarity === 'up-good' ? rising : !rising;
    return {
        lean: good ? 'favorable' : 'defavorable',
        why: polarity === 'up-good'
            ? `${rising ? 'Hausse' : 'Baisse'} — plus haut est meilleur pour la devise`
            : `${rising ? 'Hausse' : 'Baisse'} — plus bas est meilleur pour la devise`,
    };
}

export interface DirectionSummary {
    favorable: number;
    defavorable: number;
    neutre: number;
    inconnu: number;
    /**
     * Lecture d'ensemble du mois.
     *
     *   - `aligne-*`   : tout ce qui tranche va dans le même sens.
     *   - `domine-*`   : un camp l'emporte nettement (au moins deux tiers).
     *   - `contradictoire` : les deux camps se valent.
     *   - `insuffisant`    : moins de deux publications tranchées.
     */
    verdict:
        | 'aligne-favorable'
        | 'aligne-defavorable'
        | 'domine-favorable'
        | 'domine-defavorable'
        | 'contradictoire'
        | 'insuffisant';
}

/**
 * Décomptes et lecture d'ensemble sur une fenêtre de publications.
 *
 * `neutre` et `inconnu` sont comptés mais n'entrent PAS dans le verdict : le
 * verdict répond à « les signaux tranchés se confirment-ils ? », et une
 * publication qui ne tranche pas ne peut ni confirmer ni contredire.
 */
export function summariseDirection(releases: readonly DirectedRelease[]): DirectionSummary {
    let favorable = 0, defavorable = 0, neutre = 0, inconnu = 0;
    for (const r of releases) {
        if (r.lean === 'favorable') favorable += 1;
        else if (r.lean === 'defavorable') defavorable += 1;
        else if (r.lean === 'neutre') neutre += 1;
        else inconnu += 1;
    }

    const decisive = favorable + defavorable;
    let verdict: DirectionSummary['verdict'];
    if (decisive < 2) verdict = 'insuffisant';
    else if (defavorable === 0) verdict = 'aligne-favorable';
    else if (favorable === 0) verdict = 'aligne-defavorable';
    else if (favorable / decisive >= 2 / 3) verdict = 'domine-favorable';
    else if (defavorable / decisive >= 2 / 3) verdict = 'domine-defavorable';
    else verdict = 'contradictoire';

    return { favorable, defavorable, neutre, inconnu, verdict };
}

export const VERDICT_LABEL: Record<DirectionSummary['verdict'], string> = {
    'aligne-favorable': 'Signaux alignés — tous favorables',
    'aligne-defavorable': 'Signaux alignés — tous défavorables',
    'domine-favorable': 'Tendance favorable, avec des exceptions',
    'domine-defavorable': 'Tendance défavorable, avec des exceptions',
    contradictoire: 'Signaux contradictoires',
    insuffisant: 'Trop peu de publications tranchées',
};

/** Ajoute le sens à chaque publication d'une devise. */
export function directRelease(nodes: readonly LitNode[], currencyCode: string): DirectedRelease[] {
    return nodes.map((node) => ({ ...node, ...leanOf(node, currencyCode) }));
}
