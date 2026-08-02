import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { LocalTime } from "@/app/(app)/_components/local-time";
import * as fx from "@/lib/integrations/fxmacrodata";
import type { CurrencyWithScore } from "@/domain/types";
import { CURRENCY_CODES, cn } from "@/lib/utils";

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

function formatCountdown(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

// ── Risk sentiment ─────────────────────────────────────────────────────────

export async function RiskPanel() {
  const risk = fx.isConfigured() ? await settle(fx.getRiskSentiment()) : null;

  return (
    <Card
      className={cn(
        risk?.status === "Risk Off"
          ? "bg-brand-red/10 border-brand-red/30"
          : risk?.status === "Risk On"
            ? "bg-brand-green/10 border-brand-green/30"
            : undefined,
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
        <Unavailable />
      )}
    </Card>
  );
}

// ── FX sessions ────────────────────────────────────────────────────────────

export async function SessionsPanel() {
  const sessions = fx.isConfigured() ? await settle(fx.getSessions()) : null;

  return (
    <Card>
      <div className="text-muted mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={16} />
          <h2 className="text-xs font-bold tracking-widest uppercase">Sessions FX en direct</h2>
        </div>
        <LocalTime />
      </div>
      {sessions?.length ? (
        <div className="grid grid-cols-4 gap-2">
          {sessions.map((s) => (
            <div
              key={s.name}
              className={cn(
                "rounded-lg border py-2 text-center",
                s.isOpen ? "bg-brand-green/10 border-brand-green/30" : "bg-panel border-border-app",
              )}
            >
              <p className="text-fg text-[10px] font-bold">{s.name}</p>
              <p className={cn("font-mono text-[9px]", s.isOpen ? "text-brand-green" : "text-subtle")}>
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
        </div>
      ) : (
        <Unavailable />
      )}
    </Card>
  );
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

export async function CalendarPanel() {
  const entries = fx.isConfigured()
    ? await settle(
        Promise.all(CURRENCY_CODES.map((c) => fx.getCalendar(c))).then((all) =>
          all.flat().slice(0, 8),
        ),
      )
    : null;

  return (
    <Card>
      <CardTitle icon="calendar_month">Prochaines publications</CardTitle>
      {entries?.length ? (
        <ul className="space-y-1.5">
          {entries.map((e, i) => (
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
        </ul>
      ) : (
        <Unavailable />
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

  return (
    <Card className="lg:sticky lg:top-6">
      <CardTitle icon="account_balance">Communiqués des banques centrales</CardTitle>
      {releases?.length ? (
        <ul className="space-y-1.5 pr-1 lg:max-h-[70vh] lg:overflow-y-auto">
          {releases.slice(0, 15).map((p, i) => (
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
        </ul>
      ) : (
        <Unavailable />
      )}
    </Card>
  );
}
