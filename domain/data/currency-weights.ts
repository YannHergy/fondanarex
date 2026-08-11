// ================================================================
// WEIGHT TABLE PER CURRENCY PROFILE
//
// Every currency has its OWN set of weighted indicators.
// The weights of a currency always sum to 100.
//
// IMPORTANT — the weights below are REASONED ESTIMATES derived from
// observing historical forex market reactions. They are NOT official
// figures published by any institution. They are deliberately isolated
// in this configuration file so they can be tuned without touching the
// scoring engine or the UI components.
//
// Identifier convention: <country_prefix>_<kind>
//   us_ = USD · eu_ = EUR · gb_ = GBP · jp_ = JPY
//   au_ = AUD · ca_ = CAD · nz_ = NZD · ch_ = CHF
//
// The engine (scoring/engine.ts) strips the prefix to deduce the
// "kind" of the indicator and apply the right scoring function.
// ================================================================

/** A weighted indicator inside the profile of a currency */
export interface WeightedIndicator {
    /** Unique identifier — country prefix + kind */
    id: string;
    /** Label displayed in the UI */
    nom: string;
    /** Weight in % inside the currency score (total = 100 per currency) */
    poids: number;
    /** true = indicator specific to this country, requires dedicated data */
    specifique?: boolean;
}

/** Full scoring profile of a currency */
export interface CurrencyProfile {
    /** Name of the central bank */
    banqueCentrale: string;
    /** Dominant driver of the currency — displayed as a badge on the card */
    moteurN1: string;
    /** Profile particularity — explanatory note displayed under the badge */
    particularite?: string;
    /** List of the weighted indicators */
    indicateurs: WeightedIndicator[];
}

// ================================================================
// THE TABLE
// ================================================================

