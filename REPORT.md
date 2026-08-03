# Rapport de reconstruction — dipperInfonda vers Fondanarex

Ce document consigne ce qui a été fait, ce qui a été corrigé et ce qui reste
ouvert. Il existe parce que ces explications n'ont pas leur place dans
l'interface : un outil de trading doit afficher des données, pas l'historique de
sa propre réécriture.

**Règle appliquée** : si un texte explique comment *lire un chiffre*, il reste
dans l'écran. S'il explique *un choix de conception* ou *ce que faisait
l'ancienne application*, il vient ici ou dans un commentaire de code.

---

## Défauts corrigés

Chacun a été trouvé en exécutant le code, pas en le lisant, et chacun est
couvert par un test de non-régression.

### Calculs faux

| Où | Défaut | Conséquence |
|---|---|---|
| **Journal** | P&L calculé avec « 1 pip = 10 USD/lot » et pips déduits de `pair.includes('JPY')` | Un gain de 50 pips sur 1 lot USD/JPY vaut **50 000 JPY** — le journal affichait **500**. Faux pour la majorité de la liste de paires. |
| **Prédictions** | 13 règles chômage/claims lues sur le chiffre brut | Une baisse du chômage — donc une bonne nouvelle — était comptée comme une **contradiction** du modèle. |
| **Prédictions** | `aud_cpi` était une faute de frappe pour `aud_cpi_quarterly` | Les deux règles RBA de plus forte confiance (5 et 4) ne se déclenchaient **jamais**. |
| **Prédictions** | 8 règles visaient `usd_consumer_confidence`, absent du catalogue | Prédictions sur un indicateur qui ne pouvait **jamais** être publié : elles ne pouvaient qu'expirer. |
| **Prédictions** | Table d'expiration : 5 libellés couverts sur 8 utilisés | 23 règles retombaient sur 30 jours par défaut, dont les trimestrielles (~90 jours) : elles expiraient **avant** la publication qu'elles annonçaient. |
| **Briefing IA** | Égalité haussier/baissier résolue en **BAISSIER** | Un désaccord total entre deux modèles était présenté comme un signal baissier. |
| **Comparateur** | `indicatorWinner` ignorait le drapeau `inverse` | Une inflation **plus basse** perdait sa propre comparaison. |
| **Rapports** | Courbe de capital triée par date d'**entrée** | Les gains apparaissaient avant d'exister et le drawdown était sous-estimé. Vérifié : sur une séquence de 4 trades, la correction révèle un drawdown de 800 auparavant invisible. |
| **Rapports** | `profitFactor` renvoyait **999** sans perte | Un nombre magique affiché comme une vraie mesure. |
| **Journal** | « Cette semaine » sans borne supérieure | Tout trade postérieur au lundi comptait, y compris ceux du mois suivant et toute date saisie par erreur dans le futur. |
| **Journal** | Filtres résultat testant `pnl <= 0` / `pnl >= 0` | Les trades ouverts n'entraient dans **aucune** catégorie : les totaux filtrés ne retombaient jamais sur le total. |
| **Devise** | Trajectoire d'inflation testée sur `variation > 0` | Une révision de 0,01 — dans l'arrondi du chiffre publié — comptait comme une accélération complète et déplaçait le score de 35 points. |
| **Indicateurs** | Échappement Pine des guillemets seulement, pas des antislashs | Un libellé contenant `\` produisait un script que TradingView **refusait entièrement**. |
| **Graphiques** | Table de corrélations dupliquée et désynchronisée | Les alertes de double exposition utilisaient des valeurs périmées. |
| **Graphiques** | Trades ouverts détectés par `!exitPrice \|\| exitPrice === 0` | Un prix de sortie légitimement nul était traité comme une position ouverte. |
| **Alertes** | `score_change_majeur` déclaré mais **jamais généré** | Une catégorie d'alerte annoncée qui n'existait pas. |
| **Simulateur** | `expectancyPct` retombait sur un R:R codé en dur de 6 | Des chiffres confiants pour des comptes sans aucune donnée. |
| **Calendrier** | Clé de semaine ISO mélangeant horloge locale et UTC | Un événement pouvait être classé dans la mauvaise semaine. |

### Pertes de données silencieuses

| Où | Défaut |
|---|---|
| **Prévisions** | `saveWeekPlan` interceptait l'erreur de quota localStorage et **supprimait les captures** de tous les plans sauf les trois derniers. Perdre des données était le mécanisme de récupération documenté. |
| **Journal** | Même schéma : au dépassement de quota, les captures des trades au-delà des quatre plus récents étaient effacées. |
| **Graphiques** | Une seconde capture sur un même timeframe **remplaçait silencieusement** la première. |
| **Prévisions** | La navigation entre semaines sauvegardait le plan quitté et chargeait le suivant dans le même tick : un double-clic pouvait écrire l'un dans l'autre. |

### Sécurité

- **Clés API dans le bundle navigateur.** `VITE_ANTHROPIC_API_KEY` et
  `VITE_PERPLEXITY_API_KEY` : le préfixe `VITE_` fait *inliner* la valeur dans
  le JavaScript client. N'importe qui pouvait les lire depuis les outils de
  développement. **Ces deux clés doivent être considérées comme compromises et
  régénérées.** Tous les appels sont désormais côté serveur.
- **Type MIME des téléversements** pris du client. Un navigateur enverra un
  document HTML étiqueté `image/png` si on le lui demande, et un fichier
  restitué depuis notre propre origine sous un type falsifié s'exécute. Le type
  est maintenant lu dans les octets du fichier.

---

## Choix de conception

**Les données de référence restent dans le code.** Poids de scoring, profils
pays, règles de prédiction, graphe fondamental : ce sont des décisions de
modèle, elles doivent être relues en revue de code, pas modifiées en base sans
trace.

**`domain/` est pur.** Aucune I/O, aucune horloge, aucun accès réseau. `now` est
toujours passé en paramètre. C'est ce qui rend 770 tests possibles sans base de
données et ce qui garantit qu'un calcul se comporte pareil dans un test, dans un
rendu serveur et dans un aperçu navigateur.

**Un aperçu utilise les mêmes fonctions que l'écriture.** Le formulaire de
publication, la saisie de trade et le générateur Pine affichent le résultat
calculé par le code qui l'enregistrera — jamais par une seconde implémentation
qui pourrait diverger.

**Ce qui est indéterminé s'affiche comme tel.** Un tiret signifie « pas de
données », jamais zéro. Un facteur de profit sans perte est `null`, pas
l'infini. Un score de surprise à 50 % sans prédiction résolue est étiqueté
« inconnu », pas « moyennement prévisible ». Une devise absente vaut 50, pas 0 —
sinon elle passerait pour maximalement faible au lieu d'inconnue.

**Les projections sont déterministes.** Gains et pertes sont répartis
régulièrement selon le taux de réussite plutôt que tirés au hasard : l'ordre
décide à lui seul si la limite de drawdown est franchie, et une projection qui
change à chaque rendu est incomparable.

**Les comptes sont des données, plus du code.** L'ancienne application figeait
les quatre comptes dans une constante ; seul le capital courant était
modifiable. Capital, limites de drawdown et setups autorisés sont personnels :
ils se modifient sans redéploiement.

---

## Bloquants externes

Aucun n'est un problème de code.

| Service | État | Effet |
|---|---|---|
| **FXMacroData** | `403 api_key_revoked` — clé reconnue, abonnement non habilité | Sentiment de marché et communiqués indisponibles. La clé est identique à celle de l'ancienne application : elle était déjà morte avant la réécriture. Le sentiment est désormais **calculé localement** depuis le VIX. |
| **Perplexity** | Quota dépassé | Le tour de recherche du briefing dégrade sur les données macro internes au lieu d'échouer. |
| **OECD** | Série CPI japonaise renvoyant une période 2021 | Une devise sur huit avec une inflation périmée. |

Le diagnostic FXMacroData est concluant parce que les deux codes diffèrent : une
clé inventée répond **401 `invalid_api_key`**, la vôtre répond **403
`api_key_revoked`**. L'API *reconnaît* la clé — c'est l'abonnement derrière qui
n'est pas actif.

---

## État

**21 écrans portés**, tous vérifiés en rendu réel contre la base Neon.
**770 tests**, typecheck, lint et build verts.

### Écarts de parité comblés après audit

Un audit écran par écran a révélé des composants absents du portage :

- **Comparateur** : radar 7 axes, 3 modes d'affichage, profils complets, matrice de force relative
- **Devise** : analyse tripartite de l'inflation
- **Comptes** : vérificateur d'entrée, projection de capital, table de comparaison
- **Signaux** : bandeau d'état du marché
- **Rapports** : corrélation news–résultats
- **Simulateur** : simulateur trade par trade

### Ouvert

1. **Authentification Google** — branche `feat/auth-and-settings`, en attente
   des identifiants OAuth (voir `ACCESS.md`).
2. **Planification de l'ingestion** — workflow GitHub Actions ajouté ; il
   nécessite les secrets `SITE_URL` et `CRON_SECRET`.
3. **Stockage des captures** — nécessite `NETLIFY_SITE_ID` et
   `NETLIFY_API_TOKEN` en production.
