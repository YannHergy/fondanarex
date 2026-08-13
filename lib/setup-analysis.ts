import "server-only";

import {
  SETUP_ANALYSIS_SYSTEM,
  buildSetupAnalysisPrompt,
  releasesInWindow,
  type ConditionTone,
  type ReleaseForPrompt,
  type SetupCondition,
} from "@/domain/previsions/setup-analysis";
import { callClaudeStructured } from "@/lib/integrations/llm";
import { getReleases } from "@/lib/releases";
import { getAttachment } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

/**
 * Analyse fondamentale d'un setup, capture à l'appui.
 *
 * Croise trois choses que seul le serveur détient ensemble : le scénario écrit
 * par le trader, ses captures, et le calendrier économique réel de la période
 * visée. Le modèle ne devine aucune de ces trois — il les confronte.
 *
 * Claude uniquement : c'est le seul des modèles branchés, avec Gemini, qui
 * lise une image, et le seul dont la sortie est déjà contrainte par un schéma
 * JSON validé.
 */

/** Deux captures suffisent à décrire un setup et bornent le coût du message. */
const MAX_IMAGES = 2;

/** Formats qu'Anthropic accepte. Un autre type est ignoré plutôt que refusé. */
const SUPPORTED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface SetupAnalysisResult {
  ok: boolean;
  message: string;
  analyse?: string;
  conditions?: SetupCondition[];
  macroBias?: string;
  verdict?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    biais_macro: { type: "string", enum: ["Haussier", "Baissier", "Neutre"] },
    analyse: { type: "string" },
    conditions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          release: { type: "string" },
          currency: { type: "string" },
          at: { type: "string" },
          requirement: { type: "string" },
          tone: { type: "string", enum: ["favorable", "risque", "neutre"] },
        },
        required: ["release", "currency", "at", "requirement", "tone"],
        additionalProperties: false,
      },
    },
    verdict: { type: "string", enum: ["corrobore", "contredit", "aucun_lien"] },
  },
  required: ["biais_macro", "analyse", "conditions", "verdict"],
  additionalProperties: false,
} as const;

interface Parsed {
  biais_macro: string;
  analyse: string;
  conditions: SetupCondition[];
  verdict: string;
}

const TONES = new Set<ConditionTone>(["favorable", "risque", "neutre"]);

function validate(value: unknown): Parsed | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.analyse !== "string" || typeof v.verdict !== "string") return null;

  const conditions: SetupCondition[] = Array.isArray(v.conditions)
    ? v.conditions.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const c = raw as Record<string, unknown>;
        const tone = c.tone as ConditionTone;
        if (
          typeof c.release !== "string" ||
          typeof c.currency !== "string" ||
          typeof c.at !== "string" ||
          typeof c.requirement !== "string" ||
          !TONES.has(tone)
        ) {
          return [];
        }
        return [
          {
            release: c.release,
            currency: c.currency.toUpperCase(),
            at: c.at,
            requirement: c.requirement,
            tone,
          },
        ];
      })
    : [];

  return {
    biais_macro: typeof v.biais_macro === "string" ? v.biais_macro : "Neutre",
    analyse: v.analyse,
    conditions,
    verdict: v.verdict,
  };
}

/**
 * Ne garde que les conditions qui correspondent à une publication RÉELLE.
 *
 * Le prompt interdit d'inventer une publication, mais une consigne n'est pas
 * une garantie : un modèle qui hallucine un « NFP » inexistant produirait une
 * bande verte parfaitement crédible pour une donnée qui ne sortira jamais.
 * L'appariement se fait sur la devise et le jour — pas sur le libellé, que le
 * modèle peut légitimement reformuler.
 */
function keepRealConditions(
  conditions: readonly SetupCondition[],
  releases: readonly ReleaseForPrompt[],
): SetupCondition[] {
  const real = new Set(
    releases.map((r) => `${r.currencyCode}|${r.at.toISOString().slice(0, 10)}`),
  );
  return conditions.filter((c) => {
    const day = new Date(c.at);
    if (Number.isNaN(day.getTime())) return false;
    return real.has(`${c.currency}|${day.toISOString().slice(0, 10)}`);
  });
}

export async function analyseSetup(
  userId: string,
  setupId: string,
  horizonDays: number,
): Promise<SetupAnalysisResult> {
  // La propriété passe par le plan : un setup n'a pas d'userId propre, et
  // l'identifiant vient du client.
  const setup = await prisma.planSetup.findFirst({
    where: { id: setupId, weekPlan: { userId } },
    include: { screenshots: { orderBy: { position: "asc" }, take: MAX_IMAGES } },
  });
  if (!setup) return { ok: false, message: "Setup introuvable." };

  const now = new Date();
  const releases = await getReleases(userId);

  const inWindow: ReleaseForPrompt[] = releasesInWindow(
    releases.map((r) => ({
      currencyCode: r.currencyCode,
      label: r.label,
      at: r.at,
      impact: r.impact,
      previous: r.previous,
    })),
    setup.instrument,
    horizonDays,
    now,
  );

  // Les captures sont lues depuis le stockage, jamais depuis une URL fournie
  // par le client : une URL sortante serait un moyen de faire télécharger
  // n'importe quoi au serveur.
  const images: Array<{ mediaType: string; base64: string }> = [];
  for (const shot of setup.screenshots) {
    const blob = await getAttachment(shot.blobPath).catch(() => null);
    if (!blob || !SUPPORTED.has(blob.mimeType)) continue;
    images.push({
      mediaType: blob.mimeType,
      base64: Buffer.from(blob.bytes).toString("base64"),
    });
  }

  const prompt = buildSetupAnalysisPrompt(
    {
      instrument: setup.instrument,
      bias: setup.technicalBias,
      entryZone: setup.entryZone,
      tp: setup.tp,
      sl: setup.sl,
      notes: setup.notes,
      horizonDays,
      screenshotCount: images.length,
    },
    inWindow,
    now,
  );

  const { data, error } = await callClaudeStructured<Parsed>({
    system: SETUP_ANALYSIS_SYSTEM,
    prompt,
    schema: SCHEMA,
    validate,
    maxTokens: 2000,
    images,
  });

  if (!data) return { ok: false, message: error ?? "Analyse impossible." };

  const conditions = keepRealConditions(data.conditions, inWindow);
  const invented = data.conditions.length - conditions.length;

  await prisma.planSetup.update({
    where: { id: setup.id },
    data: {
      horizonDays,
      macroBias: data.biais_macro,
      macroConditions: conditions as unknown as object,
      fundamentalNotes: data.analyse,
    },
  });

  const counted =
    inWindow.length === 0
      ? "aucune publication sur la période"
      : `${conditions.length} condition(s) sur ${inWindow.length} publication(s)`;

  return {
    ok: true,
    message:
      `Biais macro : ${data.biais_macro} · ${counted}` +
      (invented > 0 ? ` · ${invented} condition(s) inventée(s) écartée(s)` : ""),
    analyse: data.analyse,
    conditions,
    macroBias: data.biais_macro,
    verdict: data.verdict,
  };
}
