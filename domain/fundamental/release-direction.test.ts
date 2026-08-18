import { describe, expect, it } from 'vitest';

import type { LitNode } from './release-bridge';
import {
    directRelease,
    leanOf,
    summariseDirection,
    type DirectedRelease,
} from './release-direction';

function node(
    indicatorKey: string,
    actual: number | null,
    previous: number | null,
    nodeId = `usd_${indicatorKey}`,
): LitNode {
    const surprise =
        actual === null || previous === null
            ? null
            : Math.abs(previous) < 0.001
              ? Math.max(-5, Math.min(5, actual - previous))
              : Math.max(-5, Math.min(5, Math.round(((actual - previous) / Math.abs(previous)) * 100) / 10));
    return { nodeId, indicatorKey, label: indicatorKey, at: '2026-08-10T00:00:00Z', actual, previous, surprise };
}

describe('leanOf', () => {
    it('lit une hausse selon ce qu elle vaut POUR LA DEVISE, pas selon son signe', () => {
        expect(leanOf(node('nfp', 200, 100), 'USD').lean).toBe('favorable');
        expect(leanOf(node('unemployment', 6.5, 6.1), 'CAD').lean).toBe('defavorable');
    });

    it('distingue chomage et variation d emploi, qui partagent le MEME noeud', () => {
        // Le piège que ce module existe pour éviter : `nodeIdFor` envoie les
        // deux sur `{devise}_labour_market`, alors que leur sens est opposé.
        // Déduire la polarité du nœud ferait applaudir une hausse du chômage.
        const chomage = node('unemployment', 6.5, 6.1, 'cad_labour_market');
        const emploi = node('employmentChange', 0.55, 0.14, 'nzd_labour_market');

        expect(chomage.nodeId.endsWith('labour_market')).toBe(true);
        expect(emploi.nodeId.endsWith('labour_market')).toBe(true);

        expect(leanOf(chomage, 'CAD').lean).toBe('defavorable');
        expect(leanOf(emploi, 'NZD').lean).toBe('favorable');
    });

    it('juge l inflation par rapport a la cible, jamais en monotone', () => {
        // La MÊME hausse de 0,5 point, deux verdicts opposés.
        expect(leanOf(node('cpi', 1.5, 1.0), 'USD').lean).toBe('favorable');
        expect(leanOf(node('cpi', 3.5, 3.0), 'USD').lean).toBe('defavorable');
        // Et une baisse depuis le dessus de la cible est une bonne nouvelle.
        expect(leanOf(node('corePce', 3.29, 3.42), 'USD').lean).toBe('favorable');
    });

    it('utilise le milieu de fourchette 2,5 % pour la RBA', () => {
        // À 2,4 %, l'AUD est DANS sa fourchette officielle 2-3 % : monter vers
        // 2,5 est un rapprochement, là où la même valeur s'éloignerait d'une
        // cible à 2 %.
        expect(leanOf(node('cpi', 2.4, 2.1), 'AUD').lean).toBe('favorable');
        expect(leanOf(node('cpi', 2.4, 2.1), 'USD').lean).toBe('defavorable');
    });

    it('ne tranche pas sur une variation negligeable', () => {
        expect(leanOf(node('pmiManufacturing', 53.9, 54), 'USD').lean).toBe('neutre');
    });

    it('dit ne pas savoir plutot que de supposer', () => {
        expect(leanOf(node('inventeDeToutePiece', 5, 1), 'USD').lean).toBe('inconnu');
        expect(leanOf(node('nfp', 200, null), 'USD').lean).toBe('inconnu');
    });
});

describe('summariseDirection', () => {
    const make = (leans: DirectedRelease['lean'][]): DirectedRelease[] =>
        leans.map((lean, i) => ({ ...node('nfp', 1, 1, `n${i}`), lean, why: '' }));

    it('rend « aligne » quand rien ne contredit', () => {
        expect(summariseDirection(make(['favorable', 'favorable'])).verdict).toBe('aligne-favorable');
        expect(summariseDirection(make(['defavorable', 'defavorable', 'neutre'])).verdict)
            .toBe('aligne-defavorable');
    });

    it('rend « contradictoire » quand les deux camps se valent', () => {
        expect(summariseDirection(make(['favorable', 'favorable', 'defavorable', 'defavorable'])).verdict)
            .toBe('contradictoire');
    });

    it('rend « domine » a partir de deux tiers', () => {
        expect(summariseDirection(make(['favorable', 'favorable', 'defavorable'])).verdict)
            .toBe('domine-favorable');
        expect(summariseDirection(make(['defavorable', 'defavorable', 'favorable'])).verdict)
            .toBe('domine-defavorable');
    });

    it('exige au moins deux publications TRANCHEES', () => {
        expect(summariseDirection(make(['favorable'])).verdict).toBe('insuffisant');
        // Cinq lignes, mais une seule tranche : rien à confirmer ni à contredire.
        expect(summariseDirection(make(['favorable', 'neutre', 'neutre', 'inconnu', 'neutre'])).verdict)
            .toBe('insuffisant');
    });

    it('compte les indecises sans les faire peser sur le verdict', () => {
        const s = summariseDirection(make(['favorable', 'favorable', 'neutre', 'inconnu']));
        expect(s).toMatchObject({ favorable: 2, defavorable: 0, neutre: 1, inconnu: 1 });
        expect(s.verdict).toBe('aligne-favorable');
    });
});

describe('directRelease', () => {
    it('reproduit la lecture reelle du CAD au 2026-08-18', () => {
        // Chômage 6,1 -> 6,5 et balance 4,24 -> 3,86 : deux mauvaises
        // nouvelles, dont une par une HAUSSE. C'est le mois entier qui doit
        // ressortir comme aligné, pas chaque chiffre pris isolément.
        const directed = directRelease(
            [
                node('unemployment', 6.5, 6.1, 'cad_labour_market'),
                node('tradeBalance', 3.8555, 4.2434, 'cad_trade_balance'),
            ],
            'CAD',
        );
        expect(directed.map((d) => d.lean)).toEqual(['defavorable', 'defavorable']);
        expect(summariseDirection(directed).verdict).toBe('aligne-defavorable');
    });
});
