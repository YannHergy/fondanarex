"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { analyseJournal, type JournalAnalytics } from "@/domain/journal/analytics";
import {
  buildCoachPrompt,
  COACH_SCHEMA,
  COACH_SYSTEM,
  validateCoachVerdict,
  type CoachVerdict,
} from "@/domain/journal/coach-prompt";
import {
  computeDeepStats,
  MIN_TRADES_FOR_DEEP_STATS,
  type DeepStats,
} from "@/domain/journal/deep-stats";
import { CLOSE_TYPES, EMOTIONS_AFTER, EMOTIONS_BEFORE, SESSIONS } from "@/domain/journal/filters";
import {
  buildQuantPrompt,
  QUANT_SCHEMA,
  QUANT_SYSTEM,
  validateQuantVerdict,
  type QuantVerdict,
} from "@/domain/journal/quant-prompt";
import { Mt5ParseError } from "@/domain/journal/mt5-report";
import { attachTo, removeAttachment } from "@/lib/attachments";
import { callGeminiStructured, geminiConfigured } from "@/lib/integrations/llm";
import { importMt5Report, type ImportSummary } from "@/lib/journal-import";
import {
  addStrategy,
  createTrade,
  deleteTrade,
  listTradesForAnalysis,
  removeStrategy,
  updateTrade,
  type TradeInput,
} from "@/lib/journal";
import { requireUserIdOrThrow } from "@/lib/session";
import { UploadError } from "@/lib/storage";

const ENTRY_TYPES = [
  "M1_ENTRY",
  "M2_ENTRY",
  "A11_ENTRY",
  "A12_ENTRY",
  "A2_ENTRY",
  "A21_ENTRY",
  "A22_ENTRY",
  "GOLDEN_ENTRY",
] as const;

/** A price. Positive and finite — a zero price is a missing value, not a level. */
const price = z.number().finite().positive();

const tradeSchema = z
  .object({
    id: z.string().min(1).optional(),
    accountId: z.string().min(1).nullable().optional(),
    instrument: z.string().regex(/^[A-Z]{3}\/[A-Z]{3}$/),
    direction: z.enum(["Buy", "Sell"]),
    /** "YYYY-MM-DDTHH:mm" in the user's wall clock. */
    openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    closedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    entryPrice: price,
    exitPrice: price.nullable().optional(),
    stopLoss: price.nullable().optional(),
    takeProfit: price.nullable().optional(),
    lotSize: z.number().finite().positive().max(1000),
    commission: z.number().finite().nullable().optional(),
    swap: z.number().finite().nullable().optional(),
    strategy: z.string().max(64).nullable().optional(),
    entryType: z.enum(ENTRY_TYPES).nullable().optional(),
    session: z.enum(SESSIONS).nullable().optional(),
    closeType: z.enum(CLOSE_TYPES).nullable().optional(),
    emotionBefore: z.enum(EMOTIONS_BEFORE).nullable().optional(),
    emotionAfter: z.enum(EMOTIONS_AFTER).nullable().optional(),
    notes: z.string().max(8000).nullable().optional(),
    tags: z.array(z.string().max(32)).max(20).optional(),
  })
  // A closed trade needs an exit price, and an exit price implies a close.
  // Allowing one without the other produces a trade that is neither open nor
  // valued, which every aggregate then has to guess about.
  .refine((value) => Boolean(value.closedAt) === Boolean(value.exitPrice), {
    message: "Une clôture exige un prix de sortie, et inversement",
    path: ["exitPrice"],
  })
  .refine(
    (value) => !value.closedAt || Date.parse(value.closedAt) >= Date.parse(value.openedAt),
    { message: "La clôture ne peut pas précéder l'entrée", path: ["closedAt"] },
  );

