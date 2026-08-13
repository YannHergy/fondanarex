import "server-only";

import crypto from "node:crypto";

import {
  buildTranslatePrompt,
  parseTranslations,
  TRANSLATE_SCHEMA,
  TRANSLATE_SYSTEM,
} from "@/domain/news/translate";
import { callGeminiStructured, geminiConfigured } from "@/lib/integrations/llm";
import { prisma } from "@/lib/prisma";

/**
 * French titles for central-bank press releases.
 *
 * The releases themselves come from FXMacroData fresh on every page view and
 * are never stored locally, so caching lives here instead: each title is
 * hashed and looked up in `PressReleaseTranslation` before anything is sent to
 * Gemini, so the same communiqué is billed once no matter how many times the
 * panel renders. The link a reader clicks always stays on the bank's own
 * English page — only the label shown on this site is translated.
 */
function hashTitle(title: string): string {
  return crypto.createHash("sha256").update(title.trim()).digest("hex");
}

/** Returns whatever it could translate; a missing entry falls back to English. */
export async function translateTitles(titles: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(titles.map((t) => t.trim()).filter((t) => t.length > 0))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const hashOf = new Map(unique.map((title) => [title, hashTitle(title)]));
  const cached = await prisma.pressReleaseTranslation.findMany({
    where: { titleHash: { in: [...hashOf.values()] } },
    select: { titleHash: true, titleFr: true },
  });
  const frByHash = new Map(cached.map((row) => [row.titleHash, row.titleFr]));

  const missing: string[] = [];
  for (const title of unique) {
    const fr = frByHash.get(hashOf.get(title)!);
    if (fr) out.set(title, fr);
    else missing.push(title);
  }

  if (missing.length === 0 || !geminiConfigured()) return out;

  const items = missing.map((title, i) => ({ id: String(i), title, summary: "" }));
  const result = await callGeminiStructured({
    system: TRANSLATE_SYSTEM,
    prompt: buildTranslatePrompt(items),
    schema: TRANSLATE_SCHEMA as unknown as object,
    validate: (value) => {
      const map = parseTranslations(value);
      return map.size > 0 ? map : null;
    },
    maxTokens: 4000,
  });

  if (!result.data) return out;

  for (const item of items) {
    const translation = result.data.get(item.id);
    if (!translation) continue;
    out.set(item.title, translation.titre);
  }

  // Cached after render, not before: a title the reader never ends up seeing
  // still costs nothing extra, and a cache-write failure never blocks the
  // translation already held in `out`.
  if (out.size > 0) {
    try {
      await prisma.$transaction(
        [...out.entries()]
          .filter(([title]) => missing.includes(title))
          .map(([title, titleFr]) =>
            prisma.pressReleaseTranslation.upsert({
              where: { titleHash: hashTitle(title) },
              create: { titleHash: hashTitle(title), title, titleFr },
              update: { titleFr },
            }),
          ),
      );
    } catch {
      /* the translation already reached this render; only the cache write was lost */
    }
  }

  return out;
}
