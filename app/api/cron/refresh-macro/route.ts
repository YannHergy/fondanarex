import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { recordScoresAndAlert } from "@/lib/alerts";
import { refreshChinaDemand } from "@/lib/china";
import { refreshDairyGdt } from "@/lib/dairy";
import { refreshJpCurrentAccount } from "@/lib/jp-current-account";
import { refreshChfRateDate } from "@/lib/chf-rate-date";
import { refreshNominalGdp } from "@/lib/nominal-gdp-refresh";
import { refreshMacroData } from "@/lib/macro-refresh";
import { refreshOilChange } from "@/lib/oil";
import { currentUserId } from "@/lib/session";

/**
 * Scheduled macro refresh.
 *
 * Pulls the OECD and FRED and writes the readings into IndicatorValue, which is
 * what keeps every score current. Intended to run from a Netlify scheduled
 * function (see netlify.toml), but safe to call by hand.
 *
 * WHY IT RUNS AT 13:05 UTC (see the schedule in vercel.json, which is strict
 * JSON and cannot carry this note).
 *
 * It used to run at 06:10, an hour that bore no relation to when anything is
 * actually published. Traced end to end on 17 Aug 2026: StatCan released the
 * Canadian CPI at 12:30 UTC, more than six hours after the morning run had
 * finished, so the site kept showing June's figure with a "next release" date
 * already in the past — and the following automatic run was not due for
 * another seventeen hours. Only a manual click closed the gap. The release
 * time was sitting in the database the whole time; the schedule simply never
 * looked at it.
 *
 * Eight runs a day, placed just after each publication window, is what this
 * wants. Vercel's Hobby plan refuses it outright — "Hobby accounts are
 * limited to daily cron jobs", verified by a rejected deployment — so the one
 * slot available goes to the window that carries the most weight: the North
 * American batch, where the BLS, StatCan and the BEA all publish at 12:30.
 * Anything released later in the day still waits for the next morning, which
 * is the remaining gap rather than a solved problem.
 *
 * recordScoresAndAlert was made conditional in the same change. It is not
 * needed at one run a day, but it is the guard that makes a denser schedule
 * safe the moment one becomes available — without it, eight runs would
 * multiply the score history by eight.
 *
 * Authentication is a shared secret, not a session: a scheduler has no cookies.
 * Note that with app authentication currently disabled this is the ONLY
 * protected endpoint in the app — and it must stay protected, because it makes
 * outbound API calls that consume the owner's rate limits.
 */

export const dynamic = "force-dynamic";
// The upstream fetches dominate; the default serverless budget is not enough.
// Raised from 60: measured live, the ONS block — last in the sequential write
// order because it re-upserts ~870 rows every run — was being cut off by the
// 60s ceiling on every single invocation, so GBP's GDP, trade balance and
// four other ONS-sourced fields never advanced past whatever they held the
// day this first started happening. 60s was the Hobby-plan hard cap; this
// project is on a plan that allows more.
export const maxDuration = 180;

function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";

  // An unset secret means the endpoint is closed, never open. Defaulting to
  // open would leave a world-callable job that burns API quota.
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Netlify's scheduler cannot set headers, so a query parameter is accepted
  // too. It is the same secret either way.
  const fromQuery = request.nextUrl.searchParams.get("secret") ?? "";

  return timingSafeEqual(bearer, expected) || timingSafeEqual(fromQuery, expected);
}

/** Constant-time comparison, so a wrong secret cannot be guessed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skipFred = request.nextUrl.searchParams.get("fred") === "0";

  // BEFORE the macro pull, not after, and the ordering is load-bearing.
  //
  // `refreshMacroData` a déjà dépassé le budget de 60 s de cette fonction —
  // mesuré : FUNCTION_INVOCATION_TIMEOUT à 61 s sur Vercel. Anything
  // sequenced after it therefore never runs at all. These two are a handful of
  // requests each and finish in about a second, so they go first and are
  // already committed by the time the slow work times out.
  let china: Awaited<ReturnType<typeof refreshChinaDemand>> | null = null;
  let dairy: Awaited<ReturnType<typeof refreshDairyGdt>> | null = null;
  let oil: Awaited<ReturnType<typeof refreshOilChange>> | null = null;
  let jpCurrentAccount: Awaited<ReturnType<typeof refreshJpCurrentAccount>> | null = null;
  let chfRateDate: Awaited<ReturnType<typeof refreshChfRateDate>> | null = null;
  // Ne dépend d'aucun utilisateur : le PIB nominal est une échelle partagée,
  // pas une donnée de compte. Court en général sans toucher au réseau — il ne
  // rappelle la Banque mondiale que si la valeur stockée a plus de 30 jours.
  const nominalGdp = await refreshNominalGdp().catch(() => null);
  const fastUserId = await currentUserId().catch(() => null);
  if (fastUserId) {
    // Independent sources, so they go out together — one failing must not
    // delay or lose the others.
    [china, dairy, oil, jpCurrentAccount, chfRateDate] = await Promise.all([
      refreshChinaDemand(fastUserId).catch(() => null),
      refreshDairyGdt(fastUserId).catch(() => null),
      refreshOilChange(fastUserId).catch(() => null),
      refreshJpCurrentAccount(fastUserId).catch(() => null),
      refreshChfRateDate(fastUserId).catch(() => null),
    ]);
  }

  try {
    const report = await refreshMacroData({ skipFred });

    // Snapshot the resulting scores. This is what builds the score history
    // curve: without it ScoreSnapshot stays empty forever, which is exactly
    // what happened until now — the manual refresh action recorded snapshots
    // but this scheduled route never did, and every refresh so far came
    // through here.
    //
    // Best-effort on purpose: a failure here must not discard the macro data
    // that was just written successfully.
    let alerts = 0;
    try {
      const userId = await currentUserId();
      if (userId) alerts = (await recordScoresAndAlert(userId)).created;
    } catch {
      alerts = 0;
    }

    // Every screen reads these values, so the whole tree is invalidated.
    revalidatePath("/", "layout");

    return NextResponse.json(
      { ...report, alerts, china, dairy, oil, jpCurrentAccount, chfRateDate, nominalGdp },
      { status: report.written > 0 ? 200 : 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = GET;
