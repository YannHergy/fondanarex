import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import "dotenv/config";

import { PrismaClient, CurrencyCategory } from "../lib/generated/prisma/client.js";

neonConfig.webSocketConstructor = ws;

/**
 * Seeds REFERENCE data only — the rows the application treats as fixed
 * vocabulary: the eight tracked currencies and the tradable instruments.
 *
 * User-owned rows (accounts, trades, settings) are deliberately NOT seeded.
 * They are created per user on first sign-in, because seeding them would
 * require inventing a user and would break the moment a second one existed.
 *
 * This script is idempotent: it upserts, so running it repeatedly is safe and
 * re-running after a schema change refreshes the reference values in place.
 */

// Central bank inflation targets and NAIRU estimates, carried over from the
// legacy scoring engine (utils.ts BC_TARGETS / NAIRU). They feed the inflation
// and unemployment scorers, which measure deviation from these anchors.
const CURRENCIES = [
  {
    code: "USD",
    name: "US Dollar",
    countryCode: "US",
    category: CurrencyCategory.SAFE_HAVEN,
    centralBank: "Fed",
    cbTarget: 2.0,
    nairu: 4.0,
    sortOrder: 1,
  },
  {
    code: "EUR",
    name: "Euro",
    countryCode: "EU",
    category: CurrencyCategory.RISK_ON,
    centralBank: "ECB",
    cbTarget: 2.0,
    nairu: 6.5,
    sortOrder: 2,
  },
  {
    code: "GBP",
    name: "British Pound",
    countryCode: "GB",
    category: CurrencyCategory.RISK_ON,
    centralBank: "BoE",
    cbTarget: 2.0,
    nairu: 4.5,
    sortOrder: 3,
  },
  {
    code: "JPY",
    name: "Japanese Yen",
    countryCode: "JP",
    category: CurrencyCategory.SAFE_HAVEN,
    centralBank: "BoJ",
    cbTarget: 2.0,
    nairu: 2.5,
    sortOrder: 4,
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    countryCode: "AU",
    category: CurrencyCategory.RISK_ON,
    centralBank: "RBA",
    // RBA targets a 2–3% band; 2.5 is the midpoint the scorer measures against.
    cbTarget: 2.5,
    nairu: 4.5,
    sortOrder: 5,
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    countryCode: "CA",
    category: CurrencyCategory.RISK_ON,
    centralBank: "BoC",
    cbTarget: 2.0,
    nairu: 6.0,
    sortOrder: 6,
  },
  {
    code: "NZD",
    name: "New Zealand Dollar",
    countryCode: "NZ",
    category: CurrencyCategory.RISK_ON,
    centralBank: "RBNZ",
    cbTarget: 2.0,
    nairu: 4.5,
    sortOrder: 7,
  },
  {
    code: "CHF",
    name: "Swiss Franc",
    countryCode: "CH",
    category: CurrencyCategory.SAFE_HAVEN,
    centralBank: "SNB",
    // SNB targets a 0–2% band; 1.0 is the midpoint.
    cbTarget: 1.0,
    nairu: 2.5,
    sortOrder: 8,
  },
] as const;

/**
 * Instruments traded in the journal, unioned with the forecast set used by the
 * weekly plan.
 *
 * pipSize and pricePrecision are derived from the QUOTE currency, which is what
 * actually determines them. The legacy app hardcoded `pair.includes("JPY") ? 100
 * : 10000`, which is wrong for any pair where JPY is the base rather than the
 * quote, and offered no way to express a non-standard instrument at all.
 */
const JOURNAL_PAIRS = [
  "EUR/USD", "GBP/USD", "AUD/USD", "NZD/USD", "USD/CAD", "USD/JPY", "USD/CHF",
  "EUR/GBP", "GBP/JPY", "AUD/NZD", "EUR/JPY", "EUR/AUD", "GBP/AUD", "GBP/NZD",
  "AUD/CAD", "NZD/CAD", "EUR/CAD", "EUR/CHF", "EUR/NZD", "GBP/CAD", "GBP/CHF",
  "AUD/CHF", "NZD/CHF", "AUD/JPY", "NZD/JPY", "CAD/JPY", "CHF/JPY", "GBP/NOK",
] as const;

/** The subset surfaced in the weekly forecast view (legacy FORECAST_PAIRS). */
const FORECAST_PAIRS = new Set([
  "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "NZD/USD",
  "EUR/NZD", "GBP/NZD", "NZD/JPY", "NZD/CAD",
  "EUR/AUD", "EUR/CAD", "GBP/CAD",
  "EUR/GBP", "GBP/NOK",
]);

function instrumentSpec(symbol: string) {
  const parts = symbol.split("/");
  const base = parts[0];
  const quote = parts[1];
  if (!base || !quote) {
    throw new Error(`Malformed instrument symbol: ${symbol}`);
  }

  // JPY is quoted to 3 decimal places, so one pip is 0.01 rather than 0.0001.
  const isJpyQuoted = quote === "JPY";

  return {
    symbol,
    baseCurrency: base,
    quoteCurrency: quote,
    pipSize: isJpyQuoted ? 0.01 : 0.0001,
    contractSize: 100_000,
    pricePrecision: isJpyQuoted ? 3 : 5,
    isActive: true,
    inForecastSet: FORECAST_PAIRS.has(symbol),
  };
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL or DATABASE_URL must be set to run the seed.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    for (const currency of CURRENCIES) {
      const { code, ...rest } = currency;
      await prisma.currency.upsert({
        where: { code },
        create: { code, ...rest },
        update: rest,
      });
    }
    console.log(`Seeded ${CURRENCIES.length} currencies.`);

    for (const symbol of JOURNAL_PAIRS) {
      const spec = instrumentSpec(symbol);
      const { symbol: key, ...rest } = spec;
      await prisma.instrument.upsert({
        where: { symbol: key },
        create: spec,
        update: rest,
      });
    }
    console.log(`Seeded ${JOURNAL_PAIRS.length} instruments.`);

    const forecastCount = await prisma.instrument.count({
      where: { inForecastSet: true },
    });
    // Guards against a typo in FORECAST_PAIRS silently dropping a pair: every
    // entry must have matched a real instrument.
    if (forecastCount !== FORECAST_PAIRS.size) {
      throw new Error(
        `Forecast set mismatch: ${forecastCount} instruments flagged, but FORECAST_PAIRS lists ${FORECAST_PAIRS.size}. A symbol is probably misspelled.`,
      );
    }
    console.log(`Verified ${forecastCount} forecast instruments.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
