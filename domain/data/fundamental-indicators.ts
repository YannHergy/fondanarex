// ================================================================
// FUNDAMENTAL ENGINE — Catalogue of economic indicators
// 5 levels: king -> pillar -> driver -> signal -> root
// 8 G10 currencies + shared global indicators
// ================================================================

export type IndicatorLevel = 'king' | 'pillar' | 'driver' | 'signal' | 'root';
export type IndicatorFrequency = 'weekly' | 'monthly' | 'quarterly' | 'event';
export type IndicatorImportance = 1 | 2 | 3 | 4 | 5;

export interface FundamentalIndicator {
    id: string;
    name: string;
    fullName: string;
    country: string;
    currency: string;
    level: IndicatorLevel;
    category: string;
    frequency: IndicatorFrequency;
    importance: IndicatorImportance;
    /**
     * True when a HIGHER print is bad news for the currency — unemployment and
     * jobless claims. The prediction rules were written with `bullish` meaning
     * "the economy improves" ("Emploi fort → moins de demandes de chômage"),
     * while the raw print moves the other way, so without this flag every rule
     * touching these four indicators resolved backwards.
     *
     * The cascade does NOT use this: the connection graph already models the
     * relationship with `direction: 'inverse'` edges, and feeds on the raw sign.
     */
    higherIsBearish?: boolean;
    description: string;
}

