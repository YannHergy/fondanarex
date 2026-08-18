import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import * as fx from "@/lib/integrations/fxmacrodata";
import { CURRENCY_CODES, cn, isCurrencyCode } from "@/lib/utils";

/** Resolves to null instead of throwing, so one dead panel never fails the page. */
async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function Unavailable() {
  return (
    <p className="text-subtle flex items-start gap-2 text-xs">
      <Icon name="cloud_off" size={13} className="mt-px shrink-0" />
      Données FXMacroData indisponibles.
    </p>
  );
}

/**
 * Yield curve, COT positioning and rate differentials for one currency.
 *
 * All three come from FXMacroData and are fetched in parallel, each behind
 * its own `settle()` — a dead one shows "indisponible" instead of taking the
 * other two down with it. This is the real-data follow-up to the
 * "Bientôt disponible" placeholders from the earlier form-only pass.
 */
export async function ComplementaryData({ code }: { code: string }) {
  const configured = fx.isConfigured() && isCurrencyCode(code);

  const [curve, cot, allDiffs] = configured
    ? await Promise.all([
        settle(fx.getYieldCurve(code)),
        settle(fx.getCOT(code)),
        settle(fx.getRateDifferentials()),
      ])
    : [null, null, null];

  const differentials = allDiffs?.filter((d) => d.base === code) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardTitle icon="show_chart">Courbe des taux</CardTitle>
        {!configured || !curve || curve.points.length === 0 ? (
          <Unavailable />
        ) : (
          <>
            <div className="flex items-end gap-4">
              {curve.points.map((point) => (
                <div key={point.maturity} className="text-center">
                  <p className="text-fg tabular font-mono text-lg font-bold">
                    {point.yieldPct.toFixed(2)}
                    <span className="text-subtle text-xs">%</span>
                  </p>
                  <p className="text-subtle text-[10px] tracking-wide uppercase">
                    {point.maturity}
                  </p>
                </div>
              ))}
            </div>

            {/* La date de la donnée, pas celle de l'affichage.
                Sans elle, une courbe qui bouge lentement — la BCE publie les
                jours ouvrés, l'agrégateur accuse quelques jours de retard —
                est indiscernable d'une courbe figée. C'est précisément ce
                doute qui a motivé ce champ. */}
            {curve.asOf ? (
              <p
                className={cn(
                  "mt-2 flex items-center gap-1 text-[10px]",
                  curve.isStale ? "text-brand-amber" : "text-subtle",
                )}
              >
                <Icon name={curve.isStale ? "warning" : "schedule"} size={11} />
                Donnée du {curve.asOf}
                {curve.lagDays !== null && curve.lagDays > 0
                  ? ` · ${curve.lagDays} jour${curve.lagDays > 1 ? "s" : ""} de décalage`
                  : ""}
                {curve.sourceName ? ` · ${curve.sourceName}` : ""}
                {curve.isStale ? " · jugée périmée par la source" : ""}
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <CardTitle icon="groups">COT — Positionnement spéculatif</CardTitle>
        {!configured || !cot ? (
          <Unavailable />
        ) : (
          <div>
            <div className="bg-panel relative flex h-3 overflow-hidden rounded-full">
              <div className="bg-brand-green h-full" style={{ width: `${cot.longPct}%` }} />
              <div className="bg-brand-red h-full" style={{ width: `${cot.shortPct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-brand-green font-semibold">{cot.longPct}% long</span>
              <span className="text-brand-red font-semibold">{cot.shortPct}% short</span>
            </div>
            <p className="text-subtle mt-1 text-[10px]">
              Position nette : {cot.netPosition > 0 ? "+" : ""}
              {cot.netPosition} · {cot.updatedAt || "date inconnue"}
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle icon="swap_horiz">Différentiels de taux</CardTitle>
        {!configured || !differentials || differentials.length === 0 ? (
          <Unavailable />
        ) : (
          <ul className="space-y-1">
            {CURRENCY_CODES.filter((quote) => quote !== code)
              .map((quote) => differentials.find((d) => d.quote === quote))
              .filter((d): d is NonNullable<typeof d> => Boolean(d))
              .map((d) => (
                <li key={d.quote} className="flex items-center justify-between text-xs">
                  <span className="text-muted font-mono">
                    {code}/{d.quote}
                  </span>
                  <span
                    className={cn(
                      "tabular font-mono font-semibold",
                      d.differentialPct > 0
                        ? "text-brand-green"
                        : d.differentialPct < 0
                          ? "text-brand-red"
                          : "text-subtle",
                    )}
                  >
                    {d.differentialPct > 0 ? "+" : ""}
                    {d.differentialPct.toFixed(2)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
