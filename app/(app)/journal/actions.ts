"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import {
  ANALYSIS_SCHEMA,
  ANALYSIS_SYSTEM,
  buildAnalysisPrompt,
  validateAnalysisVerdict,
  type AnalysisVerdict,
} from "@/domain/journal/analysis-prompt";
import { analyseJournal, type JournalAnalytics } from "@/domain/journal/analytics";
import {
  ASSISTANT_SYSTEM,
  buildAssistantContext,
  MAX_HISTORY_TURNS,
  type AssistantContext,
} from "@/domain/journal/assistant-prompt";
import {
  computeDeepStats,
  MIN_TRADES_FOR_DEEP_STATS,
  type DeepStats,
} from "@/domain/journal/deep-stats";
import { CLOSE_TYPES, EMOTIONS_AFTER, EMOTIONS_BEFORE, SESSIONS } from "@/domain/journal/filters";
import { Mt5ParseError } from "@/domain/journal/mt5-report";
import { deleteAnalysisRun, saveAnalysisRun } from "@/lib/analysis-history";
import { attachTo, removeAttachment } from "@/lib/attachments";
import { callGeminiChat, callGeminiStructured, geminiConfigured } from "@/lib/integrations/llm";
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

/**
 * Un journal sans compte n'a pas de sens.
 *
 * Un trade se juge contre un capital, un risque par position et un seuil
 * d'alerte — trois choses qui vivent sur le compte. Sans compte, le journal
 * affiche un P&L de -103,81 sans pouvoir dire si c'est 2 % ou 20 % de ce que
 * le trader a engagé, et la carte de compte n'a rien à mesurer.
 *
 * C'est aussi ce qui produisait des trades orphelins : rien n'empêchait d'en
 * saisir, ni d'importer un rapport MetaTrader, avant d'avoir créé le moindre
 * compte. Constaté le 2026-08-18 : 39 trades, zéro compte.
 */
async function requireAnAccount(userId: string): Promise<void> {
  const count = await prisma.tradingAccount.count({ where: { userId } });
  if (count === 0) {
    throw new Error(
      "Crée d'abord un compte dans « Comptes » : un trade se mesure contre un capital.",
    );
  }
}

export async function saveTrade(input: unknown): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();
  const parsed = tradeSchema.parse(input);

  // À la création seulement : modifier un trade déjà enregistré ne doit pas se
  // retrouver bloqué par une règle instaurée après coup.
  if (!parsed.id) await requireAnAccount(userId);

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
  // Le vocabulaire des setups est partagé : la page Comptes s'en sert pour
  // cocher les entrées autorisées d'un compte, et « Mes setups » pour en
  // afficher les statistiques. Ne rafraîchir que le journal laissait un setup
  // créé depuis un compte invisible sur l'écran qui venait de le créer.
  revalidatePath("/journal");
  revalidatePath("/comptes");
  revalidatePath("/setups");
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

  const accountCount = await prisma.tradingAccount.count({ where: { userId } });
  if (accountCount === 0) {
    return {
      ok: false,
      error: "Crée d'abord un compte dans « Comptes » : un rapport s'importe SUR un compte.",
    };
  }

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
 * The journal's analysis: statistics, then behaviour, in one pass.
 *
 * One model call rather than two, because the statements worth reading sit
 * ACROSS the two sets — "a low SQN alongside position size that falls after a
 * loss" is a sentence neither half could write alone. Two calls could only
 * reach it by letting one guess at the other's numbers.
 *
 * Takes the ids currently visible so the analysis matches what the user is
 * looking at. Passing the filters instead would mean reimplementing them
 * server-side and risking a drift between the two.
 */
export async function analyseJournalWithAi(input: {
  tradeIds: string[];
  periodLabel: string;
}): Promise<
  | {
      ok: true;
      verdict: AnalysisVerdict;
      analytics: JournalAnalytics;
      stats: DeepStats;
      tokens: number;
      /** Null when the run could not be persisted; the analysis is still valid. */
      runId: string | null;
    }
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

  // Enforced here, not only in the UI: below the gate a Sharpe ratio and a
  // reshuffled Monte-Carlo produce confident-looking figures describing noise,
  // and a caller that skipped the button would get exactly that.
  if (closed.length < MIN_TRADES_FOR_DEEP_STATS) {
    return {
      ok: false,
      error: `L'analyse demande au moins ${MIN_TRADES_FOR_DEEP_STATS} trades clôturés (${closed.length} pour l'instant).`,
    };
  }

  const analytics = analyseJournal(trades);
  const stats = computeDeepStats(closed);

  const result = await callGeminiStructured({
    system: ANALYSIS_SYSTEM,
    prompt: buildAnalysisPrompt(analytics, stats, parsed.data.periodLabel),
    schema: ANALYSIS_SCHEMA as unknown as object,
    validate: validateAnalysisVerdict,
    // Ten measure blocks plus the behavioural half runs long; the default would
    // truncate mid-JSON and surface as an unparseable response.
    maxTokens: 24000,
  });

  if (!result.data) {
    return { ok: false, error: result.error ?? "Analyse indisponible" };
  }

  const tokens = result.inputTokens + result.outputTokens;

  // Saved before returning, so a verdict survives closing the page and the
  // headline measures can be plotted against each other later. A failure to
  // persist must not lose the analysis the user just paid for and waited on.
  let runId: string | null = null;
  try {
    runId = await saveAnalysisRun(userId, {
      periodLabel: parsed.data.periodLabel,
      analytics,
      stats,
      verdict: result.data,
      tokens,
    });
    revalidatePath("/journal");
  } catch {
    runId = null;
  }

  return { ok: true, verdict: result.data, analytics, stats, tokens, runId };
}

