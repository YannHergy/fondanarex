import "server-only";

/**
 * PIB nominal annuel, en MONNAIE LOCALE — l'échelle qui rend les balances
 * commerciales comparables entre devises.
 *
 * Sans lui, `scoreTradeBalance` comparait des milliards de yens à des
 * milliards de dollars sur une seule échelle absolue : le Japon touchait le
 * plancher (-10) pour un déficit de -363 Md¥ (~-2,4 Md$) pendant que les
 * États-Unis touchaient le même plancher pour -73 Md$, trente fois plus gros.
 * Rapportée au PIB, une balance devient un pourcentage — sans unité, donc
 * comparable, et sans avoir besoin d'aucun taux de change.
 *
 * Deux sources, toutes deux gratuites et sans clé :
 *   · Banque mondiale, indicateur NY.GDP.MKTP.CN (« GDP, current LCU ») pour
 *     les sept pays. C'est littéralement « PIB nominal en unité monétaire
 *     locale », exactement ce qu'il faut.
 *   · Eurostat pour la zone euro, que la Banque mondiale ne couvre pas sous
 *     cet indicateur (vérifié : EMU et XC renvoient tous deux un jeu vide).
 *
 * Valeurs retournées en MILLIARDS de monnaie locale, pour coller à l'unité
 * dans laquelle les balances commerciales sont déjà stockées.
 */

const WORLD_BANK = "https://api.worldbank.org/v2";
const EUROSTAT =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp";

/** Le PIB annuel bouge de quelques pour cent par an — un jour de cache suffit largement. */
const REVALIDATE = 24 * 60 * 60;

/** Code devise -> code ISO3 pays chez la Banque mondiale. */
const ISO3: Record<string, string> = {
  USD: "USA",
  JPY: "JPN",
  GBP: "GBR",
  CHF: "CHE",
  CAD: "CAN",
  AUD: "AUS",
  NZD: "NZL",
};

export interface NominalGdpPoint {
  /** Année de référence, "2025". */
  period: string;
  /** Milliards de monnaie locale. */
  value: number;
}

export interface NominalGdpReading {
  currencyCode: string;
  /** Série annuelle, de la plus ancienne à la plus récente. */
  history: NominalGdpPoint[];
  error: string | null;
}

/**
 * Toute la série annuelle, pas seulement la dernière valeur.
 *
 * La courbe de score rejoue le moteur mois par mois depuis janvier 2023 :
 * sans PIB daté, chaque mois antérieur à la dernière publication perdrait son
 * indicateur de balance et l'historique ne serait plus calculé sur la même
 * base que le point du jour. Avec la série, chaque mois retrouve le PIB de
 * son année.
 */
const HISTORY_SINCE = 2015;

interface WorldBankPoint {
  date?: string;
  value?: number | null;
}

/**
 * Garde-fou : un PIB annuel plausible tient entre 100 milliards et 1000
 * billions d'unités locales (le yen, très nombreux par dollar, occupe le haut
 * de la fourchette avec ~664 000 milliards). Hors de là, l'API a changé de
 * forme ou d'unité et il vaut mieux ne rien écrire que diviser par un chiffre
 * faux — une balance rapportée à un PIB erroné produit un score crédible mais
 * faux, exactement le genre de bug qui ne se voit pas.
 */
function plausible(billions: number): boolean {
  return Number.isFinite(billions) && billions > 100 && billions < 1_000_000;
}

async function fetchWorldBank(
  currencyCode: string,
  iso3: string,
  attempt = 0,
): Promise<NominalGdpReading> {
  const base = { currencyCode, history: [] as NominalGdpPoint[], error: null as string | null };
  const url = `${WORLD_BANK}/country/${iso3}/indicator/NY.GDP.MKTP.CN?format=json&per_page=100&date=${HISTORY_SINCE}:${new Date().getUTCFullYear()}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // Le 400 de cette API signale un throttling, pas une requête invalide :
      // mesuré, la MÊME URL qui répondait 200 bascule en 400 après une rafale,
      // puis re-répond 200 une minute plus tard. Une seule reprise espacée
      // suffit à absorber le cas courant.
      if (response.status === 400 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        return fetchWorldBank(currencyCode, iso3, 1);
      }
      return { ...base, error: `Banque mondiale ${response.status}` };
    }

    const payload = (await response.json()) as [unknown, WorldBankPoint[] | null];
    const history: NominalGdpPoint[] = [];
    for (const point of payload?.[1] ?? []) {
      if (typeof point.value !== "number" || !point.date) continue;
      const billions = point.value / 1e9;
      if (!plausible(billions)) continue;
      history.push({ period: point.date, value: billions });
    }
    history.sort((a, b) => (a.period < b.period ? -1 : 1));

    if (history.length === 0) {
      return { ...base, error: `Aucune valeur PIB exploitable pour ${iso3}` };
    }

    return { currencyCode, history, error: null };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

interface EurostatGdp {
  value?: Record<string, number>;
  dimension?: { time?: { category?: { index?: Record<string, number> } } };
}

/** Zone euro (EA20), prix courants, en millions d'euros. */
async function fetchEuroArea(): Promise<NominalGdpReading> {
  const base = { currencyCode: "EUR", history: [] as NominalGdpPoint[], error: null as string | null };
  const url = `${EUROSTAT}?format=JSON&na_item=B1GQ&unit=CP_MEUR&geo=EA20&sinceTimePeriod=${HISTORY_SINCE}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return { ...base, error: `Eurostat ${response.status}` };
    }

    const payload = (await response.json()) as EurostatGdp;
    // JSON-stat : `value` est indexé par la POSITION dans la dimension temps,
    // pas par l'année. C'est `dimension.time.category.index` qui donne la
    // correspondance année -> position, et il faut passer par elle sous peine
    // de décaler toute la série d'un cran.
    const index = payload.dimension?.time?.category?.index ?? {};
    const values = payload.value ?? {};

    const history: NominalGdpPoint[] = [];
    for (const [year, position] of Object.entries(index)) {
      const millions = values[String(position)];
      if (typeof millions !== "number") continue;
      const billions = millions / 1000;
      if (!plausible(billions)) continue;
      history.push({ period: year, value: billions });
    }
    history.sort((a, b) => (a.period < b.period ? -1 : 1));

    if (history.length === 0) {
      return { ...base, error: "Aucune valeur PIB exploitable pour la zone euro" };
    }

    return { currencyCode: "EUR", history, error: null };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * PIB nominal des huit devises, en milliards de monnaie locale.
 *
 * Les sept appels à la Banque mondiale partent EN SÉRIE, espacés — mesuré
 * directement : sept requêtes simultanées font basculer l'API en 400 pendant
 * plusieurs minutes, y compris sur des URL qui répondaient juste avant. Même
 * traitement que l'OCDE ailleurs dans ce module. Eurostat, lui, part en
 * parallèle : c'est un hôte différent, qui ne partage pas ce quota.
 */
export async function fetchNominalGdp(): Promise<NominalGdpReading[]> {
  const euroArea = fetchEuroArea();

  const worldBank: NominalGdpReading[] = [];
  const entries = Object.entries(ISO3);
  for (const [code, iso3] of entries) {
    worldBank.push(await fetchWorldBank(code, iso3));
    if (code !== entries[entries.length - 1]![0]) {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
  }

  return [...worldBank, await euroArea];
}
