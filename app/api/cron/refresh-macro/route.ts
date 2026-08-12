import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { recordScoresAndAlert } from "@/lib/alerts";
import { refreshChinaDemand } from "@/lib/china";
import { refreshDairyGdt } from "@/lib/dairy";
import { refreshJpCurrentAccount } from "@/lib/jp-current-account";
import { OECD_FIELDS } from "@/lib/integrations/oecd";
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
 * Authentication is a shared secret, not a session: a scheduler has no cookies.
 * Note that with app authentication currently disabled this is the ONLY
 * protected endpoint in the app — and it must stay protected, because it makes
 * outbound API calls that consume the owner's rate limits.
 */

export const dynamic = "force-dynamic";
// The upstream fetches dominate; the default serverless budget is not enough.
export const maxDuration = 60;

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

/** 1-366, UTC. Only used to pick a stable rotation index, not a real date. */
function dayOfYear(): number {
  const now = new Date();
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - startOfYear) / 86_400_000) + 1;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `?dataset=cpi` pulls a single OECD dataset, so a schedule can walk them one
  // per invocation and stay inside the platform's execution limit.
  //
  // The daily schedule (vercel.json) calls this with NO query string at all,
  // so without a default it silently fell through to "pull all five" — the
  // exact case the comment above describes avoiding. Fetching all five costs
  // ~30s of deliberately-spaced OECD requests before a single row is even
  // written, which is half of Vercel's Hobby-plan ceiling gone on a source
  // that, since RBA/StatCan/Stats NZ/Eurostat/ONS took over the fields that
  // matter, wins almost nothing — it is now relevant mainly for PMI.
  //
  // A day-of-year rotation (free: no cron-schedule or plan change, no extra
  // billed function invocations) picks ONE dataset when the caller does not
  // name one, cycling through all five across five days. `?dataset=<field>`
  // still targets one explicitly, and `?dataset=all` opts back into the old
  // "every dataset, one call" behaviour for a by-hand full refresh — knowing
  // that call risks the same timeout this default exists to avoid.
  const requestedDataset = request.nextUrl.searchParams.get("dataset");
  const dataset =
    requestedDataset === "all"
      ? null
      : (requestedDataset ?? OECD_FIELDS[dayOfYear() % OECD_FIELDS.length]);
  const skipFred = request.nextUrl.searchParams.get("fred") === "0";

  // BEFORE the macro pull, not after, and the ordering is load-bearing.
  //
  // `refreshMacroData` alone exceeds this function's 60-second budget against
  // the OECD — measured: FUNCTION_INVOCATION_TIMEOUT at 61s on Vercel. Anything
  // sequenced after it therefore never runs at all. These two are a handful of
  // requests each and finish in about a second, so they go first and are
  // already committed by the time the slow work times out.
  let china: Awaited<ReturnType<typeof refreshChinaDemand>> | null = null;
  let dairy: Awaited<ReturnType<typeof refreshDairyGdt>> | null = null;
  let oil: Awaited<ReturnType<typeof refreshOilChange>> | null = null;
  let jpCurrentAccount: Awaited<ReturnType<typeof refreshJpCurrentAccount>> | null = null;
  const fastUserId = await currentUserId().catch(() => null);
  if (fastUserId) {
    // Independent sources, so they go out together — one failing must not
    // delay or lose the others.
    [china, dairy, oil, jpCurrentAccount] = await Promise.all([
      refreshChinaDemand(fastUserId).catch(() => null),
      refreshDairyGdt(fastUserId).catch(() => null),
      refreshOilChange(fastUserId).catch(() => null),
      refreshJpCurrentAccount(fastUserId).catch(() => null),
    ]);
  }

  try {
    const report = await refreshMacroData({
      oecdFields: dataset ? [dataset] : undefined,
      skipFred,
    });

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
      { ...report, alerts, china, dairy, oil, jpCurrentAccount },
      { status: report.written > 0 ? 200 : 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = GET;
