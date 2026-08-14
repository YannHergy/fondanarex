import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { FxSessions } from "@/app/(app)/_components/fx-sessions";
import { getSessionStatuses } from "@/domain/market/sessions";
import { getUpcomingEvents } from "@/lib/weekly-events";
import { translateTitles } from "@/lib/press-release-translate";
import { geminiConfigured } from "@/lib/integrations/llm";
import * as fx from "@/lib/integrations/fxmacrodata";
import { localRiskSentiment } from "@/domain/market-context/scorers";
import type { MarketContext } from "@/domain/types";
import type { CurrencyWithScore } from "@/domain/types";
import { CURRENCY_CODES, brazzavilleMonthDay, brazzavilleTime, cn } from "@/lib/utils";

/**
 * FXMacroData panels for the overview screen.
 *
 * Each one is its own async server component so the page can stream them
 * individually. The legacy version awaited every request before rendering
 * anything, which meant the slowest upstream call set the load time of the
 * whole screen — and when the API is unreachable or the key has been revoked,
 * that is the abort timeout on every visit.
 *
 * Here the currency ranking (which comes from our own database) paints
 * immediately and these fill in behind a skeleton, or degrade to a notice.
 */

export function PanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="bg-panel h-4 animate-pulse rounded" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

function Unavailable({ reason }: { reason?: string }) {
  return (
    <p className="text-subtle flex items-start gap-2 text-xs">
      <Icon name="cloud_off" size={14} className="mt-px shrink-0" />
      <span>{reason ?? "Données FXMacroData indisponibles."}</span>
    </p>
  );
}

/** Resolves to null instead of throwing, so one dead panel never fails a page. */
async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

// ── Risk sentiment ─────────────────────────────────────────────────────────

export async function RiskPanel({ context }: { context: MarketContext }) {
  const remote = fx.isConfigured() ? await settle(fx.getRiskSentiment()) : null;

  // FXMacroData first when it answers, our own VIX otherwise. The VIX IS what
  // decides risk-on/risk-off, and it is already part of the market context the
  // scoring engine consumes — so with the subscription revoked there is no
  // reason to leave the panel blank on data we hold.
  const local = remote ? null : localRiskSentiment(context);

  const status = remote?.status ?? local?.status ?? null;
  const detail = remote
    ? `Score : ${remote.score > 0 ? "+" : ""}${remote.score}`
    : (local?.rationale ?? null);

  return (
    <Card
      className={cn(
        status === "Risk Off"
          ? "bg-brand-red/10 border-brand-red/30"
          : status === "Risk On"
            ? "bg-brand-green/10 border-brand-green/30"
            : undefined,
      )}
    >
      <CardTitle icon="monitoring">Sentiment de marché</CardTitle>
      {status ? (
        <div className="flex items-center gap-3">
          <Icon
            name={
              status === "Risk On"
                ? "trending_up"
                : status === "Risk Off"
                  ? "trending_down"
                  : "trending_flat"
            }
            size={28}
            className={
              status === "Risk On"
                ? "text-brand-green"
                : status === "Risk Off"
                  ? "text-brand-red"
                  : "text-subtle"
            }
          />
          <div>
            <p
              className={cn(
                "text-2xl font-black",
                status === "Risk On"
                  ? "text-brand-green"
                  : status === "Risk Off"
                    ? "text-brand-red"
                    : "text-muted",
              )}
            >
              {status}
            </p>
            <p className="text-subtle font-mono text-xs">{detail}</p>
            {local ? (
              <p className="text-subtle text-[10px]">Calculé localement</p>
            ) : null}
          </div>
        </div>
      ) : (
        <Unavailable reason="Saisissez le VIX dans Admin pour calculer le sentiment sans FXMacroData." />
      )}
    </Card>
  );
}

// ── FX sessions ────────────────────────────────────────────────────────────

/**
 * Session hours are computed locally from each venue's timezone — see
 * domain/market/sessions.ts. This panel used to fetch them from FXMacroData,
 * which made a panel that cannot fail depend on a subscription that can.
 *
 * The server renders the first value so the markup is complete without
 * JavaScript; the client component then keeps the countdowns ticking.
 */
export function SessionsPanel() {
  return <FxSessions initial={getSessionStatuses(new Date())} />;
}

// ── Carry matrix ───────────────────────────────────────────────────────────

// Literal class strings: Tailwind extracts class names by scanning source, so
// an interpolated `bg-${tone}/10` produces no CSS and the cell renders unstyled.
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

export async function CarryMatrix({ currencies }: { currencies: CurrencyWithScore[] }) {
  const diffs = fx.isConfigured() ? await settle(fx.getRateDifferentials()) : null;

  // Fallback to our own policy rates when FXMacroData is unavailable.
  //
  // A carry differential IS the gap between two policy rates, and those rates
  // are already in our database — so an empty matrix would be hiding data we
  // hold. The source is labelled below so the two are never confused.
  const rateByCode = new Map(currencies.map((c) => [c.code, c.interestRate]));
  const usingFallback = !diffs || diffs.length === 0;

  const diffFor = (base: string, quote: string): number => {
    if (!usingFallback) {
      return diffs.find((d) => d.base === base && d.quote === quote)?.differentialPct ?? 0;
    }
    const b = rateByCode.get(base);
    const q = rateByCode.get(quote);
    if (b === undefined || q === undefined) return 0;
    return Math.round((b - q) * 100) / 100;
  };

  return (
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
        Plus la couleur est marquée, plus l&apos;écart de taux entre les deux devises est important.
        {usingFallback
          ? " Source : taux directeurs enregistrés dans l'application (FXMacroData indisponible)."
          : " Source : FXMacroData."}
      </p>
    </Card>
  );
}

