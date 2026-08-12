"use client";

import { useOptimistic, useTransition } from "react";

import { setDashboardCurrencies } from "@/app/(app)/preferences-actions";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Choix des devises affichées sur le tableau de bord.
 *
 * Une liste VIDE veut dire « toutes » — voir UserSettings.dashboardCurrencies.
 * Épingler est donc un filtre que l'on ajoute, et décrocher la dernière devise
 * épinglée ramène à l'affichage complet plutôt qu'à un écran vide, ce qui
 * évite un cul-de-sac où l'utilisateur ne voit plus rien sans comprendre
 * pourquoi.
 *
 * Optimiste : la grille se réordonne au clic sans attendre l'aller-retour
 * serveur. Le filtrage réel se fait côté serveur, celui-ci n'est que le
 * reflet immédiat de l'intention.
 */
export function CurrencyFilter({
  allCodes,
  selected,
}: {
  allCodes: string[];
  selected: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(selected);

  const showingAll = optimistic.length === 0;

  function toggle(code: string) {
    const next = optimistic.includes(code)
      ? optimistic.filter((c) => c !== code)
      : [...optimistic, code];
    startTransition(async () => {
      setOptimistic(next);
      await setDashboardCurrencies(next);
    });
  }

  function reset() {
    startTransition(async () => {
      setOptimistic([]);
      await setDashboardCurrencies([]);
    });
  }

  return (
    <div className="border-border-app bg-surface flex flex-wrap items-center gap-2 rounded-xl border p-3">
      <span className="text-subtle mr-1 flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase">
        <Icon name="filter_list" size={12} />
        Devises
      </span>

      {allCodes.map((code) => {
        const active = showingAll || optimistic.includes(code);
        const pinned = optimistic.includes(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            aria-pressed={pinned}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] tracking-wider transition-all",
              pinned
                ? "border-brand-cyan/50 bg-brand-cyan/10 text-brand-cyan"
                : active
                  ? "border-border-app text-muted hover:border-border-strong hover:text-fg"
                  : "border-border-app/60 text-subtle opacity-50 hover:opacity-100",
            )}
          >
            <CurrencyBadge code={code} size="sm" />
            {code}
            {pinned ? <Icon name="push_pin" size={10} /> : null}
          </button>
        );
      })}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-subtle font-mono text-[10px]">
          {showingAll ? `${allCodes.length} affichées` : `${optimistic.length}/${allCodes.length}`}
        </span>
        {!showingAll ? (
          <button
            type="button"
            onClick={reset}
            className="border-border-app text-muted hover:text-fg hover:border-border-strong rounded-lg border px-2 py-1 font-mono text-[10px] tracking-wide uppercase transition-all"
          >
            Tout afficher
          </button>
        ) : null}
        {pending ? <Icon name="progress_activity" size={12} className="text-subtle animate-spin" /> : null}
      </div>
    </div>
  );
}
