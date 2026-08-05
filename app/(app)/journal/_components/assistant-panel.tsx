"use client";

import { useRef, useState, useTransition } from "react";

import { askAssistant } from "@/app/(app)/journal/actions";
import { Icon } from "@/components/ui/icon";
import {
  MAX_HISTORY_TURNS,
  type AssistantContext,
  type AssistantTurn,
} from "@/domain/journal/assistant-prompt";
import { cn } from "@/lib/utils";

/**
 * A real conversation about the trader's own numbers.
 *
 * The context is handed over from the projection running in this same page, so
 * the figures the assistant reads are byte-for-byte the ones on screen. A
 * second server-side computation would have been one more place for the two to
 * disagree.
 *
 * Only the last turns are sent back. The context block is the same size every
 * time; the history is what would grow without bound, and a conversation that
 * gets slower the longer it runs is a conversation people stop having.
 */

const SUGGESTIONS = [
  "Combien de temps pour valider mon compte à mon rythme actuel ?",
  "Qu'est-ce que je peux changer pour aller plus vite sans plus de risque ?",
  "Vaut-il mieux trader plus gros ou plus souvent ?",
  "Quel est le risque réel de me faire éliminer ?",
];

export function AssistantPanel({ context }: { context: AssistantContext }) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    const next: AssistantTurn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setError(null);

    startTransition(async () => {
      // Wrapped because a server action that THROWS rejects this promise, and a
      // rejection inside a transition leaves `pending` stuck at true — the
      // panel then says "thinking" forever with no way back. Seen for real:
      // a slow database made the auth check throw and the UI hung while the
      // request had long since returned.
      try {
        const result = await askAssistant({
          context,
          // Trimmed to the tail rather than summarised: a summary of a numeric
          // conversation loses exactly the numbers that made it worth having.
          turns: next.slice(-MAX_HISTORY_TURNS),
        });

        if (result.ok) {
          setTurns([...next, { role: "assistant", content: result.reply }]);
        } else {
          setError(result.error);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "L'assistant est injoignable");
      }

      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  return (
    <div className="border-border-app bg-bg rounded-lg border p-4">
      <div className="mb-3">
        <p className="text-fg flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="forum" size={16} className="text-brand-blue" />
          Pose tes questions
        </p>
        <p className="text-subtle mt-0.5 text-[11px] leading-relaxed">
          L&apos;assistant lit les chiffres ci-dessus. Il ne calcule rien lui-même et te dira quand
          il ne peut pas répondre plutôt que d&apos;inventer.
        </p>
      </div>

      {turns.length === 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion)}
              className="border-border-app text-muted hover:border-brand-blue hover:text-fg rounded-full border px-3 py-1.5 text-[11px] transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
          {turns.map((turn, index) => (
            <div
              key={index}
              className={cn(
                "rounded-lg px-3 py-2 text-sm leading-relaxed",
                turn.role === "user"
                  ? "bg-brand-blue/15 text-fg ml-8"
                  : "border-border-app bg-panel text-muted mr-8 border whitespace-pre-wrap",
              )}
            >
              {turn.role === "assistant" ? <Formatted text={turn.content} /> : turn.content}
            </div>
          ))}
          {pending ? (
            <p className="text-subtle mr-8 px-3 py-2 text-sm">L&apos;assistant réfléchit…</p>
          ) : null}
          <div ref={endRef} />
        </div>
      )}

      {error ? (
        <p className="text-brand-red mb-2 flex items-start gap-1.5 text-xs">
          <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={pending}
          placeholder="Et si je passais à 3 trades par semaine ?"
          className="bg-panel border-border-app text-fg focus:border-brand-blue flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        >
          <Icon name={pending ? "hourglass_empty" : "send"} size={15} />
        </button>
      </form>

      {turns.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setTurns([]);
            setError(null);
          }}
          className="text-subtle hover:text-fg mt-2 text-[11px] transition-colors"
        >
          Effacer la conversation
        </button>
      ) : null}
    </div>
  );
}

/**
 * The assistant's reply, with its bold markers honoured.
 *
 * Models reach for markdown whatever the prompt says, and `**plus souvent**`
 * printed raw looks like a bug. Only bold is handled — a full markdown
 * renderer would be a dependency and an injection surface for one asterisk.
 */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((chunk, index) =>
        chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4 ? (
          <strong key={index} className="text-fg font-semibold">
            {chunk.slice(2, -2)}
          </strong>
        ) : (
          chunk
        ),
      )}
    </>
  );
}
