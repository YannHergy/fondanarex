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
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Échec du rafraîchissement" },
      { status: 500 },
    );
  }
}
