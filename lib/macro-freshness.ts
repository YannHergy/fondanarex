import "server-only";

import { after } from "next/server";

import { recordScoresAndAlert } from "@/lib/alerts";
import { refreshDairyGdt } from "@/lib/dairy";
import { refreshMacroData } from "@/lib/macro-refresh";
import { prisma } from "@/lib/prisma";

/**
 * Refreshes the macro readings when a publication has come due since the last
 * pull — browsing IS the schedule, the same bargain lib/news.ts already makes.
 *
 * WHY THIS EXISTS. The scheduled refresh runs once a day, and Vercel's Hobby
 * plan refuses anything denser ("Hobby accounts are limited to daily cron
 * jobs", verified by a rejected deployment). One run a day cannot track a
 * publication calendar: traced on 17 Aug 2026, StatCan released the Canadian
 * CPI at 12:30 UTC, six hours after the morning run, and the site showed
 * June's figure until somebody pressed the refresh button by hand.
 *
 * THE TRIGGER IS THE CALENDAR, not a stopwatch. The app already stores each
 * indicator's next publication instant, so the question "is there anything new
 * to fetch?" has an exact answer: has a `nextRelease` fallen between our last
 * pull and now? On a day when nothing publishes this costs two indexed queries
 * and does nothing at all — which is most days, and the reason this can sit in
 * a page render without turning every visit into an outbound fetch storm.
 */

/**
 * Never refresh twice inside this window.
 *
 * A floor, not the trigger. Vercel runs several instances, prefetches links
 * and re-renders on navigation, so a single reader can open half a dozen
 * renders in a minute; without this they would each see the same due release
 * and pile onto the same upstreams.
 */
const MIN_GAP_MINUTES = 20;

/**
 * Shared across renders in ONE instance. Vercel runs many, so this is a
 * courtesy rather than a lock — the real protection is MIN_GAP_MINUTES above,
 * which closes as soon as the first run writes.
 */
let inFlight: Promise<unknown> | null = null;

export type MacroFreshness = "fresh" | "queued";

export async function ensureFreshMacro(userId: string): Promise<MacroFreshness> {
  const newest = await prisma.indicatorValue.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });
  // An empty table is a seeding problem, not a staleness one, and kicking off
  // a full refresh from a page render is not how it should be solved.
  if (!newest) return "fresh";

  const since = newest.fetchedAt;
  const now = new Date();
  if ((now.getTime() - since.getTime()) / 60_000 < MIN_GAP_MINUTES) return "fresh";

  // The whole condition: a release fell due AFTER we last pulled. Once the
  // refresh lands, both sides of this resolve on their own — `since` moves
  // past the release, and the row's own nextRelease rolls forward to the next
  // one — so a caught-up dashboard stops asking.
  const due = await prisma.indicatorValue.findFirst({
    where: { nextRelease: { gt: since, lt: now } },
    select: { id: true },
  });
  if (!due) return "fresh";

  // `after`, never awaited inline. The reader gets the page immediately and
  // the new figures on their next load; awaiting a multi-source fetch inside a
  // render would put every upstream's latency on the critical path of a screen
  // that already has something true to show.
  after(async () => {
    try {
      inFlight ??= (async () => {
        // OECD skipped: see RefreshOptions.skipOecd. This path is the one
        // running on borrowed time, and the OECD is both the slowest source
        // and the one currently answering 500 across the board.
        //
        // Le GDT part avec, et pas seulement dans le cron.
        //
        // `refreshMacroData` ne le couvre pas : les enchères laitières vivent
        // dans `lib/dairy.ts`, appelé uniquement par les routes cron. Or c'est
        // la source qui a le plus besoin de ce chemin-ci. GDT met ses
        // résultats en ligne vers 15h15 UTC, deux heures après le passage
        // quotidien de 13h05 — le cron ne peut structurellement PAS voir une
        // enchère le jour où elle se tient, seulement le lendemain. Une visite
        // en fin d'après-midi, elle, le peut.
        //
        // Deux lectures de JSON statique, sans clé ni limite de débit : le
        // coût est négligeable même quand c'est une autre publication qui a
        // ouvert la porte.
        await Promise.all([
          refreshMacroData({ skipOecd: true }),
          refreshDairyGdt(userId).catch(() => null),
        ]);
        await recordScoresAndAlert(userId).catch(() => undefined);
      })().finally(() => {
        inFlight = null;
      });
      await inFlight;
    } catch {
      /* a background refresh that fails costs the next load, never this one */
    }
  });

  return "queued";
}
