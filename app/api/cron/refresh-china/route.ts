import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { recordScoresAndAlert } from "@/lib/alerts";
import { refreshChinaDemand } from "@/lib/china";
import { currentUserId } from "@/lib/session";

/**
 * Refreshes the Chinese demand composite on its own.
 *
 * Separate from `refresh-macro` deliberately. That route pulls the OECD and
 * overruns its 60-second budget on Vercel, so anything sharing it inherits a
 * timeout it did nothing to earn. This is five FXMacroData requests and an
 * arithmetic recombination — about a second — and it must stay independently
 * runnable so the indicator can be refreshed, and verified, without waiting on
 * a job that fails.
 *
 * No entry in vercel.json: the macro schedule already calls the same function
 * in-process, before its slow work. This exists for manual runs and checks.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  // An unset secret closes the endpoint rather than opening it: this spends
  // the owner's API quota.
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const fromQuery = request.nextUrl.searchParams.get("secret") ?? "";

  return timingSafeEqual(bearer, expected) || timingSafeEqual(fromQuery, expected);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Base de données indisponible" }, { status: 503 });
  }

  const report = await refreshChinaDemand(userId);

  // The AUD and NZD scores move with this value, so every screen that shows
  // them is invalidated — not just the two currency pages.
  if (report.written > 0) {
    revalidatePath("/", "layout");

    // A written value moves the scores, and the score curve has to record it.
    // Without this the history only ever reflects the full macro refresh, and
    // a change arriving through this route is invisible on the chart.
    try {
      await recordScoresAndAlert(userId);
    } catch {
      /* the reading stands; only the curve point is lost */
    }
  }

  return NextResponse.json(report, { status: report.error ? 502 : 200 });
}

export const POST = GET;
