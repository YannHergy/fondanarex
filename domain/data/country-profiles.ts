// ================================================================
// COUNTRY PROFILES — Structural fact sheets for the 8 G10 currencies
// Educational content based on the forex training material
// ================================================================

export type SensitivityLevel = 'FAIBLE' | 'MODÉRÉE' | 'FORTE' | 'TRÈS FORTE' | 'EXTRÊME';
export type SensitivityDirection = 'positive' | 'negative' | 'mixed';
export type TagType = 'refuge' | 'risk-on' | 'commodity' | 'industrial' | 'fragile';

export interface SensitivityRule {
    event: string;
    sensitivity: SensitivityLevel;
    direction: SensitivityDirection;
    note?: string;
}

export interface CountryProfile {
    code: string;
    name: string;
    fullName: string;
    flag: string;
    centralBank: string;
    tag: string;
    tagType: TagType;
    miniStrength: string;
    miniWeakness: string;
    miniIndicator: string;
    strengths: string[];
    weaknesses: string[];
    specialIndicators: string[];
    sensitivityRules: SensitivityRule[];
    secondaryCascades: string[];
}

export const COUNTRY_PROFILES: CountryProfile[] = [

    // ================================================================
    // USD — US Dollar
    // ================================================================
    {
        code: 'USD',
        name: 'Dollar Américain',
        fullName: 'Dollar Américain — États-Unis',
        flag: '🇺🇸',
        centralBank: 'Réserve Fédérale (Fed)',
        tag: 'REFUGE PRINCIPAL / DEVISE DE RÉSERVE MONDIALE',
        tagType: 'refuge',
        miniStrength: '80% du commerce mondial, devise de réserve n°1',
        miniWeakness: 'Position extérieure nette de -20 000 Mds$ (plus gros débiteur mondial)',
        miniIndicator: 'Vote FOMC : Powell = 1 voix sur 12 seulement',
        strengths: [
            'Dollar = 80% du commerce mondial, 90% des échanges interbancaires',
            '58% des réserves de change mondiales (en baisse depuis 72% en 2000)',
            'Wall Street domine la finance mondiale (30% des tensions étrangères)',
            'Armée la plus puissante au monde — sécurité des échanges mondiaux garantie',
            'Doctrine du marché libre : la Fed n\'intervient quasiment jamais directement sur le FX',
            'Swap lines de la Fed soutiennent le système bancaire mondial entier',
            'Refuge automatique en cas de crise mondiale (« Dollar Smile »)',
            'Contrôle de l\'Amérique latine (Panama, Venezuela) — accès aux ressources stratégiques',
        ],
        weaknesses: [
            'Position extérieure nette de -20 000 milliards de dollars (plus gros débiteur mondial)',
            'Dette publique en hausse continue, aucun plan crédible de réduction',
            'Or de la Fed : pas d\'audit depuis les années 50, soupçons sur la quantité réelle',
            'L\'Allemagne a récupéré son or « remis aux normes » (pas l\'or d\'origine) après 7 ans d\'attente',
            'Système politique court-termiste (élections tous les 2 ans, midterms perturbateurs)',
            'Dédollarisation lente mais réelle (BRICS, Chine, Russie, paiements en monnaies locales)',
            'Migration progressive d\'actifs depuis New York vers Euroclear (Bruxelles) depuis 2025-2026',
        ],
        specialIndicators: [
            'Intervention de la Fed de New York sur le marché FX = signal d\'urgence systémique majeur (très rare — dernière fois en 2011 après le tsunami japonais)',
            'Vote du FOMC : Powell n\'est qu\'1 voix sur 12. Le président américain ne peut pas le virer facilement (accord du Sénat requis)',
            'Migration d\'actifs NY → Bruxelles (Euroclear) = perte de confiance dans le système américain',
            'Statut des swap lines avec BCE, BoE, BoJ (rupture = catastrophe systémique)',
            'Audit de l\'or de Fort Knox (jamais réalisé depuis des décennies — risque de scandale)',
            'Spreads des obligations du Trésor US (signal de confiance des créanciers étrangers)',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',       sensitivity: 'TRÈS FORTE', direction: 'positive',  note: 'Refuge automatique' },
            { event: 'Décisions FOMC',          sensitivity: 'EXTRÊME',    direction: 'mixed' },
            { event: 'Hausse du pétrole',       sensitivity: 'MODÉRÉE',    direction: 'mixed',     note: 'Impact complexe' },
            { event: 'Crise géopolitique',      sensitivity: 'FORTE',      direction: 'positive',  note: 'Valeur refuge' },
            { event: 'Données Chine',           sensitivity: 'MODÉRÉE',    direction: 'negative' },
            { event: 'Crise immobilière US',    sensitivity: 'EXTRÊME',    direction: 'negative' },
            { event: 'Indépendance Fed menacée', sensitivity: 'EXTRÊME',   direction: 'negative' },
        ],
        secondaryCascades: [
            'Si la Fed de NY intervient sur USD/JPY → c\'est qu\'il y a une crise systémique majeure → tous les actifs risqués chutent en cascade',
            'Si les capitaux japonais sont rapatriés → vente massive d\'obligations US → taux US explosent → Fed forcée d\'intervenir d\'urgence',
            'Si Trump menace l\'indépendance de la Fed → bearish USD à court terme (incertitude) même si l\'économie va bien',
            'Le « Dollar Smile » : l\'USD monte quand tout va bien (taux élevés attractifs) ET quand tout va mal (refuge automatique)',
            'Si la migration d\'actifs vers Euroclear s\'accélère → USD structurellement affaibli sur plusieurs années',
        ],
    },

    // ================================================================
    // EUR — Euro / Eurozone
    // ================================================================
    {
        code: 'EUR',
        name: 'Euro',
        fullName: 'Euro — Zone Euro (19 pays)',
        flag: '🇪🇺',
        centralBank: 'Banque Centrale Européenne (BCE)',
        tag: 'REFUGE SECONDAIRE / INDUSTRIEL FRAGMENTÉ',
        tagType: 'industrial',
        miniStrength: 'Euroclear détient des trillions d\'actifs mondiaux — arme financière cachée',
        miniWeakness: 'Fragmentation politique France-Allemagne, bureaucratie ultra-lente',
        miniIndicator: 'Migration nette d\'actifs vers Euroclear (entrée = bullish EUR)',
        strengths: [
            'Euroclear (Bruxelles) = arme financière cachée, détient des trillions d\'actifs mondiaux',
            'Swift = système de messagerie interbancaire mondial sous influence européenne',
            'Marché de 450 millions de consommateurs (2ème plus grand au monde)',
            '2ème valeur refuge mondiale après l\'USD (16% des réserves de change mondiales)',
            'Allemagne = 2ème position extérieure nette du monde (3 300 Mds$, 80% du PIB)',
            'Migration d\'actifs depuis New York vers Bruxelles depuis 2025-2026 (tendance structurelle bullish)',
            'Zone monétaire crédible avec une BCE indépendante et rigoureuse',
        ],
        weaknesses: [
            'Fragmentation politique profonde : conflit France-Allemagne sur le nucléaire, le SCAF (avion de combat)',
            'Bureaucratie extrêmement lente (le temps de voter une loi est interminable, prise de décision lente)',
            'Coût de l\'énergie élevé → compétitivité à l\'export structurellement pénalisée',
            'Dépendance énergétique : 30% Norvège, 30% Algérie pour l\'Italie — vulnérabilité géopolitique',
            'Pays Baltes = talon d\'Achille militaire face à la Russie (menace permanente sur l\'est)',
            'Risque Turquie-Grèce permanent (contentieux maritime, migratoire)',
            'France en surendettement chronique → risque de fragmentation zone euro si crise de confiance',
        ],
        specialIndicators: [
            'Tensions internes France-Allemagne (signal qualitatif fort — divergences sur la politique énergétique et industrielle)',
            'Recommandations BCE/Euroclear sur la dette américaine = peut déplacer des trillions de dollars en quelques jours',
            'Élections françaises (risque structurel sur l\'intégration européenne)',
            'Migration nette d\'actifs vers Euroclear (entrée massive = très bullish EUR structurellement)',
            'Spreads souverains Italie/Allemagne (signal de fragmentation de la zone euro — critique)',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',      sensitivity: 'MODÉRÉE',    direction: 'positive',  note: 'Perd moins que AUD/CAD/GBP' },
            { event: 'Décisions BCE',         sensitivity: 'EXTRÊME',    direction: 'mixed' },
            { event: 'Données Allemagne',     sensitivity: 'TRÈS FORTE', direction: 'mixed' },
            { event: 'Crise politique France', sensitivity: 'FORTE',     direction: 'negative' },
            { event: 'Tensions avec la Russie', sensitivity: 'FORTE',   direction: 'negative' },
            { event: 'Données Chine',         sensitivity: 'FAIBLE',     direction: 'negative',  note: 'Impact indirect via Allemagne' },
            { event: 'Tarifs US sur l\'UE',   sensitivity: 'MODÉRÉE',   direction: 'positive',  note: 'EUR paradoxalement résilient (2025)' },
        ],
        secondaryCascades: [
            'Si la BCE recommande aux investisseurs européens de diversifier hors USD → flux massifs vers EUR → EUR très bullish',
            'Si Trump met des tarifs sur l\'UE → l\'EUR a été paradoxalement RÉSILIENT (preuve : EUR/USD a monté pendant les menaces Trump 2025)',
            'Si l\'Italie a un problème politique majeur → fragmentation zone euro → EUR très bearish (spreads souverains explosent)',
            'En cas de risk-off mondial, l\'EUR est la 2ème valeur refuge → il perd MOINS que les autres devises non-USD',
            'Si Euroclear attire de nouveaux flux d\'actifs hors des USA → soutien structurel à l\'EUR sur plusieurs trimestres',
        ],
    },

    // ================================================================
    // GBP — Pound Sterling / United Kingdom
    // ================================================================
    {
        code: 'GBP',
        name: 'Livre Sterling',
        fullName: 'Livre Sterling — Royaume-Uni',
        flag: '🇬🇧',
        centralBank: 'Banque d\'Angleterre (BoE)',
        tag: 'PUISSANCE FINANCIÈRE / SERVICES',
        tagType: 'industrial',
        miniStrength: 'Londres = 38% des transactions Forex mondiales, 4 700 Mds$/jour',
        miniWeakness: 'La City = 10% des recettes fiscales — si elle souffre, le UK s\'effondre',
        miniIndicator: 'Volume Forex à Londres (proxy de la force du système financier britannique)',
        strengths: [
            'Londres = capitale mondiale du Forex : 38% des transactions de devises mondiales',
            '4 700 milliards $ transitent chaque jour à Londres (plus d\'USD échangés à Londres qu\'aux USA)',
            '2ème exportateur mondial de services financiers',
            'Lloyds of London assure la majorité de la flotte maritime mondiale',
            '40% des contrats commerciaux mondiaux régis par le droit anglais (Common Law)',
            'London Metal Exchange fixe les prix mondiaux du cuivre, aluminium, nickel',
            'LBMA fixe le prix de l\'or 2× par jour (« London Fix ») — référence mondiale',
            'ICE de Londres : le Brent = référence pour 70% du brut mondial',
            'Track record juridique unique : pas de coup d\'État depuis des siècles',
            'Audits de l\'or réguliers et transparents (contrairement aux USA)',
        ],
        weaknesses: [
            'Secteur financier = 80-90 Mds£ d\'impôts (10% des recettes fiscales) → si la City souffre, le UK s\'effondre',
            'Brexit a affaibli le pouvoir politique et l\'attractivité de la City pour les entreprises européennes',
            'Très dépendant de la confiance internationale dans son système juridique',
            'Si le UK fait passer des lois anti-finance → fuite des capitaux vers Suisse/Singapour → GBP structurellement bearish',
            'Inflation persistante structurelle (problème récurrent lié aux importations)',
            'Grand déficit de compte courant → dépendance permanente aux flux de capitaux entrants',
        ],
        specialIndicators: [
            'Volume Forex à Londres (proxy de la santé du système financier mondial)',
            'Décisions Lloyds (changement de normes d\'assurance maritime = impact mondial)',
            'London Fix de l\'or (signal structurel sur la stabilité du système financier UK)',
            'Réformes financières au UK (toute régulation lourde = risque de fuite des capitaux)',
            'Émissions d\'obligations souveraines (Gilts) à Londres (signal de confiance dans le souverain)',
            'CBI (Confederation of British Industry) — sentiment des entreprises — indicateur avancé',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',      sensitivity: 'FORTE',      direction: 'negative' },
            { event: 'Décisions BoE',         sensitivity: 'EXTRÊME',    direction: 'mixed' },
            { event: 'Crise de la City',      sensitivity: 'EXTRÊME',    direction: 'negative' },
            { event: 'Données USD/Fed',       sensitivity: 'FORTE',      direction: 'mixed' },
            { event: 'Données EUR/BCE',       sensitivity: 'TRÈS FORTE', direction: 'mixed' },
            { event: 'Brexit-related news',   sensitivity: 'FORTE',      direction: 'negative' },
            { event: 'Réforme financière UK', sensitivity: 'EXTRÊME',    direction: 'negative' },
        ],
        secondaryCascades: [
            'Si la City impose une nouvelle régulation lourde sur la finance → fuite des capitaux → GBP très bearish',
            'Si Lloyds change ses normes d\'assurance maritime → impact direct sur les flux mondiaux (assurance cargo, shipping)',
            'Si le UK pousse une législation anti-finance → fuite vers Zurich/Genève → GBP bearish, CHF bullish automatiquement',
            'Le GBP diverge souvent de la zone euro (PMI plus forts, BoE généralement plus hawkish que BCE)',
            'Les tensions sur les Gilts (obligations UK) se transmettent immédiatement au GBP (cf. crise Truss 2022)',
        ],
    },

    // ================================================================
    // JPY — Japanese Yen
    // ================================================================
    {
        code: 'JPY',
        name: 'Yen Japonais',
        fullName: 'Yen Japonais — Japon',
        flag: '🇯🇵',
        centralBank: 'Banque du Japon (BoJ)',
        tag: 'REFUGE / FINANCEMENT MONDIAL / RISQUE SYSTÉMIQUE',
        tagType: 'refuge',
        miniStrength: '10 000 Mds$ de créances étrangères — premier créancier mondial',
        miniWeakness: 'Carry trade : 400-500 Mds$ à risque si le JPY s\'apprécie brusquement',
        miniIndicator: 'USD/JPY = baromètre du système financier mondial (mouvement brusque = alarme)',
        strengths: [
            'Excédent de compte courant : ~200 Mds$/an (nation rentière — crée des flux permanents de retour)',
            '10 000 milliards $ de créances étrangères (probablement n°1 ou n°2 mondial avec l\'Allemagne)',
            'Bat l\'Allemagne au coude à coude pour le titre de premier créancier net mondial',
            'Industrie du made in Japan en renaissance (semi-conducteurs, IA, robotique, énergie)',
            'Gouvernement Takaishi mise sur IA, défense, robotique, indépendance alimentaire — transformation structurelle',
            'JPY = valeur refuge automatique en cas de crise mondiale (débouclage du carry trade)',
        ],
        weaknesses: [
            'Dette publique = 250% du PIB (la plus élevée des économies développées)',
            'Carry trade : 400-500 Mds$ à risque d\'appels de marge si le JPY s\'apprécie brusquement',
            'Banques japonaises = « zombies » qui soutiennent des entreprises non-rentables avec des taux à 0%',
            'Mur démographique : retraités vident leur épargne → pression permanente sur les finances publiques',
            'Premier partenaire commercial = Chine → si la Chine ralentit, le Japon ralentit immédiatement',
            '⚠️ RISQUE SYSTÉMIQUE MONDIAL : si le Japon rapatrie ses capitaux → vente massive d\'obligations US → taux US explosent → crise type 2008',
        ],
        specialIndicators: [
            'USD/JPY = baromètre du système financier mondial — un mouvement brusque (ex: -4.3% en 12h le 23 jan. 2026) = signal d\'alarme systémique',
            'Politique BoJ : si elle augmente les taux → carry trade explose → vagues de liquidations mondiales',
            'Spread USD/JPY vs différentiel de taux d\'intérêt (mesure de la pression sur le carry trade — divergence = danger)',
            'Rapatriement des capitaux japonais (GPIF, assureurs) — suivi des flux TIC (Treasury International Capital)',
            'Interventions de la BoJ sur le marché des changes (fréquentes pour limiter la dépréciation excessive)',
            '« Celui qui sous-estime le Japon est fou » — citation de formation',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',          sensitivity: 'TRÈS FORTE', direction: 'positive',  note: 'Refuge automatique (carry unwind)' },
            { event: 'Hausse des taux US',         sensitivity: 'TRÈS FORTE', direction: 'negative',  note: 'Élargit le différentiel → pression carry' },
            { event: 'Données Chine',              sensitivity: 'EXTRÊME',    direction: 'negative',  note: 'Chine = 1er partenaire commercial' },
            { event: 'Décisions BoJ',             sensitivity: 'EXTRÊME',    direction: 'mixed' },
            { event: 'Crise immobilière chinoise', sensitivity: 'EXTRÊME',    direction: 'negative' },
            { event: 'Rapatriement de capitaux',  sensitivity: 'EXTRÊME',    direction: 'positive',  note: 'JPY explose à la hausse' },
        ],
        secondaryCascades: [
            'Si la BoJ augmente les taux trop vite → carry trade explose → vagues de liquidations mondiales (AUD, NZD, actions)',
            'Si la Chine ralentit → exportations japonaises plongent → BoJ doit imprimer → JPY se transforme de refuge en monnaie toxique',
            'Si les retraités japonais vident leur épargne plus vite que prévu → Japon doit vendre des obligations US → effets dominos sur taux mondiaux',
            'L\'USD/JPY est le canari dans la mine : un mouvement brusque annonce un problème mondial, pas japonais',
            'Si la BoJ abandonne le YCC (Yield Curve Control) → séisme sur les marchés obligataires mondiaux',
        ],
    },

    // ================================================================
    // CHF — Swiss Franc
    // ================================================================
    {
        code: 'CHF',
        name: 'Franc Suisse',
        fullName: 'Franc Suisse — Suisse',
        flag: '🇨🇭',
        centralBank: 'Banque Nationale Suisse (SNB)',
        tag: 'ULTRA-REFUGE / GESTION DE FORTUNE MONDIALE',
        tagType: 'refuge',
        miniStrength: '25% de la fortune privée mondiale transfrontalière gérée à Zurich/Genève',
        miniWeakness: 'Petit pays → peu de liquidité, SNB doit constamment intervenir pour limiter l\'appréciation',
        miniIndicator: 'Interventions SNB sur le marché FX (fréquentes — défense de EUR/CHF)',
        strengths: [
            'Pays minuscule mais extrêmement bien géré — modèle de gestion publique rigoureuse',
            '25% de la fortune privée mondiale transfrontalière gérée à Zurich/Genève',
            'Démocratie directe : impossible de monter les impôts sans référendum — stabilité fiscale garantie',
            'Système juridique parmi les plus solides et les plus stables du monde',
            'N\'utilise pas le CHF comme arme de sanction (contrairement USD/EUR) — neutre crédible',
            'UBS = banque centrale officieuse pour les ultra-riches (gestion de fortune institutionnelle)',
            'Audits d\'or stricts et réguliers — transparence totale sur les réserves',
            'Zone refuge automatique en cas de crise géopolitique ou financière mondiale',
        ],
        weaknesses: [
            'Petit pays → peu de liquidité sur le CHF → mouvements violents lors des crises',
            'Dépendance à l\'export (pharma, horlogerie, finance) → CHF fort pénalise les exportateurs',
            'A subi 49% de tarifs douaniers de Trump (peu de leviers de rétorsion diplomatiques)',
            'SNB doit constamment intervenir pour empêcher le CHF de trop monter (coût élevé)',
            'L\'appréciation excessive du CHF nuit aux exportations et à l\'inflation (risque de déflation)',
            'Bilan SNB très gonflé par les achats massifs d\'EUR pour limiter l\'appréciation',
        ],
        specialIndicators: [
            'Recommandations UBS = peuvent déplacer des milliards d\'actifs mondiaux en quelques jours',
            'Interventions SNB sur le marché FX (fréquentes — annonces officielles ou variation soudaine de EUR/CHF)',
            'Bilan de la SNB (très gonflé par les achats d\'EUR — risque de pertes si EUR baisse)',
            'EUR/CHF = paire ultra-surveillée (SNB la défend agressivement — plancher implicite)',
            'Référendums fiscaux suisses (signaux structurels sur l\'attractivité de la place financière)',
            'Dépôts à vue SNB : variation brusque = signal d\'intervention sur le marché des changes',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',       sensitivity: 'EXTRÊME',    direction: 'positive',  note: 'Ultra-refuge — premier bénéficiaire' },
            { event: 'Décisions SNB',          sensitivity: 'EXTRÊME',    direction: 'mixed' },
            { event: 'Crise zone euro',        sensitivity: 'TRÈS FORTE', direction: 'positive',  note: 'Fuite vers CHF automatique' },
            { event: 'Crise géopolitique',     sensitivity: 'TRÈS FORTE', direction: 'positive',  note: 'Valeur refuge neutre' },
            { event: 'Intervention SNB',       sensitivity: 'EXTRÊME',    direction: 'negative',  note: 'Plafonne l\'appréciation' },
            { event: 'Données Chine',          sensitivity: 'FAIBLE',     direction: 'mixed' },
        ],
        secondaryCascades: [
            'Si crise dans la zone euro → flux massifs vers CHF → SNB forcée d\'intervenir agressivement pour limiter l\'appréciation',
            'Si la SNB arrête d\'intervenir (comme en janvier 2015) → CHF explose à la hausse, choc de marché mondial',
            'En cas de risk-off mondial → CHF monte mécaniquement, souvent avant le USD (premier refuge)',
            'Si les ultra-riches migrent leurs fortunes de Singapour/Dubai vers Genève → CHF bullish structurel',
            'Si le UK adopte des lois anti-finance → fuite vers Genève/Zurich → CHF bullish, GBP bearish simultanément',
        ],
    },

    // ================================================================
    // CAD — Canadian Dollar
    // ================================================================
    {
        code: 'CAD',
        name: 'Dollar Canadien',
        fullName: 'Dollar Canadien — Canada',
        flag: '🇨🇦',
        centralBank: 'Banque du Canada (BoC)',
        tag: 'MATIÈRE PREMIÈRE / SATELLITE DES USA',
        tagType: 'commodity',
        miniStrength: 'Gros exportateur de pétrole (3ème-4ème mondial), or, gaz, bois, agriculture',
        miniWeakness: 'Dépendance totale aux USA (75% des exportations) — aucun levier financier mondial',
        miniIndicator: 'Prix du pétrole WTI (corrélation directe et quasi-instantanée avec le CAD)',
        strengths: [
            'Gros exportateur de pétrole (3ème ou 4ème mondial — réserves parmi les plus grandes)',
            'Ressources abondantes : or, gaz naturel, bois, agriculture — économie de matières premières',
            'Système bancaire parmi les plus stables du monde (pas de faillite bancaire en 2008)',
            'Dette publique gérable (ratio inférieur aux USA et à la plupart des pays du G7)',
            'Démocratie politique stable avec des institutions solides',
        ],
        weaknesses: [
            'Dépendance totale aux USA : 75% des exportations vers les États-Unis — vulnérabilité extrême',
            'Aucun levier financier mondial — pas de place financière internationale, pas de devise de réserve',
            'Pas de centre financier mondial (Toronto est important régionalement mais pas globalement)',
            'Pétrole canadien très dépendant des pipelines et des raffineries américaines pour l\'exportation',
            'Tarifs douaniers de Trump = catastrophe économique pour le Canada (aucune capacité de rétorsion sérieuse)',
            '⚠️ Citation de formation : « Le Canada ne pèse que dalle dans la finance mondiale. Très très très peu de leviers. »',
        ],
        specialIndicators: [
            'Décisions américaines sur le commerce Canada-USA (impact disproportionné — chaque menace fait chuter le CAD)',
            'Prix du pétrole WTI (corrélation directe et quasi-instantanée avec le CAD — 1ère paire à surveiller)',
            'Spread BoC vs Fed (mesure du différentiel de taux — déterminant pour USD/CAD)',
            'Politique commerciale de Trump envers le Canada (tweets, annonces, menaces tarifaires)',
            'Production OPEC (impact sur WTI → impact sur CAD)',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',      sensitivity: 'FORTE',      direction: 'negative' },
            { event: 'Décisions Fed',         sensitivity: 'EXTRÊME',    direction: 'mixed',     note: 'CAD suit largement la Fed' },
            { event: 'Prix pétrole WTI',      sensitivity: 'EXTRÊME',    direction: 'positive',  note: 'Corrélation quasi-directe' },
            { event: 'Décisions BoC',         sensitivity: 'FORTE',      direction: 'mixed' },
            { event: 'Tarifs US sur Canada',  sensitivity: 'EXTRÊME',    direction: 'negative' },
            { event: 'Données Chine',         sensitivity: 'FAIBLE',     direction: 'negative' },
        ],
        secondaryCascades: [
            'Le CAD suit l\'USD avec un delta : quand l\'USD monte fort, le CAD monte aussi mais moins → USD/CAD reste dans un range prévisible',
            'USD/CAD est la paire la plus prévisible structurellement (corrélation pétrole + politique Fed)',
            'Si Trump menace le Canada de tarifs → CAD chute immédiatement, même avant la mise en œuvre',
            'Le Canada est dans une situation de quasi-stagflation potentielle (inflation persistante + ralentissement structurel)',
            'Si les pipelines canadiens sont bloqués → surplus de pétrole au Canada → prix baisse → CAD bearish',
        ],
    },

    // ================================================================
    // AUD — Australian Dollar
    // ================================================================
    {
        code: 'AUD',
        name: 'Dollar Australien',
        fullName: 'Dollar Australien — Australie',
        flag: '🇦🇺',
        centralBank: 'Banque Centrale d\'Australie (RBA)',
        tag: 'DEVISE LA PLUS FRAGILE DU G10 / MATIÈRE PREMIÈRE',
        tagType: 'fragile',
        miniStrength: 'Excédent commercial, matières premières (fer, charbon, gaz)',
        miniWeakness: 'Dette des ménages = 112% du PIB — 2ème plus élevée au monde',
        miniIndicator: 'PMI Chine (sensibilité ×2 vs autres devises — impact quasi-instantané sur l\'AUD)',
        strengths: [
            'Pays très riche en ressources naturelles (PIB par habitant parmi les plus élevés du G10)',
            'Excédent de balance commerciale (exportations de matières premières excèdent les importations)',
            'Matières premières abondantes : minerai de fer, charbon thermique, gaz naturel liquéfié (GNL)',
            'Dette publique relativement faible par rapport au PIB',
            'Environnement politique et institutionnel stable',
        ],
        weaknesses: [
            'Dette des ménages = 112% du PIB (2ème plus élevée au monde après la Suisse)',
            '⚠️ Importe 40% de ses biens manufacturés — quasi aucune industrie propre (pays le plus sous-industrialisé de l\'hémisphère occidental)',
            'Importe 90% du carburant raffiné (paradoxe : ils ont du gaz et charbon mais pas de raffineries)',
            'Mines australiennes majoritairement détenues par des étrangers → l\'argent repart immédiatement',
            'AUD très volatile et peu liquide → mouvements violents et imprévisibles (amplifie tous les chocs)',
            'Banques australiennes empruntent à l\'étranger pour financer l\'immobilier local → risque systémique',
            'Dépendance commerciale extrême à la Chine (1er partenaire commercial de loin)',
            'Toute hausse des taux mondiaux → défauts de paiement des ménages australiens (dette 112% PIB)',
        ],
        specialIndicators: [
            'PMI Chine (signal direct avec sensibilité ×2 vs autres devises — impact quasi-instantané)',
            'Prix du minerai de fer spot (corrélation directe — 1ère exportation australienne)',
            'Inflation Chine (même une simple baisse fait chuter l\'AUD — moins de consommation → moins d\'achats de fer)',
            'Taux d\'intérêt mondiaux (impact disproportionné via dette des ménages à 112% du PIB)',
            'Tensions Australie-Chine (embargos comme celui sur le charbon — impact commercial majeur)',
            'RBA particulière : a dû augmenter les taux alors que d\'autres maintiennent → inflation importée via dépendance',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',          sensitivity: 'EXTRÊME',    direction: 'negative',  note: 'Devise la plus fragile du G10' },
            { event: 'Données Chine',              sensitivity: 'EXTRÊME',    direction: 'negative',  note: 'Chine = 1er partenaire' },
            { event: 'Prix matières premières',   sensitivity: 'EXTRÊME',    direction: 'positive' },
            { event: 'Hausse taux mondiaux',       sensitivity: 'EXTRÊME',    direction: 'negative',  note: 'Dette ménages 112% PIB' },
            { event: 'Décisions RBA',              sensitivity: 'FORTE',      direction: 'mixed' },
            { event: 'Données USD/Fed',            sensitivity: 'FORTE',      direction: 'mixed' },
        ],
        secondaryCascades: [
            'Si l\'inflation chinoise baisse → moins de consommation en Chine → moins de minerai de fer importé → AUD chute (cascade indirecte mais puissante)',
            'Si la Fed monte les taux → coût d\'emprunt mondial monte → ménages australiens en difficulté → défauts → AUD chute',
            'Si une simple ligne d\'actu négative sur la Chine sort → AUD réagit immédiatement (peu liquide, mouvements violents)',
            'L\'AUD est le premier à chuter en risk-off et le dernier à se rétablir — éviter les positions longues en période d\'incertitude',
            'Si la Chine impose un embargo (ex: charbon) → AUD peut perdre 3-5% en quelques heures',
        ],
    },

    // ================================================================
    // NZD — New Zealand Dollar
    // ================================================================
    {
        code: 'NZD',
        name: 'Dollar Néo-Zélandais',
        fullName: 'Dollar Néo-Zélandais — Nouvelle-Zélande',
        flag: '🇳🇿',
        centralBank: 'Banque de Réserve de Nouvelle-Zélande (RBNZ)',
        tag: 'AGRICOLE / SATELLITE AUD',
        tagType: 'commodity',
        miniStrength: 'RBNZ = banque centrale crédible, souvent pionnière sur les décisions de taux',
        miniWeakness: 'Petit pays, peu liquide — suit l\'AUD à 80-90% du temps',
        miniIndicator: 'Prix du lait Fonterra (GDT Auction) — 1ère exportation, impact direct et immédiat',
        strengths: [
            'Économie agricole hautement spécialisée et compétitive (lait, viande, vin, kiwi)',
            'Système financier stable et bien régulé',
            'Démocratie robuste avec des institutions crédibles',
            'RBNZ = banque centrale crédible, souvent à l\'avant-garde des décisions de taux (précurseur pour RBA et autres)',
            'Fonterra = coopérative laitière parmi les plus grandes et compétitives au monde',
        ],
        weaknesses: [
            'Petit pays → très peu de liquidité sur le NZD → mouvements violents lors des chocs',
            'Dépendance à la Chine (1er client pour les produits laitiers via Fonterra — canal très concentré)',
            'Dépendance aux matières premières agricoles (volatilité des prix)',
            'Tendance structurelle à suivre l\'AUD (corrélation forte — réduit l\'intérêt pour les analyses séparées)',
            'Dette des ménages élevée (similaire à l\'Australie mais moins extrême — même dynamique structurelle)',
        ],
        specialIndicators: [
            'Prix du lait Fonterra (GDT Auction bimensuelle) — 1ère exportation, impact direct sur le NZD et la croissance',
            'Données Chine (consommation, PMI) — impact fort via exportations agricoles',
            'Balance commerciale mensuelle (très importante pour la confiance dans le NZD)',
            'Corrélation avec AUD/USD : surveiller AUD comme proxy pour anticiper les mouvements NZD',
            'RBNZ meeting statements : souvent plus direct et prévisible que la plupart des autres banques centrales',
        ],
        sensitivityRules: [
            { event: 'Risk-off mondial',    sensitivity: 'TRÈS FORTE', direction: 'negative' },
            { event: 'Données Chine',       sensitivity: 'FORTE',      direction: 'negative' },
            { event: 'Prix du lait GDT',   sensitivity: 'EXTRÊME',    direction: 'positive',  note: 'Impact direct et immédiat' },
            { event: 'Décisions RBNZ',     sensitivity: 'EXTRÊME',    direction: 'mixed' },
            { event: 'Données AUD/RBA',    sensitivity: 'TRÈS FORTE', direction: 'positive',  note: 'Corrélation structurelle forte' },
        ],
        secondaryCascades: [
            'Si Fonterra annonce une baisse des prix du lait → NZD chute immédiatement, parfois 0.5% en quelques minutes',
            'Le NZD suit l\'AUD à 80-90% du temps → AUD/NZD est une paire tradable en mean reversion très efficace',
            'La RBNZ est souvent la première à bouger sur les taux → signal pour RBA et autres banques centrales d\'Océanie',
            'Si la Chine ralentit → exportations laitières chutent → NZD chute, souvent plus fort que l\'AUD',
            'En risk-off, le NZD est encore plus volatil que l\'AUD (marché moins liquide, réactions plus amplifiées)',
        ],
    },
];

