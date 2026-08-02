import type { Metadata } from "next";

import { RunBriefing } from "@/app/(app)/briefing/_components/run-briefing";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import type { CurrencyConsensus } from "@/domain/briefing/consensus";
import {
  anthropicConfigured,
  groqConfigured,
  perplexityConfigured,
} from "@/lib/integrations/llm";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Briefing IA" };

const BIAS_STYLE = {
  Bullish: "text-brand-green border-brand-green/40 bg-brand-green/10",
  Bearish: "text-brand-red border-brand-red/40 bg-brand-red/10",
  Neutral: "text-muted border-border-app bg-panel",
} as const;

const STRENGTH_LABEL = {
  strong: "Unanime",
  medium: "Majoritaire",
  mixed: "Divergent",
} as const;

const AI_STYLE: Record<string, { label: string; className: string }> = {
  PERPLEXITY: { label: "Perplexity", className: "text-brand-cyan" },
  CLAUDE: { label: "Claude", className: "text-brand-blue" },
  GROQ: { label: "Groq", className: "text-brand-amber" },
};

export default async function BriefingPage() {
  const userId = await requireUserId();

  const providers = {
    claude: anthropicConfigured(),
    groq: groqConfigured(),
    perplexity: perplexityConfigured(),
  };
  const anyConfigured = providers.claude || providers.groq || providers.perplexity;

  const session = await prisma.briefingSession.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: { messages: { orderBy: [{ round: "asc" }, { createdAt: "asc" }] } },
  });

  const consensus = (session?.consensus as CurrencyConsensus[] | null) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Briefing IA"
        subtitle="Débat contradictoire en cinq tours entre trois modèles"
      />

      <Card>
        <RunBriefing enabled={anyConfigured} />
        <div className="border-border-app mt-3 flex flex-wrap gap-3 border-t pt-3">
          {[
            { name: "Perplexity", role: "recherche", on: providers.perplexity },
            { name: "Claude", role: "analyse · défense · verdict", on: providers.claude },
            { name: "Groq", role: "contradiction", on: providers.groq },
          ].map((provider) => (
            <span key={provider.name} className="flex items-center gap-1.5 text-[11px]">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  provider.on ? "bg-brand-green" : "bg-brand-red",
                )}
              />
              <span className="text-fg font-medium">{provider.name}</span>
              <span className="text-subtle">
                {provider.role}
                {provider.on ? "" : " · clé absente"}
              </span>
            </span>
          ))}
        </div>
      </Card>

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Perplexity recherche les faits récents, Claude produit une lecture directionnelle, Groq
            la conteste, puis Claude défend ou révise avant de trancher. Seules les{" "}
            <strong>positions finales</strong> votent, et Perplexity ne vote pas : c&apos;est le
            chercheur du débat, pas un opinion. Un appel en échec est exclu du vote plutôt que
            compté comme neutre.
          </p>
        </div>
      </Card>

      {session ? (
        <>
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <CardTitle icon="how_to_vote" className="mb-0">
                Consensus
              </CardTitle>
              <span className="text-subtle font-mono text-[10px]">
                <TimeAgo date={session.startedAt} />
                {session.costUsd ? ` · ${Number(session.costUsd).toFixed(4)} $` : ""}
                {session.totalInputTokens
                  ? ` · ${session.totalInputTokens + (session.totalOutputTokens ?? 0)} tokens`
                  : ""}
              </span>
            </div>

            {session.status === "failed" ? (
              <p className="text-brand-red text-sm">
                Session en échec : {session.errorMessage ?? "raison inconnue"}
              </p>
            ) : null}

            {session.errorMessage && session.status !== "failed" ? (
              <p className="text-brand-amber mb-3 text-xs">{session.errorMessage}</p>
            ) : null}

            {consensus.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {consensus.map((entry) => (
                  <div
                    key={entry.code}
                    className={cn("rounded-lg border p-3", BIAS_STYLE[entry.bias])}
                  >
                    <div className="flex items-center justify-between">
                      <CurrencyBadge code={entry.code} size="sm" />
                      <span className="text-[10px] font-bold uppercase">{entry.bias}</span>
                    </div>
                    <p className="mt-1.5 font-mono text-[10px] opacity-80">
                      {STRENGTH_LABEL[entry.strength]} · {entry.confidence} %
                    </p>
                    {entry.contested ? (
                      <p className="mt-0.5 text-[10px] opacity-80">
                        Désaccord — aucun signal net
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-subtle text-sm">Aucun consensus produit par cette session.</p>
            )}
          </Card>

          <Card>
            <CardTitle icon="forum">Débat ({session.messages.length} tours)</CardTitle>
            <ol className="space-y-2">
              {session.messages.map((message) => {
                const ai = AI_STYLE[message.ai] ?? { label: message.ai, className: "text-muted" };
                const failed = Boolean(message.errorMessage);

                return (
                  <li
                    key={message.id}
                    className={cn(
                      "border-border-app rounded-lg border p-3",
                      failed && "border-brand-red/40 bg-brand-red/5",
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className={cn("text-xs font-bold", ai.className)}>{ai.label}</span>
                      <span className="text-subtle text-[10px]">{message.roundLabel}</span>
                      <span className="text-subtle font-mono text-[10px]">{message.model}</span>
                      {message.changedOpinion ? (
                        <span className="text-brand-amber border-brand-amber/40 rounded border px-1.5 text-[9px] uppercase">
                          avis révisé
                        </span>
                      ) : null}
                      <span className="text-subtle ml-auto font-mono text-[10px]">
                        {message.durationMs ? `${Math.round(message.durationMs / 1000)} s` : ""}
                        {message.outputTokens ? ` · ${message.outputTokens} tok` : ""}
                      </span>
                    </div>

                    {/* A failed call is rendered as a failure, never as an empty
                     * successful analysis — the legacy screen did the latter. */}
                    {failed ? (
                      <p className="text-brand-red text-xs">
                        <Icon name="error" size={12} className="mr-1 inline align-text-bottom" />
                        {message.errorMessage}
                        {message.stopReason ? ` (${message.stopReason})` : ""}
                      </p>
                    ) : (
                      <p className="text-muted text-sm leading-relaxed whitespace-pre-line">
                        {message.researchText ?? message.content ?? ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-muted text-sm">
            Aucun briefing enregistré. Lancez-en un pour voir les trois modèles débattre devise par
            devise.
          </p>
        </Card>
      )}
    </div>
  );
}
