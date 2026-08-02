// ================================================================
// PREDICTION RULES — Fundamental engine
// If [source indicator] prints [bullish/bearish] ->
// then [target indicator] will probably be [direction] within [delay]
// ================================================================

export type PredictionDirection = 'bullish' | 'bearish';

export interface PredictionRule {
    sourceIndicatorId: string;
    direction: PredictionDirection;
    targetIndicatorId: string;
    predictedDirection: PredictionDirection;
    confidence: 1 | 2 | 3 | 4 | 5;
    reason: string;
    delayLabel: string; // data values: "immédiat" | "~1 semaine" | "~2-3 semaines" | "~1 mois" | "avant la réunion"
}

export const PREDICTION_RULES: PredictionRule[] = [

    // ──────────────────────────── USD ────────────────────────────

    // NFP → ...
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_initial_claims',      predictedDirection: 'bullish', confidence: 4, reason: 'Emploi fort → moins de demandes de chômage', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_wages',               predictedDirection: 'bullish', confidence: 4, reason: 'Plus d\'emplois → pression haussière sur les salaires', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_consumption',         predictedDirection: 'bullish', confidence: 3, reason: 'Plus de revenus → plus de dépenses', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bullish', confidence: 3, reason: 'Emploi fort → consommateurs confiants', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_pmi_services',        predictedDirection: 'bullish', confidence: 3, reason: 'Emploi services fort → PMI soutenu', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_cpi',                 predictedDirection: 'bullish', confidence: 2, reason: 'Emploi → salaires → demande → prix (effet retardé)', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bullish', targetIndicatorId: 'usd_fomc',                predictedDirection: 'bullish', confidence: 4, reason: 'Emploi fort → Fed reste hawkish', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'usd_nfp', direction: 'bearish', targetIndicatorId: 'usd_initial_claims',      predictedDirection: 'bearish', confidence: 4, reason: 'Emploi faible → plus de demandes de chômage', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bearish', targetIndicatorId: 'usd_wages',               predictedDirection: 'bearish', confidence: 3, reason: 'Moins d\'emplois → moins de pression salariale', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bearish', targetIndicatorId: 'usd_consumption',         predictedDirection: 'bearish', confidence: 3, reason: 'Moins de revenus → moins de dépenses', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bearish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bearish', confidence: 4, reason: 'Emploi faible → inquiétude des ménages', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_nfp', direction: 'bearish', targetIndicatorId: 'usd_fomc',                predictedDirection: 'bearish', confidence: 4, reason: 'Emploi faible → Fed envisage des baisses', delayLabel: 'avant la réunion' },

    // CPI USD → ...
    { sourceIndicatorId: 'usd_cpi', direction: 'bullish', targetIndicatorId: 'usd_pce',                 predictedDirection: 'bullish', confidence: 5, reason: 'CPI et PCE mesurent la même inflation', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_cpi', direction: 'bullish', targetIndicatorId: 'usd_fomc',                predictedDirection: 'bullish', confidence: 5, reason: 'Inflation ↑ → Fed DOIT rester hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'usd_cpi', direction: 'bullish', targetIndicatorId: 'usd_consumption',         predictedDirection: 'bearish', confidence: 2, reason: 'Inflation ↑ → pouvoir d\'achat ↓', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_cpi', direction: 'bullish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bearish', confidence: 3, reason: 'Prix montent → mécontentement des ménages', delayLabel: '~2-3 semaines' },

    { sourceIndicatorId: 'usd_cpi', direction: 'bearish', targetIndicatorId: 'usd_pce',                 predictedDirection: 'bearish', confidence: 5, reason: 'Très corrélés — désinflation se propage', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_cpi', direction: 'bearish', targetIndicatorId: 'usd_fomc',                predictedDirection: 'bearish', confidence: 4, reason: 'Inflation ↓ → Fed peut baisser les taux', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'usd_cpi', direction: 'bearish', targetIndicatorId: 'usd_consumption',         predictedDirection: 'bullish', confidence: 2, reason: 'Pouvoir d\'achat ↑ → consommation soutenue', delayLabel: '~2-3 semaines' },

    // ISM Services USD → ...
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bullish', targetIndicatorId: 'usd_nfp',                 predictedDirection: 'bullish', confidence: 4, reason: 'Services en expansion → embauches à venir', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bullish', targetIndicatorId: 'usd_consumption',         predictedDirection: 'bullish', confidence: 3, reason: 'Activité forte → revenus → dépenses', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bullish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bullish', confidence: 3, reason: 'Économie forte → confiance des consommateurs', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bullish', targetIndicatorId: 'usd_cpi',                 predictedDirection: 'bullish', confidence: 2, reason: 'Demande forte → pression sur les prix', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bullish', targetIndicatorId: 'usd_jolts',               predictedDirection: 'bullish', confidence: 3, reason: 'Expansion → plus d\'offres d\'emploi', delayLabel: '~2-3 semaines' },

    { sourceIndicatorId: 'usd_pmi_services', direction: 'bearish', targetIndicatorId: 'usd_nfp',                 predictedDirection: 'bearish', confidence: 4, reason: 'Contraction services → licenciements à venir', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bearish', targetIndicatorId: 'usd_consumption',         predictedDirection: 'bearish', confidence: 3, reason: 'Activité faible → consommation ↓', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bearish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bearish', confidence: 4, reason: 'Services = 80% économie → inquiétude', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bearish', targetIndicatorId: 'usd_fomc',                predictedDirection: 'bearish', confidence: 4, reason: 'Contraction → Fed doit soutenir', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'usd_pmi_services', direction: 'bearish', targetIndicatorId: 'usd_initial_claims',      predictedDirection: 'bearish', confidence: 3, reason: 'Contraction → licenciements → claims ↑', delayLabel: '~2-3 semaines' },

    // Retail Sales USD → ...
    { sourceIndicatorId: 'usd_consumption', direction: 'bullish', targetIndicatorId: 'usd_cpi',                 predictedDirection: 'bullish', confidence: 3, reason: 'Demande forte → pression sur les prix', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_consumption', direction: 'bullish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bullish', confidence: 3, reason: 'Les gens dépensent → signal de confiance', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_consumption', direction: 'bullish', targetIndicatorId: 'usd_pmi_services',        predictedDirection: 'bullish', confidence: 3, reason: 'Consommation forte → services tournent', delayLabel: '~2-3 semaines' },

    { sourceIndicatorId: 'usd_consumption', direction: 'bearish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bearish', confidence: 4, reason: 'Les gens ne dépensent pas → signal négatif', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_consumption', direction: 'bearish', targetIndicatorId: 'usd_pmi_services',        predictedDirection: 'bearish', confidence: 3, reason: 'Consommation faible → services ralentissent', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_consumption', direction: 'bearish', targetIndicatorId: 'usd_fomc',                predictedDirection: 'bearish', confidence: 3, reason: 'Conso faible → Fed pourrait stimuler', delayLabel: 'avant la réunion' },

    // FOMC → ...
    { sourceIndicatorId: 'usd_fomc', direction: 'bullish', targetIndicatorId: 'usd_cpi',  predictedDirection: 'bullish', confidence: 2, reason: 'Fed hawkish = elle voit l\'inflation persistante', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_fomc', direction: 'bullish', targetIndicatorId: 'usd_nfp',  predictedDirection: 'bullish', confidence: 2, reason: 'Fed hawkish = emploi solide (condition maintenue)', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_fomc', direction: 'bearish', targetIndicatorId: 'usd_nfp',          predictedDirection: 'bearish', confidence: 2, reason: 'Fed dovish = anticipe un affaiblissement emploi', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_fomc', direction: 'bearish', targetIndicatorId: 'usd_initial_claims', predictedDirection: 'bearish', confidence: 2, reason: 'Fed dovish = anticipe un ralentissement économique', delayLabel: '~2-3 semaines' },

    // PCE → ...
    { sourceIndicatorId: 'usd_pce', direction: 'bullish', targetIndicatorId: 'usd_cpi',  predictedDirection: 'bullish', confidence: 5, reason: 'PCE et CPI mesurent la même inflation, PCE sort avant', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_pce', direction: 'bullish', targetIndicatorId: 'usd_fomc', predictedDirection: 'bullish', confidence: 4, reason: 'Inflation PCE ↑ → Fed hawkish confirmé', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'usd_pce', direction: 'bearish', targetIndicatorId: 'usd_cpi',  predictedDirection: 'bearish', confidence: 5, reason: 'Désinflation PCE précède le CPI', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_pce', direction: 'bearish', targetIndicatorId: 'usd_fomc', predictedDirection: 'bearish', confidence: 4, reason: 'Désinflation → Fed peut assouplir', delayLabel: 'avant la réunion' },

    // JOLTS → ...
    { sourceIndicatorId: 'usd_jolts', direction: 'bullish', targetIndicatorId: 'usd_nfp',  predictedDirection: 'bullish', confidence: 4, reason: 'Offres emploi élevées → embauches NFP solides', delayLabel: '~1 semaine' },
    { sourceIndicatorId: 'usd_jolts', direction: 'bearish', targetIndicatorId: 'usd_nfp', predictedDirection: 'bearish', confidence: 4, reason: 'Offres emploi faibles → NFP décevant probable', delayLabel: '~1 semaine' },

    // Initial Claims → ...
    { sourceIndicatorId: 'usd_initial_claims', direction: 'bullish', targetIndicatorId: 'usd_nfp', predictedDirection: 'bullish', confidence: 4, reason: 'Claims bas = emploi stable → NFP fort', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_initial_claims', direction: 'bearish', targetIndicatorId: 'usd_nfp', predictedDirection: 'bearish', confidence: 4, reason: 'Claims élevés = licenciements → NFP décevant', delayLabel: '~2-3 semaines' },

    // USD wages -> ...
    { sourceIndicatorId: 'usd_wages', direction: 'bullish', targetIndicatorId: 'usd_cpi',         predictedDirection: 'bullish', confidence: 3, reason: 'Salaires ↑ → coûts entreprises → prix ↑', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'usd_wages', direction: 'bullish', targetIndicatorId: 'usd_consumption', predictedDirection: 'bullish', confidence: 3, reason: 'Plus de revenus → plus de dépenses', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'usd_wages', direction: 'bullish', targetIndicatorId: 'usd_fomc',        predictedDirection: 'bullish', confidence: 3, reason: 'Salaires ↑ = pression inflationniste → Fed hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'usd_wages', direction: 'bearish', targetIndicatorId: 'usd_cpi',         predictedDirection: 'bearish', confidence: 3, reason: 'Salaires stagnent → moins de pression sur les prix', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'usd_wages', direction: 'bearish', targetIndicatorId: 'usd_fomc',        predictedDirection: 'bearish', confidence: 3, reason: 'Salaires faibles → pression inflationniste ↓ → Fed dovish', delayLabel: 'avant la réunion' },

    // PMI Manufacturing USD → ...
    { sourceIndicatorId: 'usd_pmi_manufacturing', direction: 'bullish', targetIndicatorId: 'usd_nfp', predictedDirection: 'bullish', confidence: 3, reason: 'Industrie en expansion → embauches dans le secteur', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'usd_pmi_manufacturing', direction: 'bearish', targetIndicatorId: 'usd_nfp', predictedDirection: 'bearish', confidence: 3, reason: 'Industrie en contraction → licenciements secteur manufacturier', delayLabel: '~1 mois' },

    // ──────────────────────────── OIL (GLOBAL) ────────────────────────────

    { sourceIndicatorId: 'global_oil', direction: 'bullish', targetIndicatorId: 'usd_cpi',             predictedDirection: 'bullish', confidence: 4, reason: 'Pétrole ↑ → prix à la pompe ↑ → CPI énergie ↑', delayLabel: '~3-4 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bullish', targetIndicatorId: 'eur_hicp',            predictedDirection: 'bullish', confidence: 4, reason: 'Pétrole ↑ → HICP zone euro ↑ (UE importatrice)', delayLabel: '~3-4 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bullish', targetIndicatorId: 'cad_cpi',             predictedDirection: 'bullish', confidence: 3, reason: 'Pétrole ↑ → CPI Canada ↑ (exportateur)', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bullish', targetIndicatorId: 'usd_consumption',     predictedDirection: 'bearish', confidence: 2, reason: 'Essence chère → moins de budget pour le reste', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bullish', targetIndicatorId: 'usd_consumer_confidence', predictedDirection: 'bearish', confidence: 3, reason: 'Prix pompe visibles → moral des consommateurs ↓', delayLabel: '~2-3 semaines' },

    { sourceIndicatorId: 'global_oil', direction: 'bearish', targetIndicatorId: 'usd_cpi',             predictedDirection: 'bearish', confidence: 4, reason: 'Pétrole ↓ → CPI énergie ↓', delayLabel: '~3-4 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bearish', targetIndicatorId: 'eur_hicp',            predictedDirection: 'bearish', confidence: 4, reason: 'Pétrole ↓ → HICP zone euro ↓', delayLabel: '~3-4 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bearish', targetIndicatorId: 'cad_cpi',             predictedDirection: 'bearish', confidence: 3, reason: 'Pétrole ↓ → revenus pétrole Canada ↓ → CPI ↓', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'global_oil', direction: 'bearish', targetIndicatorId: 'usd_consumption',     predictedDirection: 'bullish', confidence: 2, reason: 'Essence moins chère → plus de budget disponible', delayLabel: '~2-3 semaines' },

    // ──────────────────────────── EUR ────────────────────────────

    // HICP EUR → ...
    { sourceIndicatorId: 'eur_hicp', direction: 'bullish', targetIndicatorId: 'eur_ecb_meeting',       predictedDirection: 'bullish', confidence: 5, reason: 'HICP ↑ → BCE sous pression pour rester hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_hicp', direction: 'bullish', targetIndicatorId: 'eur_pmi_composite',     predictedDirection: 'bearish', confidence: 2, reason: 'Inflation ↑ → pouvoir d\'achat ↓ → PMI services ↓', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'eur_hicp', direction: 'bearish', targetIndicatorId: 'eur_ecb_meeting',       predictedDirection: 'bearish', confidence: 4, reason: 'HICP ↓ → BCE peut baisser les taux', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_hicp', direction: 'bearish', targetIndicatorId: 'eur_pmi_composite',     predictedDirection: 'bullish', confidence: 2, reason: 'Désinflation → pouvoir d\'achat ↑ → activité soutenue', delayLabel: '~1 mois' },

    // German IFO -> ...
    { sourceIndicatorId: 'eur_german_ifo', direction: 'bullish', targetIndicatorId: 'eur_pmi_composite', predictedDirection: 'bullish', confidence: 4, reason: 'IFO Allemagne anticipe le PMI composite zone euro', delayLabel: '~1 semaine' },
    { sourceIndicatorId: 'eur_german_ifo', direction: 'bearish', targetIndicatorId: 'eur_pmi_composite', predictedDirection: 'bearish', confidence: 4, reason: 'IFO déprimé → PMI composite zone euro décevant', delayLabel: '~1 semaine' },

    // ZEW → ...
    { sourceIndicatorId: 'eur_zew', direction: 'bullish', targetIndicatorId: 'eur_pmi_composite', predictedDirection: 'bullish', confidence: 3, reason: 'ZEW positif anticipe le PMI composite', delayLabel: '~1 semaine' },
    { sourceIndicatorId: 'eur_zew', direction: 'bearish', targetIndicatorId: 'eur_pmi_composite', predictedDirection: 'bearish', confidence: 3, reason: 'ZEW négatif → PMI composite décevant', delayLabel: '~1 semaine' },

    // PMI Composite EUR → ...
    { sourceIndicatorId: 'eur_pmi_composite', direction: 'bullish', targetIndicatorId: 'eur_hicp',       predictedDirection: 'bullish', confidence: 2, reason: 'Activité forte → pression sur les prix', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'eur_pmi_composite', direction: 'bullish', targetIndicatorId: 'eur_ecb_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Économie forte → BCE peut maintenir taux élevés', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_pmi_composite', direction: 'bearish', targetIndicatorId: 'eur_ecb_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Contraction → BCE doit soutenir l\'économie', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_pmi_composite', direction: 'bearish', targetIndicatorId: 'eur_hicp',        predictedDirection: 'bearish', confidence: 2, reason: 'Ralentissement → pression prix ↓', delayLabel: '~1 mois' },

    // ──────────────────────────── GBP ────────────────────────────

    { sourceIndicatorId: 'gbp_wages', direction: 'bullish', targetIndicatorId: 'gbp_cpi',         predictedDirection: 'bullish', confidence: 4, reason: 'Salaires UK ↑ → services CPI → inflation persistante', delayLabel: '~2-3 mois' },
    { sourceIndicatorId: 'gbp_wages', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Salaires forts = pression inflationniste → BoE hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'gbp_wages', direction: 'bearish', targetIndicatorId: 'gbp_cpi',         predictedDirection: 'bearish', confidence: 3, reason: 'Salaires faibles → moins de pression sur les services CPI', delayLabel: '~2-3 mois' },
    { sourceIndicatorId: 'gbp_wages', direction: 'bearish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Salaires faibles → pression inflationniste ↓ → BoE dovish', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'gbp_claimant_count', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Plus de chômeurs → marché emploi UK se dégrade → BoE dovish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'gbp_claimant_count', direction: 'bearish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Moins de chômeurs → emploi UK fort → BoE peut rester ferme', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'gbp_cpi', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 5, reason: 'CPI UK ↑ → BoE sous pression pour rester hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'gbp_cpi', direction: 'bearish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'CPI UK ↓ → BoE peut baisser les taux', delayLabel: 'avant la réunion' },

    // ──────────────────────────── JPY ────────────────────────────

    { sourceIndicatorId: 'jpy_wages', direction: 'bullish', targetIndicatorId: 'jpy_cpi',         predictedDirection: 'bullish', confidence: 4, reason: 'Salaires Shunto ↑ → inflation services Japon', delayLabel: '~2-3 mois' },
    { sourceIndicatorId: 'jpy_wages', direction: 'bullish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'Salaires forts → BoJ peut normaliser sa politique', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'jpy_wages', direction: 'bearish', targetIndicatorId: 'jpy_cpi',         predictedDirection: 'bearish', confidence: 3, reason: 'Salaires stagnent → inflation services limitée', delayLabel: '~2-3 mois' },
    { sourceIndicatorId: 'jpy_wages', direction: 'bearish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Salaires faibles → BoJ reste accommodant', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'jpy_cpi', direction: 'bullish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'CPI JP durable → BoJ normalise sa politique', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'jpy_cpi', direction: 'bearish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'CPI JP ↓ → BoJ maintient politique ultra-accommodante', delayLabel: 'avant la réunion' },

    // ──────────────────────────── AUD ────────────────────────────

    { sourceIndicatorId: 'global_china_pmi', direction: 'bullish', targetIndicatorId: 'aud_iron_ore',          predictedDirection: 'bullish', confidence: 4, reason: 'PMI Chine ↑ → demande minerai de fer australien ↑', delayLabel: '~1 semaine' },
    { sourceIndicatorId: 'global_china_pmi', direction: 'bullish', targetIndicatorId: 'aud_employment_change', predictedDirection: 'bullish', confidence: 3, reason: 'Activité Chine forte → exportations AUS → emploi ↑', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'global_china_pmi', direction: 'bearish', targetIndicatorId: 'aud_iron_ore',          predictedDirection: 'bearish', confidence: 4, reason: 'PMI Chine ↓ → moins de demande minerai fer', delayLabel: '~1 semaine' },
    { sourceIndicatorId: 'global_china_pmi', direction: 'bearish', targetIndicatorId: 'aud_employment_change', predictedDirection: 'bearish', confidence: 3, reason: 'Chine ralentit → exportations AUS ↓ → emploi sous pression', delayLabel: '~1 mois' },

    { sourceIndicatorId: 'aud_employment_change', direction: 'bullish', targetIndicatorId: 'aud_rba_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'Emploi AUS fort = facteur déterminant pour la RBA hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'aud_employment_change', direction: 'bullish', targetIndicatorId: 'aud_cpi_quarterly',         predictedDirection: 'bullish', confidence: 2, reason: 'Emploi fort → salaires → demande → prix', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'aud_employment_change', direction: 'bearish', targetIndicatorId: 'aud_rba_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Emploi AUS faible → RBA dovish probable', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'aud_cpi_quarterly', direction: 'bullish', targetIndicatorId: 'aud_rba_meeting', predictedDirection: 'bullish', confidence: 5, reason: 'CPI AUS ↑ → RBA doit rester hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'aud_cpi_quarterly', direction: 'bearish', targetIndicatorId: 'aud_rba_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'CPI AUS ↓ → RBA peut baisser les taux', delayLabel: 'avant la réunion' },

    // ──────────────────────────── NZD ────────────────────────────

    { sourceIndicatorId: 'nzd_gdt_auction', direction: 'bullish', targetIndicatorId: 'nzd_cpi_quarterly', predictedDirection: 'bullish', confidence: 3, reason: 'Prix laitiers ↑ → composante exports → CPI NZ ↑', delayLabel: '~1 trimestre' },
    { sourceIndicatorId: 'nzd_gdt_auction', direction: 'bullish', targetIndicatorId: 'nzd_rbnz_meeting',  predictedDirection: 'bullish', confidence: 2, reason: 'Termes d\'échange NZ ↑ → RBNZ moins pressé de baisser', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'nzd_gdt_auction', direction: 'bearish', targetIndicatorId: 'nzd_cpi_quarterly', predictedDirection: 'bearish', confidence: 3, reason: 'Prix laitiers ↓ → revenus exports → pression déflationniste', delayLabel: '~1 trimestre' },
    { sourceIndicatorId: 'nzd_gdt_auction', direction: 'bearish', targetIndicatorId: 'nzd_rbnz_meeting',  predictedDirection: 'bearish', confidence: 2, reason: 'Termes d\'échange NZ ↓ → RBNZ sous pression pour baisser', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'nzd_cpi_quarterly', direction: 'bullish', targetIndicatorId: 'nzd_rbnz_meeting', predictedDirection: 'bullish', confidence: 5, reason: 'CPI NZ ↑ → RBNZ hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'nzd_cpi_quarterly', direction: 'bearish', targetIndicatorId: 'nzd_rbnz_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'CPI NZ ↓ → RBNZ dovish', delayLabel: 'avant la réunion' },

    // ──────────────────────────── CAD ────────────────────────────

    { sourceIndicatorId: 'cad_employment_change', direction: 'bullish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'Emploi CAD fort = facteur clé BoC hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'cad_employment_change', direction: 'bullish', targetIndicatorId: 'cad_cpi',         predictedDirection: 'bullish', confidence: 2, reason: 'Emploi fort → salaires → demande → prix', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'cad_employment_change', direction: 'bearish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Emploi CAD faible → BoC dovish', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'cad_cpi', direction: 'bullish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bullish', confidence: 5, reason: 'CPI Canada ↑ → BoC doit rester hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'cad_cpi', direction: 'bearish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'CPI Canada ↓ → BoC peut baisser les taux', delayLabel: 'avant la réunion' },

    { sourceIndicatorId: 'cad_wti_spot', direction: 'bullish', targetIndicatorId: 'cad_cpi',         predictedDirection: 'bullish', confidence: 4, reason: 'WTI ↑ → composante énergie CPI Canada ↑', delayLabel: '~3-4 semaines' },
    { sourceIndicatorId: 'cad_wti_spot', direction: 'bullish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Pétrole ↑ → économie canadienne soutenue → BoC moins dovish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'cad_wti_spot', direction: 'bearish', targetIndicatorId: 'cad_cpi',         predictedDirection: 'bearish', confidence: 4, reason: 'WTI ↓ → CPI énergie Canada ↓', delayLabel: '~3-4 semaines' },
    { sourceIndicatorId: 'cad_wti_spot', direction: 'bearish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'Pétrole ↓ → économie canadienne sous pression → BoC dovish', delayLabel: 'avant la réunion' },

    // Canada GDP -> BoC
    { sourceIndicatorId: 'cad_gdp_monthly', direction: 'bullish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Croissance CA ↑ → BoC peut maintenir les taux élevés', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'cad_gdp_monthly', direction: 'bearish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Croissance CA faible → BoC dovish probable', delayLabel: 'avant la réunion' },

    // Ivey PMI → BoC
    { sourceIndicatorId: 'cad_pmi_ivey', direction: 'bullish', targetIndicatorId: 'cad_boc_meeting',     predictedDirection: 'bullish', confidence: 3, reason: 'Ivey PMI ↑ → économie CA en expansion → BoC hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'cad_pmi_ivey', direction: 'bullish', targetIndicatorId: 'cad_employment_change', predictedDirection: 'bullish', confidence: 3, reason: 'Activité économique CA ↑ → embauches à venir', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'cad_pmi_ivey', direction: 'bearish', targetIndicatorId: 'cad_boc_meeting',     predictedDirection: 'bearish', confidence: 3, reason: 'Ivey PMI ↓ → ralentissement CA → BoC dovish', delayLabel: 'avant la réunion' },

    // Retail Sales CAD → BoC
    { sourceIndicatorId: 'cad_consumption', direction: 'bullish', targetIndicatorId: 'cad_cpi',         predictedDirection: 'bullish', confidence: 2, reason: 'Consommation CA ↑ → demande → prix à la consommation ↑', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'cad_consumption', direction: 'bullish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Consommation solide → BoC moins enclin à baisser', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'cad_consumption', direction: 'bearish', targetIndicatorId: 'cad_boc_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'Consommation faible → BoC dovish', delayLabel: 'avant la réunion' },

    // ──────────────────────────── EUR (additional) ────────────────────────────

    // EUR Services PMI -> ECB
    { sourceIndicatorId: 'eur_pmi_services', direction: 'bullish', targetIndicatorId: 'eur_ecb_meeting',     predictedDirection: 'bullish', confidence: 4, reason: 'PMI Services EUR ↑ → BCE peut maintenir les taux', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_pmi_services', direction: 'bullish', targetIndicatorId: 'eur_hicp',             predictedDirection: 'bullish', confidence: 3, reason: 'Activité services ↑ → inflation services persistante', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'eur_pmi_services', direction: 'bearish', targetIndicatorId: 'eur_ecb_meeting',     predictedDirection: 'bearish', confidence: 4, reason: 'PMI Services EUR ↓ → BCE dovish probable', delayLabel: 'avant la réunion' },

    // EUR Mfg PMI -> ECB
    { sourceIndicatorId: 'eur_pmi_manufacturing', direction: 'bullish', targetIndicatorId: 'eur_ecb_meeting',   predictedDirection: 'bullish', confidence: 3, reason: 'Industrie EUR ↑ → reprise économique → BCE moins dovish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_pmi_manufacturing', direction: 'bullish', targetIndicatorId: 'eur_pmi_composite', predictedDirection: 'bullish', confidence: 4, reason: 'Mfg ↑ tire le composite vers le haut', delayLabel: '~1 semaine' },
    { sourceIndicatorId: 'eur_pmi_manufacturing', direction: 'bearish', targetIndicatorId: 'eur_ecb_meeting',   predictedDirection: 'bearish', confidence: 3, reason: 'Contraction industrie EUR → BCE dovish', delayLabel: 'avant la réunion' },

    // EUR unemployment -> ECB
    { sourceIndicatorId: 'eur_unemployment', direction: 'bullish', targetIndicatorId: 'eur_ecb_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Chômage EUR ↓ (bullish = emploi ↑) → BCE moins pressée de baisser', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'eur_unemployment', direction: 'bullish', targetIndicatorId: 'eur_wages',       predictedDirection: 'bullish', confidence: 3, reason: 'Emploi fort → négociations salariales favorables', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'eur_unemployment', direction: 'bearish', targetIndicatorId: 'eur_ecb_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Chômage EUR ↑ → BCE dovish', delayLabel: 'avant la réunion' },

    // ──────────────────────────── GBP (additional) ────────────────────────────

    // UK GDP -> BoE
    { sourceIndicatorId: 'gbp_gdp', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'Croissance UK ↑ → BoE peut maintenir les taux', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'gbp_gdp', direction: 'bullish', targetIndicatorId: 'gbp_cpi',         predictedDirection: 'bullish', confidence: 2, reason: 'Croissance ↑ → demande → pression inflationniste légère', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'gbp_gdp', direction: 'bearish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Croissance UK faible → BoE dovish probable', delayLabel: 'avant la réunion' },

    // PMI Services UK → BoE
    { sourceIndicatorId: 'gbp_pmi_services', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'PMI Services UK ↑ → économie solide → BoE hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'gbp_pmi_services', direction: 'bullish', targetIndicatorId: 'gbp_cpi',         predictedDirection: 'bullish', confidence: 3, reason: 'Services en expansion → inflation services persistante (>5% UK)', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'gbp_pmi_services', direction: 'bearish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'PMI Services UK ↓ → BoE dovish', delayLabel: 'avant la réunion' },

    // UK Mfg PMI -> UK GDP
    { sourceIndicatorId: 'gbp_pmi_manufacturing', direction: 'bullish', targetIndicatorId: 'gbp_gdp',         predictedDirection: 'bullish', confidence: 3, reason: 'Industrie UK ↑ → contribution positive au PIB', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'gbp_pmi_manufacturing', direction: 'bearish', targetIndicatorId: 'gbp_gdp',         predictedDirection: 'bearish', confidence: 3, reason: 'Contraction industrie UK → PIB sous pression', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'gbp_pmi_manufacturing', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Reprise industrielle UK → BoE moins dovish', delayLabel: 'avant la réunion' },

    // Retail Sales UK → BoE
    { sourceIndicatorId: 'gbp_consumption', direction: 'bullish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Consommation UK ↑ → demande intérieure solide → BoE hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'gbp_consumption', direction: 'bullish', targetIndicatorId: 'gbp_cpi',         predictedDirection: 'bullish', confidence: 2, reason: 'Dépenses ↑ → demande → prix UK ↑', delayLabel: '~2-3 semaines' },
    { sourceIndicatorId: 'gbp_consumption', direction: 'bearish', targetIndicatorId: 'gbp_boe_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Consommation UK faible → BoE dovish', delayLabel: 'avant la réunion' },

    // ──────────────────────────── JPY (additional) ────────────────────────────

    // Tankan → BoJ
    { sourceIndicatorId: 'jpy_tankan', direction: 'bullish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bullish', confidence: 5, reason: 'Tankan ↑ → grandes entreprises optimistes → BoJ peut normaliser', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'jpy_tankan', direction: 'bullish', targetIndicatorId: 'jpy_wages',       predictedDirection: 'bullish', confidence: 3, reason: 'Entreprises prospères → pression salariale Shunto à la hausse', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'jpy_tankan', direction: 'bearish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Tankan ↓ → BoJ reste ultra-accommodant', delayLabel: 'avant la réunion' },

    // JPY trade balance -> BoJ
    { sourceIndicatorId: 'jpy_trade_balance', direction: 'bullish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Excédent commercial JP ↑ → soutien macroéconomique pour BoJ', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'jpy_trade_balance', direction: 'bearish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'Déficit commercial JP → faiblesse économique → BoJ accommodant', delayLabel: 'avant la réunion' },

    // PMI JPY → BoJ
    { sourceIndicatorId: 'jpy_pmi_manufacturing', direction: 'bullish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'PMI Mfg Japon ↑ → reprise industrielle → BoJ normalise', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'jpy_pmi_manufacturing', direction: 'bearish', targetIndicatorId: 'jpy_boj_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'PMI Mfg Japon ↓ → BoJ reste accommodant', delayLabel: 'avant la réunion' },

    // ──────────────────────────── AUD (additional) ────────────────────────────

    // AUS trade balance -> RBA
    { sourceIndicatorId: 'aud_trade_balance', direction: 'bullish', targetIndicatorId: 'aud_rba_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Excédent commercial AUS ↑ → termes échange favorables → RBA hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'aud_trade_balance', direction: 'bearish', targetIndicatorId: 'aud_rba_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'Balance commerciale AUS détériorée → RBA dovish', delayLabel: 'avant la réunion' },

    // NAB Business AUS → RBA
    { sourceIndicatorId: 'aud_nab_business', direction: 'bullish', targetIndicatorId: 'aud_rba_meeting',    predictedDirection: 'bullish', confidence: 3, reason: 'Confiance NAB ↑ → économie australienne solide → RBA hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'aud_nab_business', direction: 'bullish', targetIndicatorId: 'aud_employment_change', predictedDirection: 'bullish', confidence: 3, reason: 'Confiance entreprises ↑ → embauches à venir', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'aud_nab_business', direction: 'bearish', targetIndicatorId: 'aud_rba_meeting',    predictedDirection: 'bearish', confidence: 3, reason: 'Confiance NAB ↓ → RBA dovish probable', delayLabel: 'avant la réunion' },

    // ──────────────────────────── NZD (additional) ────────────────────────────

    // NZ employment -> RBNZ
    { sourceIndicatorId: 'nzd_employment_change', direction: 'bullish', targetIndicatorId: 'nzd_rbnz_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'Emploi NZ fort → RBNZ hawkish probable', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'nzd_employment_change', direction: 'bullish', targetIndicatorId: 'nzd_cpi_quarterly', predictedDirection: 'bullish', confidence: 2, reason: 'Emploi ↑ → salaires → demande → prix NZ', delayLabel: '~1 trimestre' },
    { sourceIndicatorId: 'nzd_employment_change', direction: 'bearish', targetIndicatorId: 'nzd_rbnz_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Emploi NZ faible → RBNZ dovish', delayLabel: 'avant la réunion' },

    // NZ GDP -> RBNZ
    { sourceIndicatorId: 'nzd_gdp', direction: 'bullish', targetIndicatorId: 'nzd_rbnz_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Croissance NZ ↑ → RBNZ peut maintenir les taux', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'nzd_gdp', direction: 'bearish', targetIndicatorId: 'nzd_rbnz_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Récession NZ → RBNZ dovish certain', delayLabel: 'avant la réunion' },

    // ANZ Business NZ → RBNZ
    { sourceIndicatorId: 'nzd_anz_business', direction: 'bullish', targetIndicatorId: 'nzd_rbnz_meeting',    predictedDirection: 'bullish', confidence: 3, reason: 'Confiance ANZ ↑ → économie NZ en reprise → RBNZ hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'nzd_anz_business', direction: 'bullish', targetIndicatorId: 'nzd_employment_change', predictedDirection: 'bullish', confidence: 3, reason: 'Entreprises optimistes → embauches NZ à venir', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'nzd_anz_business', direction: 'bearish', targetIndicatorId: 'nzd_rbnz_meeting',    predictedDirection: 'bearish', confidence: 3, reason: 'Confiance ANZ ↓ → RBNZ dovish', delayLabel: 'avant la réunion' },

    // ──────────────────────────── CHF ────────────────────────────

    // Swiss CPI -> SNB
    { sourceIndicatorId: 'chf_cpi', direction: 'bullish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bullish', confidence: 4, reason: 'Inflation CH ↑ → SNB moins encline à baisser les taux', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'chf_cpi', direction: 'bearish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bearish', confidence: 4, reason: 'Désinflation CH → SNB peut baisser les taux ou intervenir', delayLabel: 'avant la réunion' },

    // Swiss GDP -> SNB
    { sourceIndicatorId: 'chf_gdp', direction: 'bullish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Croissance CH solide → SNB peut maintenir sa politique', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'chf_gdp', direction: 'bullish', targetIndicatorId: 'chf_cpi',         predictedDirection: 'bullish', confidence: 2, reason: 'Croissance CH ↑ → demande intérieure → légère pression sur les prix', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'chf_gdp', direction: 'bearish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Croissance CH faible → SNB accommodante', delayLabel: 'avant la réunion' },

    // KOF -> CHF GDP
    { sourceIndicatorId: 'chf_kof', direction: 'bullish', targetIndicatorId: 'chf_gdp',         predictedDirection: 'bullish', confidence: 4, reason: 'KOF suisse ↑ → indicateur avancé de reprise économique CH', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'chf_kof', direction: 'bullish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'KOF ↑ → économie CH saine → SNB moins dovish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'chf_kof', direction: 'bearish', targetIndicatorId: 'chf_gdp',         predictedDirection: 'bearish', confidence: 4, reason: 'KOF suisse ↓ → ralentissement économique CH à venir', delayLabel: '~1-2 mois' },
    { sourceIndicatorId: 'chf_kof', direction: 'bearish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'KOF ↓ → SNB dovish probable', delayLabel: 'avant la réunion' },

    // CHF PMI -> GDP
    { sourceIndicatorId: 'chf_pmi_composite', direction: 'bullish', targetIndicatorId: 'chf_gdp',         predictedDirection: 'bullish', confidence: 3, reason: 'PMI CH ↑ → expansion économique suisse', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'chf_pmi_composite', direction: 'bullish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Activité CH ↑ → SNB hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'chf_pmi_composite', direction: 'bearish', targetIndicatorId: 'chf_gdp',         predictedDirection: 'bearish', confidence: 3, reason: 'PMI CH ↓ → contraction économique suisse', delayLabel: '~1 mois' },
    { sourceIndicatorId: 'chf_pmi_composite', direction: 'bearish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'PMI CH ↓ → SNB dovish', delayLabel: 'avant la réunion' },

    // Swiss unemployment -> SNB
    { sourceIndicatorId: 'chf_unemployment', direction: 'bullish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bullish', confidence: 3, reason: 'Chômage CH ↓ (bullish = emploi ↑) → SNB hawkish', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'chf_unemployment', direction: 'bearish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bearish', confidence: 3, reason: 'Chômage CH ↑ → SNB dovish', delayLabel: 'avant la réunion' },

    // Swiss trade balance -> SNB
    { sourceIndicatorId: 'chf_trade_balance', direction: 'bullish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bullish', confidence: 2, reason: 'Excédent commercial CH ↑ → économie suisse solide', delayLabel: 'avant la réunion' },
    { sourceIndicatorId: 'chf_trade_balance', direction: 'bearish', targetIndicatorId: 'chf_snb_meeting', predictedDirection: 'bearish', confidence: 2, reason: 'Balance commerciale CH détériorée → SNB dovish', delayLabel: 'avant la réunion' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Every rule that applies to an indicator in a given direction */
export function getRulesFor(sourceIndicatorId: string, direction: PredictionDirection): PredictionRule[] {
    return PREDICTION_RULES.filter(
        r => r.sourceIndicatorId === sourceIndicatorId && r.direction === direction
    );
}

/** Every rule where an indicator is the target */
export function getRulesTargeting(targetIndicatorId: string): PredictionRule[] {
    return PREDICTION_RULES.filter(r => r.targetIndicatorId === targetIndicatorId);
}

/** All unique source indicator ids */
export const ALL_SOURCE_IDS = [...new Set(PREDICTION_RULES.map(r => r.sourceIndicatorId))];
