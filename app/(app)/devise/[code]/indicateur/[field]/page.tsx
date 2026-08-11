import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryChart } from "@/app/(app)/devise/[code]/indicateur/[field]/_components/history-chart";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { periodEnd } from "@/domain/macro/period";
import * as fx from "@/lib/integrations/fxmacrodata";
import { getEcbHistory, hasEcbHistory } from "@/lib/integrations/ecb";
import { getEurostatHistory, hasEurostatHistory } from "@/lib/integrations/eurostat";
import { getScoredCurrencies } from "@/lib/currencies";
import { requireUserId } from "@/lib/session";
import { isCurrencyCode } from "@/lib/utils";

/**
 * Historical view for one macro field of one currency — the Trading
 * Economics-style drill-down: click a number on the Devise page, land on its
 * chart. Graph only for now, no written commentary (explicit decision: build
 * the chart first, add the narrative later once this is solid).
 */

const FIELD_LABELS: Record<string, { label: string; unit: string }> = {
  interestRate: { label: "Taux directeur", unit: "%" },
  cpi: { label: "Inflation (CPI)", unit: "%" },
  coreCpi: { label: "Inflation sous-jacente", unit: "%" },
  gdpQoQ: { label: "PIB (trimestriel)", unit: "%" },
  unemployment: { label: "Chômage", unit: "%" },
  wagePPI: { label: "Salaires", unit: "%" },
  tradeBalance: { label: "Balance commerciale", unit: "" },
  retailSales: { label: "Ventes au détail", unit: "%" },
  // Stored as a year-on-year percentage, not the raw RBA index level — see
  // FIELD_EXTRACTORS in fxmacrodata.ts.
  commodityPrice: { label: "Matières premières", unit: "%" },
  // Thousands of jobs for the AUD and the CAD, a quarterly percentage for the
  // NZD, which is why the unit is resolved per currency below.
  employmentChange: { label: "Emploi", unit: "" },
};

/** The NZD publishes its employment move as a %, the AUD and CAD in thousands. */
function unitFor(field: string, code: string, fallback: string): string {
  if (field !== "employmentChange") return fallback;
  return code === "NZD" ? "%" : "k";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string; field: string }>;
}): Promise<Metadata> {
  const { code, field } = await params;
  const meta = FIELD_LABELS[field];
  return { title: meta ? `${meta.label} — ${code.toUpperCase()}` : code.toUpperCase() };
}

export default async function IndicatorHistoryPage({
  params,
}: {
  params: Promise<{ code: string; field: string }>;
}) {
  const userId = await requireUserId();
  const { code, field } = await params;
  const upperCode = code.toUpperCase();

  const meta = FIELD_LABELS[field];
  // Eurostat and the ECB cover EUR with no depth limit; FXMacroData's
  // `/announcements` endpoint caps at 20 points on our plan (see
  // lib/integrations/eurostat.ts). A field is chartable here if ANY source
  // has it — both are only wired for EUR, so every other currency and every
  // field neither covers still falls through to FXMacroData.
  const useEurostat = upperCode === "EUR" && hasEurostatHistory(field);
  const useEcb = upperCode === "EUR" && !useEurostat && hasEcbHistory(field);
  if (
    !meta ||
    !isCurrencyCode(upperCode) ||
    (!useEurostat && !useEcb && !fx.hasIndicatorHistory(field))
  ) {
    notFound();
  }

  const currencies = await getScoredCurrencies(userId);
  const currency = currencies[upperCode];
  if (!currency) notFound();

  let history: fx.IndicatorHistory | null = null;
  let error: string | null = null;
  let sourceLabel = "FXMacroData";

  if (useEurostat) {
    sourceLabel = "Eurostat";
    try {
      const series = await getEurostatHistory(field);
      if (!series || series.history.length === 0) {
        error = series?.error ?? "Aucune donnée Eurostat disponible.";
      } else {
        history = {
          name: series.label,
          points: series.history
            .map((p) => {
              const end = periodEnd(p.period);
              return end ? { date: end.toISOString(), value: p.value } : null;
            })
            .filter((p): p is { date: string; value: number } => p !== null),
        };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Erreur Eurostat";
    }
  } else if (useEcb) {
    sourceLabel = "BCE";
    try {
      const series = await getEcbHistory(field);
      if (!series || series.history.length === 0) {
        error = series?.error ?? "Aucune donnée BCE disponible.";
      } else {
        // The DFR/MRR series publish daily but the rate only moves on
        // decision dates — collapsing consecutive equal values down to one
        // point per actual change turns ~1300 raw points into ~16 without
        // altering the step-line shape the chart already draws between them.
        const collapsed = series.history.filter(
          (p, i) => i === 0 || p.value !== series.history[i - 1]!.value,
        );
        history = {
          name: series.label,
          points: collapsed
            .map((p) => {
              const end = periodEnd(p.period);
              return end ? { date: end.toISOString(), value: p.value } : null;
            })
            .filter((p): p is { date: string; value: number } => p !== null),
        };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Erreur BCE";
    }
  } else if (fx.isConfigured()) {
    try {
      history = await fx.getIndicatorHistory(upperCode, field);
    } catch (err) {
      error = err instanceof Error ? err.message : "Erreur FXMacroData";
    }
  } else {
    error = "FXMACRODATA_API_KEY non configurée.";
  }

  // The one French sentence for this field, when one exists — see
  // lib/commentary.ts. Shown here, below the enlarged chart, rather than on
  // the small card on the overview grid: a sentence of context earns a
  // reader's attention once they have already clicked through for the detail,
  // not while they are scanning eight cards at once.
  const comment = currency.comments?.[field];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <Link
        href={`/devise/${code.toLowerCase()}`}
        className="text-muted hover:text-fg inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <Icon name="arrow_back" size={14} /> Retour à {upperCode}
      </Link>

      <PageHeader title={`${meta.label} — ${currency.code}`} subtitle={currency.name} />

      <Card>
        {error ? (
          <p className="text-subtle flex items-start gap-2 text-sm">
            <Icon name="cloud_off" size={16} className="mt-0.5 shrink-0" />
            Historique indisponible : {error}
          </p>
        ) : history && history.points.length > 0 ? (
          <>
            <HistoryChart points={history.points} unit={unitFor(field, upperCode, meta.unit)} />
            {/* Caption folded into the same card as the chart it describes,
                rather than a second stacked card — two cards for one graph
                left a visible gap of empty space between them for no
                content. */}
            <p className="text-subtle border-border-app mt-3 border-t pt-3 text-xs">
              {history.points.length} publications · source : {sourceLabel} ({history.name})
            </p>
            {comment ? (
              <p className="text-muted mt-2 text-sm leading-relaxed">{comment}</p>
            ) : null}
          </>
        ) : (
          <p className="text-subtle text-sm">Aucune donnée historique trouvée.</p>
        )}
      </Card>
    </div>
  );
}
