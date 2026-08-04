import { describe, expect, it } from 'vitest';

import { filterByRange, isRangeKey, rangeBounds } from './range';

/** Mercredi 5 août 2026, 14h30 locales. */
const MERCREDI = new Date(2026, 7, 5, 14, 30);

function iso(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

describe('rangeBounds', () => {
    it("borne aujourd'hui sur la journée locale, pas sur 24 h glissantes", () => {
        const r = rangeBounds('aujourdhui', MERCREDI)!;
        expect(iso(r.from)).toBe('2026-08-05');
        expect(iso(r.to)).toBe('2026-08-06');
        // Le début est bien minuit et non l'heure courante.
        expect(r.from.getHours()).toBe(0);
    });

    it('fait commencer la semaine le LUNDI', () => {
        const r = rangeBounds('semaine', MERCREDI)!;
        expect(iso(r.from)).toBe('2026-08-03');
        expect(iso(r.to)).toBe('2026-08-10');
    });

    it('rattache le dimanche à la semaine qui s’achève, pas à la suivante', () => {
        // getDay() vaut 0 le dimanche : sans correction, « cette semaine »
        // sauterait six jours en avant.
        const dimanche = new Date(2026, 7, 9, 10, 0);
        const r = rangeBounds('semaine', dimanche)!;
        expect(iso(r.from)).toBe('2026-08-03');
        expect(iso(r.to)).toBe('2026-08-10');
    });

    it('enchaîne les semaines sans trou ni recouvrement', () => {
        const courante = rangeBounds('semaine', MERCREDI)!;
        const suivante = rangeBounds('semaine_prochaine', MERCREDI)!;
        expect(suivante.from.getTime()).toBe(courante.to.getTime());
    });

    it('borne le mois sur le mois civil', () => {
        const r = rangeBounds('mois', MERCREDI)!;
        expect(iso(r.from)).toBe('2026-08-01');
        expect(iso(r.to)).toBe('2026-09-01');
    });

    it('passe correctement à l’année suivante en décembre', () => {
        const decembre = new Date(2026, 11, 20, 9, 0);
        const r = rangeBounds('mois', decembre)!;
        expect(iso(r.from)).toBe('2026-12-01');
        expect(iso(r.to)).toBe('2027-01-01');

        const demain = rangeBounds('demain', new Date(2026, 11, 31, 9, 0))!;
        expect(iso(demain.from)).toBe('2027-01-01');
    });

    it('ne borne rien pour « tout »', () => {
        expect(rangeBounds('tout', MERCREDI)).toBeNull();
    });
});

describe('filterByRange', () => {
    const items = [
        { at: new Date(2026, 7, 4, 9, 0), nom: 'hier' },
        { at: new Date(2026, 7, 5, 8, 30), nom: "aujourd'hui tôt" },
        { at: new Date(2026, 7, 5, 23, 59), nom: "aujourd'hui tard" },
        { at: new Date(2026, 7, 6, 8, 30), nom: 'demain' },
        { at: new Date(2026, 7, 12, 8, 30), nom: 'semaine prochaine' },
        { at: new Date(2026, 8, 2, 8, 30), nom: 'mois prochain' },
    ];

    it("retient toute la journée, y compris juste avant minuit", () => {
        const noms = filterByRange(items, 'aujourdhui', MERCREDI).map(i => i.nom);
        expect(noms).toEqual(["aujourd'hui tôt", "aujourd'hui tard"]);
    });

    it('exclut la borne haute pour éviter les doublons entre plages', () => {
        const semaine = filterByRange(items, 'semaine', MERCREDI).map(i => i.nom);
        const suivante = filterByRange(items, 'semaine_prochaine', MERCREDI).map(i => i.nom);
        expect(semaine).not.toContain('semaine prochaine');
        expect(suivante).toContain('semaine prochaine');
    });

    it('garde le passé sur « tout »', () => {
        expect(filterByRange(items, 'tout', MERCREDI)).toHaveLength(items.length);
    });

    it('exclut le mois suivant de « ce mois-ci »', () => {
        const noms = filterByRange(items, 'mois', MERCREDI).map(i => i.nom);
        expect(noms).not.toContain('mois prochain');
        expect(noms).toContain('hier');
    });
});

describe('isRangeKey', () => {
    it('accepte les clés connues et rejette le reste', () => {
        expect(isRangeKey('semaine')).toBe(true);
        expect(isRangeKey('tout')).toBe(true);
        expect(isRangeKey('trimestre')).toBe(false);
        expect(isRangeKey(undefined)).toBe(false);
    });
});
