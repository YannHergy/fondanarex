import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { cellTone, relativeStrengthMatrix, type CellTone } from "@/domain/scoring/comparison";
import type { CurrencyWithScore } from "@/domain/types";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<CellTone, string> = {
  "strong-positive": "bg-brand-green/25 text-brand-green border-brand-green/20",
  positive: "bg-brand-green/10 text-brand-green/80 border-brand-green/10",
  neutral: "bg-panel text-subtle border-border-app",
  negative: "bg-brand-red/10 text-brand-red/80 border-brand-red/10",
  "strong-negative": "bg-brand-red/25 text-brand-red border-brand-red/20",
};

/**
 * Every currency against every other, strongest first.
 *
 * Rows are ordered by the SUM of a currency's edge over all the others, not by
 * its own score: the top row is the one with the broadest advantage, which is
 * the currency worth being long across the board rather than merely the
 * highest-scoring one.
 *
 * Each cell links to that pair in the comparator, so the matrix is a way in
 * rather than a dead end.
 */
export function RelativeStrengthMatrix({ currencies }: { currencies: CurrencyWithScore[] }) {
  const scores = Object.fromEntries(currencies.map((c) => [c.code, c.scores.total]));
  const codes = currencies.map((c) => c.code);
  const rows = relativeStrengthMatrix(scores, codes);
  const ordered = rows.map((row) => row.code);

  return (
    <Card className="overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="grid_on" className="mb-0">
          Matrice de force relative
        </CardTitle>
        <span className="text-subtle text-[11px]">
          Écart de score, devise en ligne moins devise en colonne
        </span>
      </div>

      <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">
          Différence de score entre chaque devise de base et chaque devise de cotation
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-14" />
            {ordered.map((code) => (
              <th key={code} scope="col" className="p-1">
                <CurrencyBadge code={code} size="sm" />
              </th>
            ))}
            <th scope="col" className="text-subtle p-1 text-[10px] font-medium tracking-wide uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <th scope="row" className="p-1">
                <CurrencyBadge code={row.code} size="sm" />
              </th>

              {ordered.map((quote) => {
                const cell = row.cells.find((entry) => entry.quote === quote)!;
                const same = row.code === quote;

                return (
                  <td key={quote} className="p-0">
                    {same ? (
                      <div className="border-border-app bg-surface text-subtle rounded border py-1.5 text-center font-mono">
                        —
                      </div>
                    ) : (
                      <Link
                        href={`/comparateur?base=${row.code}&quote=${quote}`}
                        className={cn(
                          "hover:border-brand-blue block rounded border py-1.5 text-center font-mono font-semibold transition-colors",
                          TONE_CLASS[cellTone(cell.diff)],
                        )}
                        title={`Comparer ${row.code} et ${quote}`}
                      >
                        {cell.diff > 0 ? "+" : ""}
                        {cell.diff}
                      </Link>
                    )}
                  </td>
                );
              })}

              <td className="p-0">
                <div
                  className={cn(
                    "rounded border py-1.5 text-center font-mono font-bold",
                    TONE_CLASS[cellTone(row.total / Math.max(1, ordered.length - 1))],
                  )}
                >
                  {row.total > 0 ? "+" : ""}
                  {row.total}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-subtle mt-2 text-[11px]">
        Les lignes sont classées par avantage cumulé sur l&apos;ensemble des autres devises — la
        première ligne est celle qui domine le plus largement, pas simplement celle au score le
        plus haut. Cliquez une case pour comparer la paire.
      </p>
    </Card>
  );
}