function toInput(parsed: z.infer<typeof tradeSchema>): TradeInput {
  return {
    accountId: parsed.accountId ?? null,
    instrument: parsed.instrument,
    direction: parsed.direction,
    // Entered in local wall clock, stored as UTC.
    openedAt: new Date(`${parsed.openedAt}:00Z`),
    closedAt: parsed.closedAt ? new Date(`${parsed.closedAt}:00Z`) : null,
    entryPrice: parsed.entryPrice,
    exitPrice: parsed.exitPrice ?? null,
    stopLoss: parsed.stopLoss ?? null,
    takeProfit: parsed.takeProfit ?? null,
    lotSize: parsed.lotSize,
    commission: parsed.commission ?? null,
    swap: parsed.swap ?? null,
    strategy: parsed.strategy ?? null,
    entryType: parsed.entryType ?? null,
    session: parsed.session ?? null,
    closeType: parsed.closeType ?? null,
    emotionBefore: parsed.emotionBefore ?? null,
    emotionAfter: parsed.emotionAfter ?? null,
    notes: parsed.notes ?? null,
    tags: parsed.tags ?? [],
  };
}

export async function saveTrade(input: unknown): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();
  const parsed = tradeSchema.parse(input);

  if (parsed.id) {
    await updateTrade(userId, parsed.id, toInput(parsed));
    revalidatePath("/journal");
    return { id: parsed.id };
  }

  const id = await createTrade(userId, toInput(parsed));
  revalidatePath("/journal");
  revalidatePath("/rapports");
  return { id };
}

export async function removeTrade(tradeId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await deleteTrade(userId, z.string().min(1).parse(tradeId));
  revalidatePath("/journal");
}

export async function createStrategy(name: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await addStrategy(userId, z.string().min(1).max(64).parse(name));
  revalidatePath("/journal");
}

export async function deleteStrategy(name: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await removeStrategy(userId, z.string().min(1).max(64).parse(name));
  revalidatePath("/journal");
}

/** Reports run to a few hundred kilobytes; a megabyte is already generous. */
const MAX_REPORT_BYTES = 8 * 1024 * 1024;

/**
 * Decodes the uploaded report.
 *
 * MetaTrader writes report HTML as UTF-16 as often as UTF-8, depending on
 * version and platform. Reading a UTF-16 file as UTF-8 yields text with a NUL
 * between every character, which no regex in the parser would match — the
 * import would fail with "table not found" on a perfectly valid file. The byte
 * order mark settles it.
 */