export const FUNDAMENTAL_INDICATORS: FundamentalIndicator[] = [

    // ================================================================
    // GLOBAL INDICATORS (shared between several currencies)
    // ================================================================

    { id: 'global_oil', name: 'Pétrole WTI', fullName: 'WTI Crude Oil Price', country: 'GLOBAL', currency: 'GLOBAL', level: 'root', category: 'commodities', frequency: 'weekly', importance: 5, description: 'Prix du pétrole brut WTI. Impacte directement le CAD (exportateur), puis via inflation globale.' },
    { id: 'global_china_pmi', name: 'PMI Chine', fullName: 'China Caixin Manufacturing PMI', country: 'GLOBAL', currency: 'GLOBAL', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI manufacturier chinois (Caixin). Signal crucial pour AUD et NZD (commerce avec Chine).' },
    { id: 'global_vix', name: 'VIX', fullName: 'CBOE Volatility Index', country: 'GLOBAL', currency: 'GLOBAL', level: 'signal', category: 'risk', frequency: 'weekly', importance: 5, description: 'Indice de peur du marché. VIX élevé = risk-off → JPY/CHF s\'apprécient, AUD/NZD baissent.' },
    { id: 'global_gold', name: 'Or', fullName: 'Gold Spot Price (XAU/USD)', country: 'GLOBAL', currency: 'GLOBAL', level: 'signal', category: 'risk', frequency: 'weekly', importance: 3, description: 'Prix de l\'or. Valeur refuge, corrèle avec JPY/CHF en risk-off. Inverse du dollar.' },
    { id: 'global_us_10y', name: 'US 10Y', fullName: 'US 10-Year Treasury Yield', country: 'US', currency: 'USD', level: 'signal', category: 'monetary', frequency: 'weekly', importance: 5, description: 'Taux directeur obligataire américain. Influence le différentiel de taux de TOUTES les devises.' },
    { id: 'global_copper', name: 'Cuivre', fullName: 'Copper Spot Price (LME)', country: 'GLOBAL', currency: 'GLOBAL', level: 'root', category: 'commodities', frequency: 'weekly', importance: 3, description: 'Prix du cuivre (LME). Proxy de l\'activité industrielle mondiale, corrèle avec l\'AUD et la demande chinoise.' },
    { id: 'global_bdi', name: 'Baltic Dry Index', fullName: 'Baltic Dry Index (Shipping)', country: 'GLOBAL', currency: 'GLOBAL', level: 'root', category: 'trade', frequency: 'weekly', importance: 3, description: 'Indice Baltic Dry — coûts de fret maritime. Signal avancé du commerce mondial (AUD, NZD).' },

    // ================================================================
    // USD — US Dollar (Fed)
    // ================================================================

    // King
    { id: 'usd_direction', name: 'Direction USD', fullName: 'US Dollar Directional Bias', country: 'US', currency: 'USD', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final du USD. Alimenté par les 3 piliers.' },

    // Pillars
    { id: 'usd_rate_differential', name: 'Diff. Taux USD', fullName: 'USD Interest Rate Differential', country: 'US', currency: 'USD', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel entre le taux Fed et les taux des autres banques centrales.' },
    { id: 'usd_risk_appetite', name: 'Appétit Risque USD', fullName: 'USD Risk Appetite Component', country: 'US', currency: 'USD', level: 'pillar', category: 'risk', frequency: 'event', importance: 4, description: 'Impact de l\'appétit pour le risque sur le USD (valeur refuge en stress extrême).' },
    { id: 'usd_capital_flows', name: 'Flux Capitaux USD', fullName: 'USD Capital Flows', country: 'US', currency: 'USD', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux nets de capitaux vers les actifs américains (TIC data, investissements étrangers).' },

    // Drivers
    { id: 'usd_monetary_policy', name: 'Politique Monétaire Fed', fullName: 'Federal Reserve Monetary Policy', country: 'US', currency: 'USD', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions de la Fed : taux, QE/QT, forward guidance, dot plot.' },
    { id: 'usd_inflation', name: 'Inflation US', fullName: 'US Inflation Environment', country: 'US', currency: 'USD', level: 'driver', category: 'inflation', frequency: 'monthly', importance: 5, description: 'Environnement inflationniste US composite (CPI + PCE + Core).' },
    { id: 'usd_labour_market', name: 'Marché Emploi US', fullName: 'US Labour Market Conditions', country: 'US', currency: 'USD', level: 'driver', category: 'employment', frequency: 'monthly', importance: 5, description: 'Conditions du marché du travail américain (NFP, JOLTS, Claims).' },
    { id: 'usd_growth', name: 'Croissance US', fullName: 'US Economic Growth', country: 'US', currency: 'USD', level: 'driver', category: 'growth', frequency: 'quarterly', importance: 4, description: 'Activité économique américaine (PIB, ISM, production industrielle).' },
    { id: 'usd_geopolitics', name: 'Géopolitique US', fullName: 'US Geopolitical Risk Premium', country: 'US', currency: 'USD', level: 'driver', category: 'geopolitics', frequency: 'event', importance: 3, description: 'Risques géopolitiques affectant le statut de valeur refuge du USD.' },
    { id: 'usd_liquidity', name: 'Liquidité Fed', fullName: 'Fed Balance Sheet & Liquidity', country: 'US', currency: 'USD', level: 'driver', category: 'monetary', frequency: 'weekly', importance: 4, description: 'Taille du bilan de la Fed, injections/retraits de liquidité (QE/QT).' },

    // Signals
    { id: 'usd_pmi_composite', name: 'PMI Composite US', fullName: 'US ISM/S&P PMI Composite', country: 'US', currency: 'USD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI composite américain — synthèse de l\'activité économique.' },
    { id: 'usd_wages', name: 'Salaires US', fullName: 'US Average Hourly Earnings', country: 'US', currency: 'USD', level: 'signal', category: 'inflation', frequency: 'monthly', importance: 4, description: 'Croissance des salaires horaires moyens — signal d\'inflation secondaire.' },
    { id: 'usd_consumption', name: 'Consommation US', fullName: 'US Retail Sales & Consumer Spending', country: 'US', currency: 'USD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'Ventes au détail et dépenses des consommateurs américains.' },
    // Referenced as a target by eight prediction rules but absent from the
    // legacy catalogue, so those predictions named an indicator that could
    // never be published and therefore could only ever expire.
    { id: 'usd_consumer_confidence', name: 'Confiance Conso. US', fullName: 'US Consumer Confidence (Conference Board)', country: 'US', currency: 'USD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Indice de confiance des ménages américains. Signal avancé de la consommation.' },
    { id: 'usd_yield_curve', name: 'Courbe Taux US', fullName: 'US Yield Curve (2Y-10Y Spread)', country: 'US', currency: 'USD', level: 'signal', category: 'monetary', frequency: 'weekly', importance: 4, description: 'Spread 2Y-10Y. Inversion = signal de récession, normalisation = optimisme.' },
    { id: 'usd_equity_markets', name: 'Actions US', fullName: 'US Equity Markets (S&P 500)', country: 'US', currency: 'USD', level: 'signal', category: 'risk', frequency: 'weekly', importance: 3, description: 'Performance des marchés actions US. Risk-on → USD peut faiblir vs devises risquées.' },
    { id: 'usd_housing', name: 'Immobilier US', fullName: 'US Housing Market (Starts, Permits)', country: 'US', currency: 'USD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Mises en chantier et permis de construire — indicateur avancé de l\'activité US.' },

    // Roots
    { id: 'usd_pmi_manufacturing', name: 'ISM Manufacturier', fullName: 'ISM Manufacturing PMI', country: 'US', currency: 'USD', level: 'root', category: 'growth', frequency: 'monthly', importance: 5, description: 'ISM Manufacturier US. >50 = expansion. Référence absolue pour la santé industrielle.' },
    { id: 'usd_pmi_services', name: 'ISM Services', fullName: 'ISM Services PMI', country: 'US', currency: 'USD', level: 'root', category: 'growth', frequency: 'monthly', importance: 5, description: 'ISM Services US. >50 = expansion. L\'économie US est à 70% tertiaire.' },
    { id: 'usd_nfp', name: 'NFP', fullName: 'Non-Farm Payrolls', country: 'US', currency: 'USD', level: 'root', category: 'employment', frequency: 'monthly', importance: 5, description: 'Créations d\'emplois hors agriculture. La news la plus importante pour le USD.' },
    { id: 'usd_cpi', name: 'CPI US', fullName: 'US Consumer Price Index', country: 'US', currency: 'USD', level: 'root', category: 'inflation', frequency: 'monthly', importance: 5, description: 'CPI headline et core. Déterminant principal des décisions de la Fed.' },
    { id: 'usd_pce', name: 'PCE US', fullName: 'US Personal Consumption Expenditures', country: 'US', currency: 'USD', level: 'root', category: 'inflation', frequency: 'monthly', importance: 4, description: 'PCE Core — mesure d\'inflation préférée de la Fed (target 2%).' },
    { id: 'usd_fomc', name: 'FOMC', fullName: 'Federal Open Market Committee Meeting', country: 'US', currency: 'USD', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Réunion FOMC. Décision de taux + statement + conférence de presse Powell.' },
    { id: 'usd_jolts', name: 'JOLTS', fullName: 'Job Openings and Labor Turnover Survey', country: 'US', currency: 'USD', level: 'root', category: 'employment', frequency: 'monthly', importance: 4, description: 'Offres d\'emploi ouvertes. Indicateur avancé du NFP.' },
    { id: 'usd_initial_claims', higherIsBearish: true, name: 'Initial Claims', fullName: 'Initial Jobless Claims', country: 'US', currency: 'USD', level: 'root', category: 'employment', frequency: 'weekly', importance: 3, description: 'Nouvelles demandes d\'allocations chômage. Indicateur hebdomadaire du marché de l\'emploi.' },
    { id: 'usd_durable_goods', name: 'Biens Durables US', fullName: 'US Durable Goods Orders', country: 'US', currency: 'USD', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'Commandes de biens durables — signal sur les dépenses d\'investissement.' },
    { id: 'usd_trade_balance', name: 'Balance Commerciale US', fullName: 'US Trade Balance', country: 'US', currency: 'USD', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Déficit commercial américain. Impact sur les flux de capitaux en USD.' },

    // ================================================================
    // EUR — Euro (ECB)
    // ================================================================

    { id: 'eur_direction', name: 'Direction EUR', fullName: 'Euro Directional Bias', country: 'EU', currency: 'EUR', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final de l\'EUR.' },

    { id: 'eur_rate_differential', name: 'Diff. Taux EUR', fullName: 'EUR Interest Rate Differential', country: 'EU', currency: 'EUR', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel entre le taux BCE et les autres banques centrales.' },
    { id: 'eur_risk_appetite', name: 'Appétit Risque EUR', fullName: 'EUR Risk Appetite Component', country: 'EU', currency: 'EUR', level: 'pillar', category: 'risk', frequency: 'event', importance: 3, description: 'Impact de l\'appétit pour le risque sur l\'EUR (neutre, ni refuge ni risqué).' },
    { id: 'eur_capital_flows', name: 'Flux Capitaux EUR', fullName: 'EUR Capital Flows', country: 'EU', currency: 'EUR', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux de capitaux vers la zone euro (investissements, excédent courant).' },

    { id: 'eur_monetary_policy', name: 'Politique Monétaire BCE', fullName: 'European Central Bank Monetary Policy', country: 'EU', currency: 'EUR', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions BCE : taux de dépôt, TLTRO, APP, forward guidance Lagarde.' },
    { id: 'eur_inflation', name: 'Inflation Zone Euro', fullName: 'Eurozone Inflation Environment', country: 'EU', currency: 'EUR', level: 'driver', category: 'inflation', frequency: 'monthly', importance: 5, description: 'Environnement inflationniste zone euro (HICP headline et core).' },
    { id: 'eur_labour_market', name: 'Emploi Zone Euro', fullName: 'Eurozone Labour Market', country: 'EU', currency: 'EUR', level: 'driver', category: 'employment', frequency: 'monthly', importance: 4, description: 'Chômage de la zone euro + croissance des salaires (Tracker BCE).' },
    { id: 'eur_growth', name: 'Croissance Zone Euro', fullName: 'Eurozone Economic Growth', country: 'EU', currency: 'EUR', level: 'driver', category: 'growth', frequency: 'quarterly', importance: 4, description: 'Activité économique zone euro (PIB, production industrielle, ZEW, Ifo).' },
    { id: 'eur_geopolitics', name: 'Géopolitique Europe', fullName: 'European Geopolitical Risk', country: 'EU', currency: 'EUR', level: 'driver', category: 'geopolitics', frequency: 'event', importance: 3, description: 'Risques géopolitiques en Europe (guerre Ukraine, crise énergétique, élections).' },
    { id: 'eur_current_account', name: 'Compte Courant EUR', fullName: 'Eurozone Current Account', country: 'EU', currency: 'EUR', level: 'driver', category: 'trade', frequency: 'monthly', importance: 3, description: 'Excédent courant de la zone euro — soutien structurel à l\'EUR.' },

    { id: 'eur_pmi_composite', name: 'PMI Composite EUR', fullName: 'Eurozone Markit PMI Composite', country: 'EU', currency: 'EUR', level: 'signal', category: 'growth', frequency: 'monthly', importance: 5, description: 'PMI Composite Markit — synthèse de l\'activité zone euro.' },
    { id: 'eur_wages', name: 'Salaires Zone Euro', fullName: 'Eurozone Negotiated Wages', country: 'EU', currency: 'EUR', level: 'signal', category: 'inflation', frequency: 'quarterly', importance: 4, description: 'Croissance des salaires négociés — surveillance clé de la BCE.' },
    { id: 'eur_consumption', name: 'Consommation EUR', fullName: 'Eurozone Retail Sales', country: 'EU', currency: 'EUR', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Ventes au détail zone euro.' },
    { id: 'eur_yield_spread', name: 'Spreads Souverains EUR', fullName: 'Eurozone Sovereign Yield Spreads', country: 'EU', currency: 'EUR', level: 'signal', category: 'monetary', frequency: 'weekly', importance: 4, description: 'Spreads Italie/Allemagne, Espagne/Allemagne — risque de fragmentation.' },
    { id: 'eur_sentiment', name: 'Confiance Zone Euro', fullName: 'Eurozone Consumer & Business Confidence', country: 'EU', currency: 'EUR', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Confiance consommateurs et entreprises zone euro.' },
    { id: 'eur_energy', name: 'Énergie Europe', fullName: 'European Energy Prices (TTF Gas)', country: 'EU', currency: 'EUR', level: 'signal', category: 'inflation', frequency: 'weekly', importance: 4, description: 'Prix du gaz naturel TTF européen. Impact majeur sur l\'inflation et la croissance.' },

    { id: 'eur_pmi_manufacturing', name: 'PMI Manuf. EUR', fullName: 'Eurozone Manufacturing PMI (Markit)', country: 'EU', currency: 'EUR', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI Manufacturier Markit zone euro. Faiblesse persistante en Allemagne.' },
    { id: 'eur_pmi_services', name: 'PMI Services EUR', fullName: 'Eurozone Services PMI (Markit)', country: 'EU', currency: 'EUR', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI Services Markit zone euro.' },
    { id: 'eur_hicp', name: 'HICP Zone Euro', fullName: 'Harmonized Index of Consumer Prices', country: 'EU', currency: 'EUR', level: 'root', category: 'inflation', frequency: 'monthly', importance: 5, description: 'Inflation harmonisée zone euro. Target BCE : 2%.' },
    { id: 'eur_ecb_meeting', name: 'Réunion BCE', fullName: 'ECB Governing Council Meeting', country: 'EU', currency: 'EUR', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Décision de taux BCE + conférence de presse Lagarde.' },
    { id: 'eur_german_ifo', name: 'Ifo Allemagne', fullName: 'German Ifo Business Climate', country: 'EU', currency: 'EUR', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'Confiance des entreprises allemandes. L\'Allemagne est le moteur de la zone euro.' },
    { id: 'eur_zew', name: 'ZEW Allemagne', fullName: 'German ZEW Economic Sentiment', country: 'EU', currency: 'EUR', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'Sentiment économique des investisseurs allemands.' },
    { id: 'eur_trade_balance', name: 'Balance Commerciale EUR', fullName: 'Eurozone Trade Balance', country: 'EU', currency: 'EUR', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Balance commerciale zone euro — excédent structurel soutient l\'EUR.' },
    { id: 'eur_unemployment', higherIsBearish: true, name: 'Chômage Zone Euro', fullName: 'Eurozone Unemployment Rate', country: 'EU', currency: 'EUR', level: 'root', category: 'employment', frequency: 'monthly', importance: 3, description: 'Taux de chômage de la zone euro.' },

    // ================================================================
    // GBP — Pound Sterling (BoE)
    // ================================================================

    { id: 'gbp_direction', name: 'Direction GBP', fullName: 'British Pound Directional Bias', country: 'UK', currency: 'GBP', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final du GBP.' },

    { id: 'gbp_rate_differential', name: 'Diff. Taux GBP', fullName: 'GBP Interest Rate Differential', country: 'UK', currency: 'GBP', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel taux BoE vs autres banques centrales.' },
    { id: 'gbp_risk_appetite', name: 'Appétit Risque GBP', fullName: 'GBP Risk Appetite Component', country: 'UK', currency: 'GBP', level: 'pillar', category: 'risk', frequency: 'event', importance: 3, description: 'Le GBP est légèrement pro-risque. Brexit a ajouté une prime de risque politique.' },
    { id: 'gbp_capital_flows', name: 'Flux Capitaux GBP', fullName: 'GBP Capital Flows', country: 'UK', currency: 'GBP', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux de capitaux vers le Royaume-Uni (grand déficit courant = dépendance aux flux).' },

    { id: 'gbp_monetary_policy', name: 'Politique Monétaire BoE', fullName: 'Bank of England Monetary Policy', country: 'UK', currency: 'GBP', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions BoE : taux bancaire, QE/QT, MPC minutes.' },
    { id: 'gbp_inflation', name: 'Inflation UK', fullName: 'UK Inflation Environment', country: 'UK', currency: 'GBP', level: 'driver', category: 'inflation', frequency: 'monthly', importance: 5, description: 'Environnement inflationniste UK (CPI + Core CPI + Services CPI).' },
    { id: 'gbp_labour_market', name: 'Emploi UK', fullName: 'UK Labour Market', country: 'UK', currency: 'GBP', level: 'driver', category: 'employment', frequency: 'monthly', importance: 5, description: 'Marché de l\'emploi UK (Claimant Count, Employment Change, Average Earnings).' },
    { id: 'gbp_growth', name: 'Croissance UK', fullName: 'UK Economic Growth', country: 'UK', currency: 'GBP', level: 'driver', category: 'growth', frequency: 'monthly', importance: 4, description: 'Activité économique UK (PIB mensuel, production industrielle).' },
    { id: 'gbp_political_risk', name: 'Risque Politique UK', fullName: 'UK Political Risk', country: 'UK', currency: 'GBP', level: 'driver', category: 'geopolitics', frequency: 'event', importance: 4, description: 'Risques politiques UK (stabilité gouvernementale, négociations post-Brexit).' },
    { id: 'gbp_current_account', name: 'Compte Courant UK', fullName: 'UK Current Account Balance', country: 'UK', currency: 'GBP', level: 'driver', category: 'trade', frequency: 'quarterly', importance: 3, description: 'Déficit courant UK important — vulnérabilité aux sorties de capitaux.' },

    { id: 'gbp_pmi_composite', name: 'PMI Composite UK', fullName: 'UK S&P PMI Composite', country: 'UK', currency: 'GBP', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI Composite UK.' },
    { id: 'gbp_wages', name: 'Salaires UK', fullName: 'UK Average Weekly Earnings', country: 'UK', currency: 'GBP', level: 'signal', category: 'inflation', frequency: 'monthly', importance: 5, description: 'Croissance des salaires UK — critique pour les décisions BoE (services inflation).' },
    { id: 'gbp_consumption', name: 'Consommation UK', fullName: 'UK Retail Sales', country: 'UK', currency: 'GBP', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Ventes au détail UK.' },
    { id: 'gbp_gfk', name: 'GfK Consommateurs', fullName: 'GfK Consumer Confidence UK', country: 'UK', currency: 'GBP', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Confiance des consommateurs GfK.' },
    { id: 'gbp_housing', name: 'Immobilier UK', fullName: 'UK House Prices (Halifax/Nationwide)', country: 'UK', currency: 'GBP', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Prix immobiliers UK — signal de richesse et confiance consommateurs.' },
    { id: 'gbp_gilt_yields', name: 'Gilts UK', fullName: 'UK Government Bond Yields (Gilts)', country: 'UK', currency: 'GBP', level: 'signal', category: 'monetary', frequency: 'weekly', importance: 4, description: 'Rendements obligataires UK. Tension sur les gilts = pression sur le GBP.' },

    { id: 'gbp_pmi_manufacturing', name: 'PMI Manuf. UK', fullName: 'UK Manufacturing PMI', country: 'UK', currency: 'GBP', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI Manufacturier UK.' },
    { id: 'gbp_pmi_services', name: 'PMI Services UK', fullName: 'UK Services PMI', country: 'UK', currency: 'GBP', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI Services UK.' },
    { id: 'gbp_cpi', name: 'CPI UK', fullName: 'UK Consumer Price Index', country: 'UK', currency: 'GBP', level: 'root', category: 'inflation', frequency: 'monthly', importance: 5, description: 'CPI UK headline et core. Target BoE : 2%.' },
    { id: 'gbp_boe_meeting', name: 'Réunion BoE', fullName: 'Bank of England MPC Meeting', country: 'UK', currency: 'GBP', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Décision de taux BoE + MPC minutes + vote (hawkish/dovish split).' },
    { id: 'gbp_claimant_count', higherIsBearish: true, name: 'Claimant Count', fullName: 'UK Claimant Count Change', country: 'UK', currency: 'GBP', level: 'root', category: 'employment', frequency: 'monthly', importance: 4, description: 'Variation des demandeurs d\'allocations chômage UK.' },
    { id: 'gbp_gdp', name: 'PIB UK', fullName: 'UK GDP Monthly/Quarterly', country: 'UK', currency: 'GBP', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PIB UK (mensuel et trimestriel).' },
    { id: 'gbp_trade_balance', name: 'Balance Commerciale UK', fullName: 'UK Trade Balance', country: 'UK', currency: 'GBP', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Balance commerciale UK — déficit structurel post-Brexit.' },

    // ================================================================
    // JPY — Japanese Yen (BoJ)
    // ================================================================

    { id: 'jpy_direction', name: 'Direction JPY', fullName: 'Japanese Yen Directional Bias', country: 'JP', currency: 'JPY', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final du JPY. Safe-haven = impact inverse du risque global.' },

    { id: 'jpy_rate_differential', name: 'Diff. Taux JPY', fullName: 'JPY Interest Rate Differential', country: 'JP', currency: 'JPY', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel taux BoJ vs autres — clé pour le carry trade JPY.' },
    { id: 'jpy_risk_appetite', name: 'Safe-Haven JPY', fullName: 'JPY Safe-Haven Demand', country: 'JP', currency: 'JPY', level: 'pillar', category: 'risk', frequency: 'event', importance: 5, description: 'Le JPY est la valeur refuge la plus importante. VIX ↑ → JPY ↑.' },
    { id: 'jpy_capital_flows', name: 'Flux Capitaux JPY', fullName: 'JPY Capital Flows (Carry Unwind)', country: 'JP', currency: 'JPY', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux capitaux JPY. Carry trade massif — débouclage = JPY s\'apprécie fortement.' },

    { id: 'jpy_monetary_policy', name: 'Politique Monétaire BoJ', fullName: 'Bank of Japan Monetary Policy', country: 'JP', currency: 'JPY', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'BoJ : YCC (Yield Curve Control), taux directeur, achats d\'obligations.' },
    { id: 'jpy_inflation', name: 'Inflation Japon', fullName: 'Japan Inflation Environment', country: 'JP', currency: 'JPY', level: 'driver', category: 'inflation', frequency: 'monthly', importance: 5, description: 'CPI japonais — sortie de déflation est déterminante pour le JPY.' },
    { id: 'jpy_labour_market', name: 'Emploi Japon', fullName: 'Japan Labour Market', country: 'JP', currency: 'JPY', level: 'driver', category: 'employment', frequency: 'monthly', importance: 3, description: 'Emploi japonais (Jobs-to-Applicants Ratio, taux de chômage).' },
    { id: 'jpy_growth', name: 'Croissance Japon', fullName: 'Japan Economic Growth', country: 'JP', currency: 'JPY', level: 'driver', category: 'growth', frequency: 'quarterly', importance: 4, description: 'Activité économique japonaise (PIB, Tankan, production industrielle).' },
    { id: 'jpy_intervention_risk', name: 'Risque Intervention', fullName: 'Japanese Intervention Risk (MoF)', country: 'JP', currency: 'JPY', level: 'driver', category: 'geopolitics', frequency: 'event', importance: 5, description: 'Risque d\'intervention du Ministère des Finances japonais sur le marché FX.' },
    { id: 'jpy_carry_trade', name: 'Carry Trade JPY', fullName: 'JPY Carry Trade Dynamics', country: 'JP', currency: 'JPY', level: 'driver', category: 'flows', frequency: 'event', importance: 4, description: 'Dynamique du carry trade (emprunt JPY pour investir dans devises à haut rendement).' },

    { id: 'jpy_tankan', name: 'Tankan', fullName: 'Bank of Japan Tankan Survey', country: 'JP', currency: 'JPY', level: 'signal', category: 'growth', frequency: 'quarterly', importance: 5, description: 'Enquête Tankan BoJ — confiance des grandes entreprises japonaises.' },
    { id: 'jpy_wages', name: 'Salaires Japon', fullName: 'Japan Cash Earnings / Shunto Results', country: 'JP', currency: 'JPY', level: 'signal', category: 'inflation', frequency: 'monthly', importance: 5, description: 'Croissance salaires Japon — Shunto annuel déterminant pour la politique BoJ.' },
    { id: 'jpy_consumption', name: 'Consommation Japon', fullName: 'Japan Household Spending', country: 'JP', currency: 'JPY', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Dépenses des ménages japonais.' },
    { id: 'jpy_us_yields_impact', name: 'Impact Taux US/JP', fullName: 'US-Japan Rate Differential Impact', country: 'JP', currency: 'JPY', level: 'signal', category: 'monetary', frequency: 'weekly', importance: 5, description: 'Impact du différentiel de taux US-JP sur le JPY (corrélation forte avec USD/JPY).' },
    { id: 'jpy_equity_markets', name: 'Nikkei', fullName: 'Japan Nikkei 225 Performance', country: 'JP', currency: 'JPY', level: 'signal', category: 'risk', frequency: 'weekly', importance: 3, description: 'Performance du Nikkei. Fort Nikkei = investisseurs plus confiants, parfois JPY plus faible.' },
    { id: 'jpy_current_account', name: 'Compte Courant Japon', fullName: 'Japan Current Account Balance', country: 'JP', currency: 'JPY', level: 'signal', category: 'trade', frequency: 'monthly', importance: 4, description: 'Excédent courant japonais — soutien structurel au JPY sur le long terme.' },

    { id: 'jpy_cpi', name: 'CPI Japon', fullName: 'Japan National Consumer Price Index', country: 'JP', currency: 'JPY', level: 'root', category: 'inflation', frequency: 'monthly', importance: 5, description: 'CPI national japonais. Tokyo CPI = indicateur avancé.' },
    { id: 'jpy_boj_meeting', name: 'Réunion BoJ', fullName: 'Bank of Japan Policy Meeting', country: 'JP', currency: 'JPY', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Décision de politique monétaire BoJ + forward guidance Ueda.' },
    { id: 'jpy_pmi_manufacturing', name: 'PMI Manuf. Japon', fullName: 'Japan Manufacturing PMI (Jibun Bank)', country: 'JP', currency: 'JPY', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'PMI Manufacturier japonais.' },
    { id: 'jpy_pmi_services', name: 'PMI Services Japon', fullName: 'Japan Services PMI (Jibun Bank)', country: 'JP', currency: 'JPY', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'PMI Services japonais.' },
    { id: 'jpy_jobs_to_applicants', name: 'Jobs/Applicants JP', fullName: 'Japan Jobs-to-Applicants Ratio', country: 'JP', currency: 'JPY', level: 'root', category: 'employment', frequency: 'monthly', importance: 3, description: 'Ratio offres/demandes d\'emploi au Japon.' },
    { id: 'jpy_trade_balance', name: 'Balance Commerciale JP', fullName: 'Japan Trade Balance', country: 'JP', currency: 'JPY', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Balance commerciale japonaise. Déficits en énergie fragilisent le JPY.' },

    // ================================================================
    // AUD — Australian Dollar (RBA)
    // ================================================================

    { id: 'aud_direction', name: 'Direction AUD', fullName: 'Australian Dollar Directional Bias', country: 'AU', currency: 'AUD', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final de l\'AUD. Très sensible au risque et à la Chine.' },

    { id: 'aud_rate_differential', name: 'Diff. Taux AUD', fullName: 'AUD Interest Rate Differential', country: 'AU', currency: 'AUD', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel taux RBA vs autres.' },
    { id: 'aud_risk_appetite', name: 'Risk-On AUD', fullName: 'AUD Risk-On Sensitivity', country: 'AU', currency: 'AUD', level: 'pillar', category: 'risk', frequency: 'event', importance: 5, description: 'AUD est une devise pro-risque. Risk-on → AUD ↑, risk-off → AUD ↓.' },
    { id: 'aud_capital_flows', name: 'Flux Capitaux AUD', fullName: 'AUD Capital Flows (China Trade)', country: 'AU', currency: 'AUD', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux de capitaux AUD. Très corrélé aux exportations vers la Chine (minerai de fer, charbon).' },

    { id: 'aud_monetary_policy', name: 'Politique Monétaire RBA', fullName: 'Reserve Bank of Australia Monetary Policy', country: 'AU', currency: 'AUD', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions RBA : cash rate, forward guidance, Bullock speeches.' },
    { id: 'aud_inflation', name: 'Inflation Australie', fullName: 'Australia Inflation Environment', country: 'AU', currency: 'AUD', level: 'driver', category: 'inflation', frequency: 'quarterly', importance: 5, description: 'CPI australien (trimestriel) et Monthly CPI Indicator. Target RBA : 2-3%.' },
    { id: 'aud_labour_market', name: 'Emploi Australie', fullName: 'Australia Labour Market', country: 'AU', currency: 'AUD', level: 'driver', category: 'employment', frequency: 'monthly', importance: 5, description: 'Emploi australien (Employment Change, Unemployment Rate, Participation Rate).' },
    { id: 'aud_china_exposure', name: 'Exposition Chine AUD', fullName: 'AUD China Trade Exposure', country: 'AU', currency: 'AUD', level: 'driver', category: 'trade', frequency: 'monthly', importance: 5, description: 'Exposition de l\'Australie au commerce chinois. Chine = +30% des exports australiennes.' },
    { id: 'aud_growth', name: 'Croissance Australie', fullName: 'Australia Economic Growth', country: 'AU', currency: 'AUD', level: 'driver', category: 'growth', frequency: 'quarterly', importance: 4, description: 'PIB australien, NAB Business Confidence, Westpac Consumer Sentiment.' },
    { id: 'aud_commodities', name: 'Matières Premières AUD', fullName: 'AUD Commodity Prices (Iron Ore, Coal)', country: 'AU', currency: 'AUD', level: 'driver', category: 'trade', frequency: 'weekly', importance: 5, description: 'Prix du minerai de fer et du charbon — principaux exports australiens.' },

    { id: 'aud_pmi_composite', name: 'PMI Composite AUS', fullName: 'Australia S&P PMI Composite', country: 'AU', currency: 'AUD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'PMI Composite australien.' },
    { id: 'aud_wages', name: 'Salaires Australie', fullName: 'Australia Wage Price Index', country: 'AU', currency: 'AUD', level: 'signal', category: 'inflation', frequency: 'quarterly', importance: 4, description: 'Indice des prix des salaires australiens — surveillance RBA.' },
    { id: 'aud_consumption', name: 'Consommation AUS', fullName: 'Australia Retail Sales', country: 'AU', currency: 'AUD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Ventes au détail australiennes.' },
    { id: 'aud_iron_ore', name: 'Minerai de Fer', fullName: 'Iron Ore Spot Price', country: 'AU', currency: 'AUD', level: 'signal', category: 'trade', frequency: 'weekly', importance: 5, description: 'Prix spot du minerai de fer — principal export australien.' },
    { id: 'aud_china_link', name: 'Lien Chine/AUD', fullName: 'China Economic Activity Impact on AUD', country: 'AU', currency: 'AUD', level: 'signal', category: 'trade', frequency: 'monthly', importance: 5, description: 'Impact direct de l\'activité économique chinoise sur le dollar australien.' },
    { id: 'aud_housing', name: 'Immobilier AUS', fullName: 'Australia Housing Market', country: 'AU', currency: 'AUD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Prix immobiliers australiens — signal de conditions financières.' },

    { id: 'aud_employment_change', name: 'Emploi AUS (mensuel)', fullName: 'Australia Employment Change', country: 'AU', currency: 'AUD', level: 'root', category: 'employment', frequency: 'monthly', importance: 5, description: 'Variation mensuelle de l\'emploi australien. News la plus importante pour l\'AUD.' },
    { id: 'aud_rba_meeting', name: 'Réunion RBA', fullName: 'RBA Board Meeting Decision', country: 'AU', currency: 'AUD', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Décision de taux RBA.' },
    { id: 'aud_cpi_quarterly', name: 'CPI Australie (trim.)', fullName: 'Australia Quarterly CPI', country: 'AU', currency: 'AUD', level: 'root', category: 'inflation', frequency: 'quarterly', importance: 5, description: 'CPI trimestriel australien — ultra important pour la politique RBA.' },
    { id: 'aud_nab_business', name: 'NAB Business AUS', fullName: 'NAB Business Confidence Australia', country: 'AU', currency: 'AUD', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'Confiance des entreprises australiennes (NAB).' },
    { id: 'aud_pmi_manufacturing', name: 'PMI Manuf. AUS', fullName: 'Australia Manufacturing PMI', country: 'AU', currency: 'AUD', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'PMI Manufacturier australien.' },
    { id: 'aud_trade_balance', name: 'Balance Commerciale AUS', fullName: 'Australia Trade Balance', country: 'AU', currency: 'AUD', level: 'root', category: 'trade', frequency: 'monthly', importance: 4, description: 'Balance commerciale australienne.' },

    // ================================================================
    // NZD — New Zealand Dollar (RBNZ)
    // ================================================================

    { id: 'nzd_direction', name: 'Direction NZD', fullName: 'New Zealand Dollar Directional Bias', country: 'NZ', currency: 'NZD', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final du NZD.' },

    { id: 'nzd_rate_differential', name: 'Diff. Taux NZD', fullName: 'NZD Interest Rate Differential', country: 'NZ', currency: 'NZD', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel taux RBNZ vs autres.' },
    { id: 'nzd_risk_appetite', name: 'Risk-On NZD', fullName: 'NZD Risk-On Sensitivity', country: 'NZ', currency: 'NZD', level: 'pillar', category: 'risk', frequency: 'event', importance: 5, description: 'Le NZD est encore plus pro-risque que l\'AUD.' },
    { id: 'nzd_capital_flows', name: 'Flux Capitaux NZD', fullName: 'NZD Capital Flows', country: 'NZ', currency: 'NZD', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 3, description: 'Flux de capitaux NZD. Exposition à la Chine et aux matières premières agricoles.' },

    { id: 'nzd_monetary_policy', name: 'Politique Monétaire RBNZ', fullName: 'Reserve Bank of New Zealand Monetary Policy', country: 'NZ', currency: 'NZD', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions RBNZ : OCR (Official Cash Rate), MPS (Monetary Policy Statement).' },
    { id: 'nzd_inflation', name: 'Inflation NZ', fullName: 'New Zealand Inflation Environment', country: 'NZ', currency: 'NZD', level: 'driver', category: 'inflation', frequency: 'quarterly', importance: 5, description: 'CPI néo-zélandais (trimestriel). Target RBNZ : 1-3%, cible 2%.' },
    { id: 'nzd_labour_market', name: 'Emploi NZ', fullName: 'New Zealand Labour Market', country: 'NZ', currency: 'NZD', level: 'driver', category: 'employment', frequency: 'quarterly', importance: 5, description: 'Employment Change et Unemployment Rate NZ (trimestriels).' },
    { id: 'nzd_growth', name: 'Croissance NZ', fullName: 'New Zealand Economic Growth', country: 'NZ', currency: 'NZD', level: 'driver', category: 'growth', frequency: 'quarterly', importance: 4, description: 'PIB néo-zélandais, ANZ Business Confidence.' },
    { id: 'nzd_china_exposure', name: 'Exposition Chine NZD', fullName: 'NZD China Trade Exposure', country: 'NZ', currency: 'NZD', level: 'driver', category: 'trade', frequency: 'monthly', importance: 4, description: 'Exposition de la NZ au commerce chinois (lait, produits agricoles).' },
    { id: 'nzd_dairy_prices', name: 'Prix Produits Laitiers', fullName: 'Global Dairy Trade Auction Prices', country: 'NZ', currency: 'NZD', level: 'driver', category: 'trade', frequency: 'weekly', importance: 4, description: 'Prix aux enchères GDT (Global Dairy Trade) — principal export néo-zélandais.' },

    { id: 'nzd_anz_business', name: 'ANZ Business NZ', fullName: 'ANZ Business Confidence New Zealand', country: 'NZ', currency: 'NZD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'Confiance des entreprises néo-zélandaises — indicateur avancé clé pour le NZD.' },
    { id: 'nzd_consumption', name: 'Consommation NZ', fullName: 'NZ Retail Sales', country: 'NZ', currency: 'NZD', level: 'signal', category: 'growth', frequency: 'quarterly', importance: 3, description: 'Ventes au détail néo-zélandaises (trimestrielles).' },
    { id: 'nzd_china_link', name: 'Lien Chine/NZD', fullName: 'China Economic Impact on NZD', country: 'NZ', currency: 'NZD', level: 'signal', category: 'trade', frequency: 'monthly', importance: 4, description: 'Impact de l\'activité économique chinoise sur le dollar néo-zélandais.' },
    { id: 'nzd_trade_balance', name: 'Balance Commerciale NZ', fullName: 'NZ Trade Balance', country: 'NZ', currency: 'NZD', level: 'signal', category: 'trade', frequency: 'monthly', importance: 3, description: 'Balance commerciale néo-zélandaise.' },

    { id: 'nzd_cpi_quarterly', name: 'CPI NZ (trim.)', fullName: 'New Zealand Quarterly CPI', country: 'NZ', currency: 'NZD', level: 'root', category: 'inflation', frequency: 'quarterly', importance: 5, description: 'CPI trimestriel NZ — ultra important pour la politique RBNZ.' },
    { id: 'nzd_rbnz_meeting', name: 'Réunion RBNZ', fullName: 'RBNZ Monetary Policy Statement', country: 'NZ', currency: 'NZD', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Décision de taux RBNZ + MPS (Monetary Policy Statement).' },
    { id: 'nzd_employment_change', name: 'Emploi NZ (trim.)', fullName: 'NZ Employment Change (Quarterly)', country: 'NZ', currency: 'NZD', level: 'root', category: 'employment', frequency: 'quarterly', importance: 5, description: 'Variation trimestrielle de l\'emploi néo-zélandais.' },
    { id: 'nzd_gdp', name: 'PIB NZ', fullName: 'New Zealand GDP (Quarterly)', country: 'NZ', currency: 'NZD', level: 'root', category: 'growth', frequency: 'quarterly', importance: 4, description: 'PIB néo-zélandais trimestriel.' },
    { id: 'nzd_gdt_auction', name: 'Enchères GDT', fullName: 'Global Dairy Trade Price Index', country: 'NZ', currency: 'NZD', level: 'root', category: 'trade', frequency: 'weekly', importance: 4, description: 'Résultats des enchères bimensuelles de produits laitiers GDT.' },

    // ================================================================
    // CAD — Canadian Dollar (BoC)
    // ================================================================

    { id: 'cad_direction', name: 'Direction CAD', fullName: 'Canadian Dollar Directional Bias', country: 'CA', currency: 'CAD', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final du CAD. Très corrélé au pétrole WTI.' },

    { id: 'cad_rate_differential', name: 'Diff. Taux CAD', fullName: 'CAD Interest Rate Differential', country: 'CA', currency: 'CAD', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel taux BoC vs autres (surtout vs Fed).' },
    { id: 'cad_risk_appetite', name: 'Risk-On CAD', fullName: 'CAD Risk-On Sensitivity', country: 'CA', currency: 'CAD', level: 'pillar', category: 'risk', frequency: 'event', importance: 3, description: 'Le CAD est modérément pro-risque. Moins sensible au risque que AUD/NZD.' },
    { id: 'cad_capital_flows', name: 'Flux Capitaux CAD', fullName: 'CAD Capital Flows (Oil Revenues)', country: 'CA', currency: 'CAD', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux de capitaux CAD. Revenus pétroliers = principal driver de flux.' },

    { id: 'cad_monetary_policy', name: 'Politique Monétaire BoC', fullName: 'Bank of Canada Monetary Policy', country: 'CA', currency: 'CAD', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions BoC : overnight rate, MPR (Monetary Policy Report), Macklem speeches.' },
    { id: 'cad_inflation', name: 'Inflation Canada', fullName: 'Canada Inflation Environment', country: 'CA', currency: 'CAD', level: 'driver', category: 'inflation', frequency: 'monthly', importance: 5, description: 'CPI canadien (headline + Core, Median, Trim, Common). Target BoC : 2%.' },
    { id: 'cad_labour_market', name: 'Emploi Canada', fullName: 'Canada Labour Market', country: 'CA', currency: 'CAD', level: 'driver', category: 'employment', frequency: 'monthly', importance: 5, description: 'Employment Change canadien (LFS) + taux de chômage.' },
    { id: 'cad_oil_exposure', name: 'Exposition Pétrole CAD', fullName: 'CAD Oil Price Sensitivity', country: 'CA', currency: 'CAD', level: 'driver', category: 'trade', frequency: 'weekly', importance: 5, description: 'Sensibilité du CAD aux prix du pétrole (Canada = 5ème exportateur mondial).' },
    { id: 'cad_growth', name: 'Croissance Canada', fullName: 'Canada Economic Growth', country: 'CA', currency: 'CAD', level: 'driver', category: 'growth', frequency: 'monthly', importance: 4, description: 'PIB canadien (mensuel), Ivey PMI.' },
    { id: 'cad_usd_trade', name: 'Commerce CAD/US', fullName: 'Canada-US Trade Relations', country: 'CA', currency: 'CAD', level: 'driver', category: 'trade', frequency: 'event', importance: 4, description: '75% des exports canadiens vont aux USA. Politiques commerciales US impactent fortement le CAD.' },

    { id: 'cad_pmi_ivey', name: 'Ivey PMI', fullName: 'Canada Ivey PMI', country: 'CA', currency: 'CAD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'Ivey PMI Canada — indicateur d\'activité économique.' },
    { id: 'cad_wages', name: 'Salaires Canada', fullName: 'Canada Average Hourly Wages', country: 'CA', currency: 'CAD', level: 'signal', category: 'inflation', frequency: 'monthly', importance: 3, description: 'Croissance des salaires horaires canadiens.' },
    { id: 'cad_consumption', name: 'Consommation Canada', fullName: 'Canada Retail Sales', country: 'CA', currency: 'CAD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Ventes au détail canadiennes.' },
    { id: 'cad_oil_link', name: 'Lien Pétrole/CAD', fullName: 'WTI Oil Price Impact on CAD', country: 'CA', currency: 'CAD', level: 'signal', category: 'trade', frequency: 'weekly', importance: 5, description: 'Impact direct du prix du WTI sur le dollar canadien.' },
    { id: 'cad_housing', name: 'Immobilier Canada', fullName: 'Canada Housing Market', country: 'CA', currency: 'CAD', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Prix immobiliers canadiens — sensibles aux taux BoC (endettement ménages élevé).' },
    { id: 'cad_trade_balance', name: 'Balance Commerciale CAD', fullName: 'Canada Trade Balance', country: 'CA', currency: 'CAD', level: 'signal', category: 'trade', frequency: 'monthly', importance: 3, description: 'Balance commerciale canadienne.' },

    { id: 'cad_employment_change', name: 'Emploi CAD (mensuel)', fullName: 'Canada Employment Change (LFS)', country: 'CA', currency: 'CAD', level: 'root', category: 'employment', frequency: 'monthly', importance: 5, description: 'Variation mensuelle de l\'emploi canadien (Labour Force Survey). News clé du CAD.' },
    { id: 'cad_boc_meeting', name: 'Réunion BoC', fullName: 'Bank of Canada Rate Decision', country: 'CA', currency: 'CAD', level: 'root', category: 'monetary', frequency: 'event', importance: 5, description: 'Décision de taux BoC.' },
    { id: 'cad_cpi', name: 'CPI Canada', fullName: 'Canada Consumer Price Index', country: 'CA', currency: 'CAD', level: 'root', category: 'inflation', frequency: 'monthly', importance: 5, description: 'CPI canadien + mesures core (Median, Trim, Common).' },
    { id: 'cad_gdp_monthly', name: 'PIB Canada (mensuel)', fullName: 'Canada Monthly GDP', country: 'CA', currency: 'CAD', level: 'root', category: 'growth', frequency: 'monthly', importance: 4, description: 'PIB mensuel canadien — indicateur avancé du PIB trimestriel.' },
    { id: 'cad_wti_spot', name: 'WTI Spot', fullName: 'WTI Crude Oil Spot Price', country: 'CA', currency: 'CAD', level: 'root', category: 'trade', frequency: 'weekly', importance: 5, description: 'Prix spot du WTI — corrélation directe avec le CAD.' },
    { id: 'cad_pmi_manufacturing', name: 'PMI Manuf. CAD', fullName: 'Canada Manufacturing PMI (S&P)', country: 'CA', currency: 'CAD', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'PMI Manufacturier canadien.' },

    // ================================================================
    // CHF — Swiss Franc (SNB)
    // ================================================================

    { id: 'chf_direction', name: 'Direction CHF', fullName: 'Swiss Franc Directional Bias', country: 'CH', currency: 'CHF', level: 'king', category: 'direction', frequency: 'event', importance: 5, description: 'Score directionnel final du CHF. Valeur refuge aux côtés du JPY.' },

    { id: 'chf_rate_differential', name: 'Diff. Taux CHF', fullName: 'CHF Interest Rate Differential', country: 'CH', currency: 'CHF', level: 'pillar', category: 'monetary', frequency: 'event', importance: 5, description: 'Différentiel taux SNB vs autres.' },
    { id: 'chf_risk_appetite', name: 'Safe-Haven CHF', fullName: 'CHF Safe-Haven Demand', country: 'CH', currency: 'CHF', level: 'pillar', category: 'risk', frequency: 'event', importance: 5, description: 'Le CHF est la deuxième valeur refuge après le JPY. VIX ↑ → CHF ↑.' },
    { id: 'chf_capital_flows', name: 'Flux Capitaux CHF', fullName: 'CHF Capital Flows (Safe-Haven)', country: 'CH', currency: 'CHF', level: 'pillar', category: 'flows', frequency: 'monthly', importance: 4, description: 'Flux de capitaux vers la Suisse en période de stress. SNB intervient souvent.' },

    { id: 'chf_monetary_policy', name: 'Politique Monétaire SNB', fullName: 'Swiss National Bank Monetary Policy', country: 'CH', currency: 'CHF', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Décisions SNB : policy rate, interventions FX, forward guidance.' },
    { id: 'chf_inflation', name: 'Inflation Suisse', fullName: 'Switzerland Inflation Environment', country: 'CH', currency: 'CHF', level: 'driver', category: 'inflation', frequency: 'monthly', importance: 4, description: 'CPI suisse. Target SNB : 0-2%, idéalement 1%. Inflation très basse historiquement.' },
    { id: 'chf_growth', name: 'Croissance Suisse', fullName: 'Switzerland Economic Growth', country: 'CH', currency: 'CHF', level: 'driver', category: 'growth', frequency: 'quarterly', importance: 4, description: 'PIB suisse (SECO), KOF Leading Indicator, PMI.' },
    { id: 'chf_snb_intervention', name: 'Intervention SNB', fullName: 'SNB FX Intervention Risk', country: 'CH', currency: 'CHF', level: 'driver', category: 'monetary', frequency: 'event', importance: 5, description: 'Risque d\'intervention de la SNB pour affaiblir le CHF trop fort.' },
    { id: 'chf_geopolitics', name: 'Géopolitique/CHF', fullName: 'Geopolitical Risk CHF Safe-Haven', country: 'CH', currency: 'CHF', level: 'driver', category: 'geopolitics', frequency: 'event', importance: 4, description: 'En période de tension géopolitique, le CHF s\'apprécie comme valeur refuge.' },
    { id: 'chf_eur_correlation', name: 'Corrélation EUR/CHF', fullName: 'EUR/CHF Rate Dynamics', country: 'CH', currency: 'CHF', level: 'driver', category: 'trade', frequency: 'weekly', importance: 4, description: 'La paire EUR/CHF influence fortement le CHF (80% du commerce suisse avec l\'UE).' },

    { id: 'chf_kof', name: 'KOF Leading Indicator', fullName: 'KOF Swiss Leading Indicator', country: 'CH', currency: 'CHF', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'KOF — indicateur avancé de la croissance suisse.' },
    { id: 'chf_pmi_composite', name: 'PMI Composite CHF', fullName: 'Switzerland procure.ch PMI', country: 'CH', currency: 'CHF', level: 'signal', category: 'growth', frequency: 'monthly', importance: 4, description: 'PMI suisse.' },
    { id: 'chf_consumption', name: 'Consommation CHF', fullName: 'Switzerland Retail Sales', country: 'CH', currency: 'CHF', level: 'signal', category: 'growth', frequency: 'monthly', importance: 3, description: 'Ventes au détail suisses.' },
    { id: 'chf_sight_deposits', name: 'Dépôts à Vue SNB', fullName: 'SNB Sight Deposits (Intervention Signal)', country: 'CH', currency: 'CHF', level: 'signal', category: 'monetary', frequency: 'weekly', importance: 4, description: 'Variation des dépôts à vue SNB — signal d\'intervention sur le FX.' },
    { id: 'chf_europe_stress', name: 'Stress Zone Euro', fullName: 'Eurozone Stress Impact on CHF', country: 'CH', currency: 'CHF', level: 'signal', category: 'risk', frequency: 'event', importance: 4, description: 'Stress de la zone euro → afflux de capitaux vers le CHF.' },

    { id: 'chf_cpi', name: 'CPI Suisse', fullName: 'Switzerland Consumer Price Index', country: 'CH', currency: 'CHF', level: 'root', category: 'inflation', frequency: 'monthly', importance: 4, description: 'CPI suisse. Inflation historiquement très basse.' },
    { id: 'chf_snb_meeting', name: 'Réunion SNB', fullName: 'SNB Quarterly Policy Assessment', country: 'CH', currency: 'CHF', level: 'root', category: 'monetary', frequency: 'quarterly', importance: 5, description: 'Évaluation trimestrielle de la politique SNB. Décision de taux.' },
    { id: 'chf_gdp', name: 'PIB Suisse', fullName: 'Switzerland GDP (SECO)', country: 'CH', currency: 'CHF', level: 'root', category: 'growth', frequency: 'quarterly', importance: 4, description: 'PIB trimestriel suisse (SECO).' },
    { id: 'chf_unemployment', higherIsBearish: true, name: 'Chômage Suisse', fullName: 'Switzerland Unemployment Rate', country: 'CH', currency: 'CHF', level: 'root', category: 'employment', frequency: 'monthly', importance: 3, description: 'Taux de chômage suisse (très bas, ~2-3%).' },
    { id: 'chf_trade_balance', name: 'Balance Commerciale CHF', fullName: 'Switzerland Trade Balance', country: 'CH', currency: 'CHF', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Balance commerciale suisse (excédent structurel).' },

    // ================================================================
    // SPECIAL INDICATORS — Currency-specific nodes (Phase 2)
    // ================================================================

    // JPY — Carry trade and Tokyo CPI
    { id: 'jpy_tokyo_cpi', name: 'Tokyo CPI', fullName: 'Tokyo Consumer Price Index (Monthly)', country: 'JP', currency: 'JPY', level: 'root', category: 'inflation', frequency: 'monthly', importance: 4, description: 'CPI de Tokyo — indicateur avancé du CPI national (publié 4 semaines avant). Suivi clé de la BoJ.' },
    { id: 'jpy_cot_net', name: 'COT JPY (CFTC)', fullName: 'CFTC COT JPY Net Speculative Positions', country: 'JP', currency: 'JPY', level: 'root', category: 'flows', frequency: 'weekly', importance: 3, description: 'Positions nettes spéculatives sur le JPY (CFTC). Mesure le carry trade en cours et le risque de débouclage.' },

    // GBP — London financial sector
    { id: 'gbp_city_financial', name: 'City of London', fullName: 'UK Financial Services PMI / City Activity', country: 'UK', currency: 'GBP', level: 'root', category: 'growth', frequency: 'monthly', importance: 3, description: 'Activité des services financiers de la City of London. L\'UK tire 12% de son PIB de la finance. Flux post-Brexit.' },

    // NZD — Fonterra farm gate milk price
    { id: 'nzd_fonterra_milk', name: 'Fonterra Prix Lait', fullName: 'Fonterra Farm Gate Milk Price (NZD/kgMS)', country: 'NZ', currency: 'NZD', level: 'root', category: 'trade', frequency: 'monthly', importance: 4, description: 'Prix du lait à la ferme Fonterra (coopérative NZ dominante). Impact direct sur les revenus des agriculteurs néo-zélandais.' },

    // AUD — RBA commodity price index
    { id: 'aud_rba_commodity', name: 'Indice Commodités RBA', fullName: 'RBA Index of Commodity Prices (ICP)', country: 'AU', currency: 'AUD', level: 'root', category: 'commodities', frequency: 'monthly', importance: 4, description: 'Indice composite des prix de matières premières australiennes (RBA). Couvre minerai fer, charbon, LNG — meilleur proxy des revenus export AUS.' },

    // CAD — Canadian crude oil production
    { id: 'cad_oil_production', name: 'Production Pétrole CA', fullName: 'Canada Crude Oil Production (EIA)', country: 'CA', currency: 'CAD', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Production de pétrole brut canadien (données EIA). Signale la capacité d\'export et les revenus futurs en CAD.' },

    // CHF — Swiss exports (pharma, watches)
    { id: 'chf_exports', name: 'Exportations Suisse', fullName: 'Switzerland Exports (Pharma, Watches)', country: 'CH', currency: 'CHF', level: 'root', category: 'trade', frequency: 'monthly', importance: 3, description: 'Exportations suisses (produits pharmaceutiques ~50%, montres ~10%). Signal de demande mondiale et de flux CHF.' },

    // EUR — BTP-Bund spread (fragmentation risk)
    { id: 'eur_btp_bund', name: 'Spread BTP-Bund', fullName: 'Italy-Germany 10Y Sovereign Spread', country: 'EU', currency: 'EUR', level: 'root', category: 'monetary', frequency: 'weekly', importance: 4, description: 'Écart de rendement entre les OATs italiens et les Bunds allemands. Risque de fragmentation de la zone euro — élargissement = bearish EUR.' },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Returns the indicators of a currency (plus the global ones) */
export function getIndicatorsByCurrency(currency: string): FundamentalIndicator[] {
    return FUNDAMENTAL_INDICATORS.filter(
        i => i.currency === currency || i.currency === 'GLOBAL'
    );
}

/** Returns the indicators of a given level */
export function getIndicatorsByLevel(level: IndicatorLevel): FundamentalIndicator[] {
    return FUNDAMENTAL_INDICATORS.filter(i => i.level === level);
}

/** Returns an indicator by id */
export function getIndicatorById(id: string): FundamentalIndicator | undefined {
    return FUNDAMENTAL_INDICATORS.find(i => i.id === id);
}

/** Ids of the King (direction) nodes per currency */
export const KING_IDS: Record<string, string> = {
    USD: 'usd_direction',
    EUR: 'eur_direction',
    GBP: 'gbp_direction',
    JPY: 'jpy_direction',
    AUD: 'aud_direction',
    NZD: 'nzd_direction',
    CAD: 'cad_direction',
    CHF: 'chf_direction',
};

/** Ids of the pillars per currency */
export const PILLAR_IDS: Record<string, string[]> = {
    USD: ['usd_rate_differential', 'usd_risk_appetite', 'usd_capital_flows'],
    EUR: ['eur_rate_differential', 'eur_risk_appetite', 'eur_capital_flows'],
    GBP: ['gbp_rate_differential', 'gbp_risk_appetite', 'gbp_capital_flows'],
    JPY: ['jpy_rate_differential', 'jpy_risk_appetite', 'jpy_capital_flows'],
    AUD: ['aud_rate_differential', 'aud_risk_appetite', 'aud_capital_flows'],
    NZD: ['nzd_rate_differential', 'nzd_risk_appetite', 'nzd_capital_flows'],
    CAD: ['cad_rate_differential', 'cad_risk_appetite', 'cad_capital_flows'],
    CHF: ['chf_rate_differential', 'chf_risk_appetite', 'chf_capital_flows'],
};
