// ================================================================
// PLAGES DE DATES DU CALENDRIER
//
// Les bornes d'« aujourd'hui », « demain » ou « cette semaine »
// sont calculées ici plutôt que dans la page : ce sont des règles
// de calendrier, elles se testent, et elles ont des pièges — une
// semaine commence lundi et non dimanche, un mois n'a pas toujours
// 30 jours, et « demain » le 31 décembre change d'année.
//
// Pur : aucun accès réseau ni base de données.
// ================================================================

export const RANGES = [
    'aujourdhui',
    'demain',
    'semaine',
    'semaine_prochaine',
    'mois',
    'tout',
] as const;

export type RangeKey = (typeof RANGES)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
    aujourdhui: "Aujourd'hui",
    demain: 'Demain',
    semaine: 'Cette semaine',
    semaine_prochaine: 'La semaine prochaine',
    mois: 'Ce mois-ci',
    tout: 'Tout',
};

export function isRangeKey(value: string | undefined): value is RangeKey {
    return value !== undefined && (RANGES as readonly string[]).includes(value);
}

/** Début du jour local. */
function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

/**
 * Lundi de la semaine contenant `date`.
 *
 * getDay() renvoie 0 pour dimanche : sans correction, le dimanche serait
 * rattaché à la semaine suivante et « cette semaine » sauterait six jours.
 */
function startOfWeek(date: Date): Date {
    const day = date.getDay();
    const backToMonday = day === 0 ? 6 : day - 1;
    return addDays(startOfDay(date), -backToMonday);
}

export interface DateRange {
    /** Inclusif. */
    from: Date;
    /** Exclusif — évite les doublons entre deux plages contiguës. */
    to: Date;
}

/** Bornes de la plage demandée, relatives à `now`. */
export function rangeBounds(key: RangeKey, now: Date): DateRange | null {
    const today = startOfDay(now);

    switch (key) {
        case 'aujourdhui':
            return { from: today, to: addDays(today, 1) };

        case 'demain':
            return { from: addDays(today, 1), to: addDays(today, 2) };

        case 'semaine': {
            const monday = startOfWeek(now);
            return { from: monday, to: addDays(monday, 7) };
        }

        case 'semaine_prochaine': {
            const monday = addDays(startOfWeek(now), 7);
            return { from: monday, to: addDays(monday, 7) };
        }

        case 'mois': {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            // Le mois 12 déborde volontairement sur janvier de l'année
            // suivante : Date le normalise, ce qui évite un cas particulier
            // en décembre.
            const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            return { from: first, to: next };
        }

        case 'tout':
            // Pas de bornes : tout ce qui est connu, passé compris.
            return null;
    }
}

/** Filtre une liste datée sur la plage demandée. */
export function filterByRange<T extends { at: Date }>(
    items: readonly T[],
    key: RangeKey,
    now: Date,
): T[] {
    const bounds = rangeBounds(key, now);
    if (!bounds) return [...items];

    return items.filter(
        item => item.at.getTime() >= bounds.from.getTime() && item.at.getTime() < bounds.to.getTime(),
    );
}
