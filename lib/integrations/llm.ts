import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { AIName, CurrencyBias } from "@/domain/briefing/consensus";

/**
 * LLM calls for the AI briefing.
 *
 * All three providers are called from the server. In the legacy app the
 * Anthropic and Perplexity keys were `VITE_`-prefixed, which means Vite inlined
 * them into the client bundle — anyone could read them from the browser and
 * spend the owner's quota. Those keys should be treated as compromised and
 * rotated; nothing here reaches the client.
 */

// ── Structured output ──────────────────────────────────────────────────────

const biasSchema = z.object({
  bias: z.enum(["Bullish", "Bearish", "Neutral"]),
  explanation: z.string(),
  conviction: z.enum(["Haute", "Moyenne", "Basse"]).optional(),
  changed: z.boolean().optional(),
});

/**
 * Response shape every debate round must produce.
 *
 * Built per call because the currency keys differ by group. Enforced by the
 * API rather than coaxed by prompt: the legacy version asked for "valid JSON,
 * no markdown" in the system prompt and then stripped code fences with a regex
 * — which silently produced an empty analysis whenever a model wrapped its
 * answer differently.
 */
function responseSchema(codes: readonly string[]) {
  const shape: Record<string, z.ZodTypeAny> = { summary: z.string() };
  for (const code of codes) shape[code] = biasSchema;
  return z.object(shape);
}