export async function removeAnalysisRun(runId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await deleteAnalysisRun(userId, z.string().min(1).parse(runId));
  revalidatePath("/journal");
}

/**
 * One turn of the assistant conversation.
 *
 * The context arrives from the CLIENT because the projection runs there — the
 * figures on screen and the figures the model reads are then the same object,
 * and cannot drift. It is re-validated here rather than trusted: a malformed
 * context would otherwise reach the prompt as text.
 */
export async function askAssistant(input: {
  context: unknown;
  turns: { role: "user" | "assistant"; content: string }[];
}): Promise<{ ok: true; reply: string; tokens: number } | { ok: false; error: string }> {
  await requireUserIdOrThrow();

  const parsed = z
    .object({
      turns: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(4000),
          }),
        )
        .min(1)
        .max(MAX_HISTORY_TURNS),
    })
    .safeParse({ turns: input.turns });
  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  if (!geminiConfigured()) {
    return { ok: false, error: "Aucune clé Gemini configurée (GEMINI_API_KEY)." };
  }

  const context = input.context as AssistantContext;
  if (typeof context !== "object" || context === null || typeof context.trades !== "number") {
    return { ok: false, error: "Contexte manquant" };
  }

  const result = await callGeminiChat({
    system: `${ASSISTANT_SYSTEM}

${buildAssistantContext(context)}`,
    turns: parsed.data.turns,
  });

  if (!result.text) return { ok: false, error: result.error ?? "Réponse indisponible" };

  return { ok: true, reply: result.text, tokens: result.inputTokens + result.outputTokens };
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

/**
 * Attribue un setup à plusieurs trades d'un coup.
 *
 * Indispensable après un import : un rapport MetaTrader ne porte AUCUN setup
 * — le terminal ne sait pas pourquoi vous avez pris la position. Sans cette
 * action, étiqueter un historique de plusieurs dizaines de trades demandait
 * de les ouvrir un par un, et la page « Mes setups » restait vide de tout ce
 * qui la rend utile.
 *
 * Les identifiants sont filtrés par userId dans la requête elle-même, donc un
 * identifiant appartenant à quelqu'un d'autre ne modifie rien plutôt que de
 * lever une erreur qui révélerait son existence.
 */
export async function assignStrategy(input: unknown): Promise<{ updated: number }> {
  const userId = await requireUserIdOrThrow();
  const { tradeIds, strategy } = z
    .object({
      tradeIds: z.array(z.string().min(1).max(64)).min(1).max(500),
      // Chaîne vide = retirer l'étiquette, ce qui doit rester possible.
      strategy: z.string().max(64),
    })
    .parse(input);

  const clean = strategy.trim();
  const result = await prisma.trade.updateMany({
    where: { id: { in: tradeIds }, userId },
    data: { strategy: clean.length > 0 ? clean : null },
  });

  revalidatePath("/journal");
  revalidatePath("/setups");
  revalidatePath("/rapports");
  return { updated: result.count };
}

/**
 * Rattache un lot de trades à un compte.
 *
 * Nécessaire parce qu'un trade importé AVANT la création d'un compte n'en
 * porte aucun : 26 trades étaient dans ce cas, invisibles depuis tout onglet
 * par compte alors qu'ils comptaient dans le total. L'import MT5 rattache
 * désormais à la volée, mais rien ne rattrapait l'existant.
 *
 * Le compte est vérifié comme appartenant à l'utilisateur AVANT l'écriture :
 * sans ce contrôle, un identifiant deviné rattacherait ses trades au compte
 * d'autrui — et `updateMany`, filtré sur le seul userId des trades, ne l'aurait
 * pas empêché.
 */
/**
 * Efface les trades qui ne sont rattachés à AUCUN compte.
 *
 * Le pendant de `requireAnAccount` : celui-ci empêche d'en créer de nouveaux,
 * celle-ci nettoie ceux que l'ancienne règle a laissés. Ils n'apparaissent que
 * par la suppression d'un compte, qui les détachait au lieu de les traiter —
 * `Trade.account` est en `onDelete: SetNull`.
 *
 * Volontairement limitée aux orphelins : elle ne peut pas toucher un trade
 * rattaché, même par erreur d'appel. Un journal entier s'efface trade par
 * trade ou en détachant d'abord, jamais par cette porte.
 */
export async function deleteUnassignedTrades(): Promise<{ deleted: number }> {
  const userId = await requireUserIdOrThrow();
  const { count } = await prisma.trade.deleteMany({ where: { userId, accountId: null } });

  revalidatePath("/journal");
  revalidatePath("/comptes");
  revalidatePath("/rapports");
  return { deleted: count };
}

export async function assignAccount(input: unknown): Promise<{ updated: number }> {
  const userId = await requireUserIdOrThrow();
  const { tradeIds, accountId } = z
    .object({
      tradeIds: z.array(z.string().min(1).max(64)).min(1).max(500),
      // Chaîne vide = détacher, ce qui doit rester possible.
      accountId: z.string().max(64),
    })
    .parse(input);

  const clean = accountId.trim();
  if (clean.length > 0) {
    const owned = await prisma.tradingAccount.findFirst({
      where: { id: clean, userId },
      select: { id: true },
    });
    if (!owned) throw new Error("Compte introuvable");
  }

  const result = await prisma.trade.updateMany({
    where: { id: { in: tradeIds }, userId },
    data: { accountId: clean.length > 0 ? clean : null },
  });

  revalidatePath("/journal");
  revalidatePath("/comptes");
  revalidatePath("/rapports");
  return { updated: result.count };
}
