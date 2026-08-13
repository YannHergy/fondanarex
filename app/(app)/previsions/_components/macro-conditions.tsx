import { Icon } from "@/components/ui/icon";
import type { ConditionTone, SetupCondition } from "@/domain/previsions/setup-analysis";
import { cn } from "@/lib/utils";

/**
 * Les conditions macro, une bande par publication.
 *
 * Des bandes plutôt qu'un pavé de texte : la question posée devant un setup
 * est « qu'est-ce qui peut le tuer cette semaine », et on doit pouvoir y
 * répondre d'un coup d'œil. Un paragraphe oblige à tout lire pour retrouver
 * le vendredi qui compte.
 *
 * La couleur ne porte JAMAIS l'information seule : chaque bande a son icône et
 * son mot — « soutient », « menace », « à surveiller ». Un lecteur daltonien
 * lit la même chose que les autres.
 */

const TONE: Record<
  ConditionTone,
  { label: string; icon: string; bar: string; text: string; bg: string }
> = {
  favorable: {
    label: "Soutient",
    icon: "trending_up",
    bar: "bg-brand-green",
    text: "text-brand-green",
    bg: "bg-brand-green/5 border-brand-green/25",
  },
  risque: {
    label: "Menace",
    icon: "warning",
    bar: "bg-brand-red",
    text: "text-brand-red",
    bg: "bg-brand-red/5 border-brand-red/25",
  },
  neutre: {
    label: "À surveiller",
    icon: "visibility",
    bar: "bg-brand-blue",
    text: "text-brand-blue",
    bg: "bg-brand-blue/5 border-brand-blue/25",
  },
};

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function MacroConditions({ conditions }: { conditions: SetupCondition[] }) {
  if (conditions.length === 0) {
    return (
      <p className="text-subtle border-border-app rounded-lg border border-dashed p-3 text-xs leading-relaxed">
        Aucune publication de la période ne porte ce scénario. Il tiendra ou non sur la seule
        technique — rien dans le calendrier ne viendra le confirmer ni le casser.
      </p>
    );
  }

  // Les menaces d'abord : c'est ce qu'on veut voir en premier devant un setup.
  const order: ConditionTone[] = ["risque", "favorable", "neutre"];
  const sorted = [...conditions].sort((a, b) => {
    const byTone = order.indexOf(a.tone) - order.indexOf(b.tone);
    if (byTone !== 0) return byTone;
    return new Date(a.at).getTime() - new Date(b.at).getTime();
  });

  return (
    <div className="space-y-1.5">
      {sorted.map((condition, index) => {
        const tone = TONE[condition.tone];
        const at = new Date(condition.at);
        return (
          <div
            key={`${condition.release}-${condition.at}-${index}`}
            className={cn("flex overflow-hidden rounded-lg border", tone.bg)}
          >
            <span className={cn("w-1 shrink-0", tone.bar)} aria-hidden />
            <div className="min-w-0 flex-1 p-2.5">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("flex items-center gap-1 text-[10px] font-bold uppercase", tone.text)}>
                  <Icon name={tone.icon} size={11} />
                  {tone.label}
                </span>
                <span className="text-fg font-mono text-[11px] font-semibold">
                  {condition.currency} · {condition.release}
                </span>
                <span className="text-subtle ml-auto font-mono text-[10px]">
                  {Number.isNaN(at.getTime()) ? "" : dayFmt.format(at)}
                </span>
              </div>
              <p className="text-muted text-xs leading-relaxed">{condition.requirement}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
