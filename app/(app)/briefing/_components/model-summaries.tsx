import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Ce que chaque modèle retient, sous le consensus.
 *
 * Le consensus dit QUI l'emporte ; il ne dit pas POURQUOI. Le raisonnement
 * existait déjà — chaque modèle renvoie une synthèse dans son JSON — mais il
 * n'était lisible qu'en dépliant le débat tour par tour, groupe par groupe.
 * Ici, une entrée par modèle et par groupe de devises, prise à sa POSITION
 * FINALE : la même règle que le vote, sinon on afficherait un avis que le
 * modèle a lui-même révisé après avoir lu son pair.
 *
 * Perplexity n'apparaît pas : c'est le chercheur du débat, il rassemble des
 * faits et ne formule pas d'opinion directionnelle — le montrer ici le ferait
 * passer pour un troisième avis.
 */

const AI_STYLE: Record<string, { label: string; className: string; dot: string }> = {
  CLAUDE: { label: "Claude", className: "text-brand-blue", dot: "bg-brand-blue" },
  GROQ: { label: "Groq", className: "text-brand-amber", dot: "bg-brand-amber" },
};

export interface SummaryMessage {
  ai: string;
  round: number;
  groupCodes: string[];
  content: string | null;
  errorMessage: string | null;
}

export function ModelSummaries({ messages }: { messages: SummaryMessage[] }) {
  // Par (modèle, groupe), le tour le plus avancé qui a réellement produit un
  // texte. Un appel en échec n'écrase pas une analyse antérieure réussie.
  const best = new Map<string, SummaryMessage>();
  for (const message of messages) {
    if (message.errorMessage) continue;
    if (!AI_STYLE[message.ai]) continue;
    const text = message.content?.trim();
    if (!text) continue;

    const key = `${message.ai}|${message.groupCodes.join(",")}`;
    const held = best.get(key);
    if (!held || message.round > held.round) best.set(key, message);
  }

  if (best.size === 0) return null;

  const byAi = new Map<string, SummaryMessage[]>();
  for (const message of best.values()) {
    const list = byAi.get(message.ai) ?? [];
    list.push(message);
    byAi.set(message.ai, list);
  }

  // Claude d'abord, puis Groq — l'ordre du débat.
  const order = ["CLAUDE", "GROQ"].filter((ai) => byAi.has(ai));

  return (
    <Card>
      <CardTitle icon="psychology">Ce que retient chaque modèle</CardTitle>
      <div className="space-y-4">
        {order.map((ai) => {
          const style = AI_STYLE[ai]!;
          const entries = (byAi.get(ai) ?? []).sort((a, b) =>
            a.groupCodes.join(",").localeCompare(b.groupCodes.join(",")),
          );

          return (
            <div key={ai}>
              <div className="mb-2 flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                <span className={cn("text-xs font-bold", style.className)}>{style.label}</span>
              </div>

              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.groupCodes.join(",")}
                    className="border-border-app rounded-lg border p-3"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      {entry.groupCodes.map((code) => (
                        <span key={code} className="flex items-center gap-1">
                          <CurrencyBadge code={code} size="sm" />
                          <span className="text-muted font-mono text-[10px]">{code}</span>
                        </span>
                      ))}
                      {entry.round >= 4 ? (
                        <span className="text-subtle border-border-app ml-auto rounded border px-1.5 text-[9px] uppercase">
                          position finale
                        </span>
                      ) : (
                        <span className="text-brand-amber border-brand-amber/40 ml-auto rounded border px-1.5 text-[9px] uppercase">
                          sans relecture
                        </span>
                      )}
                    </div>
                    <p className="text-muted text-sm leading-relaxed whitespace-pre-line">
                      {entry.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-subtle mt-3 flex items-start gap-1.5 text-[11px]">
        <Icon name="info" size={12} className="mt-0.5 shrink-0" />
        Synthèse de chaque modèle sur les devises qu&apos;il a analysées, à sa position finale.
        Perplexity est absent : il documente le débat, il n&apos;y vote pas.
      </p>
    </Card>
  );
}
