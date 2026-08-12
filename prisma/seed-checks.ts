import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { PrismaClient } from "@/lib/generated/prisma/client";

neonConfig.webSocketConstructor = ws;

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Verdicts of the side-by-side reviews against Trading Economics.
 *
 * Hand-recorded, because there is no Trading Economics feed to derive them
 * from — each line is the conclusion of an actual comparison against a
 * screenshot, kept so it survives the conversation that produced it.
 *
 * Only indicators that were genuinely comparable appear. Where the two sides
 * measure different things — the euro-area consumer confidence is a balance of
 * opinion around zero here and an index there — no verdict is recorded at all,
 * rather than a red dot blaming a difference that is not an error.
 */
type Verdict = { key: string; status: "MATCH" | "MISMATCH"; reference: string };

const CHECKS: Record<string, { checkedOn: string; items: Verdict[] }> = {
  EUR: {
    checkedOn: "2026-08-03",
    items: [
      { key: "cpi", status: "MATCH", reference: "2.9" },
      { key: "pmiServices", status: "MATCH", reference: "51.6" },
      { key: "unemployment", status: "MATCH", reference: "6.3" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "51.9" },
      { key: "interestRate", status: "MISMATCH", reference: "2.4" },
      { key: "gdpQoQ", status: "MISMATCH", reference: "0.4" },
      { key: "retailSales", status: "MISMATCH", reference: "0.2" },
      { key: "tradeBalance", status: "MISMATCH", reference: "-7776 M" },
    ],
  },
  AUD: {
    checkedOn: "2026-08-03",
    items: [
      { key: "interestRate", status: "MATCH", reference: "4.35" },
      { key: "cpi", status: "MATCH", reference: "3.8" },
      { key: "gdpQoQ", status: "MATCH", reference: "0.3" },
      { key: "unemployment", status: "MATCH", reference: "4.4" },
      { key: "tradeBalance", status: "MATCH", reference: "-3018 M" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "52" },
      { key: "pmiServices", status: "MISMATCH", reference: "53" },
      { key: "currentAccount", status: "MISMATCH", reference: "-27123 M" },
      { key: "consumerConfidence", status: "MISMATCH", reference: "83.9" },
    ],
  },
  GBP: {
    checkedOn: "2026-08-04",
    items: [
      { key: "interestRate", status: "MATCH", reference: "3.75" },
      { key: "unemployment", status: "MATCH", reference: "4.9" },
      { key: "gdpQoQ", status: "MATCH", reference: "0.6" },
      { key: "cpi", status: "MISMATCH", reference: "2.6" },
      { key: "tradeBalance", status: "MISMATCH", reference: "-1044 M" },
      { key: "pmiServices", status: "MISMATCH", reference: "51.8" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "51.9" },
      { key: "retailSales", status: "MISMATCH", reference: "1" },
      { key: "currentAccount", status: "MISMATCH", reference: "-22134 M" },
      { key: "consumerConfidence", status: "MISMATCH", reference: "-17" },
    ],
  },
  USD: {
    checkedOn: "2026-08-04",
    items: [
      { key: "interestRate", status: "MATCH", reference: "3.75" },
      { key: "cpi", status: "MATCH", reference: "3.5" },
      { key: "unemployment", status: "MATCH", reference: "4.2" },
      { key: "nfp", status: "MATCH", reference: "57 k" },
      { key: "tradeBalance", status: "MATCH", reference: "-77.59" },
      { key: "retailSales", status: "MATCH", reference: "0.2" },
      // Notre carte est libellée « PMI Services (ISM) » et vaut 54 : c'est la
      // ligne « PMI non manufacturier » de Trading Economics (54, préc. 54.5),
      // pas sa ligne « Services PMI » à 53.6 qui vient de S&P Global.
      { key: "pmiServices", status: "MATCH", reference: "54 (ISM non manuf.)" },
      // Même donnée que TE, convention différente : les États-Unis publient
      // leur PIB en rythme annualisé (1.5 = notre 0.37 trimestriel × 4), et
      // notre pct_change_yoy vaut 2.1, exactement la « croissance annuelle »
      // affichée par TE. Voir le point ouvert sur le barème scoreGdp.
      { key: "gdpQoQ", status: "MATCH", reference: "1.5 annualisé = 0.37 QoQ" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "53.9" },
      { key: "currentAccount", status: "MISMATCH", reference: "-227" },
      { key: "consumerConfidence", status: "MISMATCH", reference: "55.2" },
    ],
  },
  CAD: {
    checkedOn: "2026-08-04",
    items: [
      { key: "interestRate", status: "MATCH", reference: "2.25" },
      { key: "cpi", status: "MATCH", reference: "2.8" },
      { key: "tradeBalance", status: "MATCH", reference: "4240 M" },
      { key: "unemployment", status: "MISMATCH", reference: "6.5" },
      { key: "gdpQoQ", status: "MISMATCH", reference: "0" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "53" },
      { key: "retailSales", status: "MISMATCH", reference: "0.4" },
      { key: "currentAccount", status: "MISMATCH", reference: "-7184 M" },
      { key: "consumerConfidence", status: "MISMATCH", reference: "47.6" },
    ],
  },
  CHF: {
    checkedOn: "2026-08-04",
    items: [
      { key: "interestRate", status: "MATCH", reference: "0" },
      { key: "retailSales", status: "MATCH", reference: "0.2" },
      // FXMacroData étiquette cette série « Inflation, YOY » mais sert en
      // réalité la variation MENSUELLE : -0.1 / 0.0 / 0.2 correspond au
      // « taux d'inflation mensuel » de TE, pas à son taux annuel de 0.4.
      // Son source_series_id vaut d'ailleurs UNKNOWN.
      { key: "cpi", status: "MISMATCH", reference: "0.4 annuel (nous servons le mensuel)" },
      // Mesure différente, pas erreur : FXMacroData sert le taux ILO
      // harmonisé (5.18), TE le taux SECO des chômeurs inscrits (2.9), qui
      // est celui que le marché cite pour la Suisse.
      { key: "unemployment", status: "MISMATCH", reference: "2.9 (SECO inscrits)" },
      { key: "gdpQoQ", status: "MISMATCH", reference: "0.4" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "53.2" },
      { key: "tradeBalance", status: "MISMATCH", reference: "3800 M" },
      { key: "currentAccount", status: "MISMATCH", reference: "15544 M" },
    ],
  },
  JPY: {
    checkedOn: "2026-08-12",
    items: [
      // TE affiche la cible BoJ arrondie (1) ; nous servons désormais le taux
      // au jour le jour non collatéralisé réellement constaté (BoJ, moyenne
      // mensuelle) — 0.98 en juillet 2026, quelques points de base sous la
      // cible, ce qui est le comportement normal de ce taux de marché. Même
      // écart que le CPI/chômage suisses : mesure plus précise, pas erreur.
      { key: "interestRate", status: "MISMATCH", reference: "1 (cible BoJ arrondie)" },
      // Le profil pondère le CPI HORS PRODUITS FRAIS — la mesure que cible la
      // BoJ — et c'est ce que dit le libellé de la carte. TE l'affiche sur sa
      // page « Core Inflation Rate » : 1.6 en juin 2026, ce que sert
      // désormais le Bureau de la statistique. Son 1.7 « Inflation Rate »
      // est l'indice global, une autre mesure.
      { key: "cpi", status: "MATCH", reference: "1.6 (hors produits frais)" },
      { key: "unemployment", status: "MATCH", reference: "2.5" },
      // Le Japon publie son PIB en trimestriel brut, directement comparable
      // (contrairement aux États-Unis) : 0.45 contre 0.5 arrondi par TE.
      { key: "gdpQoQ", status: "MATCH", reference: "0.5" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "54.5" },
      { key: "pmiServices", status: "MISMATCH", reference: "51.9" },
      { key: "retailSales", status: "MISMATCH", reference: "-4.1" },
      // TE sert la balance commerciale douanière du ministère des Finances
      // (marchandises uniquement, base dédouanement) ; nous servons la
      // balance biens & services de la Balance des paiements (base BPM6),
      // co-publiée par la BoJ et le même ministère — un agrégat plus large,
      // pas une erreur de source (aucune série douanière trouvée dans l'API
      // BoJ Time-Series Data Search).
      { key: "tradeBalance", status: "MISMATCH", reference: "-407 Md¥ (base douanière, MoF)" },
      // Vérifié : notre compte courant BoJ de mai 2026 vaut 3968.25 Md¥,
      // identique au chiffre TE ci-dessous.
      { key: "currentAccount", status: "MATCH", reference: "3968 Md¥" },
      { key: "consumerConfidence", status: "MISMATCH", reference: "34.9" },
    ],
  },
  NZD: {
    checkedOn: "2026-08-04",
    items: [
      { key: "interestRate", status: "MATCH", reference: "2.5" },
      { key: "cpi", status: "MATCH", reference: "4.1" },
      { key: "unemployment", status: "MATCH", reference: "5.3" },
      { key: "gdpQoQ", status: "MISMATCH", reference: "0.8" },
      { key: "tradeBalance", status: "MISMATCH", reference: "23 M" },
      { key: "pmiManufacturing", status: "MISMATCH", reference: "59.7" },
      { key: "retailSales", status: "MISMATCH", reference: "0.9" },
      { key: "currentAccount", status: "MISMATCH", reference: "-1008 M" },
      { key: "consumerConfidence", status: "MISMATCH", reference: "80.4" },
    ],
  },
};

async function main() {
  let written = 0;

  for (const [currencyCode, { checkedOn, items }] of Object.entries(CHECKS)) {
    for (const item of items) {
      await prisma.indicatorCheck.upsert({
        where: {
          currencyCode_indicatorKey: { currencyCode, indicatorKey: item.key },
        },
        create: {
          currencyCode,
          indicatorKey: item.key,
          status: item.status,
          reference: item.reference,
          checkedOn: new Date(`${checkedOn}T00:00:00Z`),
        },
        update: {
          status: item.status,
          reference: item.reference,
          checkedOn: new Date(`${checkedOn}T00:00:00Z`),
        },
      });
      written += 1;
    }
  }

  const match = await prisma.indicatorCheck.count({ where: { status: "MATCH" } });
  const mismatch = await prisma.indicatorCheck.count({ where: { status: "MISMATCH" } });
  console.log(`${written} vérifications enregistrées — ${match} conformes, ${mismatch} divergentes.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
