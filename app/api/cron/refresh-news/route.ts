import { NextResponse } from "next/server";

import { refreshNews } from "@/lib/news";

/**
 * Scheduled news refresh.
 *
 * Guarded by the same shared secret as the macro refresh: these endpoints
 * write to shared tables and reach out to third-party feeds, so an open one is
 * both a data risk and a way for anyone to burn the rate limits.
 *
 * GDELT is only pulled when asked. It enforces one request every five seconds,
 * so a full pass costs about twenty — fine on a schedule, far too slow for
 * anything a person is waiting on.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const withGdelt = new URL(request.url).searchParams.get("gdelt") === "1";

  try {
    const summary = await refreshNews({ withGdelt });

    // A run where EVERY source refused is not a success, and answering 200
    // for it is what hid a three-day outage: the schedule kept reporting
    // `ok: true` with `fetched: 0` while FXStreet was turning Vercel away.
    // A quiet news day still fetches articles and simply stores none of
    // them, so "nothing fetched AND a source complained" is the honest
    // signal to fail on — a partial outage stays 200 with its failures
    // listed, because the articles that did arrive are worth keeping.
    const blackout = summary.fetched === 0 && summary.failures.length > 0;

    return NextResponse.json({ ok: !blackout, ...summary }, { status: blackout ? 502 : 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Échec du rafraîchissement" },
      { status: 500 },
    );
  }
}
