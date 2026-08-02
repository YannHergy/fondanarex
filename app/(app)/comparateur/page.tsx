import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { getIndicatorDisplay } from "@/domain/scoring";
import type { CurrencyWithScore } from "@/domain/types";
import { getMarketContext, getScoredCurrencies } from "@/lib/currencies";
import { scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { requireUserId } from "@/lib/session";
import { CURRENCY_CODES, CURRENCY_COLOR_VAR, cn, isCurrencyCode } from "@/lib/utils";

export const metadata: Metadata = { title: "Comparateur" };

const AXES = [
  { key: "monetary", label: "Politique monétaire" },
  { key: "growth", label: "Croissance" },
  { key: "inflation", label: "Inflation" },
  { key: "employment", label: "Emploi" },
  { key: "pmi", label: "PMI" },
  { key: "trade", label: "Commerce extérieur" },
  { key: "sentiment", label: "Sentiment" },
] as const;

const MACRO_ROWS = [
  { key: "interestRate", label: "Taux directeur", unit: "%", higherIsBetter: true },
  { key: "cpi", label: "Inflation (CPI)", unit: "%", higherIsBetter: false },
  { key: "coreCpi", label: "Inflation sous-jacente", unit: "%", higherIsBetter: false },
  { key: "gdpQoQ", label: "PIB (trimestriel)", unit: "%", higherIsBetter: true },
  { key: "unemployment", label: "Chômage", unit: "%", higherIsBetter: false },
  { key: "pmiManufacturing", label: "PMI manufacturier", unit: "", higherIsBetter: true },
  { key: "pmiServices", label: "PMI services", unit: "", higherIsBetter: true },
  { key: "retailSales", label: "Ventes au détail", unit: "%", higherIsBetter: true },
  { key: "wagePPI", label: "Salaires", unit: "%", higherIsBetter: true },
  { key: "tradeBalance", label: "Balance commerciale", unit: "", higherIsBetter: true },
  { key: "consumerConfidence", label: "Confiance des ménages", unit: "", higherIsBetter: true },
] as const;

/** Picker row. Selecting a currency is a link, so the pair lives in the URL. */
function CurrencyPicker({
  side,
  selected,
  other,
}: {
  side: "a" | "b";
  selected: string;
  other: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CURRENCY_CODES.map((code) => {
        const active = code === selected;
        const href = side === "a" ? `/comparateur?a=${code}&b=${other}` : `/comparateur?a=${other}&b=${code}`;
        return (
          <Link
            key={code}
            href={href}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors",
              active
                ? "border-current"
                : "border-border-app text-muted hover:text-fg hover:border-border-strong",
            )}
            style={active ? { color: CURRENCY_COLOR_VAR[code] } : undefined}
          >
            {code}
          </Link>
        );
      })}
    </div>
  );
}

