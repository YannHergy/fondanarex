"use client";

import { useState } from "react";
import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Which accounts permit a given setup.
 *
 * The question this answers is asked at the moment a setup appears, under time
 * pressure: "I have this one — where can I take it?" Reading four account cards
 * and comparing their allowed lists is exactly the kind of task that gets done
 * wrong in a hurry.
 *
 * THE SETUPS ARE THE TRADER'S OWN. This screen used to be driven by
 * ALL_ENTRY_TYPES and ENTRY_WIN_RATES — a fixed list (M2, A12, A2, A21, A22,
 * GOLDEN) with fixed percentages, which described ONE trader's playbook and was
 * shipped to everyone. A second user opening this page was shown someone else's
 * setups and someone else's win rates, presented as their own. Everything here
 * now comes from what the trader declared and what their own journal measured.
 */

export interface CheckerAccount {
  id: string;
  name: string;
  color: string;
  style: string;
  /** Setups autorisés sur ce compte, tels que le trader les a nommés. */
  allowedSetups: string[];
}

export interface CheckerSetup {
  name: string;
  /** Taux mesuré sur SON journal, null tant que l'échantillon est trop maigre. */
  winRatePct: number | null;
}

export function EntryChecker({
  accounts,
  setups,
}: {
  accounts: CheckerAccount[];
  setups: CheckerSetup[];
}) {
  const [selected, setSelected] = useState<string | null>(setups[0]?.name ?? null);

  // Rien à vérifier tant que rien n'est déclaré — et le dire vaut mieux que
  // d'afficher une rangée vide sous un titre qui promet une réponse.
  if (setups.length === 0) {
    return (
      <Card>
        <CardTitle icon="verified_user">Vérificateur d&apos;entrée</CardTitle>
        <p className="text-muted text-xs leading-relaxed">
          Vous n&apos;avez encore déclaré aucun setup. Ajoutez-en depuis un compte ci-dessus, ou
          depuis{" "}
          <Link href="/setups" className="text-brand-blue hover:underline">
            Mes setups
          </Link>
          , et cet écran vous dira sur quels comptes chacun est autorisé.
        </p>
      </Card>
    );
  }

  const active = selected ?? setups[0]!.name;

  return (
    <Card>
      <CardTitle icon="verified_user">Vérificateur d&apos;entrée</CardTitle>
      <p className="text-subtle -mt-2 mb-3 text-xs">
        Sur quels comptes ce setup est-il autorisé ?
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {setups.map((setup) => (
          <button
            key={setup.name}
            type="button"
            onClick={() => setSelected(setup.name)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors",
              active === setup.name
                ? "border-brand-violet/60 bg-brand-violet/20 text-brand-violet"
                : "border-border-app text-subtle hover:text-fg",
            )}
          >
            {setup.name}
            {/* Le taux n'apparaît que s'il est mesuré. Un setup joué trois fois
                n'a pas de taux de réussite, et en afficher un serait présenter
                du bruit comme une statistique. */}
            {setup.winRatePct !== null ? (
              <span className="ml-1 text-[10px] opacity-60">{setup.winRatePct} %</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {accounts.map((account) => {
          const allowed = account.allowedSetups.includes(active);

          return (
            <div
              key={account.id}
              className={cn(
                "rounded-xl border p-3 text-center transition-opacity",
                allowed
                  ? "border-brand-green/30 bg-brand-green/10"
                  : "border-brand-red/20 bg-brand-red/5 opacity-60",
              )}
            >
              <div className="mb-1.5 flex items-center justify-center gap-1.5">
                <Icon
                  name={allowed ? "check_circle" : "block"}
                  size={15}
                  className={allowed ? "text-brand-green" : "text-brand-red"}
                />
                <span className="text-fg text-sm font-bold">{account.name}</span>
              </div>
              <p className="text-subtle mb-1 text-[11px]">{account.style}</p>
              <p
                className={cn(
                  "text-[11px] font-bold tracking-wide uppercase",
                  allowed ? "text-brand-green" : "text-brand-red",
                )}
              >
                {allowed ? "Autorisé" : "Interdit"}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
