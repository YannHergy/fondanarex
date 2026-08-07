"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MARKET_FIELDS } from "@/domain/market-context";
import { parseObservationDate, parseReleaseDate } from "@/domain/market-context/observation-date";
import { contextKeyToDb, STANCE_TO_DB } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Manual data entry.
 *
 * Everything here writes to IndicatorOverride, CurrencyNote or
 * MarketContextValue — never to IndicatorValue. That is the structural
 * guarantee that a scheduled API refresh cannot overwrite hand-entered data:
 * the refresh only ever touches IndicatorValue, and reads prefer the override.
 *
 * The legacy app kept both in one localStorage blob and defended manual entries
 * with a hand-maintained PROTECTED_FIELDS allowlist, which silently stopped
 * protecting any field somebody forgot to add to it.
 */

const CODE = z.string().regex(/^[A-Z]{3}$/, "Code devise invalide");

/** Indicator keys the admin screen may override. */
const EDITABLE_INDICATORS = [
  "interestRate",
  "gdpQoQ",
  "pmiManufacturing",
  "pmiServices",
  "cpi",
  "coreCpi",
  "ppi",
  "unemployment",
  "retailSales",
  "wagePPI",
  "tradeBalance",
  "currentAccount",
  "consumerConfidence",
  "nfp",
  "corePce",
  "zew",
  "ifo",
  // Champs ajoutés avec leurs sources respectives (FXMacroData, Yahoo,
  // e-Stat). Éditables au même titre que les autres : une source
  // automatique peut se tromper, et la correction manuelle reste
  // prioritaire à la lecture.
  "employmentChange",
  "commodityPrice",
  "oilPrice",
  "chinaDemand",
  "riskSentiment",
  "tokyoCpi",
  "usSpillover",
  "eurChf",
] as const;

/**
 * `partialRecord`, NOT `record`, and the difference is not cosmetic.
 *
 * Zod 4 made `z.record(z.enum(...), v)` EXHAUSTIVE: every key of the enum must
 * be present or parsing fails. The editor deliberately sends only the fields
 * that were touched — submitting all of them would create an override for each
 * one and freeze values nobody edited against future refreshes — so every
 * partial save was rejected, and the action answered 500.
 *
 * It went unnoticed because the failure is silent from the outside: the
 * browser shows "Échec de l'enregistrement" and the value simply does not
 * change. Verified against the installed Zod: `{ interestRate: 3.5 }` fails
 * with "expected number, received undefined" on every other key.
 */
const overridesSchema = z.object({
  code: CODE,
  // null clears the override and hands the field back to the API value.
  values: z.partialRecord(z.enum(EDITABLE_INDICATORS), z.number().finite().nullable()),
  /**
   * Publication date per indicator, AAAA-MM-JJ. An entry that is absent, null
   * or empty keeps the source's own date rather than stamping today onto it.
   */
  periods: z.partialRecord(z.enum(EDITABLE_INDICATORS), z.string().max(10).nullish()).optional(),
  /** Next expected publication per indicator, AAAA-MM-JJ. Normally a FUTURE date. */
  releases: z.partialRecord(z.enum(EDITABLE_INDICATORS), z.string().max(10).nullish()).optional(),
});

export async function saveIndicatorOverrides(input: unknown): Promise<{ saved: number }> {
  const userId = await requireUserIdOrThrow();
  const { code, values, periods, releases } = overridesSchema.parse(input);

  // One clock for the whole batch: reading it per field could put two
  // indicators saved in the same click on opposite sides of midnight.
  const now = new Date();

  let saved = 0;

  for (const [indicatorKey, value] of Object.entries(values)) {
    if (value === null) {
      // Deleting rather than storing a null: absence of a row is what "use the
      // API value" means, and a null override would be indistinguishable from
      // a genuine zero.
      await prisma.indicatorOverride.deleteMany({
        where: { userId, currencyCode: code, indicatorKey },
      });
      saved += 1;
      continue;
    }

    // An empty date is not "today" here — it is "leave the source's date
    // alone", which is why the empty case yields null rather than falling
    // through to parseObservationDate's today default.
    const key = indicatorKey as (typeof EDITABLE_INDICATORS)[number];

    const rawPeriod = periods?.[key];
    let periodEnd: Date | null = null;

    if (typeof rawPeriod === "string" && rawPeriod.trim() !== "") {
      const parsed = parseObservationDate(rawPeriod, now);
      if (!parsed.date) throw new Error(`${indicatorKey} — ${parsed.error}`);
      periodEnd = parsed.date;
    }

    // Deliberately a DIFFERENT parser: a next release is expected to be in the
    // future, where an observation may never be. Using parseObservationDate
    // here would refuse every date worth entering.
    const rawRelease = releases?.[key];
    let nextRelease: Date | null = null;

    if (typeof rawRelease === "string" && rawRelease.trim() !== "") {
      const parsed = parseReleaseDate(rawRelease, now);
      if (!parsed.date) throw new Error(`${indicatorKey} — ${parsed.error}`);
      nextRelease = parsed.date;
    }

    await prisma.indicatorOverride.upsert({
      where: { userId_currencyCode_indicatorKey: { userId, currencyCode: code, indicatorKey } },
      create: { userId, currencyCode: code, indicatorKey, value, periodEnd, nextRelease },
      update: { value, periodEnd, nextRelease },
    });
    saved += 1;
  }

  revalidatePath("/", "layout");
  return { saved };
}