export const CURRENCY_WEIGHTS: Record<string, CurrencyProfile> = {

    // ── USD — driver: the labour market (NFP) ───────────────────
    USD: {
        banqueCentrale: 'Fed',
        moteurN1: 'Emploi (NFP)',
        indicateurs: [
            { id: 'us_nfp',         nom: 'NFP',                          poids: 12, specifique: true },
            { id: 'us_core_cpi',    nom: 'Core CPI / Core PCE',          poids: 12 },
            { id: 'us_taux',        nom: 'Taux Fed',                     poids: 12 },
            { id: 'us_pmi_serv',    nom: 'PMI Services (ISM)',           poids: 12 },
            { id: 'us_cpi',         nom: 'CPI',                          poids: 10 },
            { id: 'us_orientation', nom: 'Orientation Fed (FOMC/dot plot)', poids: 8 },
            { id: 'us_chomage',     nom: 'Chômage',                      poids: 7 },
            { id: 'us_pib',         nom: 'PIB QOQ',                      poids: 7 },
            { id: 'us_salaires',    nom: 'Croissance salaires',          poids: 6 },
            { id: 'us_pmi_manu',    nom: 'PMI Manufacturier (ISM)',      poids: 6 },
            { id: 'us_retail',      nom: 'Retail sales',                 poids: 4 },
            { id: 'us_balance',     nom: 'Balance commerciale',          poids: 4 },
        ],
    },

    // ── EUR — driver: HICP inflation + German industry ──────────
    EUR: {
        banqueCentrale: 'BCE',
        moteurN1: 'Inflation (HICP)',
        particularite: "PMI Manufacturier allemand crucial · l'EUR bouge sur l'industrie allemande et les enquêtes ZEW/ifo",
        indicateurs: [
            { id: 'eu_hicp',        nom: 'HICP (Inflation)',                 poids: 14 },
            // Carries the weight eu_pmi_manu used to hold — see the
            // `prod_indus` case in scoring/engine.ts and
            // CurrencyData.industrialProduction.
            { id: 'eu_prod_indus',  nom: 'Production industrielle (proxy PMI)', poids: 14 },
            { id: 'eu_taux',        nom: 'Taux BCE',                         poids: 13 },
            { id: 'eu_core_hicp',   nom: 'Core HICP',                        poids: 12 },
            { id: 'eu_pmi_serv',    nom: 'PMI Services (zone euro)',         poids: 11 },
            { id: 'eu_pib',         nom: 'PIB QoQ',                          poids: 10 },
            { id: 'eu_orientation', nom: 'Orientation BCE (Lagarde)',        poids: 9 },
            { id: 'eu_chomage',     nom: 'Chômage',                          poids: 6 },
            { id: 'eu_zew',         nom: 'ZEW (Allemagne)',                  poids: 4, specifique: true },
            { id: 'eu_ifo',         nom: 'ifo (Allemagne)',                  poids: 3, specifique: true },
            { id: 'eu_salaires',    nom: 'Croissance salaires',              poids: 2 },
            { id: 'eu_balance',     nom: 'Balance commerciale',              poids: 2 },
            // No free source exists for the PMI itself (S&P Global/Markit
            // sells it): kept visible as a manually-entered figurant, at
            // weight 0, so it is shown but never contributes to the score.
            { id: 'eu_pmi_manu',    nom: 'PMI Manufacturier (allemand)',     poids: 0 },
        ],
    },

    // ── GBP — driver: inflation + wages, a services economy ─────
    GBP: {
        banqueCentrale: 'BoE',
        moteurN1: 'Inflation + Salaires',
        particularite: "Économie de services à 80% · le PMI Services domine et les salaires nourrissent l'inflation des services",
        indicateurs: [
            { id: 'gb_pmi_serv',    nom: 'PMI Services',              poids: 16 },
            { id: 'gb_cpi',         nom: 'CPI (Inflation)',           poids: 13 },
            { id: 'gb_taux',        nom: 'Taux BoE',                  poids: 12 },
            { id: 'gb_core_cpi',    nom: 'Core CPI',                  poids: 11 },
            { id: 'gb_orientation', nom: 'Orientation BoE (vote MPC)', poids: 9 },
            { id: 'gb_pib',         nom: 'PIB QoQ',                   poids: 8 },
            { id: 'gb_salaires',    nom: 'Croissance salaires',       poids: 7 },
            { id: 'gb_chomage',     nom: 'Chômage',                   poids: 7 },
            { id: 'gb_pmi_manu',    nom: 'PMI Manufacturier',         poids: 7 },
            { id: 'gb_balance',     nom: 'Balance commerciale',       poids: 6 },
            { id: 'gb_retail',      nom: 'Retail sales',              poids: 4 },
        ],
    },

    // ── JPY — driver: BoJ decisions + safe-haven status ─────────
    JPY: {
        banqueCentrale: 'BoJ',
        moteurN1: 'BoJ (pivot) + safe-haven',
        particularite: 'Monnaie refuge et de carry trade · la BoJ pivote en 2026 après des décennies de taux ultra-bas · quasi insensible aux PMI et à l\'emploi',
        indicateurs: [
            // Orientation and risk sentiment are tied at 22%: the order
            // below fixes their position in the score table.
            { id: 'jp_orientation', nom: 'Orientation BoJ (pivot)',                poids: 22, specifique: true },
            { id: 'jp_risque',      nom: 'Sentiment risque (safe-haven)',          poids: 22, specifique: true },
            { id: 'jp_taux',        nom: 'Taux BoJ / YCC',                         poids: 16, specifique: true },
            { id: 'jp_cpi',         nom: 'CPI National (ex-fresh food)',           poids: 14 },
            { id: 'jp_balance',     nom: 'Balance commerciale / compte courant',   poids: 14, specifique: true },
            { id: 'jp_cpi_tokyo',   nom: 'CPI Tokyo (indicateur avancé)',          poids: 12, specifique: true },
        ],
    },

    // ── AUD — driver: commodities + Chinese demand ──────────────
    AUD: {
        banqueCentrale: 'RBA',
        moteurN1: 'Matières premières + Chine',
        particularite: 'Économie exportatrice de matières premières, très liée à la Chine · devise pro-cyclique',
        indicateurs: [
            { id: 'au_fer',         nom: 'Matières premières (fer / charbon)', poids: 18, specifique: true },
            { id: 'au_chine',       nom: 'Demande chinoise (Chine)',           poids: 15, specifique: true },
            { id: 'au_emploi',      nom: 'Emploi (Employment Change)',         poids: 14 },
            { id: 'au_taux',        nom: 'Taux RBA',                           poids: 13 },
            { id: 'au_cpi',         nom: 'CPI trimestriel',                    poids: 12 },
            { id: 'au_risque',      nom: 'Sentiment risque (pro-cyclique)',    poids: 10, specifique: true },
            { id: 'au_core_cpi',    nom: 'Core CPI (trimmed mean)',            poids: 9 },
            { id: 'au_orientation', nom: 'Orientation RBA',                    poids: 9 },
        ],
    },

    // ── CAD — driver: the oil price ─────────────────────────────
    CAD: {
        banqueCentrale: 'BoC',
        moteurN1: 'Pétrole',
        particularite: "Devise pétrolière · très corrélée au brut et à l'économie américaine (75% des exports)",
        indicateurs: [
            { id: 'ca_petrole',     nom: 'Prix du pétrole (WTI / Brent)',      poids: 22, specifique: true },
            { id: 'ca_emploi',      nom: 'Emploi (Employment Change)',         poids: 15 },
            { id: 'ca_taux',        nom: 'Taux BoC',                           poids: 13 },
            { id: 'ca_cpi',         nom: 'CPI',                                poids: 12 },
            { id: 'ca_us',          nom: 'Économie US (spillover)',            poids: 11, specifique: true },
            { id: 'ca_core_cpi',    nom: 'Core CPI (médiane / trim BoC)',      poids: 10 },
            { id: 'ca_orientation', nom: 'Orientation BoC',                    poids: 9 },
            { id: 'ca_pib',         nom: 'PIB mensuel',                        poids: 8 },
        ],
    },

    // ── NZD — driver: dairy products + Chinese demand ───────────
    NZD: {
        banqueCentrale: 'RBNZ',
        moteurN1: 'Produits laitiers + Chine',
        particularite: 'Économie agricole exportatrice (lait ≈ 30% des exports) · ultra-liée à la Chine · devise pro-cyclique',
        indicateurs: [
            { id: 'nz_laitiers',    nom: 'Prix des produits laitiers (GDT / Fonterra)', poids: 18, specifique: true },
            { id: 'nz_chine',       nom: 'Demande chinoise (Chine)',                    poids: 15, specifique: true },
            { id: 'nz_taux',        nom: 'Taux RBNZ',                                   poids: 14 },
            { id: 'nz_cpi',         nom: 'CPI trimestriel',                             poids: 13 },
            { id: 'nz_emploi',      nom: 'Emploi trimestriel',                          poids: 12 },
            { id: 'nz_risque',      nom: 'Sentiment risque (pro-cyclique)',             poids: 10, specifique: true },
            { id: 'nz_orientation', nom: 'Orientation RBNZ',                            poids: 9 },
            { id: 'nz_pib',         nom: 'PIB trimestriel',                             poids: 9 },
        ],
    },

    // ── CHF — driver: global risk aversion + the SNB ────────────
    CHF: {
        banqueCentrale: 'SNB',
        moteurN1: 'Risque global + SNB',
        particularite: "Devise refuge par excellence · la SNB intervient activement sur le change · quasi insensible aux PMI et à l'emploi",
        indicateurs: [
            { id: 'ch_risque',        nom: 'Sentiment risque (safe-haven)',    poids: 28, specifique: true },
            { id: 'ch_eurchf',        nom: 'Flux capitaux / EUR-CHF',          poids: 20, specifique: true },
            // Rates and orientation are tied at 18%: the order below fixes
            // their position in the score table.
            { id: 'ch_taux',          nom: 'Taux SNB',                         poids: 18 },
            { id: 'ch_interventions', nom: 'Orientation / interventions SNB',  poids: 18, specifique: true },
            { id: 'ch_cpi',           nom: 'CPI',                              poids: 16 },
        ],
    },
};

// ================================================================
// HELPERS
// ================================================================

/** Country prefixes used in the indicator identifiers */
const PREFIXES = ['us_', 'eu_', 'gb_', 'jp_', 'au_', 'ca_', 'nz_', 'ch_'];

/**
 * Strips the country prefix of an identifier to obtain the "kind" of
 * the indicator, which determines the scoring function to apply.
 *
 * Examples: "us_core_cpi" -> "core_cpi" · "jp_cpi_tokyo" -> "cpi_tokyo"
 */
export function indicatorKind(id: string): string {
    const prefix = PREFIXES.find(p => id.startsWith(p));
    return prefix ? id.slice(prefix.length) : id;
}

/** Returns the profile of a currency (undefined when the code is unknown) */
export function getCurrencyProfile(code: string): CurrencyProfile | undefined {
    return CURRENCY_WEIGHTS[code];
}

/** Sum of the weights of a currency — must be 100 */
export function totalWeight(code: string): number {
    const profile = CURRENCY_WEIGHTS[code];
    if (!profile) return 0;
    return profile.indicateurs.reduce((sum, i) => sum + i.poids, 0);
}
