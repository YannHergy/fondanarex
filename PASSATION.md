# Passation — Fondanarex

État au 4 août 2026. Ce document sert à reprendre le projet et à le déployer
ailleurs. Il décrit ce qui marche, ce qui ne marche pas, et pourquoi.

---

## 1. Démarrer en local

```bash
pnpm install
cp .env.example .env      # puis remplir (voir §2)
pnpm prisma generate
pnpm dev                  # http://localhost:3000
```

Vérifications :

```bash
pnpm typecheck && pnpm lint && pnpm exec vitest run   # 795 tests
pnpm build
```

La base de données est **hébergée chez Neon**, pas en local : dès que
`DATABASE_URL` est renseignée, l'application affiche les vraies données. Aucun
serveur Postgres à installer.

---

## 2. Secrets à obtenir

`.env` est exclu de git (voir `.gitignore`) et n'est donc **pas** dans le dépôt.
Les valeurs doivent être transmises hors dépôt.

**Indispensables** — sans elles l'application ne démarre pas ou reste vide :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Neon, connexion *poolée*, utilisée à l'exécution |
| `DIRECT_URL` | Neon, connexion directe, utilisée par `prisma migrate` |
| `FXMACRODATA_API_KEY` | source principale des données macro |

`DIRECT_URL` ne doit **pas** contenir `channel_binding=require` : le moteur de
migration Prisma ne sait pas le négocier et échoue en P1001.

**Optionnelles** : `CRON_SECRET` (voir §4), `ANTHROPIC_API_KEY` (bouton
« Expert AI Insight » du comparateur), `FRED_API_KEY` (données USD à meilleure
précision — actuellement absente, l'application s'en passe).

Le reste de `.env.example` (`METAAPI_*`, `NEWS_API_KEY`, `AUTH_*`…) correspond à
des fonctionnalités non branchées à ce jour.

---

## 3. Déploiement

Le projet tournait sur Netlify (`fondanarex-777`), connecté à
`github.com/YannHergy/fondanarex`, build `pnpm prisma generate && pnpm build`.

**Ce déploiement est bloqué** : le compte a épuisé les 300 crédits mensuels de
l'offre gratuite le 4 août ; les crédits se réinitialisent le **3 septembre
2026**. Le dernier commit publié est `4b42e63`. Les commits suivants
(dont le pétrole WTI) sont dans le dépôt mais pas en ligne.

Pour redéployer ailleurs, il suffit de :

1. brancher le dépôt GitHub sur l'hébergeur ;
2. reporter les trois variables indispensables ;
3. garder la commande de build ci-dessus.

`netlify.toml` et `.netlify/` ne concernent que l'ancien hébergement et peuvent
être ignorés ou supprimés sur une autre plateforme. Rien dans le code n'est lié
à Netlify.

Note de licence : l'offre gratuite de Vercel (Hobby) **interdit l'usage
commercial**. Comme ce projet est destiné à être vendu, l'hébergeur gratuit
choisi doit être vérifié sur ce point.

---

## 4. Problèmes ouverts (par ordre d'importance)

### 4.1 Le rafraîchissement ne fonctionne pas en production

C'est le point le plus important à reprendre. Trois causes indépendantes :

1. **`CRON_SECRET` n'a jamais été configurée** sur le site déployé.
   `app/api/cron/refresh-macro/route.ts` refuse tout appel quand le secret est
   absent (par choix : un secret vide ferme le point d'entrée au lieu de
   l'ouvrir). Le point d'entrée est donc fermé depuis toujours.

2. **La durée dépasse les limites des plateformes.** Un rafraîchissement
   complet prend ~90 s, contre 26 s pour une fonction synchrone Netlify et
   60 s sur la plupart des offres sans serveur. Il faut découper : le point
   d'entrée accepte déjà `?dataset=cpi` pour ne traiter qu'un jeu OECD à la
   fois, mais rien n'orchestre ce découpage.

3. **`.github/workflows/refresh-macro.yml` n'a jamais tourné** : il exige les
   secrets de dépôt `SITE_URL` et `CRON_SECRET`, jamais renseignés.

Conséquence pratique : **tous les rafraîchissements réalisés à ce jour l'ont été
depuis un poste de développement**, en appelant l'API locale connectée à la base
de production. Les données en base sont donc à jour, mais aucune automatisation
ne les maintient.

### 4.2 L'OECD répond 500 sur la majorité de ses jeux de données

`fetchAllOecdData` échoue systématiquement sur 4 des 5 datasets
(« OECD 500 Internal Server Error »), même espacés. C'est du bridage, pas une
panne — voir le commentaire détaillé dans `lib/integrations/oecd.ts`.

Ce n'est pas bloquant : FXMacroData est classé **au-dessus** de l'OECD dans la
hiérarchie des sources (`lib/currencies.ts`) précisément pour cette raison. Mais
les indicateurs que seul l'OECD couvre (PMI notamment) restent figés sur les
données de départ.

### 4.3 Indicateurs sans source

Marqués d'une **étoile** dans l'interface. Vérifiés un par un contre l'API :

- **Demande chinoise** (15 % du score AUD et NZD) — FXMacroData couvre le yuan
  (PIB, CPI, taux LPR, chômage, ventes au détail) mais n'a **aucun PMI
  chinois**, alors que le moteur note cet indicateur sur un niveau de PMI.
- **Produits laitiers** (18 % du NZD) — aucune série GDT/Fonterra.
- **PMI** (toutes devises) — aucun slug FXMacroData, une douzaine de variantes
  testées.

### 4.4 Balance commerciale GBP incohérente

FXMacroData la publie en **trimestriel** pour le Royaume-Uni alors que toutes
les autres devises sont en mensuel, et que les seuils du moteur
(`scoreTradeBalance`, ±5 / ±15 Md) sont calibrés pour du mensuel. Résultat : la
livre écope d'un score de -8/10 là où la réalité mensuelle donnerait -2.

Trois pistes discutées, aucune retenue : diviser par 3 (approximatif), calibrer
les seuils par devise (exact mais touche le scoring), ou ne plus écrire cette
série.

---

## 5. Repères d'architecture

- `domain/` est **pur** : aucune entrée/sortie, entièrement testé (795 tests).
  Toute logique de scoring vit là et doit rester testable sans réseau.
- `lib/integrations/` contient les appels réseau, un fichier par fournisseur.
- Les valeurs macro sont résolues **par palier de source** puis par période :
  `FRED > FXMACRODATA > MARKET > OECD > DERIVED > MANUAL`. L'ordre est
  commenté dans `lib/currencies.ts` — il a été établi après avoir constaté que
  l'OECD servait des lignes vieilles de plusieurs années.
- Un rafraîchissement n'écrit **jamais** dans `IndicatorOverride` : les
  corrections manuelles vivent dans une table séparée et gagnent à la lecture.
- Les pastilles vertes/rouges de la page devise viennent de `IndicatorCheck`,
  alimentée à la main par `prisma/seed-checks.ts`. Ce sont des vérifications
  humaines contre Trading Economics, pas un calcul — il n'existe aucun flux
  Trading Economics dans le projet.

---

## 6. À faire tourner après reprise

```bash
pnpm exec prisma migrate deploy    # applique les migrations sur la base cible
pnpm exec tsx --env-file=.env prisma/seed-checks.ts   # verdicts de vérification
```

Le rafraîchissement des données macro se déclenche par le bouton « Rafraîchir »
du tableau de bord, ou en appelant :

```
GET /api/cron/refresh-macro?secret=$CRON_SECRET
```
