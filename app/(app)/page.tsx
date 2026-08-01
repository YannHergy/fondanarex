import type { Metadata } from "next";
import Link from "next/link";

import { LocalTime } from "@/app/(app)/_components/local-time";
import { Card, CardTitle, NotConfigured, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import * as fx from "@/lib/integrations/fxmacrodata";
import { getScoredCurrencyList } from "@/lib/currencies";
import { scoreBgClass, scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { requireUserId } from "@/lib/session";
import { CURRENCY_CODES, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vue d'ensemble" };

function formatCountdown(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/**
 * Carry-matrix cell shading — the wider the rate gap, the stronger the colour,
 * so the best carry pairs stand out without reading every number.
 */
// Written out as literal class strings, never interpolated: Tailwind extracts
// class names by scanning the source, so a composed `bg-${tone}/10` produces no
// CSS at all and the cell silently renders unstyled.
const CARRY_CLASSES = {
  positive: [
    "bg-panel text-subtle",
    "bg-brand-green/10 text-brand-green",
    "bg-brand-green/20 text-brand-green",
    "bg-brand-green/30 text-brand-green font-bold",
  ],
  negative: [
    "bg-panel text-subtle",
    "bg-brand-red/10 text-brand-red",
    "bg-brand-red/20 text-brand-red",
    "bg-brand-red/30 text-brand-red font-bold",
  ],
} as const;

function carryClass(diff: number): string {
  const abs = Math.abs(diff);
  const level = abs >= 3 ? 3 : abs >= 1.5 ? 2 : abs >= 0.25 ? 1 : 0;
  if (level === 0 || diff === 0) return "bg-panel text-subtle";
  const ramp = diff > 0 ? CARRY_CLASSES.positive : CARRY_CLASSES.negative;
  return ramp[level] ?? ramp[0];
}

/** Resolves a promise to its value, or null if it rejects. */
async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  const userId = await requireUserId();
  const configured = fx.isConfigured();

  // Every FXMacroData panel resolves independently: one failing resource must
  // not blank the page, which is what the legacy single error banner did.
  const [currencies, risk, sessions, diffs, pressReleases, calendar, announcements] =
    await Promise.all([
      getScoredCurrencyList(userId),
      configured ? settle(fx.getRiskSentiment()) : null,
      configured ? settle(fx.getSessions()) : null,
      configured ? settle(fx.getRateDifferentials()) : null,
      configured ? settle(fx.getAllPressReleases()) : null,
      configured
        ? settle(
            Promise.all(CURRENCY_CODES.map((c) => fx.getCalendar(c))).then((all) =>
              all.flat().slice(0, 8),
            ),
          )
        : null,
      configured
        ? settle(
            Promise.all(CURRENCY_CODES.map((c) => fx.getLatestAnnouncements(c))).then((all) =>
              all.flat().slice(0, 8),
            ),
          )
        : null,
    ]);

  const ranked = [...currencies].sort((a, b) => b.scores.total - a.scores.total);
  const diffFor = (base: string, quote: string) =>
    diffs?.find((d) => d.base === base && d.quote === quote)?.differentialPct ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-4 p-5 md:p-6">
      <PageHeader title="Vue d'ensemble du marché" subtitle="Données transversales · FXMacroData" />

      {!configured ? (
        <Card>
          <NotConfigured what="Panneaux FXMacroData (sentiment, sessions, carry, calendrier)" />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          className={cn(
            risk?.status === "Risk Off"
              ? "bg-brand-red/10 border-brand-red/30"
              : "bg-brand-green/10 border-brand-green/30",
          )}
        >
          <CardTitle icon="monitoring">Sentiment de marché</CardTitle>
          {risk ? (
            <div className="flex items-center gap-3">
              <Icon
                name={risk.status === "Risk On" ? "trending_up" : "trending_down"}
                size={28}
                className={risk.status === "Risk On" ? "text-brand-green" : "text-brand-red"}
              />
              <div>
                <p
                  className={cn(
                    "text-2xl font-black",
                    risk.status === "Risk On" ? "text-brand-green" : "text-brand-red",
                  )}
                >
                  {risk.status}
                </p>
                <p className="text-subtle font-mono text-xs">
                  Score : {risk.score > 0 ? "+" : ""}
                  {risk.score}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-subtle text-xs">Indisponible</p>
          )}
        </Card>

        <Card>
          <div className="text-muted mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="schedule" size={16} />
              <h2 className="text-xs font-bold tracking-widest uppercase">Sessions FX en direct</h2>
            </div>
            <LocalTime />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(sessions ?? []).map((s) => (
              <div
                key={s.name}
                className={cn(
                  "rounded-lg border py-2 text-center",
                  s.isOpen
                    ? "bg-brand-green/10 border-brand-green/30"
                    : "bg-panel border-border-app",
                )}
              >
                <p className="text-fg text-[10px] font-bold">{s.name}</p>
                <p
                  className={cn(
                    "font-mono text-[9px]",
                    s.isOpen ? "text-brand-green" : "text-subtle",
                  )}
                >
                  {s.isOpen ? "Ouverte" : "Fermée"}
                </p>
                {s.isOpen && s.closesInMin != null ? (
                  <p className="text-subtle text-[8px]">ferme dans {formatCountdown(s.closesInMin)}</p>
                ) : null}
                {!s.isOpen && s.opensInMin != null ? (
                  <p className="text-subtle text-[8px]">ouvre dans {formatCountdown(s.opensInMin)}</p>
                ) : null}
              </div>
            ))}
            {sessions === null ? <p className="text-subtle col-span-4 text-xs">Indisponible</p> : null}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Classement de force des devises</CardTitle>
            <div className="space-y-1">
              {ranked.map((c, index) => (
                <Link
                  key={c.code}
                  href={`/devise/${c.code}`}
                  className="hover:bg-panel flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors"
                >
                  <span className="text-subtle w-5 font-mono text-xs">{index + 1}</span>
                  <CurrencyBadge code={c.code} />
                  <div className="bg-panel h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className={cn("h-full rounded-full", scoreBgClass(c.scores.total))}
                      style={{ width: `${c.scores.total}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "tabular w-10 text-right font-mono text-sm font-bold",
                      scoreTextClass(c.scores.total),
                    )}
                  >
                    {c.scores.total}
                  </span>
                  <span
                    className={cn(
                      "w-24 text-right text-xs font-semibold",
                      scoreTextClass(c.scores.total),
                    )}
                  >
                    {scoreVerdict(c.scores.total)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <CardTitle icon="swap_horiz">Matrice carry — différentiels de taux</CardTitle>
            <table className="w-full text-xs">
              <caption className="sr-only">
                Différentiel de taux entre chaque devise de base (lignes) et de cotation (colonnes)
              </caption>
              <thead>
                <tr>
                  <th className="p-1" />
                  {CURRENCY_CODES.map((c) => (
                    <th key={c} scope="col" className="text-subtle p-1 font-mono">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CURRENCY_CODES.map((base) => (
                  <tr key={base}>
                    <th scope="row" className="text-fg p-1 text-left font-mono font-bold">
                      {base}
                    </th>
                    {CURRENCY_CODES.map((quote) => {
                      if (base === quote) {
                        return (
                          <td key={quote} className="text-subtle p-1 text-center">
                            —
                          </td>
                        );
                      }
                      const d = diffFor(base, quote);
                      return (
                        <td key={quote} className="p-1 text-center">
                          <span
                            className={cn(
                              "tabular inline-block w-12 rounded px-1 py-0.5 font-mono",
                              carryClass(d),
                            )}
                          >
                            {d > 0 ? "+" : ""}
                            {d.toFixed(2)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-subtle mt-2 text-[10px]">
              Plus la couleur est marquée, plus l&apos;écart de taux entre les deux devises est
              important.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardTitle icon="calendar_month">Prochaines publications</CardTitle>
              <ul className="space-y-1.5">
                {(calendar ?? []).map((e, i) => (
                  <li
                    key={`${e.currency}-${e.indicator}-${i}`}
                    className="border-border-app flex items-center justify-between border-b py-1.5 text-xs last:border-0"
                  >
                    <span className="text-subtle w-20 shrink-0 font-mono">
                      {e.date} {e.time}
                    </span>
                    <span className="text-fg flex-1 font-bold">
                      {e.currency} — {e.indicator}
                    </span>
                    {e.importance ? (
                      <span className="text-subtle text-[10px] uppercase">{e.importance}</span>
                    ) : null}
                  </li>
                ))}
                {!calendar?.length ? <li className="text-subtle text-xs">Aucune donnée</li> : null}
              </ul>
            </Card>

            <Card>
              <CardTitle>Dernières publications</CardTitle>
              <ul className="space-y-1.5">
                {(announcements ?? []).map((a, i) => (
                  <li
                    key={`${a.currency}-${a.indicator}-${i}`}
                    className="border-border-app flex items-center justify-between border-b py-1.5 text-xs last:border-0"
                  >
                    <span className="text-fg flex-1 font-bold">
                      {a.currency} — {a.indicator}
                    </span>
                    <span className="text-subtle font-mono">
                      Réel : {a.actual} (préc. {a.previous})
                    </span>
                  </li>
                ))}
                {!announcements?.length ? (
                  <li className="text-subtle text-xs">Aucune donnée</li>
                ) : null}
              </ul>
            </Card>
          </div>
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardTitle icon="account_balance">Communiqués des banques centrales</CardTitle>
          <ul className="space-y-1.5 pr-1 lg:max-h-[70vh] lg:overflow-y-auto">
            {(pressReleases ?? []).slice(0, 15).map((p, i) => (
              <li
                key={`${p.currency}-${p.date}-${i}`}
                className="border-border-app hover:bg-panel border-b px-1 py-2 transition-colors last:border-0"
              >
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-subtle font-mono text-[10px]">{p.date}</span>
                  <span className="text-brand-blue text-[10px] font-bold">{p.currency}</span>
                </div>
                <p className="text-muted text-xs leading-snug">{p.title}</p>
              </li>
            ))}
            {!pressReleases?.length ? <li className="text-subtle text-xs">Aucune donnée</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
