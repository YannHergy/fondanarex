import "server-only";

import { z } from "zod";

import { callClaudeStructured, callPerplexity } from "@/lib/integrations/llm";

/**
 * The AI panels of the weekly plan.
 *
 * Nothing here is persisted. These are research aids the trader reads while
 * writing the plan; what they decide goes into the plan's own fields, in their
 * own words. Caching a model's opinion as if it were data would give it a
 * permanence it has not earned.
 *
 * The legacy versions called Anthropic and Perplexity from the BROWSER with
 * `VITE_`-prefixed keys, then parsed the reply with a code-fence regex. Here
 * the calls are server-side and Claude's schema is enforced by the API.
 */

const scenarioSchema = z.object({
  scenarioBullish: z.string(),
  scenarioBearish: z.string(),
  conclusion: z.string(),
  conclusionType: z.enum(["bullish", "bearish", "neutral"]),
});

export type EventScenario = z.infer<typeof scenarioSchema>;

const SCENARIO_JSON_SCHEMA = {
  type: "object",
  properties: {
    scenarioBullish: { type: "string" },
    scenarioBearish: { type: "string" },
    conclusion: { type: "string" },
    conclusionType: { type: "string", enum: ["bullish", "bearish", "neutral"] },
  },
  required: ["scenarioBullish", "scenarioBearish", "conclusion", "conclusionType"],
  additionalProperties: false,
} as const;

const ANALYST_SYSTEM =
  "Tu es un analyste forex spécialisé en fondamentaux macroéconomiques. Tu raisonnes par mécanisme : donnée → conséquence macro → réaction de la banque centrale → effet sur la devise. Réponds en français.";

/** Both directions a release could take, and which is likelier. */
export async function generateEventScenario(input: {
  label: string;
  currency: string;
  country: string;
  currentValue: string;
}): Promise<{ scenario: EventScenario | null; error: string | null }> {
  const prompt = [
    `Publication à venir : "${input.label}" pour ${input.currency} (${input.country}).`,
    `Dernière valeur connue : ${input.currentValue}.`,
    "",
    "Décris les deux scénarios possibles, chacun comme une chaîne causale courte :",
    "condition → impact macro → réaction de la banque centrale → effet sur la devise.",
    "",
    `Puis conclus en une ligne sur la direction la plus probable pour ${input.currency}, et classe-la.`,
  ].join("\n");

  const result = await callClaudeStructured({
    system: ANALYST_SYSTEM,
    prompt,
    schema: SCENARIO_JSON_SCHEMA,
    validate: (value) => scenarioSchema.safeParse(value).data ?? null,
    maxTokens: 900,
  });

  return { scenario: result.data, error: result.error };
}

const geoEventSchema = z.object({
  title: z.string(),
  description: z.string(),
  impact: z.enum(["risk-on", "risk-off", "neutre"]),
  source: z.string(),
  url: z.string(),
});

export type GeoEvent = z.infer<typeof geoEventSchema>;

/**
 * Geopolitical events bearing on the week.
 *
 * Perplexity, because this needs current facts with sources rather than
 * reasoning. Its output is not schema-enforced, so each entry is validated
 * individually and the malformed ones are dropped — one bad row should not
 * discard the rest.
 */
export async function fetchGeoEvents(): Promise<{ events: GeoEvent[]; error: string | null }> {
  const result = await callPerplexity({
    prompt: [
      "Quels événements géopolitiques en cours peuvent impacter le marché des changes cette semaine ?",
      "Conflits, tensions commerciales, élections, déclarations politiques majeures.",
      "Pour chacun, précise l'effet sur l'appétit pour le risque (risk-on / risk-off / neutre).",
      "Sources : reuters.com, bloomberg.com, forexlive.com. Cite les dates.",
      "",
      'Réponds en JSON : {"events": [{"title": "...", "description": "2-3 phrases sur l\'impact forex", "impact": "risk-on|risk-off|neutre", "source": "Reuters", "url": "https://..."}]}',
    ].join("\n"),
  });

  if (result.error) return { events: [], error: result.error };

  const parsed = safeParseJson(result.researchText ?? result.content);
  const rows = Array.isArray((parsed as { events?: unknown })?.events)
    ? ((parsed as { events: unknown[] }).events)
    : [];

  const events = rows
    .map((row) => geoEventSchema.safeParse(row).data)
    .filter((event): event is GeoEvent => event !== undefined);

  return {
    events,
    error: events.length === 0 && rows.length > 0 ? "Réponse hors format" : null,
  };
}

