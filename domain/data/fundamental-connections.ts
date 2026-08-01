// ================================================================
// FUNDAMENTAL ENGINE — Connection graph between indicators
// Each connection = weighted directional link with a delay
// Read as: from -> to, with weight (1-5), direction, delay
// ================================================================

export type ConnectionDirection = 'positive' | 'inverse';
export type ConnectionDelay = 'immediate' | 'days' | 'weeks' | 'months';

export interface FundamentalConnection {
    from: string;
    to: string;
    weight: 1 | 2 | 3 | 4 | 5;
    direction: ConnectionDirection;
    delay: ConnectionDelay;
    description: string;
}

export const FUNDAMENTAL_CONNECTIONS: FundamentalConnection[] = [

    // ================================================================
    // GLOBAL CONNECTIONS (cross-currency)
    // ================================================================

    // Oil -> CAD
    { from: 'global_oil', to: 'cad_oil_link', weight: 5, direction: 'positive', delay: 'immediate', description: 'Pétrole ↑ → revenus exportateurs Canada ↑ → CAD ↑' },
    { from: 'global_oil', to: 'cad_oil_exposure', weight: 5, direction: 'positive', delay: 'immediate', description: 'Prix pétrole = driver direct du CAD (corrélation ~0.8)' },
    { from: 'global_oil', to: 'cad_capital_flows', weight: 4, direction: 'positive', delay: 'days', description: 'Pétrole ↑ → recettes pétrole Canada ↑ → flux CAD ↑' },
    { from: 'global_oil', to: 'cad_inflation', weight: 3, direction: 'positive', delay: 'weeks', description: 'Pétrole ↑ → coûts transport/énergie ↑ → CPI Canada ↑' },

    // Oil -> other currencies (inflationary impact)
    { from: 'global_oil', to: 'usd_inflation', weight: 2, direction: 'positive', delay: 'weeks', description: 'Pétrole ↑ → coûts énergie US ↑ → CPI US ↑ (modéré, US producteur)' },
    { from: 'global_oil', to: 'eur_inflation', weight: 3, direction: 'positive', delay: 'weeks', description: 'Pétrole ↑ → énergie zone euro ↑ → HICP ↑ (UE importatrice nette)' },
    { from: 'global_oil', to: 'jpy_capital_flows', weight: 3, direction: 'inverse', delay: 'weeks', description: 'Pétrole ↑ → facture énergie Japon ↑ → balance commerciale JPY ↓' },

    // China PMI -> AUD
    { from: 'global_china_pmi', to: 'aud_china_link', weight: 5, direction: 'positive', delay: 'days', description: 'PMI Chine ↑ → demande minerai de fer/charbon ↑ → AUD ↑' },
    { from: 'global_china_pmi', to: 'aud_china_exposure', weight: 5, direction: 'positive', delay: 'days', description: 'Activité chinoise → exports AUD directs' },
    { from: 'global_china_pmi', to: 'aud_capital_flows', weight: 4, direction: 'positive', delay: 'weeks', description: 'Chine forte → flux vers AUD (proxy Chine)' },
    { from: 'global_china_pmi', to: 'aud_iron_ore', weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI Chine → demande minerai de fer (corrélation directe)' },

    // China PMI -> NZD
    { from: 'global_china_pmi', to: 'nzd_china_link', weight: 4, direction: 'positive', delay: 'days', description: 'PMI Chine ↑ → demande produits laitiers NZ ↑ → NZD ↑' },
    { from: 'global_china_pmi', to: 'nzd_china_exposure', weight: 4, direction: 'positive', delay: 'days', description: 'Activité chinoise → exports NZ directs' },
    { from: 'global_china_pmi', to: 'nzd_capital_flows', weight: 3, direction: 'positive', delay: 'weeks', description: 'Chine forte → flux vers NZD' },

    // VIX -> safe havens (JPY, CHF)
    { from: 'global_vix', to: 'jpy_risk_appetite', weight: 5, direction: 'inverse', delay: 'immediate', description: 'VIX ↑ (peur) → demande JPY safe-haven ↑ (relation inverse : VIX↑ = JPY score↑)' },
    { from: 'global_vix', to: 'chf_risk_appetite', weight: 4, direction: 'inverse', delay: 'immediate', description: 'VIX ↑ → demande CHF safe-haven ↑' },
    { from: 'global_vix', to: 'jpy_capital_flows', weight: 4, direction: 'inverse', delay: 'immediate', description: 'VIX ↑ → débouclage carry trade JPY → flux retour vers JPY' },
    { from: 'global_vix', to: 'chf_capital_flows', weight: 4, direction: 'inverse', delay: 'immediate', description: 'VIX ↑ → flux capitaux vers la Suisse' },

    // VIX -> risk currencies (AUD, NZD — negative impact in risk-off)
    { from: 'global_vix', to: 'aud_risk_appetite', weight: 4, direction: 'positive', delay: 'immediate', description: 'VIX ↑ → risk-off → AUD ↓ (le score risk-off est positif = bearish pour AUD ici)' },
    { from: 'global_vix', to: 'nzd_risk_appetite', weight: 4, direction: 'positive', delay: 'immediate', description: 'VIX ↑ → risk-off → NZD ↓' },
    { from: 'global_vix', to: 'cad_risk_appetite', weight: 2, direction: 'positive', delay: 'immediate', description: 'VIX ↑ → modéré impact sur CAD (moins pro-risque que AUD/NZD)' },

    // US 10Y -> every currency (through the rate differential)
    { from: 'global_us_10y', to: 'usd_rate_differential', weight: 4, direction: 'positive', delay: 'immediate', description: 'Yields US ↑ → attractivité USD ↑ → diff. taux USD ↑' },
    { from: 'global_us_10y', to: 'jpy_rate_differential', weight: 5, direction: 'inverse', delay: 'immediate', description: 'Yields US ↑ → diff. taux US/JP s\'élargit → JPY rate diff. ↓ (pression baissière JPY)' },
    { from: 'global_us_10y', to: 'eur_rate_differential', weight: 3, direction: 'inverse', delay: 'immediate', description: 'Yields US ↑ → attractivité EUR relative ↓' },
    { from: 'global_us_10y', to: 'gbp_rate_differential', weight: 3, direction: 'inverse', delay: 'immediate', description: 'Yields US ↑ → attractivité GBP relative ↓' },
    { from: 'global_us_10y', to: 'aud_rate_differential', weight: 3, direction: 'inverse', delay: 'immediate', description: 'Yields US ↑ → attractivité AUD relative ↓' },

    // Iron ore -> AUD
    { from: 'aud_iron_ore', to: 'aud_commodities', weight: 5, direction: 'positive', delay: 'immediate', description: 'Fer ↑ → revenus exports AUS ↑ → soutien AUD' },
    { from: 'aud_iron_ore', to: 'aud_china_link', weight: 4, direction: 'positive', delay: 'immediate', description: 'Prix fer = proxy de la demande chinoise' },

    // GDT (dairy) -> NZD
    { from: 'nzd_gdt_auction', to: 'nzd_dairy_prices', weight: 5, direction: 'positive', delay: 'immediate', description: 'Enchères GDT ↑ → revenus exports NZ ↑ → NZD ↑' },

    // ================================================================
    // USD — Cascade roots -> signals -> drivers -> pillars -> king
    // ================================================================

    // Roots -> USD signals
    { from: 'usd_pmi_manufacturing', to: 'usd_pmi_composite', weight: 5, direction: 'positive', delay: 'immediate', description: 'ISM Manuf ↑ → PMI composite ↑' },
    { from: 'usd_pmi_services',      to: 'usd_pmi_composite', weight: 5, direction: 'positive', delay: 'immediate', description: 'ISM Services ↑ → PMI composite ↑' },
    { from: 'usd_nfp',               to: 'usd_wages',         weight: 4, direction: 'positive', delay: 'immediate', description: 'NFP solide → pression salariale ↑' },
    { from: 'usd_jolts',             to: 'usd_wages',         weight: 3, direction: 'positive', delay: 'weeks', description: 'JOLTS ↑ (offres emploi) → pression salaires ↑' },
    { from: 'usd_initial_claims',    to: 'usd_consumption',   weight: 3, direction: 'inverse', delay: 'weeks', description: 'Claims ↑ → chômage ↑ → consommation ↓' },
    { from: 'usd_durable_goods',     to: 'usd_pmi_composite', weight: 3, direction: 'positive', delay: 'days', description: 'Commandes biens durables ↑ → activité industrielle ↑' },
    { from: 'usd_cpi',               to: 'usd_wages',         weight: 3, direction: 'positive', delay: 'months', description: 'CPI ↑ → demandes d\'augmentation salariale' },
    { from: 'usd_pce',               to: 'usd_yield_curve',   weight: 3, direction: 'positive', delay: 'weeks', description: 'PCE ↑ → marchés anticipent taux ↑ → yields long terme ↑' },
    { from: 'usd_fomc',              to: 'usd_yield_curve',   weight: 5, direction: 'positive', delay: 'immediate', description: 'Décision FOMC → repricing courbe de taux immédiat' },
    { from: 'usd_trade_balance',     to: 'usd_capital_flows', weight: 3, direction: 'inverse', delay: 'months', description: 'Déficit commercial US ↑ → sorties de capitaux USD ↑' },

    // Signals -> USD drivers
    { from: 'usd_pmi_composite', to: 'usd_growth',         weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI composite = proxy en temps réel de la croissance' },
    { from: 'usd_wages',         to: 'usd_inflation',      weight: 4, direction: 'positive', delay: 'months', description: 'Salaires ↑ → coûts entreprises ↑ → inflation secondaire' },
    { from: 'usd_wages',         to: 'usd_labour_market',  weight: 4, direction: 'positive', delay: 'immediate', description: 'Salaires ↑ = signal d\'emploi tendu' },
    { from: 'usd_consumption',   to: 'usd_growth',         weight: 4, direction: 'positive', delay: 'immediate', description: 'Consommation = 70% du PIB américain' },
    { from: 'usd_yield_curve',   to: 'usd_monetary_policy',weight: 4, direction: 'positive', delay: 'immediate', description: 'Courbe taux → signal anticipations politique Fed' },
    { from: 'usd_yield_curve',   to: 'usd_growth',         weight: 3, direction: 'positive', delay: 'months', description: 'Inversion courbe = signal de récession (décalage ~12-18 mois)' },
    { from: 'usd_housing',       to: 'usd_growth',         weight: 3, direction: 'positive', delay: 'months', description: 'Immobilier ↑ → effet richesse → consommation ↑' },
    { from: 'usd_equity_markets',to: 'usd_risk_appetite',  weight: 3, direction: 'positive', delay: 'immediate', description: 'S&P ↑ → risk-on → USD peut faiblir (paradoxal pour valeur refuge)' },
    { from: 'global_us_10y',     to: 'usd_liquidity',      weight: 4, direction: 'inverse', delay: 'days', description: 'Yields ↑ → coût emprunt ↑ → liquidité se resserre' },

    // Direct roots -> USD drivers
    { from: 'usd_nfp',    to: 'usd_labour_market',  weight: 5, direction: 'positive', delay: 'immediate', description: 'NFP ↑ → emploi fort → Fed plus hawkish' },
    { from: 'usd_cpi',    to: 'usd_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'CPI = mesure directe de l\'inflation US' },
    { from: 'usd_pce',    to: 'usd_inflation',      weight: 4, direction: 'positive', delay: 'immediate', description: 'PCE = cible officielle de la Fed' },
    { from: 'usd_fomc',   to: 'usd_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Décision FOMC = input direct politique monétaire' },
    { from: 'usd_jolts',  to: 'usd_labour_market',  weight: 4, direction: 'positive', delay: 'immediate', description: 'JOLTS = signal avancé de l\'emploi' },

    // Drivers -> USD pillars
    { from: 'usd_monetary_policy', to: 'usd_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'Fed hawkish → taux USD ↑ → diff. taux favorable USD' },
    { from: 'usd_inflation',       to: 'usd_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Inflation ↑ → pression sur Fed pour relever → politique resserrée' },
    { from: 'usd_labour_market',   to: 'usd_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Emploi fort → Fed peut rester hawkish plus longtemps' },
    { from: 'usd_growth',          to: 'usd_capital_flows',     weight: 4, direction: 'positive', delay: 'months', description: 'Croissance US ↑ → attractivité actifs US ↑ → flux entrants USD' },
    { from: 'usd_growth',          to: 'usd_rate_differential', weight: 3, direction: 'positive', delay: 'months', description: 'Croissance ↑ → marchés anticipent taux plus hauts → diff. ↑' },
    { from: 'usd_geopolitics',     to: 'usd_risk_appetite',     weight: 3, direction: 'inverse', delay: 'immediate', description: 'Tensions géopolitiques → demande USD safe-haven ↑' },
    { from: 'usd_liquidity',       to: 'usd_capital_flows',     weight: 3, direction: 'inverse', delay: 'weeks', description: 'QT (bilan Fed ↓) → liquidité USD ↓ → USD ↑ (rareté)' },

    // Pillars -> USD king
    { from: 'usd_rate_differential', to: 'usd_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux favorable → USD bullish' },
    { from: 'usd_risk_appetite',     to: 'usd_direction', weight: 4, direction: 'inverse', delay: 'immediate', description: 'Risk-on → USD perd statut refuge → bearish (relation inverse)' },
    { from: 'usd_capital_flows',     to: 'usd_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux entrants USD → demande USD ↑ → bullish' },

    // ================================================================
    // EUR — Cascade
    // ================================================================

    // Roots -> EUR signals
    { from: 'eur_pmi_manufacturing', to: 'eur_pmi_composite', weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI Manuf EUR → PMI composite' },
    { from: 'eur_pmi_services',      to: 'eur_pmi_composite', weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI Services EUR → PMI composite' },
    { from: 'eur_german_ifo',        to: 'eur_sentiment',     weight: 4, direction: 'positive', delay: 'immediate', description: 'Ifo Allemagne → sentiment zone euro (moteur principal)' },
    { from: 'eur_zew',               to: 'eur_sentiment',     weight: 3, direction: 'positive', delay: 'immediate', description: 'ZEW → anticipations sentiment EUR' },
    { from: 'eur_hicp',              to: 'eur_wages',         weight: 3, direction: 'positive', delay: 'months', description: 'HICP ↑ → pression salaires ↑' },
    { from: 'eur_ecb_meeting',       to: 'eur_yield_spread',  weight: 4, direction: 'positive', delay: 'immediate', description: 'BCE hawkish → spreads souverains se compriment' },
    { from: 'eur_unemployment',      to: 'eur_wages',         weight: 3, direction: 'inverse', delay: 'months', description: 'Chômage ↓ → marché travail tendu → salaires ↑' },
    { from: 'eur_trade_balance',     to: 'eur_capital_flows', weight: 3, direction: 'positive', delay: 'months', description: 'Excédent commercial EUR → flux entrants EUR' },

    // Signals -> EUR drivers
    { from: 'eur_pmi_composite', to: 'eur_growth',         weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI composite = proxy croissance zone euro' },
    { from: 'eur_wages',         to: 'eur_inflation',      weight: 4, direction: 'positive', delay: 'months', description: 'Salaires négociés ↑ → inflation services ↑ → BCE hawkish' },
    { from: 'eur_sentiment',     to: 'eur_growth',         weight: 3, direction: 'positive', delay: 'months', description: 'Confiance ↑ → dépenses ↑ → croissance ↑' },
    { from: 'eur_yield_spread',  to: 'eur_monetary_policy',weight: 4, direction: 'inverse', delay: 'immediate', description: 'Spreads ↑ → risque fragmentation → BCE contrainte d\'agir' },
    { from: 'eur_energy',        to: 'eur_inflation',      weight: 4, direction: 'positive', delay: 'weeks', description: 'Énergie ↑ → HICP ↑ → pression BCE' },
    { from: 'eur_energy',        to: 'eur_growth',         weight: 4, direction: 'inverse', delay: 'months', description: 'Énergie ↑ → coûts production ↑ → croissance ↓' },
    { from: 'eur_consumption',   to: 'eur_growth',         weight: 3, direction: 'positive', delay: 'immediate', description: 'Consommation EUR → croissance' },

    // Direct roots -> EUR drivers
    { from: 'eur_hicp',       to: 'eur_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'HICP = mesure directe inflation zone euro' },
    { from: 'eur_ecb_meeting',to: 'eur_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion BCE = input direct politique monétaire' },

    // Drivers -> EUR pillars
    { from: 'eur_monetary_policy', to: 'eur_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'BCE hawkish → taux EUR ↑ → diff. taux EUR favorable' },
    { from: 'eur_inflation',       to: 'eur_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Inflation ↑ → BCE sous pression pour relever' },
    { from: 'eur_labour_market',   to: 'eur_monetary_policy',   weight: 3, direction: 'positive', delay: 'weeks', description: 'Emploi fort → BCE peut maintenir posture hawkish' },
    { from: 'eur_growth',          to: 'eur_capital_flows',     weight: 4, direction: 'positive', delay: 'months', description: 'Croissance EUR ↑ → flux entrants zone euro' },
    { from: 'eur_geopolitics',     to: 'eur_risk_appetite',     weight: 4, direction: 'inverse', delay: 'immediate', description: 'Tensions Europe → risk-off → EUR baisse' },
    { from: 'eur_current_account', to: 'eur_capital_flows',     weight: 4, direction: 'positive', delay: 'months', description: 'Excédent courant = soutien structurel EUR' },

    // Pillars -> EUR king
    { from: 'eur_rate_differential', to: 'eur_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux → EUR direction' },
    { from: 'eur_risk_appetite',     to: 'eur_direction', weight: 3, direction: 'positive', delay: 'immediate', description: 'Risk-on → EUR stable/haussier' },
    { from: 'eur_capital_flows',     to: 'eur_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux entrants → EUR ↑' },

    // ================================================================
    // GBP — Cascade
    // ================================================================

    { from: 'gbp_pmi_manufacturing', to: 'gbp_pmi_composite', weight: 4, direction: 'positive', delay: 'immediate', description: 'PMI Manuf UK → composite' },
    { from: 'gbp_pmi_services',      to: 'gbp_pmi_composite', weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI Services UK → composite (UK = économie tertiaire)' },
    { from: 'gbp_cpi',               to: 'gbp_wages',         weight: 3, direction: 'positive', delay: 'months', description: 'CPI UK ↑ → demandes salariales ↑' },
    { from: 'gbp_claimant_count',    to: 'gbp_labour_market', weight: 4, direction: 'inverse', delay: 'immediate', description: 'Claimant Count ↑ → emploi ↓ → bearish GBP' },
    { from: 'gbp_boe_meeting',       to: 'gbp_gilt_yields',   weight: 5, direction: 'positive', delay: 'immediate', description: 'BoE hawkish → gilts ↑ → attractivité GBP ↑' },
    { from: 'gbp_gdp',               to: 'gbp_pmi_composite', weight: 3, direction: 'positive', delay: 'months', description: 'PIB UK → signal activité composite' },

    { from: 'gbp_pmi_composite', to: 'gbp_growth',         weight: 5, direction: 'positive', delay: 'immediate', description: 'PMI UK → croissance' },
    { from: 'gbp_wages',         to: 'gbp_inflation',      weight: 5, direction: 'positive', delay: 'months', description: 'Salaires UK ↑ → services CPI ↑ → inflation services persistante' },
    { from: 'gbp_gfk',          to: 'gbp_consumption',    weight: 3, direction: 'positive', delay: 'months', description: 'GfK ↑ → confiance → dépenses ↑' },
    { from: 'gbp_gilt_yields',   to: 'gbp_monetary_policy',weight: 4, direction: 'positive', delay: 'immediate', description: 'Gilts ↑ → marchés anticipent BoE plus hawkish' },
    { from: 'gbp_housing',       to: 'gbp_consumption',    weight: 3, direction: 'positive', delay: 'months', description: 'Immobilier UK ↑ → effet richesse → consommation ↑' },

    { from: 'gbp_cpi',       to: 'gbp_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'CPI UK = input direct inflation' },
    { from: 'gbp_boe_meeting',to: 'gbp_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion BoE → politique monétaire' },

    { from: 'gbp_monetary_policy', to: 'gbp_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'BoE hawkish → diff. taux GBP ↑' },
    { from: 'gbp_inflation',       to: 'gbp_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Inflation UK persistante → BoE sous pression' },
    { from: 'gbp_labour_market',   to: 'gbp_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Salaires UK = facteur clé BoE (services inflation)' },
    { from: 'gbp_growth',          to: 'gbp_capital_flows',     weight: 4, direction: 'positive', delay: 'months', description: 'Croissance UK ↑ → attractivité actifs UK ↑' },
    { from: 'gbp_political_risk',  to: 'gbp_risk_appetite',     weight: 4, direction: 'inverse', delay: 'immediate', description: 'Risque politique UK ↑ → prime de risque ↑ → GBP ↓' },
    { from: 'gbp_current_account', to: 'gbp_capital_flows',     weight: 3, direction: 'inverse', delay: 'months', description: 'Déficit courant UK → besoin de financement → fragilité GBP' },

    { from: 'gbp_rate_differential', to: 'gbp_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux → GBP direction' },
    { from: 'gbp_risk_appetite',     to: 'gbp_direction', weight: 3, direction: 'positive', delay: 'immediate', description: 'Risk-on → GBP haussier' },
    { from: 'gbp_capital_flows',     to: 'gbp_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux entrants → GBP ↑' },

    // ================================================================
    // JPY — Cascade
    // ================================================================

    { from: 'jpy_pmi_manufacturing', to: 'jpy_tankan',       weight: 4, direction: 'positive', delay: 'months', description: 'PMI Manuf JP → confiance entreprises (Tankan)' },
    { from: 'jpy_pmi_services',      to: 'jpy_tankan',       weight: 3, direction: 'positive', delay: 'months', description: 'PMI Services JP → Tankan' },
    { from: 'jpy_cpi',               to: 'jpy_wages',        weight: 3, direction: 'positive', delay: 'months', description: 'CPI JP ↑ → Shunto (négociations salariales) plus agressif' },
    { from: 'jpy_jobs_to_applicants',to: 'jpy_wages',        weight: 3, direction: 'positive', delay: 'months', description: 'Ratio offres/demandes ↑ → pression salaires ↑' },
    { from: 'jpy_boj_meeting',       to: 'jpy_us_yields_impact', weight: 4, direction: 'inverse', delay: 'immediate', description: 'BoJ hawkish → écart US/JP se réduit → JPY ↑' },
    { from: 'jpy_trade_balance',     to: 'jpy_current_account',  weight: 4, direction: 'positive', delay: 'months', description: 'Balance commerciale → composante compte courant' },

    { from: 'jpy_tankan',         to: 'jpy_growth',          weight: 5, direction: 'positive', delay: 'immediate', description: 'Tankan fort → croissance JP ↑' },
    { from: 'jpy_wages',          to: 'jpy_inflation',       weight: 5, direction: 'positive', delay: 'months', description: 'Salaires JP ↑ → inflation durable → BoJ peut normaliser' },
    { from: 'jpy_consumption',    to: 'jpy_growth',          weight: 3, direction: 'positive', delay: 'immediate', description: 'Consommation JP → croissance' },
    { from: 'jpy_us_yields_impact',to: 'jpy_rate_differential', weight: 5, direction: 'inverse', delay: 'immediate', description: 'Yields US ↑ → diff. US/JP s\'élargit → pression baissière JPY' },
    { from: 'jpy_current_account',to: 'jpy_capital_flows',   weight: 4, direction: 'positive', delay: 'months', description: 'Excédent courant JP → flux structurel vers JPY' },
    { from: 'jpy_equity_markets', to: 'jpy_carry_trade',     weight: 3, direction: 'positive', delay: 'immediate', description: 'Marchés forts → carry trade actif → JPY emprunté' },

    { from: 'jpy_cpi',       to: 'jpy_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'CPI JP = input direct inflation' },
    { from: 'jpy_boj_meeting',to: 'jpy_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion BoJ → politique monétaire' },

    { from: 'jpy_monetary_policy',  to: 'jpy_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'BoJ hawkish → taux JP ↑ → diff. JPY moins négatif' },
    { from: 'jpy_inflation',        to: 'jpy_monetary_policy',   weight: 5, direction: 'positive', delay: 'weeks', description: 'Inflation JP durable → BoJ normalisera ses taux' },
    { from: 'jpy_growth',           to: 'jpy_monetary_policy',   weight: 3, direction: 'positive', delay: 'months', description: 'Croissance JP ↑ → BoJ plus confiant pour normaliser' },
    { from: 'jpy_intervention_risk',to: 'jpy_capital_flows',     weight: 5, direction: 'positive', delay: 'immediate', description: 'Intervention MoF → achat JPY massif → flux JPY ↑' },
    { from: 'jpy_carry_trade',      to: 'jpy_capital_flows',     weight: 4, direction: 'inverse', delay: 'immediate', description: 'Carry trade actif → emprunts JPY = sorties de capitaux' },
    { from: 'jpy_intervention_risk',to: 'jpy_risk_appetite',     weight: 4, direction: 'positive', delay: 'immediate', description: 'Intervention → signal fort de soutien au JPY' },

    { from: 'jpy_rate_differential', to: 'jpy_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux JP → direction JPY' },
    { from: 'jpy_risk_appetite',     to: 'jpy_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Safe-haven ↑ → JPY bullish (corrélation inverse avec risk)' },
    { from: 'jpy_capital_flows',     to: 'jpy_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux vers JPY → JPY ↑' },

    // ================================================================
    // AUD — Cascade
    // ================================================================

    { from: 'aud_employment_change', to: 'aud_labour_market',  weight: 5, direction: 'positive', delay: 'immediate', description: 'Emploi AUS → marché du travail' },
    { from: 'aud_cpi_quarterly',     to: 'aud_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'CPI AUS trim. → inflation' },
    { from: 'aud_rba_meeting',       to: 'aud_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion RBA → politique monétaire' },
    { from: 'aud_nab_business',      to: 'aud_pmi_composite',  weight: 3, direction: 'positive', delay: 'immediate', description: 'NAB Business → proxy PMI' },
    { from: 'aud_pmi_manufacturing', to: 'aud_pmi_composite',  weight: 4, direction: 'positive', delay: 'immediate', description: 'PMI Manuf AUS → composite' },
    { from: 'aud_trade_balance',     to: 'aud_capital_flows',  weight: 3, direction: 'positive', delay: 'months', description: 'Balance commerciale AUS → flux CAD' },

    { from: 'aud_pmi_composite', to: 'aud_growth',        weight: 4, direction: 'positive', delay: 'immediate', description: 'PMI AUS → croissance' },
    { from: 'aud_wages',         to: 'aud_inflation',     weight: 4, direction: 'positive', delay: 'months', description: 'Salaires AUS ↑ → CPI services ↑' },
    { from: 'aud_consumption',   to: 'aud_growth',        weight: 3, direction: 'positive', delay: 'immediate', description: 'Retail Sales AUS → croissance' },
    { from: 'aud_iron_ore',      to: 'aud_commodities',   weight: 5, direction: 'positive', delay: 'immediate', description: 'Fer ↑ → commodity complex AUS ↑' },
    { from: 'aud_china_link',    to: 'aud_china_exposure',weight: 5, direction: 'positive', delay: 'immediate', description: 'Lien Chine → exposition directe AUD' },
    { from: 'aud_housing',       to: 'aud_growth',        weight: 3, direction: 'positive', delay: 'months', description: 'Immobilier AUS → croissance' },

    { from: 'aud_monetary_policy', to: 'aud_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'RBA hawkish → diff. taux AUD ↑' },
    { from: 'aud_inflation',       to: 'aud_monetary_policy',   weight: 5, direction: 'positive', delay: 'weeks', description: 'CPI AUS ↑ → RBA sous pression' },
    { from: 'aud_labour_market',   to: 'aud_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Emploi fort AUS → RBA hawkish' },
    { from: 'aud_china_exposure',  to: 'aud_capital_flows',     weight: 5, direction: 'positive', delay: 'days', description: 'Commerce Chine fort → flux AUD ↑' },
    { from: 'aud_commodities',     to: 'aud_capital_flows',     weight: 4, direction: 'positive', delay: 'days', description: 'Commodities ↑ → revenus exports AUS ↑ → AUD ↑' },
    { from: 'aud_growth',          to: 'aud_capital_flows',     weight: 3, direction: 'positive', delay: 'months', description: 'Croissance AUS → attractivité investissements' },

    { from: 'aud_rate_differential', to: 'aud_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux → AUD direction' },
    { from: 'aud_risk_appetite',     to: 'aud_direction', weight: 5, direction: 'inverse', delay: 'immediate', description: 'Risk-off (VIX ↑) → AUD baisse (pro-risque)' },
    { from: 'aud_capital_flows',     to: 'aud_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux AUD → AUD ↑' },

    // ================================================================
    // NZD — Cascade
    // ================================================================

    { from: 'nzd_employment_change', to: 'nzd_labour_market',  weight: 5, direction: 'positive', delay: 'immediate', description: 'Emploi NZ → marché du travail' },
    { from: 'nzd_cpi_quarterly',     to: 'nzd_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'CPI NZ trim. → inflation' },
    { from: 'nzd_rbnz_meeting',      to: 'nzd_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion RBNZ → politique monétaire' },
    { from: 'nzd_gdt_auction',       to: 'nzd_dairy_prices',   weight: 5, direction: 'positive', delay: 'immediate', description: 'GDT → prix laitiers NZ' },
    { from: 'nzd_gdp',               to: 'nzd_growth',         weight: 5, direction: 'positive', delay: 'immediate', description: 'PIB NZ → croissance' },

    { from: 'nzd_anz_business',  to: 'nzd_growth',       weight: 4, direction: 'positive', delay: 'immediate', description: 'ANZ Business → proxy croissance NZ' },
    { from: 'nzd_consumption',   to: 'nzd_growth',       weight: 3, direction: 'positive', delay: 'immediate', description: 'Retail Sales NZ → croissance' },
    { from: 'nzd_dairy_prices',  to: 'nzd_china_exposure',weight: 4, direction: 'positive', delay: 'immediate', description: 'Prix laitiers → revenus exports NZ' },
    { from: 'nzd_china_link',    to: 'nzd_china_exposure',weight: 5, direction: 'positive', delay: 'immediate', description: 'Lien Chine → exposition directe NZD' },
    { from: 'nzd_trade_balance', to: 'nzd_capital_flows', weight: 3, direction: 'positive', delay: 'months', description: 'Balance commerciale NZ → flux NZD' },

    { from: 'nzd_monetary_policy', to: 'nzd_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'RBNZ hawkish → diff. taux NZD ↑' },
    { from: 'nzd_inflation',       to: 'nzd_monetary_policy',   weight: 5, direction: 'positive', delay: 'weeks', description: 'CPI NZ ↑ → RBNZ sous pression' },
    { from: 'nzd_labour_market',   to: 'nzd_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Emploi NZ fort → RBNZ hawkish' },
    { from: 'nzd_china_exposure',  to: 'nzd_capital_flows',     weight: 5, direction: 'positive', delay: 'days', description: 'Commerce Chine → flux NZD' },
    { from: 'nzd_dairy_prices',    to: 'nzd_capital_flows',     weight: 4, direction: 'positive', delay: 'days', description: 'Lait ↑ → revenus exports NZ ↑ → NZD ↑' },
    { from: 'nzd_growth',          to: 'nzd_capital_flows',     weight: 3, direction: 'positive', delay: 'months', description: 'Croissance NZ → attractivité' },

    { from: 'nzd_rate_differential', to: 'nzd_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux → NZD direction' },
    { from: 'nzd_risk_appetite',     to: 'nzd_direction', weight: 5, direction: 'inverse', delay: 'immediate', description: 'Risk-off → NZD baisse (plus pro-risque que AUD)' },
    { from: 'nzd_capital_flows',     to: 'nzd_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux NZD → NZD ↑' },

    // ================================================================
    // CAD — Cascade
    // ================================================================

    { from: 'cad_employment_change', to: 'cad_labour_market',  weight: 5, direction: 'positive', delay: 'immediate', description: 'Emploi CAD → marché du travail' },
    { from: 'cad_cpi',               to: 'cad_inflation',      weight: 5, direction: 'positive', delay: 'immediate', description: 'CPI CAD → inflation' },
    { from: 'cad_boc_meeting',       to: 'cad_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion BoC → politique monétaire' },
    { from: 'cad_wti_spot',          to: 'cad_oil_link',       weight: 5, direction: 'positive', delay: 'immediate', description: 'WTI → lien pétrole CAD' },
    { from: 'cad_gdp_monthly',       to: 'cad_growth',         weight: 4, direction: 'positive', delay: 'immediate', description: 'PIB mensuel CAD → croissance' },
    { from: 'cad_pmi_manufacturing', to: 'cad_pmi_ivey',       weight: 3, direction: 'positive', delay: 'immediate', description: 'PMI Manuf CAD → Ivey PMI' },

    { from: 'cad_pmi_ivey',  to: 'cad_growth',       weight: 4, direction: 'positive', delay: 'immediate', description: 'Ivey PMI → croissance Canada' },
    { from: 'cad_wages',     to: 'cad_inflation',    weight: 3, direction: 'positive', delay: 'months', description: 'Salaires CAD ↑ → CPI services ↑' },
    { from: 'cad_consumption',to: 'cad_growth',      weight: 3, direction: 'positive', delay: 'immediate', description: 'Retail Sales CAD → croissance' },
    { from: 'cad_oil_link',  to: 'cad_oil_exposure', weight: 5, direction: 'positive', delay: 'immediate', description: 'Prix pétrole → exposition pétrolière CAD' },
    { from: 'cad_housing',   to: 'cad_growth',       weight: 3, direction: 'positive', delay: 'months', description: 'Immobilier CAD → croissance (très sensible aux taux BoC)' },
    { from: 'cad_trade_balance',to: 'cad_capital_flows',weight: 3, direction: 'positive', delay: 'months', description: 'Balance commerciale CAD → flux' },

    { from: 'cad_monetary_policy', to: 'cad_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'BoC hawkish → diff. taux CAD ↑' },
    { from: 'cad_inflation',       to: 'cad_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'CPI CAD ↑ → BoC sous pression' },
    { from: 'cad_labour_market',   to: 'cad_monetary_policy',   weight: 4, direction: 'positive', delay: 'weeks', description: 'Emploi fort CAD → BoC hawkish' },
    { from: 'cad_oil_exposure',    to: 'cad_capital_flows',     weight: 5, direction: 'positive', delay: 'days', description: 'Pétrole ↑ → revenus Canada ↑ → flux CAD ↑' },
    { from: 'cad_usd_trade',       to: 'cad_capital_flows',     weight: 3, direction: 'positive', delay: 'months', description: 'Relations commerciales US-Canada → flux bilatéraux' },
    { from: 'cad_growth',          to: 'cad_capital_flows',     weight: 3, direction: 'positive', delay: 'months', description: 'Croissance CAD → attractivité actifs canadiens' },

    { from: 'cad_rate_differential', to: 'cad_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux → CAD direction' },
    { from: 'cad_risk_appetite',     to: 'cad_direction', weight: 3, direction: 'inverse', delay: 'immediate', description: 'Risk-off → CAD modérément baissier' },
    { from: 'cad_capital_flows',     to: 'cad_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux pétroliers → CAD ↑' },

    // ================================================================
    // CHF — Cascade
    // ================================================================

    { from: 'chf_cpi',       to: 'chf_inflation',      weight: 4, direction: 'positive', delay: 'immediate', description: 'CPI CHF → inflation (très basse historiquement)' },
    { from: 'chf_snb_meeting',to: 'chf_monetary_policy',weight: 5, direction: 'positive', delay: 'immediate', description: 'Réunion SNB (trimestrielle) → politique monétaire' },
    { from: 'chf_gdp',        to: 'chf_growth',         weight: 5, direction: 'positive', delay: 'immediate', description: 'PIB CHF → croissance' },
    { from: 'chf_unemployment',to: 'chf_growth',        weight: 3, direction: 'inverse', delay: 'months', description: 'Chômage CHF ↑ → activité ↓' },
    { from: 'chf_trade_balance',to: 'chf_capital_flows', weight: 3, direction: 'positive', delay: 'months', description: 'Excédent commercial CHF → flux entrants' },

    { from: 'chf_kof',         to: 'chf_growth',          weight: 4, direction: 'positive', delay: 'immediate', description: 'KOF → proxy croissance suisse' },
    { from: 'chf_pmi_composite',to: 'chf_growth',         weight: 4, direction: 'positive', delay: 'immediate', description: 'PMI CHF → croissance' },
    { from: 'chf_consumption', to: 'chf_growth',          weight: 3, direction: 'positive', delay: 'immediate', description: 'Retail Sales CHF → croissance' },
    { from: 'chf_sight_deposits',to: 'chf_snb_intervention',weight: 4, direction: 'positive', delay: 'immediate', description: 'Hausse dépôts à vue = signal intervention SNB imminente' },
    { from: 'chf_europe_stress',to: 'chf_risk_appetite',  weight: 5, direction: 'inverse', delay: 'immediate', description: 'Stress zone euro → afflux capitaux CHF → CHF ↑' },
    { from: 'chf_eur_correlation',to: 'chf_capital_flows',weight: 4, direction: 'inverse', delay: 'immediate', description: 'EUR/CHF baisse → CHF s\'apprécie → flux entrants' },

    { from: 'chf_monetary_policy',  to: 'chf_rate_differential', weight: 5, direction: 'positive', delay: 'immediate', description: 'SNB hawkish → diff. taux CHF ↑' },
    { from: 'chf_inflation',        to: 'chf_monetary_policy',   weight: 3, direction: 'positive', delay: 'weeks', description: 'Inflation CHF → SNB sous pression (rare)' },
    { from: 'chf_growth',           to: 'chf_capital_flows',     weight: 3, direction: 'positive', delay: 'months', description: 'Croissance CHF → attractivité' },
    { from: 'chf_snb_intervention', to: 'chf_capital_flows',     weight: 5, direction: 'inverse', delay: 'immediate', description: 'SNB intervient pour affaiblir CHF → vend CHF = sorties capitaux' },
    { from: 'chf_geopolitics',      to: 'chf_risk_appetite',     weight: 5, direction: 'inverse', delay: 'immediate', description: 'Géopolitique tendue → safe-haven CHF → CHF ↑' },

    { from: 'chf_rate_differential', to: 'chf_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Diff. taux → CHF direction' },
    { from: 'chf_risk_appetite',     to: 'chf_direction', weight: 5, direction: 'positive', delay: 'immediate', description: 'Safe-haven ↑ → CHF bullish' },
    { from: 'chf_capital_flows',     to: 'chf_direction', weight: 4, direction: 'positive', delay: 'immediate', description: 'Flux → CHF ↑' },

    // ================================================================
    // SPECIAL CONNECTIONS — New Phase 2 nodes
    // ================================================================

    // Copper (global) -> AUD
    { from: 'global_copper', to: 'aud_commodities', weight: 3, direction: 'positive', delay: 'days', description: 'Cuivre ↑ → demande industrielle Chine ↑ → AUD profite (corrélation ~0.7)' },
    { from: 'global_copper', to: 'aud_china_link', weight: 3, direction: 'positive', delay: 'days', description: 'Cuivre = proxy demande chinoise → lien AUD/Chine renforcé' },

    // Baltic Dry Index (global) -> AUD, NZD
    { from: 'global_bdi', to: 'aud_commodities', weight: 2, direction: 'positive', delay: 'weeks', description: 'BDI ↑ → fret maritime ↑ → activité commerce AUS ↑ → AUD ↑' },
    { from: 'global_bdi', to: 'nzd_dairy_prices', weight: 2, direction: 'positive', delay: 'weeks', description: 'BDI ↑ → coûts transport produits laitiers → signal commerce mondial NZ' },

    // JPY — Tokyo CPI -> national CPI
    { from: 'jpy_tokyo_cpi', to: 'jpy_cpi',       weight: 4, direction: 'positive', delay: 'immediate', description: 'Tokyo CPI = indicateur avancé du CPI national japonais (4 semaines d\'avance)' },
    { from: 'jpy_tokyo_cpi', to: 'jpy_wages',      weight: 3, direction: 'positive', delay: 'months',    description: 'Tokyo CPI ↑ → pression sur les négociations salariales Shunto' },

    // JPY — COT positions -> carry trade
    { from: 'jpy_cot_net', to: 'jpy_carry_trade',  weight: 4, direction: 'inverse',  delay: 'immediate', description: 'Positions courtes nettes JPY ↑ → carry trade actif → risque de débouclage' },
    { from: 'jpy_cot_net', to: 'jpy_capital_flows', weight: 3, direction: 'inverse', delay: 'immediate', description: 'Positionnement short JPY élevé = capitaux sortis → retour violent possible' },

    // GBP — City of London -> UK growth, flows
    { from: 'gbp_city_financial', to: 'gbp_growth',        weight: 3, direction: 'positive', delay: 'immediate', description: 'Services financiers City ↑ → 12% du PIB UK → croissance' },
    { from: 'gbp_city_financial', to: 'gbp_capital_flows', weight: 3, direction: 'positive', delay: 'weeks',     description: 'Activité City ↑ → flux capitaux vers la UK ↑ → GBP soutien' },

    // NZD — Fonterra -> dairy prices -> flows
    { from: 'nzd_fonterra_milk', to: 'nzd_dairy_prices',   weight: 5, direction: 'positive', delay: 'immediate', description: 'Fonterra prix lait = composante principale des prix laitiers NZ' },
    { from: 'nzd_fonterra_milk', to: 'nzd_capital_flows',  weight: 4, direction: 'positive', delay: 'days',      description: 'Prix Fonterra ↑ → revenus fermiers NZ ↑ → flux NZD entrants' },

    // AUD — RBA commodity index -> composite
    { from: 'aud_rba_commodity', to: 'aud_commodities',   weight: 5, direction: 'positive', delay: 'immediate', description: 'Indice RBA = composite iron ore + charbon + LNG → meilleur proxy revenus exports' },
    { from: 'aud_rba_commodity', to: 'aud_capital_flows', weight: 4, direction: 'positive', delay: 'days',      description: 'Commodités RBA ↑ → revenus export australiens ↑ → flux AUD entrants' },

    // CAD — Oil production -> oil exposure
    { from: 'cad_oil_production', to: 'cad_oil_exposure',  weight: 3, direction: 'positive', delay: 'weeks', description: 'Production pétrole CA ↑ → revenus futurs en CAD ↑ → soutien structurel' },
    { from: 'cad_oil_production', to: 'cad_capital_flows', weight: 2, direction: 'positive', delay: 'months', description: 'Production ↑ → investissements pétroliers → flux entrants CAD' },

    // CHF — Swiss exports -> growth, flows
    { from: 'chf_exports', to: 'chf_growth',        weight: 3, direction: 'positive', delay: 'immediate', description: 'Exports CH ↑ → activité économique suisse ↑ (pharma + montres = 60% des exports)' },
    { from: 'chf_exports', to: 'chf_capital_flows', weight: 3, direction: 'positive', delay: 'months',   description: 'Revenus exports suisses → rapatriement → flux CHF entrants' },

    // EUR — BTP-Bund spread -> yield spread -> policy
    { from: 'eur_btp_bund', to: 'eur_yield_spread',    weight: 5, direction: 'positive', delay: 'immediate', description: 'Spread BTP-Bund = composante principale du risque de fragmentation EUR' },
    { from: 'eur_btp_bund', to: 'eur_monetary_policy', weight: 4, direction: 'inverse',  delay: 'days',      description: 'Spread ↑ → pression BCE d\'activer TPI (outil anti-fragmentation)' },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Outgoing connections from an indicator */
export function getOutgoingConnections(indicatorId: string): FundamentalConnection[] {
    return FUNDAMENTAL_CONNECTIONS.filter(c => c.from === indicatorId);
}

/** Incoming connections into an indicator */
export function getIncomingConnections(indicatorId: string): FundamentalConnection[] {
    return FUNDAMENTAL_CONNECTIONS.filter(c => c.to === indicatorId);
}

/** Every indicator id connected to a node (incoming + outgoing) */
export function getConnectedIds(indicatorId: string): string[] {
    const out = getOutgoingConnections(indicatorId).map(c => c.to);
    const inc = getIncomingConnections(indicatorId).map(c => c.from);
    return [...new Set([...out, ...inc])];
}