const noteSchema = z.object({
  code: CODE,
  stance: z.enum(["Very Hawkish", "Hawkish", "Neutral", "Dovish", "Very Dovish"]),
  geopoliticalRisks: z.string().max(5000),
  qualitativeAnalysis: z.string().max(5000),
  eventsToWatch: z.array(z.string().max(300)).max(50),
});

export async function saveCurrencyNote(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = noteSchema.parse(input);

  const data = {
    stance: STANCE_TO_DB[parsed.stance],
    geopoliticalRisks: parsed.geopoliticalRisks,
    qualitativeAnalysis: parsed.qualitativeAnalysis,
    eventsToWatch: parsed.eventsToWatch.filter((e) => e.trim().length > 0),
  };

  await prisma.currencyNote.upsert({
    where: { userId_currencyCode: { userId, currencyCode: parsed.code } },
    create: { userId, currencyCode: parsed.code, ...data },
    update: data,
  });

  revalidatePath("/", "layout");
}

const CONTEXT_KEYS = MARKET_FIELDS.map((f) => f.key as string);

const contextSchema = z.object({
  values: z.record(z.string(), z.number().finite().nullable()),
  /** AAAA-MM-JJ. Absent or empty means today. */
  observedOn: z.string().max(10).nullish(),
});

export async function saveMarketContext(input: unknown): Promise<{ saved: number; date: string }> {
  const userId = await requireUserIdOrThrow();
  const { values, observedOn: requested } = contextSchema.parse(input);

  // The administrator may back-date an entry, because the day a figure is
  // TYPED is routinely not the day it describes — a GDT result read on
  // Thursday belongs to Tuesday's auction. Validated in the domain, and
  // re-validated HERE rather than trusted from the client: a server action is
  // a public endpoint, and the browser's date input is a convenience, not a
  // constraint.
  //
  // The clock is read once and passed in, so the bound and the default cannot
  // disagree by a tick across midnight.
  const { date: observedOn, error } = parseObservationDate(requested, new Date());
  if (!observedOn) throw new Error(error ?? 'Date invalide');

  // The table keeps one row per (user, key, day), so editing twice for the
  // same day corrects that day's value rather than appending a duplicate,
  // while another day becomes a new dated row and preserves history.

  let saved = 0;

  for (const [key, value] of Object.entries(values)) {
    if (!CONTEXT_KEYS.includes(key)) continue;
    const dbKey = contextKeyToDb(key);

    if (value === null) {
      await prisma.marketContextValue.deleteMany({ where: { userId, key: dbKey } });
      saved += 1;
      continue;
    }

    await prisma.marketContextValue.upsert({
      where: { userId_key_observedOn: { userId, key: dbKey, observedOn } },
      create: { userId, key: dbKey, value, observedOn, source: IndicatorSource.MANUAL },
      // The source is reasserted on update: a row an automatic refresh wrote
      // as MARKET or DERIVED becomes MANUAL the moment a human overrides it,
      // and the provenance column has to say so.
      update: { value, source: IndicatorSource.MANUAL },
    });
    saved += 1;
  }

  revalidatePath("/", "layout");
  return { saved, date: observedOn.toISOString().slice(0, 10) };
}

/**
 * Clears every manual override for one currency, handing all its indicators
 * back to the API values.
 */
export async function resetCurrencyOverrides(input: unknown): Promise<{ removed: number }> {
  const userId = await requireUserIdOrThrow();
  const code = CODE.parse(input);

  const { count } = await prisma.indicatorOverride.deleteMany({
    where: { userId, currencyCode: code },
  });

  revalidatePath("/", "layout");
  return { removed: count };
}

/**
 * Clears ALL manual data: every override, every note, every market-context
 * value. The scoring then reflects nothing but the API sources and the seeded
 * baseline.
 *
 * This is the destructive action the legacy app exposed as a "Reset Data"
 * button in the sidebar footer, one click away behind a single window.confirm.
 * It lives here, next to the data it destroys, and the UI requires typing the
 * word to proceed.
 */
export async function resetAllManualData(input: unknown): Promise<{
  overrides: number;
  notes: number;
  context: number;
}> {
  const userId = await requireUserIdOrThrow();

  // A typed confirmation, verified server-side. Checking only in the browser
  // would leave the action itself callable without it.
  const confirmation = z.literal("REINITIALISER").parse(input);
  void confirmation;

  const [overrides, notes, context] = await prisma.$transaction([
    prisma.indicatorOverride.deleteMany({ where: { userId } }),
    prisma.currencyNote.deleteMany({ where: { userId } }),
    prisma.marketContextValue.deleteMany({ where: { userId } }),
  ]);

  revalidatePath("/", "layout");
  return { overrides: overrides.count, notes: notes.count, context: context.count };
}
