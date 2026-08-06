import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { refreshDairyGdt } from "@/lib/dairy";
import { currentUserId } from "@/lib/session";

/**
 * Refreshes the GDT dairy auction reading on its own.
 *
 * Separate from `refresh-macro` for the same reason the China route is: that
 * job overruns its 60-second budget against the OECD, and anything sequenced
 * behind it never runs. This is two static JSON reads.
 *
 * No entry in vercel.json — the macro schedule calls the same function
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

  const report = await refreshDairyGdt(userId);

  if (report.written > 0) revalidatePath("/", "layout");

  return NextResponse.json(report, { status: report.error ? 502 : 200 });
}

export const POST = GET;