export default async function ComparatorPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const userId = await requireUserId();
  const [query, currencies, marketContext] = await Promise.all([
    searchParams,
    getScoredCurrencies(userId),
    getMarketContext(userId),
  ]);

  const codeA = (query.a ?? "EUR").toUpperCase();
  const codeB = (query.b ?? "USD").toUpperCase();

  const a = currencies[isCurrencyCode(codeA) ? codeA : "EUR"];
  const b = currencies[isCurrencyCode(codeB) ? codeB : "USD"];

  if (!a || !b) {
    return (
      <div className="p-6">
        <p className="text-muted text-sm">Données de devises indisponibles.</p>
      </div>
    );
  }

  const spread = a.scores.total - b.scores.total;
  // The pair convention is BASE/QUOTE: a positive spread means the base is the
  // stronger currency, so the pair reads as a buy.
  const pairBias = spread > 5 ? "Achat" : spread < -5 ? "Vente" : "Neutre";
  const pairTone =
    spread > 5 ? "text-brand-green" : spread < -5 ? "text-brand-red" : "text-brand-amber";

  const recordA = a as unknown as Record<string, unknown>;
  const recordB = b as unknown as Record<string, unknown>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Comparateur"
        subtitle="Comparaison de deux devises, famille par famille"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Devise de base</CardTitle>
          <CurrencyPicker side="a" selected={a.code} other={b.code} />
        </Card>
        <Card>
          <CardTitle>Devise de cotation</CardTitle>
          <CurrencyPicker side="b" selected={b.code} other={a.code} />
        </Card>
      </div>

      <Card>
        <div className="grid grid-cols-3 items-center gap-4">
          {[a, b].map((currency, index) => (
            <div key={currency.code} className={cn(index === 1 && "order-3 text-right")}>
              <div className={cn("flex items-center gap-3", index === 1 && "justify-end")}>
                <CurrencyBadge code={currency.code} size="lg" />
                <div className={cn(index === 1 && "text-right")}>
                  <p className="text-fg font-bold">{currency.code}</p>
                  <p className="text-subtle text-[10px] uppercase">{currency.name}</p>
                </div>
              </div>
              <p
                className={cn(
                  "tabular mt-3 font-mono text-3xl font-bold",
                  scoreTextClass(currency.scores.total),
                )}
              >
                {currency.scores.total}
              </p>
              <p className={cn("text-xs font-semibold", scoreTextClass(currency.scores.total))}>
                {scoreVerdict(currency.scores.total)}
              </p>
            </div>
          ))}

          <div className="order-2 text-center">
            <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
              {a.code}/{b.code}
            </p>
            <p className={cn("tabular mt-1 font-mono text-2xl font-bold", pairTone)}>
              {spread > 0 ? "+" : ""}
              {spread.toFixed(1)}
            </p>
            <p className={cn("text-xs font-bold tracking-wide uppercase", pairTone)}>{pairBias}</p>
            <p className="text-subtle mt-1 text-[10px]">Écart de score</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle icon="radar">Familles d&apos;indicateurs</CardTitle>
        <div className="space-y-3">
          {AXES.map((axis) => {
            const valueA = a.scores[axis.key];
            const valueB = b.scores[axis.key];
            return (
              <div key={axis.key}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span
                    className="tabular w-10 font-mono font-semibold"
                    style={{ color: CURRENCY_COLOR_VAR[a.code as never] }}
                  >
                    {valueA.toFixed(1)}
                  </span>
                  <span className="text-muted">{axis.label}</span>
                  <span
                    className="tabular w-10 text-right font-mono font-semibold"
                    style={{ color: CURRENCY_COLOR_VAR[b.code as never] }}
                  >
                    {valueB.toFixed(1)}
                  </span>
                </div>
                {/* Two bars growing from a shared centre — the wider side is the
                 * stronger currency on that family. */}
                <div className="flex items-center gap-px">
                  <div className="bg-panel flex h-2 flex-1 justify-end overflow-hidden rounded-l-full">
                    <div
                      className="h-full rounded-l-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, valueA * 10))}%`,
                        backgroundColor: CURRENCY_COLOR_VAR[a.code as never],
                      }}
                    />
                  </div>
                  <div className="bg-panel h-2 flex-1 overflow-hidden rounded-r-full">
                    <div
                      className="h-full rounded-r-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, valueB * 10))}%`,
                        backgroundColor: CURRENCY_COLOR_VAR[b.code as never],
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <CardTitle icon="table_chart">Données macroéconomiques</CardTitle>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-subtle border-border-app border-b">
              <th scope="col" className="py-2 text-left font-medium">
                Indicateur
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {a.code}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {b.code}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Écart
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Avantage
              </th>
            </tr>
          </thead>
          <tbody>
            {MACRO_ROWS.map((row) => {
              const valueA = recordA[row.key];
              const valueB = recordB[row.key];
              if (typeof valueA !== "number" || typeof valueB !== "number") return null;

              const delta = valueA - valueB;
              // "Better" is indicator-dependent: a higher policy rate favours a
              // currency, a higher unemployment rate does not.
              const favoursA = row.higherIsBetter ? delta > 0 : delta < 0;
              const meaningful = Math.abs(delta) > 0.001;

              return (
                <tr key={row.key} className="border-border-app border-b last:border-0">
                  <td className="text-muted py-2">{row.label}</td>
                  <td className="text-fg tabular py-2 text-right font-mono">
                    {valueA.toFixed(2)}
                    {row.unit}
                  </td>
                  <td className="text-fg tabular py-2 text-right font-mono">
                    {valueB.toFixed(2)}
                    {row.unit}
                  </td>
                  <td
                    className={cn(
                      "tabular py-2 text-right font-mono",
                      !meaningful
                        ? "text-subtle"
                        : favoursA
                          ? "text-brand-green"
                          : "text-brand-red",
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {meaningful ? (
                      <span
                        style={{
                          color: CURRENCY_COLOR_VAR[(favoursA ? a.code : b.code) as never],
                        }}
                      >
                        {favoursA ? a.code : b.code}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[a, b].map((currency) => (
          <DriversCard key={currency.code} currency={currency} ctx={marketContext} />
        ))}
      </div>
    </div>
  );
}

function DriversCard({
  currency,
  ctx,
}: {
  currency: CurrencyWithScore;
  ctx: Awaited<ReturnType<typeof getMarketContext>>;
}) {
  const drivers = (currency.scores.breakdown ?? []).slice(0, 6);

  return (
    <Card>
      <CardTitle icon="bolt">Drivers dominants — {currency.code}</CardTitle>
      <ul className="space-y-1.5">
        {drivers.map((indicator) => {
          const display = getIndicatorDisplay(indicator.id, currency, ctx, indicator.score);
          return (
            <li
              key={indicator.id}
              className={cn(
                "flex items-center justify-between text-xs",
                !indicator.disponible && "opacity-45",
              )}
            >
              <span className="text-muted flex-1 truncate">{indicator.nom}</span>
              <span className="text-subtle tabular mx-2 font-mono">{indicator.poids}%</span>
              <span className="text-fg tabular w-16 text-right font-mono font-semibold">
                {display.value}
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/devise/${currency.code}`}
        className="text-brand-blue mt-3 inline-flex items-center gap-1 text-xs hover:underline"
      >
        Analyse complète <Icon name="arrow_forward" size={12} />
      </Link>
    </Card>
  );
}