/** JSON Schema for the providers that take one directly. */
function jsonSchemaFor(codes: readonly string[]) {
  const properties: Record<string, unknown> = {
    summary: { type: "string" },
  };
  for (const code of codes) {
    properties[code] = {
      type: "object",
      properties: {
        bias: { type: "string", enum: ["Bullish", "Bearish", "Neutral"] },
        explanation: { type: "string" },
        conviction: { type: "string", enum: ["Haute", "Moyenne", "Basse"] },
        changed: { type: "boolean" },
      },
      required: ["bias", "explanation"],
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    properties,
    required: ["summary", ...codes],
    additionalProperties: false,
  };
}

export interface LlmResult {
  ai: AIName;
  model: string;
  content: string;
  biases: Record<string, CurrencyBias>;
  /** Raw research text, for the Perplexity round. */
  researchText?: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Non-null when the call failed. The UI MUST branch on this. */
  error: string | null;
  /** Anthropic stop_reason, when available. */
  stopReason: string | null;
}

function emptyResult(ai: AIName, model: string, startedAt: number, error: string): LlmResult {
  return {
    ai,
    model,
    content: "",
    biases: {},
    durationMs: Date.now() - startedAt,
    inputTokens: null,
    outputTokens: null,
    error,
    stopReason: null,
  };
}

/** Normalises a parsed payload into the domain bias shape. */
function toBiases(
  parsed: Record<string, unknown>,
  codes: readonly string[],
): Record<string, CurrencyBias> {
  const biases: Record<string, CurrencyBias> = {};

  for (const code of codes) {
    const entry = parsed[code];
    if (!entry || typeof entry !== "object") continue;

    const value = entry as Record<string, unknown>;
    const bias = value.bias;
    if (bias !== "Bullish" && bias !== "Bearish" && bias !== "Neutral") continue;

    biases[code] = {
      bias,
      explanation: typeof value.explanation === "string" ? value.explanation : "",
      conviction: value.conviction as CurrencyBias["conviction"],
      changedOpinion: typeof value.changed === "boolean" ? value.changed : undefined,
    };
  }

  return biases;
}

/**
 * Best-effort JSON extraction, for providers without schema enforcement.
 *
 * Only used for Groq and Perplexity; the Anthropic path uses the API's own
 * structured output and never needs this.
 */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const braced = /\{[\s\S]*\}/.exec(candidate);
  if (!braced) return null;

  try {
    const parsed: unknown = JSON.parse(braced[0]);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ── Anthropic ──────────────────────────────────────────────────────────────

/** Claude Opus 5 pricing, USD per million tokens. */
export const CLAUDE_PRICING = { model: "claude-opus-5", input: 5, output: 25 } as const;

export function anthropicConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").length > 0;
}

/**
 * Structured Claude call against an arbitrary schema.
 *
 * `callClaude` below is bound to the briefing's per-currency bias shape. This
 * one takes the JSON Schema and a Zod validator, for callers that need a
 * different result — the weekly plan's scenarios and week-ahead, which are not
 * currency verdicts.
 *
 * The schema is enforced by the API, and the Zod pass is not redundant: it
 * proves the parsed value matches what the CALLER expects, so a schema and a
 * type drifting apart is a caught error rather than a runtime surprise.
 */
export async function callClaudeStructured<T>(options: {
  system: string;
  prompt: string;
  schema: object;
  validate: (value: unknown) => T | null;
  maxTokens?: number;
}): Promise<{ data: T | null; error: string | null; inputTokens: number; outputTokens: number }> {
  const model = CLAUDE_PRICING.model;

  if (!anthropicConfigured()) {
    return { data: null, error: "ANTHROPIC_API_KEY absente", inputTokens: 0, outputTokens: 0 };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 2000,
      system: options.system,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: options.schema } },
      messages: [{ role: "user", content: options.prompt }],
    } as Parameters<typeof client.messages.stream>[0]);

    const message = await stream.finalMessage();
    const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };

    if (message.stop_reason === "refusal") {
      return { data: null, error: "Requête refusée par le modèle", ...usage };
    }
    if (message.stop_reason === "max_tokens") {
      return { data: null, error: "Réponse tronquée (max_tokens)", ...usage };
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const parsed = extractJson(text);
    if (!parsed) return { data: null, error: "Réponse illisible", ...usage };

    const data = options.validate(parsed);
    return data
      ? { data, error: null, ...usage }
      : { data: null, error: "Réponse hors schéma", ...usage };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Erreur Anthropic",
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export async function callClaude(options: {
  system: string;
  prompt: string;
  codes: readonly string[];
  maxTokens?: number;
}): Promise<LlmResult> {
  const startedAt = Date.now();
  const model = CLAUDE_PRICING.model;

  if (!anthropicConfigured()) {
    return emptyResult("Claude", model, startedAt, "ANTHROPIC_API_KEY absente");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Streaming because a long debate round can exceed the non-streaming HTTP
    // timeout; `finalMessage()` still yields the complete message.
    const stream = client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 4000,
      system: options.system,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: jsonSchemaFor(options.codes) },
      },
      messages: [{ role: "user", content: options.prompt }],
    } as Parameters<typeof client.messages.stream>[0]);

    const message = await stream.finalMessage();

    // A refusal returns HTTP 200 with an empty or partial body. Reading
    // content[0] without checking first would surface a refusal as a blank
    // but apparently successful analysis.
    if (message.stop_reason === "refusal") {
      return {
        ...emptyResult("Claude", model, startedAt, "Requête refusée par le modèle"),
        stopReason: "refusal",
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const parsed = extractJson(text);
    if (!parsed) {
      return {
        ...emptyResult("Claude", model, startedAt, "Réponse illisible"),
        stopReason: message.stop_reason,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    }

    const validated = responseSchema(options.codes).safeParse(parsed);

    return {
      ai: "Claude",
      model,
      content:
        (validated.success ? String(validated.data.summary) : undefined) ??
        (typeof parsed.summary === "string" ? parsed.summary : ""),
      biases: toBiases(parsed, options.codes),
      durationMs: Date.now() - startedAt,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      // A truncated response is not a successful one — surface it so the UI
      // does not render a half-finished analysis as complete.
      error: message.stop_reason === "max_tokens" ? "Réponse tronquée (max_tokens)" : null,
      stopReason: message.stop_reason,
    };
  } catch (error) {
    return emptyResult(
      "Claude",
      model,
      startedAt,
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ── Groq ───────────────────────────────────────────────────────────────────

const GROQ_MODEL = "llama-3.3-70b-versatile";

export function groqConfigured(): boolean {
  return (process.env.GROQ_API_KEY ?? "").length > 0;
}

export async function callGroq(options: {
  system: string;
  prompt: string;
  codes: readonly string[];
  maxTokens?: number;
}): Promise<LlmResult> {
  const startedAt = Date.now();

  if (!groqConfigured()) {
    return emptyResult("Groq", GROQ_MODEL, startedAt, "GROQ_API_KEY absente");
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: options.maxTokens ?? 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.prompt },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!response.ok) {
      return emptyResult(
        "Groq",
        GROQ_MODEL,
        startedAt,
        payload.error?.message ?? `Groq ${response.status}`,
      );
    }

    const text = payload.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);

    return {
      ai: "Groq",
      model: GROQ_MODEL,
      content: parsed && typeof parsed.summary === "string" ? parsed.summary : "",
      biases: parsed ? toBiases(parsed, options.codes) : {},
      durationMs: Date.now() - startedAt,
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      error: parsed ? null : "Réponse illisible",
      stopReason: payload.choices?.[0]?.finish_reason ?? null,
    };
  } catch (error) {
    return emptyResult(
      "Groq",
      GROQ_MODEL,
      startedAt,
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ── Perplexity (research round) ────────────────────────────────────────────

/**
 * `sonar-pro` rather than `sonar`: it searches more sources per query and
 * returns longer, better-cited answers. The research round is the only place
 * the briefing touches the live web, and the base model kept replying that it
 * "could not find enough dated results" on half the currency groups.
 */
const PERPLEXITY_MODEL = "sonar-pro";

export function perplexityConfigured(): boolean {
  return (process.env.PERPLEXITY_API_KEY ?? "").length > 0;
}

/**
 * Research round. Returns prose, not a verdict — Perplexity gathers current
 * facts for the other two models to argue over, and does not vote.
 */
export async function callPerplexity(options: {
  prompt: string;
  maxTokens?: number;
}): Promise<LlmResult> {
  const startedAt = Date.now();

  if (!perplexityConfigured()) {
    return emptyResult("Perplexity", PERPLEXITY_MODEL, startedAt, "PERPLEXITY_API_KEY absente");
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        max_tokens: options.maxTokens ?? 2000,
        messages: [
          {
            role: "system",
            content:
              "Tu es un chercheur macroéconomique. Tu rapportes des faits récents, sourcés et datés. Tu ne donnes aucune opinion directionnelle. Réponds en français.",
          },
          { role: "user", content: options.prompt },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (!response.ok) {
      return emptyResult(
        "Perplexity",
        PERPLEXITY_MODEL,
        startedAt,
        payload.error?.message ?? `Perplexity ${response.status}`,
      );
    }

    const text = payload.choices?.[0]?.message?.content ?? "";

    return {
      ai: "Perplexity",
      model: PERPLEXITY_MODEL,
      content: text,
      researchText: text,
      biases: {},
      durationMs: Date.now() - startedAt,
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      error: text.trim().length > 0 ? null : "Recherche vide",
      stopReason: payload.choices?.[0]?.finish_reason ?? null,
    };
  } catch (error) {
    return emptyResult(
      "Perplexity",
      PERPLEXITY_MODEL,
      startedAt,
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ── Gemini ─────────────────────────────────────────────────────────────────

/**
 * Google's free tier covers this workload outright: 1 500 requests a day
 * against a journal analysis run a few times a week. Chosen over a paid
 * provider for that reason alone — at ~2k in / 1.2k out per call the token
 * price of every candidate rounded to under half a dollar a month, so entry
 * cost was the only real difference.
 *
 * `gemini-2.5-flash` is deliberately NOT the default: Google has closed it to
 * new API keys, and it answers with an error rather than a fallback.
 */
const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").length > 0;
}

/**
 * Structured Gemini call against a response schema.
 *
 * Mirrors `callClaudeStructured`: the schema is enforced by the API and the
 * Zod pass afterwards proves the parsed value matches what the CALLER expects,
 * so a schema drifting from a type is a caught error rather than a surprise at
 * render time.
 */
export async function callGeminiStructured<T>(options: {
  system: string;
  prompt: string;
  schema: object;
  validate: (value: unknown) => T | null;
  maxTokens?: number;
}): Promise<{ data: T | null; error: string | null; inputTokens: number; outputTokens: number }> {
  const empty = { inputTokens: 0, outputTokens: 0 };

  if (!geminiConfigured()) {
    return { data: null, error: "GEMINI_API_KEY absente", ...empty };
  }

  try {
    const response = await fetch(`${GEMINI_URL}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: options.maxTokens ?? 8000,
          responseMimeType: "application/json",
          responseSchema: options.schema,
        },
      }),
    });

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      error?: { message?: string };
    };

    const usage = {
      inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
    };

    if (!response.ok || payload.error) {
      return { data: null, error: payload.error?.message ?? `HTTP ${response.status}`, ...usage };
    }

    const candidate = payload.candidates?.[0];
    // MAX_TOKENS truncates mid-JSON, which then fails to parse for a reason the
    // caller could not otherwise diagnose.
    if (candidate?.finishReason === "MAX_TOKENS") {
      return { data: null, error: "Réponse tronquée (maxOutputTokens)", ...usage };
    }

    const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    if (!text.trim()) return { data: null, error: "Réponse vide", ...usage };

    const parsed = extractJson(text);
    if (!parsed) return { data: null, error: "Réponse illisible", ...usage };

    const data = options.validate(parsed);
    return data
      ? { data, error: null, ...usage }
      : { data: null, error: "Réponse hors schéma", ...usage };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Erreur Gemini",
      ...empty,
    };
  }
}

/** Cost of a Claude call in USD. Only Anthropic pricing is tracked. */
export function claudeCostUsd(inputTokens: number | null, outputTokens: number | null): number {
  const input = ((inputTokens ?? 0) / 1_000_000) * CLAUDE_PRICING.input;
  const output = ((outputTokens ?? 0) / 1_000_000) * CLAUDE_PRICING.output;
  return Number((input + output).toFixed(6));
}
