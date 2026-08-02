import type { Metadata } from "next";

import { PineView } from "@/app/(app)/indicateurs/_components/pine-view";
import { weekStartOf, weekdays } from "@/domain/plan/week-plan";
import { listConfigs, upcomingReleases } from "@/lib/pine";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Indicateurs" };
export const dynamic = "force-dynamic";

export default async function IndicateursPage() {
  const userId = await requireUserId();

  const now = new Date();
  const week = weekdays(weekStartOf(now));
  const today = now.toISOString().slice(0, 10);

  const [newsConfigs, journalConfigs, releases] = await Promise.all([
    listConfigs(userId, "news"),
    listConfigs(userId, "journal"),
    // This week's scheduled releases, so the rows can be pre-filled from dates
    // we already hold rather than retyped — the usual way a line lands on the
    // wrong day.
    upcomingReleases(userId, week[0]!, week[week.length - 1]!),
  ]);

  return (
    <PineView
      newsConfigs={newsConfigs}
      journalConfigs={journalConfigs}
      releases={releases}
      today={today}
    />
  );
}