// ── Helpers ──────────────────────────────────────────────────────

export function getProfileByCode(code: string): CountryProfile | undefined {
    return COUNTRY_PROFILES.find(p => p.code === code);
}

export const SENSITIVITY_BARS: Record<SensitivityLevel, number> = {
    'FAIBLE':      1,
    'MODÉRÉE':     2,
    'FORTE':       3,
    'TRÈS FORTE':  4,
    'EXTRÊME':     5,
};

export const SENSITIVITY_COLOR: Record<SensitivityLevel, string> = {
    'FAIBLE':      'text-gray-400',
    'MODÉRÉE':     'text-yellow-400',
    'FORTE':       'text-orange-400',
    'TRÈS FORTE':  'text-red-400',
    'EXTRÊME':     'text-red-500',
};

export const TAG_COLOR: Record<TagType, string> = {
    'refuge':     'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    'risk-on':    'text-red-400 bg-red-400/10 border-red-400/30',
    'commodity':  'text-orange-400 bg-orange-400/10 border-orange-400/30',
    'industrial': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    'fragile':    'text-red-400 bg-red-400/10 border-red-400/30',
};

export const GOLDEN_RULE = "Une news ne bouge le marché QUE SI elle impacte les flux commerciaux ou financiers réels. Le bruit médiatique sans impact sur les flux = impact 0.";