function decodeReport(bytes: Uint8Array): string {
  const [b0, b1, b2] = bytes;

  if (b0 === 0xff && b1 === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (b0 === 0xfe && b1 === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Imports closed trades from a MetaTrader 5 HTML report.
 *
 * Returns the outcome instead of throwing, because a partial import is the
 * normal case: a report routinely contains instruments the journal does not
 * carry, and the user needs to be told which rather than left to notice a
 * missing trade weeks later.
 */
export async function importMt5(
  formData: FormData,
): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const userId = await requireUserIdOrThrow();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu" };
  if (file.size === 0) return { ok: false, error: "Le fichier est vide" };
  if (file.size > MAX_REPORT_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (8 Mo maximum)" };
  }

  // XLSX is a ZIP archive, so the parser would see binary noise and report a
  // missing table. Naming the real problem saves a round trip.
  if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return {
      ok: false,
      error:
        "Ce format n'est pas lu. Dans MetaTrader, choisis « Rapport » puis enregistre en HTML.",
    };
  }

  const accountId = formData.get("accountId");

  try {
    const html = decodeReport(new Uint8Array(await file.arrayBuffer()));
    const summary = await importMt5Report(userId, html, {
      accountId: typeof accountId === "string" && accountId ? accountId : null,
    });

    if (summary.imported > 0) {
      revalidatePath("/journal");
      revalidatePath("/rapports");
    }

    return { ok: true, summary };
  } catch (error) {
    if (error instanceof Mt5ParseError) return { ok: false, error: error.message };
    return { ok: false, error: "Lecture du rapport impossible" };
  }
}

/**
 * Behavioural analysis of the journal.
 *
 * The maths never leave the machine: `analyseJournal` computes every figure
 * under test, and the model receives that result as text. It is asked to
 * interpret, never to derive — a model that computes a win rate can return a
 * different one on a second run with nothing in the output to show it.
 *
 * Takes the trade ids currently visible so the analysis matches what the user
 * is looking at. Passing the filters themselves would mean reimplementing them
 * server-side and risking a drift between the two.
 */
export async function analyseJournalWithAi(input: {
  tradeIds: string[];
  periodLabel: string;
}): Promise<
  | { ok: true; verdict: CoachVerdict; analytics: JournalAnalytics; tokens: number }
  | { ok: false; error: string }
> {
  const userId = await requireUserIdOrThrow();

  const parsed = z
    .object({
      tradeIds: z.array(z.string().min(1)).min(1).max(2000),
      periodLabel: z.string().min(1).max(120),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  if (!geminiConfigured()) {
    return { ok: false, error: "Aucune clé Gemini configurée (GEMINI_API_KEY)." };
  }

  const trades = await listTradesForAnalysis(userId, parsed.data.tradeIds);
  const closed = trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null);

  // Below a handful of trades every breakdown is one or two rows deep, and the
  // model would dress coincidence as a habit however firmly the prompt warns it.
  if (closed.length < 5) {
    return {
      ok: false,
      error: `Il faut au moins 5 trades clôturés pour une analyse qui tienne (${closed.length} pour l'instant).`,
    };
  }

  const analytics = analyseJournal(trades);

  const result = await callGeminiStructured({
    system: COACH_SYSTEM,
    prompt: buildCoachPrompt(analytics, parsed.data.periodLabel),
    schema: COACH_SCHEMA as unknown as object,
    validate: validateCoachVerdict,
  });

  if (!result.data) {
    return { ok: false, error: result.error ?? "Analyse indisponible" };
  }

  return {
    ok: true,
    verdict: result.data,
    analytics,
    tokens: result.inputTokens + result.outputTokens,
  };
}

/**
 * Deep statistical analysis of the journal.
 *
 * Gated at 30 closed trades, and the gate is enforced HERE rather than only in
 * the UI: below it a Sharpe ratio or a reshuffled Monte-Carlo produces a
 * confident-looking figure describing nothing but noise, and a caller that
 * skipped the button would get exactly that.
 */
export async function deepStatsWithAi(input: {
  tradeIds: string[];
  periodLabel: string;
}): Promise<
  | { ok: true; verdict: QuantVerdict; stats: DeepStats; tokens: number }
  | { ok: false; error: string }
> {
  const userId = await requireUserIdOrThrow();

  const parsed = z
    .object({
      tradeIds: z.array(z.string().min(1)).min(1).max(2000),
      periodLabel: z.string().min(1).max(120),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  if (!geminiConfigured()) {
    return { ok: false, error: "Aucune clé Gemini configurée (GEMINI_API_KEY)." };
  }

  const trades = await listTradesForAnalysis(userId, parsed.data.tradeIds);
  const closed = trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null);

  if (closed.length < MIN_TRADES_FOR_DEEP_STATS) {
    return {
      ok: false,
      error: `L'analyse statistique demande au moins ${MIN_TRADES_FOR_DEEP_STATS} trades clôturés (${closed.length} pour l'instant).`,
    };
  }

  const stats = computeDeepStats(closed);

  const result = await callGeminiStructured({
    system: QUANT_SYSTEM,
    prompt: buildQuantPrompt(stats, parsed.data.periodLabel),
    schema: QUANT_SCHEMA as unknown as object,
    validate: validateQuantVerdict,
    // Eight blocks of concept, reading and advice runs long; the default would
    // truncate mid-JSON and surface as an unparseable response.
    maxTokens: 16000,
  });

  if (!result.data) {
    return { ok: false, error: result.error ?? "Analyse indisponible" };
  }

  return {
    ok: true,
    verdict: result.data,
    stats,
    tokens: result.inputTokens + result.outputTokens,
  };
}

export async function uploadTradeScreenshot(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserIdOrThrow();

  const parsed = z.object({ tradeId: z.string().min(1) }).safeParse({
    tradeId: formData.get("tradeId"),
  });
  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu" };

  try {
    await attachTo(userId, { kind: "trade", id: parsed.data.tradeId }, file);
    revalidatePath("/journal");
    return { ok: true };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: "Téléversement impossible" };
  }
}

export async function deleteTradeScreenshot(attachmentId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await removeAttachment(userId, z.string().min(1).parse(attachmentId));
  revalidatePath("/journal");
}
