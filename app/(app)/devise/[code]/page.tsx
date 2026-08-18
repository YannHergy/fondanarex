import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckDot } from "@/app/(app)/devise/[code]/_components/check-dot";
import { ComplementaryData } from "@/app/(app)/devise/[code]/_components/complementary-data";
import { CurrencyNews } from "@/app/(app)/devise/[code]/_components/currency-news";
import { EditableValue } from "@/app/(app)/devise/[code]/_components/editable-value";
import { ScoreHistory } from "@/app/(app)/devise/[code]/_components/score-history";
import { IndicatorCategoryGrid } from "@/app/(app)/devise/[code]/_components/indicator-category-grid";
import { MANUAL_CHECK_TITLE, needsManualCheck } from "@/app/(app)/devise/[code]/_lib/data-source-flag";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { getIndicatorDisplay } from "@/domain/scoring";
import { getMarketContext, getScoredCurrencies } from "@/lib/currencies";
import { scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { ensureFreshMacro } from "@/lib/macro-freshness";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: code.toUpperCase() };
}

/**
 * Currency detail.
 *
 * In the legacy app this was not a route — it was `selectedCurrencyCode` state
 * inside App.tsx, so it could not be linked to, bookmarked, or reached with the
 * back button, and picking a currency destroyed the state of every sibling view.
 */

/** Macro fields shown in the data grid, with their units. */
const MACRO_FIELDS = [
  { key: "interestRate", label: "Taux directeur", unit: "%" },
  { key: "cpi", label: "Inflation (CPI)", unit: "%" },
  { key: "coreCpi", label: "Inflation sous-jacente", unit: "%" },
  { key: "ppi", label: "PPI", unit: "%" },
  { key: "gdpQoQ", label: "PIB (trimestriel)", unit: "%" },
  { key: "unemployment", label: "Chômage", unit: "%" },
  { key: "pmiManufacturing", label: "PMI manufacturier", unit: "" },
  { key: "pmiServices", label: "PMI services", unit: "" },
  { key: "retailSales", label: "Ventes au détail", unit: "%" },
  { key: "wagePPI", label: "Salaires", unit: "%" },
  { key: "tradeBalance", label: "Balance commerciale", unit: "" },
  { key: "currentAccount", label: "Compte courant", unit: "" },
  { key: "consumerConfidence", label: "Confiance des ménages", unit: "" },
  { key: "nfp", label: "NFP", unit: "k" },
  { key: "corePce", label: "Core PCE", unit: "%" },
  { key: "zew", label: "ZEW", unit: "" },
  { key: "ifo", label: "ifo", unit: "" },
] as const;

/** −10..+10 directional score to a bar width and colour. */
function scoreBar(score: number | null): { width: string; className: string } {
  if (score === null) return { width: "0%", className: "bg-border-strong" };
  const width = `${(Math.abs(score) / 10) * 50}%`;
  if (score >= 4) return { width, className: "bg-brand-green" };
  if (score > 0) return { width, className: "bg-brand-green/60" };
  if (score === 0) return { width: "2%", className: "bg-brand-steel" };
  if (score > -4) return { width, className: "bg-brand-red/60" };
  return { width, className: "bg-brand-red" };
}

