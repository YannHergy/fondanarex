import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import type { AIBias, CurrencyConsensus } from "@/domain/briefing/consensus";
import type { CurrencyWithScore } from "@/domain/types";
import { scoreTextClass } from "@/lib/score-display";
import { cn } from "@/lib/utils";

/**
 * The conclusion of the debate, one row per currency.
 *
 * The individual votes were already computed and stored — the page only showed
 * the aggregate, so there was no way to tell a unanimous call from a coin
 * flip, or to see WHICH model dissented. Showing Claude and Groq side by side
 * is what makes the consensus column mean something.
 *
 * The last column is our own quantitative score. Putting it next to the AI
 * verdict is the useful comparison: agreement is confirmation, disagreement is
 * a flag that the narrative and the numbers are telling different stories.
 */

const BIAS_LABEL: Record<AIBias, string> = {
  Bullish: "Haussier",
  Bearish: "Baissier",
  Neutral: "Neutre",
};

const BIAS_CLASS: Record<AIBias, string> = {
  Bullish: "text-brand-green",
  Bearish: "text-brand-red",
  Neutral: "text-subtle",
};

const BIAS_ICON: Record<AIBias, string> = {
  Bullish: "trending_up",
  Bearish: "trending_down",
  Neutral: "trending_flat",
};

function BiasCell({ bias }: { bias: AIBias | null }) {
  if (!bias) {
    return <span className="text-subtle font-mono text-xs">—</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", BIAS_CLASS[bias])}>
      <Icon name={BIAS_ICON[bias]} size={13} />
      {BIAS_LABEL[bias]}
    </span>
  );
}

/** Where the AI verdict and our own score point in opposite directions. */
function divergence(bias: AIBias, score: number): boolean {
  if (bias === "Bullish") return score < 45;
  if (bias === "Bearish") return score > 60;
  return false;
}

export function VerdictTable({
  consensus,
  currencies,
}: {
  consensus: CurrencyConsensus[];
  currencies: Record<string, CurrencyWithScore>;
}) {
  if (consensus.length === 0) return null;

  // Strongest conviction first: an unanimous call is worth reading before a
  // contested one.
  const rows = [...consensus].sort((a, b) => {
    if (a.contested !== b.contested) return a.contested ? 1 : -1;
    return b.confidence - a.confidence;
  });

  return (
    <Card className="overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="fact_check" className="mb-0">
          Verdict final par devise
        </CardTitle>
        <span className="text-subtle text-[11px]">
          Positions d&apos;après-débat · le score est notre calcul fondamental
        </span>
      </div>

      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-subtle border-border-app border-b text-[10px] tracking-wide uppercase">
            <th scope="col" className="py-2 text-left font-medium">
              Devise
            </th>
            <th scope="col" className="py-2 text-left font-medium">
              Claude
            </th>
            <th scope="col" className="py-2 text-left font-medium">
              Groq
            </th>
            <th scope="col" className="py-2 text-left font-medium">
              Consensus
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Confiance
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => {
            const claude = entry.votes.find((v) => v.ai === "Claude")?.bias ?? null;
            const groq = entry.votes.find((v) => v.ai === "Groq")?.bias ?? null;
            const score = currencies[entry.code]?.scores.total ?? null;
            const diverges = score !== null && divergence(entry.bias, score);

            return (
              <tr key={entry.code} className="border-border-app/60 border-b last:border-0">
                <td className="py-2.5">
                  <CurrencyBadge code={entry.code} size="sm" />
                </td>
                <td className="py-2.5">
                  <BiasCell bias={claude} />
                </td>
                <td className="py-2.5">
                  <BiasCell bias={groq} />
                </td>
                <td className="py-2.5">
                  <span className="flex items-center gap-1.5">
                    <BiasCell bias={entry.bias} />
                    {entry.contested ? (
                      <span
                        title="Claude et Groq ne sont pas d'accord"
                        className="border-brand-amber/40 bg-brand-amber/10 text-brand-amber rounded border px-1 py-px text-[9px] font-bold uppercase"
                      >
                        Contesté
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="tabular py-2.5 text-right font-mono text-xs">
                  {entry.confidence} %
                </td>
                <td className="py-2.5 text-right">
                  {score === null ? (
                    <span className="text-subtle font-mono text-xs">—</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {diverges ? (
                        <Icon
                          name="warning"
                          size={12}
                          className="text-brand-amber"
                          aria-label="Le verdict IA diverge du score"
                        />
                      ) : null}
                      <span
                        className={cn("tabular font-mono text-xs font-bold", scoreTextClass(score))}
                      >
                        {score}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-subtle mt-3 text-[11px] leading-relaxed">
        Claude et Groq votent sur leur position <strong>après le débat</strong>, pas sur leur
        première impression. Un accord signifie donc que le contradicteur a cherché la faille et
        n&apos;en a pas trouvé. Le pictogramme d&apos;alerte marque les devises où le verdict IA
        s&apos;oppose à notre score fondamental.
      </p>
    </Card>
  );
}