const weekAheadEventSchema = z.object({
  day: z.string(),
  name: z.string(),
  currentValue: z.string(),
  scenarioBullish: z.string(),
  scenarioBearish: z.string(),
  conclusion: z.string(),
  conclusionType: z.enum(["bullish", "bearish", "neutral"]),
});

export type WeekAheadEvent = z.infer<typeof weekAheadEventSchema>;

const WEEK_AHEAD_JSON_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string" },
          name: { type: "string" },
          currentValue: { type: "string" },
          scenarioBullish: { type: "string" },
          scenarioBearish: { type: "string" },
          conclusion: { type: "string" },
          conclusionType: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        },
        required: [
          "day",
          "name",
          "currentValue",
          "scenarioBullish",
          "scenarioBearish",
          "conclusion",
          "conclusionType",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["events"],
  additionalProperties: false,
} as const;

/**
 * The week's calendar for one currency, with a scenario per release.
 *
 * Two stages, as in the legacy function: Perplexity finds what is scheduled,
 * Claude turns it into structured scenarios. Splitting them is what makes the
 * result usable — the researcher has current facts but no enforced shape, the
 * reasoner has an enforced shape but no calendar.
 *
 * If the research stage fails the second stage still runs on internal context
 * alone, and says so, rather than the panel returning nothing.
 */
export async function generateWeekAhead(input: {
  currency: string;
  country: string;
  weekLabel: string;
  setupBias: string | null;
}): Promise<{ events: WeekAheadEvent[]; error: string | null; researchFailed: boolean }> {
  const research = await callPerplexity({
    prompt: [
      `Calendrier économique de ${input.currency} (${input.country}) pour la ${input.weekLabel.toLowerCase()}.`,
      "Liste chaque publication : jour, nom exact, dernière valeur connue et consensus s'il existe.",
      "Uniquement des faits datés, aucune opinion directionnelle.",
    ].join("\n"),
  });

  const researchFailed = Boolean(research.error);

  const result = await callClaudeStructured({
    system: ANALYST_SYSTEM,
    prompt: [
      `Publications de ${input.currency} (${input.country}) pour la ${input.weekLabel.toLowerCase()}.`,
      "",
      "=== CALENDRIER ===",
      researchFailed
        ? "(recherche indisponible — appuie-toi sur le calendrier habituel de cette devise et dis-le dans les conclusions)"
        : (research.researchText ?? ""),
      "",
      input.setupBias
        ? `Position actuelle du trader : ${input.setupBias}. Signale explicitement ce qui la menacerait.`
        : "Aucune position ouverte sur cette devise.",
      "",
      "Pour chaque publication, donne les deux scénarios sous forme de chaîne causale courte, puis une conclusion d'une ligne et son classement.",
    ].join("\n"),
    schema: WEEK_AHEAD_JSON_SCHEMA,
    validate: (value) => {
      const rows = (value as { events?: unknown }).events;
      if (!Array.isArray(rows)) return null;
      return rows
        .map((row) => weekAheadEventSchema.safeParse(row).data)
        .filter((event): event is WeekAheadEvent => event !== undefined);
    },
    maxTokens: 3000,
  });

  return { events: result.data ?? [], error: result.error, researchFailed };
}

function safeParseJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const braced = /\{[\s\S]*\}/.exec(candidate);
  if (!braced) return null;

  try {
    return JSON.parse(braced[0]);
  } catch {
    return null;
  }
}