export default async function CurrencyDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const userId = await requireUserId();
  const { code } = await params;

  // This is the screen where a passed release date shows as "⚠ À MAJ", so it
  // is the one that most needs to close the gap on its own.
  await ensureFreshMacro(userId);

  const [currencies, marketContext] = await Promise.all([
    getScoredCurrencies(userId),
    getMarketContext(userId),
  ]);

  const currency = currencies[code.toUpperCase()];
  if (!currency) notFound();

  const ranked = Object.values(currencies).sort((a, b) => b.scores.total - a.scores.total);
  const rank = ranked.findIndex((c) => c.code === currency.code) + 1;

  const { scores } = currency;
  const breakdown = scores.breakdown ?? [];
  const unavailable = breakdown.filter((b) => !b.disponible);
  const record = currency as unknown as Record<string, unknown>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <Link
        href="/tableau-de-bord"
        className="text-muted hover:text-fg inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <Icon name="arrow_back" size={14} /> Retour au tableau de bord
      </Link>

      <PageHeader title={`${currency.code} — ${currency.name}`} subtitle={scores.banqueCentrale}>
        <div className="flex items-center gap-4">
          <CurrencyBadge code={currency.code} size="lg" />
          <div className="text-right">
            <p className={cn("tabular font-mono text-3xl font-bold", scoreTextClass(scores.total))}>
              {scores.total}
              <span className="text-subtle text-base font-normal">/100</span>
            </p>
            <p className={cn("text-xs font-semibold", scoreTextClass(scores.total))}>
              {scoreVerdict(scores.total)} · #{rank}/{ranked.length}
            </p>
          </div>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Taux réel", value: `${scores.realRate.toFixed(2)} %`, hint: "Taux − inflation" },
          {
            label: "Score brut",
            value: scores.rawTotal.toFixed(2),
            hint: "Moyenne pondérée, −10 à +10",
          },
          {
            label: "Poids utilisé",
            value: `${scores.poidsUtilise ?? 0} / ${scores.poidsTotal ?? 100}`,
            hint: "Indicateurs disponibles",
          },
          { label: "Moteur n°1", value: scores.moteurN1 || "—", hint: "Driver dominant" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
              {stat.label}
            </p>
            <p className="text-fg mt-1 truncate font-mono text-lg font-bold">{stat.value}</p>
            <p className="text-subtle mt-0.5 text-[10px]">{stat.hint}</p>
          </Card>
        ))}
      </div>

      {scores.particularite ? (
        <Card className="border-brand-blue/30 bg-brand-blue/5">
          <div className="flex items-start gap-2.5">
            <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
            <p className="text-muted text-sm leading-relaxed">{scores.particularite}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardTitle icon="analytics">Décomposition du score</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-subtle border-border-app border-b">
                  <th scope="col" className="py-2 text-left font-medium">
                    Indicateur
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Poids
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Valeur
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Score
                  </th>
                  <th scope="col" className="w-28 py-2 text-left font-medium">
                    Contribution
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((indicator) => {
                  const display = getIndicatorDisplay(
                    indicator.id,
                    currency,
                    marketContext,
                    indicator.score,
                  );
                  const bar = scoreBar(indicator.score);
                  const negative = (indicator.score ?? 0) < 0;

                  return (
                    <tr
                      key={indicator.id}
                      className={cn(
                        "border-border-app border-b last:border-0",
                        !indicator.disponible && "opacity-45",
                      )}
                    >
                      <td className="py-2">
                        <span className="text-fg font-medium">{indicator.nom}</span>
                        {indicator.specifique ? (
                          <span className="text-brand-cyan ml-1.5 font-mono text-[9px] uppercase">
                            spéc.
                          </span>
                        ) : null}
                      </td>
                      <td className="text-muted tabular py-2 text-right font-mono">
                        {indicator.poids}%
                      </td>
                      <td className="text-muted tabular py-2 text-right font-mono">
                        {display.value}
                      </td>
                      <td
                        className={cn(
                          "tabular py-2 text-right font-mono font-semibold",
                          indicator.score === null
                            ? "text-subtle"
                            : indicator.score > 0
                              ? "text-brand-green"
                              : indicator.score < 0
                                ? "text-brand-red"
                                : "text-muted",
                        )}
                      >
                        {indicator.score === null ? "—" : indicator.score.toFixed(1)}
                      </td>
                      <td className="py-2">
                        {/* Bars grow outward from a centre line: left for a
                         * negative contribution, right for a positive one, so
                         * the sign is readable without reading the number. */}
                        <div className="bg-panel relative h-1.5 overflow-hidden rounded-full">
                          <div
                            className={cn("absolute top-0 h-full", bar.className)}
                            style={{
                              width: bar.width,
                              ...(negative ? { right: "50%" } : { left: "50%" }),
                            }}
                          />
                          <div className="bg-border-strong absolute top-0 left-1/2 h-full w-px" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {unavailable.length > 0 ? (
            <p className="text-subtle mt-3 text-[11px] leading-relaxed">
              <Icon name="info" size={12} className="mr-1 inline align-text-bottom" />
              {unavailable.length} indicateur{unavailable.length > 1 ? "s" : ""} sans donnée —
              exclu{unavailable.length > 1 ? "s" : ""} du calcul. Leur poids (
              {unavailable.reduce((sum, i) => sum + i.poids, 0)} %) sort du dénominateur au lieu
              d&apos;être compté comme zéro.
            </p>
          ) : null}
        </Card>

        <div className="lg:col-span-2">
          {/* Currency-specific categories — see indicator-category-grid.tsx.
           * Replaces the old generic 7-axis bar list: JPY/CHF have no PMI or
           * employment card at all, AUD/NZD get a commodity + China-demand
           * card that USD/EUR/GBP never show. */}
          <IndicatorCategoryGrid currency={currency} marketContext={marketContext} />
        </div>
      </div>

      <ScoreHistory code={currency.code} current={currency.scores.total} />

      {/* Full page width from here — kept OUTSIDE the 3-column grid above so
       * it is not squeezed into the same 2/3 as the category cards while the
       * shorter score table leaves the other 1/3 empty below it. */}

      {/* Everything here is deliberately OUTSIDE the score: yield curve, COT
       * and rate differentials are enrichments, and the three qualitative
       * cards are notes, not computed indicators. Grouping them together
       * frees the rest of the page for Actualités & Sentiment instead of
       * splitting this content across the bottom.
       *
       * Les taux directeurs sont passés depuis ici : les différentiels s'en
       * déduisent par soustraction, ce qui évite les 56 requêtes que ce
       * panneau lançait par affichage — et qui saturaient la limite de l'API
       * au point d'emporter la courbe des taux avec elles. */}
      <ComplementaryData
        code={currency.code}
        rates={Object.fromEntries(
          Object.values(currencies).map((c) => [c.code, c.interestRate]),
        )}
      />

      <Card>
        <CardTitle icon="table_chart">Données macroéconomiques</CardTitle>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {MACRO_FIELDS.map((field) => {
            const value = record[field.key];
            if (typeof value !== "number") return null;
            const previous = currency.previousData[field.key];
            const delta = typeof previous === "number" ? value - previous : null;

            const manualCheck = needsManualCheck(
              field.key,
              currency.dataSources,
              true,
              currency.staleFields,
            );

            return (
              <div key={field.key} className="border-border-app border-b py-2">
                <p className="text-subtle flex items-center gap-1 text-[10px] tracking-wide uppercase">
                  <CheckDot field={field.key} checks={currency.checks} />
                  {field.label}
                  {manualCheck ? (
                    <span title={MANUAL_CHECK_TITLE} className="text-brand-amber shrink-0">
                      ★
                    </span>
                  ) : null}
                </p>
                <EditableValue
                  code={currency.code}
                  field={field.key}
                  value={value}
                  unit={field.unit}
                />
                {delta !== null ? (
                  <p
                    className={cn(
                      "tabular font-mono text-[10px]",
                      delta > 0 ? "text-brand-green" : delta < 0 ? "text-brand-red" : "text-subtle",
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)} vs préc.
                  </p>
                ) : (
                  <p className="text-subtle font-mono text-[10px]">pas d&apos;historique</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Actualités & Sentiment ───────────────────────────────────────────
       * Titres issus de flux publics, étiquetés par devise dans le domaine.
       * Le sens haussier/baissier vaut POUR CETTE DEVISE : le même article
       * peut être haussier ici et baissier ailleurs. */}
      <CurrencyNews code={currency.code} />
    </div>
  );
}