// ── Calendar and announcements ─────────────────────────────────────────────

/**
 * Upcoming releases, read from the user's own WeeklyEvent rows rather than a
 * third-party calendar. These are the events they actually track and annotate
 * in Calendrier, so the overview and the calendar can no longer disagree.
 */
export async function CalendarPanel({ userId }: { userId: string }) {
  const events = await getUpcomingEvents(userId, 8);

  return (
    <Card>
      <CardTitle icon="calendar_month">Prochaines publications</CardTitle>
      {events.length > 0 ? (
        <ul className="space-y-1.5">
          {events.map((event) => (
            <li
              key={event.id}
              className="border-border-app flex items-center gap-2 border-b py-1.5 text-xs last:border-0"
            >
              <span className="text-subtle w-24 shrink-0 font-mono">
                {brazzavilleMonthDay(event.scheduledAt)} {brazzavilleTime(event.scheduledAt)}
              </span>
              <span className="text-fg min-w-0 flex-1 truncate font-bold">
                {event.currencyCode} — {event.name}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                  event.importance === "HIGH"
                    ? "text-brand-red border-brand-red/40 bg-brand-red/10"
                    : event.importance === "MEDIUM"
                      ? "text-brand-amber border-brand-amber/40 bg-brand-amber/10"
                      : "text-muted border-border-app",
                )}
              >
                {event.importance === "HIGH"
                  ? "haute"
                  : event.importance === "MEDIUM"
                    ? "moyenne"
                    : "basse"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <p className="text-subtle text-xs leading-relaxed">
            Aucune publication à venir enregistrée.
          </p>
          <Link
            href="/calendrier"
            className="text-brand-blue mt-2 inline-flex items-center gap-1 text-xs hover:underline"
          >
            Ajouter des événements <Icon name="arrow_forward" size={12} />
          </Link>
        </div>
      )}
    </Card>
  );
}

export async function AnnouncementsPanel() {
  const entries = fx.isConfigured()
    ? await settle(
        Promise.all(CURRENCY_CODES.map((c) => fx.getLatestAnnouncements(c))).then((all) =>
          all.flat().slice(0, 8),
        ),
      )
    : null;

  return (
    <Card>
      <CardTitle>Dernières publications</CardTitle>
      {entries?.length ? (
        <ul className="space-y-1.5">
          {entries.map((a, i) => (
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
        </ul>
      ) : (
        <Unavailable />
      )}
    </Card>
  );
}

export async function PressReleasesPanel() {
  const releases = fx.isConfigured() ? await settle(fx.getAllPressReleases()) : null;
  const shown = releases?.slice(0, 15) ?? [];

  // Titres traduits en français ; le lien de sortie, lui, reste celui de la
  // banque centrale telle quelle — c'est le site de destination qui gère sa
  // propre traduction, pas nous.
  const frTitles = geminiConfigured()
    ? ((await settle(translateTitles(shown.map((p) => p.title)))) ?? new Map<string, string>())
    : new Map<string, string>();

  return (
    <Card className="lg:sticky lg:top-6 lg:flex lg:h-full lg:flex-col">
      <CardTitle icon="account_balance">Communiqués des banques centrales</CardTitle>
      {shown.length ? (
        // flex-1 plutôt qu'une hauteur maximale fixe : la liste occupe tout
        // l'espace que la carte reçoit de sa ligne de grille, jusqu'en bas,
        // et ne défile que si elle en déborde réellement.
        <ul className="space-y-1.5 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {shown.map((p, i) => (
            <li
              key={`${p.currency}-${p.date}-${i}`}
              className="border-border-app hover:bg-panel border-b px-1 py-2 transition-colors last:border-0"
            >
              <div className="mb-0.5 flex items-center gap-2">
                <span className="text-subtle font-mono text-[10px]">{p.date}</span>
                <span className="text-brand-blue text-[10px] font-bold">{p.currency}</span>
              </div>
              {p.url ? (
                // The banks publish these themselves — a title alone read like
                // a claim with no way to check it. Opens on the bank's own
                // site, never redistributed, so the source is unambiguous.
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-brand-blue group flex items-start gap-1 text-xs leading-snug transition-colors"
                >
                  <span className="flex-1">{frTitles.get(p.title.trim()) ?? p.title}</span>
                  <Icon
                    name="open_in_new"
                    size={11}
                    className="text-subtle group-hover:text-brand-blue mt-0.5 shrink-0"
                  />
                </a>
              ) : (
                <p className="text-muted text-xs leading-snug">
                  {frTitles.get(p.title.trim()) ?? p.title}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Unavailable />
      )}
    </Card>
  );
}
