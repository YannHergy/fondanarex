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
