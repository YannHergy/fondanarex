import type { Metadata } from "next";
import Link from "next/link";

import { RangePicker } from "@/app/(app)/calendrier/_components/range-picker";
import { ReleaseRow } from "@/app/(app)/calendrier/_components/release-row";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { filterByRange, isRangeKey, type RangeKey } from "@/domain/events/range";
import { getReleases, type Release } from "@/lib/releases";
import { requireUserId } from "@/lib/session";
import { CURRENCY_CODES, cn, isCurrencyCode } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendrier" };

/**
 * Economic calendar.
 *
 * Built from the indicators the currency pages already track, NOT from a
 * separate news feed. Every indicator already carries its next publication
 * date, its current reading and the one before it — which is exactly what a
 * calendar row is. A second unrelated feed would have listed events with no
 * connection to the figures actually driving the scores.
 *
 * The previous version read WeeklyEvent, a table filled by hand, which is why
 * the page was empty: nobody had typed anything into it.
 */

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "lundi 3 août" -> "Lundi 3 août" — French locale lower-cases the weekday. */
function capitalise(text: string): string {
  return text.replace(/(^|\s)\p{L}/u, (letter) => letter.toUpperCase());
}

/** Local day key, so grouping matches the day the user actually sees. */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; devise?: string }>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;

  const range: RangeKey = isRangeKey(params.periode) ? params.periode : "semaine";
  const requested = params.devise?.toUpperCase();
  const filterCurrency = requested && isCurrencyCode(requested) ? requested : null;

  const all = await getReleases(userId);
  const now = new Date();

  const scoped = filterCurrency ? all.filter((r) => r.currencyCode === filterCurrency) : all;
  const releases = filterByRange(scoped, range, now);

  // Grouped by day so the list reads like a calendar rather than a flat feed.
  const byDay = new Map<string, Release[]>();
  for (const release of releases) {
    const key = dayKey(release.at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(release);
    else byDay.set(key, [release]);
  }

  const href = (over: { periode?: string; devise?: string | null }) => {
    const next = new URLSearchParams();
    const merged = { periode: range, devise: filterCurrency, ...over };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/calendrier?${next.toString()}`;
  };

  const highCount = releases.filter((r) => r.impact === "high").length;
  const publishedCount = releases.filter((r) => r.actual !== null).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Calendrier économique"
        subtitle="Publications des indicateurs suivis, par devise"
      >
        <RangePicker value={range} />
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Publications", value: releases.length, tone: "text-fg" },
          { label: "Impact fort", value: highCount, tone: "text-brand-red" },
          { label: "Déjà publiées", value: publishedCount, tone: "text-brand-green" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
              {stat.label}
            </p>
            <p className={cn("mt-1 font-mono text-2xl font-bold", stat.tone)}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={href({ devise: null })}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
              filterCurrency === null
                ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
                : "border-border-app text-muted hover:text-fg",
            )}
          >
            Toutes
          </Link>
          {CURRENCY_CODES.map((code) => (
            <Link key={code} href={href({ devise: code })} aria-label={`Filtrer sur ${code}`}>
              <CurrencyBadge
                code={code}
                size="sm"
                className={filterCurrency === code ? "" : "opacity-45"}
              />
            </Link>
          ))}
        </div>
      </Card>

      {byDay.size === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="event_busy" size={28} className="text-subtle" />
            <p className="text-muted text-sm">Aucune publication sur cette période.</p>
            <p className="text-subtle text-xs">Élargis la période, ou retire le filtre de devise.</p>
          </div>
        </Card>
      ) : (
        [...byDay.entries()].map(([key, dayReleases]) => {
          const date = dayReleases[0]!.at;
          const isToday = dayKey(now) === key;

          return (
            <Card key={key}>
              <CardTitle icon="calendar_month" className="mb-3">
                <span className="flex items-center gap-2">
                  {capitalise(dayFmt.format(date))}
                  {isToday ? (
                    <span className="border-brand-blue/40 bg-brand-blue/10 text-brand-blue rounded border px-1.5 py-px text-[9px] font-bold uppercase">
                      Aujourd&apos;hui
                    </span>
                  ) : null}
                </span>
              </CardTitle>
              <div className="space-y-1.5">
                {dayReleases.map((release) => (
                  <ReleaseRow
                    key={`${release.currencyCode}-${release.indicatorKey}`}
                    release={release}
                  />
                ))}
              </div>
            </Card>
          );
        })
      )}

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Ces publications proviennent des indicateurs suivis sur chaque page devise. Le{" "}
            <strong>précédent</strong> est la valeur en vigueur avant la publication ; le{" "}
            <strong>réel</strong> reste vide tant que le chiffre n&apos;est pas sorti. Une heure
            affichée « — » signifie que la source fournit la date sans l&apos;horaire.
          </p>
        </div>
      </Card>
    </div>
  );
}
