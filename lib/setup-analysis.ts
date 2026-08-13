import "server-only";

import {
  SETUP_ANALYSIS_SYSTEM,
  buildSetupAnalysisPrompt,
  releasesInWindow,
  type ReleaseForPrompt,
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
  ventsPorteurs?: string;
  ventsContraires?: string;
  verdict?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    analyse: { type: "string" },
    vents_porteurs: { type: "string" },
    vents_contraires: { type: "string" },
    verdict: { type: "string", enum: ["corrobore", "contredit", "aucun_lien"] },
  },
  required: ["analyse", "vents_porteurs", "vents_contraires", "verdict"],
  additionalProperties: false,
} as const;

interface Parsed {
  analyse: string;
  vents_porteurs: string;
  vents_contraires: string;
  verdict: string;
}

function validate(value: unknown): Parsed | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.analyse !== "string" || typeof v.verdict !== "string") return null;
  return {
    analyse: v.analyse,
    vents_porteurs: typeof v.vents_porteurs === "string" ? v.vents_porteurs : "",
    vents_contraires: typeof v.vents_contraires === "string" ? v.vents_contraires : "",
    verdict: v.verdict,
  };
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

  await prisma.planSetup.update({
    where: { id: setup.id },
    data: {
      horizonDays,
      fundamentalNotes: data.analyse,
      tailwinds: data.vents_porteurs,
      headwinds: data.vents_contraires,
    },
  });

  const counted =
    inWindow.length === 0
      ? "aucune publication sur la période"
      : `${inWindow.length} publication(s) confrontée(s)`;

  return {
    ok: true,
    message: `Analyse écrite · ${counted} · verdict : ${data.verdict.replace("_", " ")}`,
    analyse: data.analyse,
    ventsPorteurs: data.vents_porteurs,
    ventsContraires: data.vents_contraires,
    verdict: data.verdict,
  };
}
