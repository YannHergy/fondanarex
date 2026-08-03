"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTradingAccount, deleteTradingAccount } from "@/app/(app)/comptes/actions";
import { Icon } from "@/components/ui/icon";

/** Adds a trading account, then scrolls to it so it is obvious where it landed. */
export function AddAccountButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          const { id } = await createTradingAccount();
          router.refresh();
          // After the refresh paints; a new card at the bottom of a long page
          // is otherwise easy to miss entirely.
          window.setTimeout(() => {
            document.getElementById(`account-${id}`)?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }, 250);
        })
      }
      disabled={pending}
      className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
    >
      <Icon
        name={pending ? "progress_activity" : "add"}
        size={16}
        className={pending ? "animate-spin" : undefined}
      />
      {pending ? "Création…" : "Ajouter un compte"}
    </button>
  );
}

/**
 * Removes an account, behind a confirmation.
 *
 * The confirmation states what survives: trades keep their history because
 * `Trade.accountId` is nullable. Deleting an account that closed should not
 * erase the record of what was traded on it.
 */
export function DeleteAccountButton({
  accountId,
  accountName,
  tradeCount,
}: {
  accountId: string;
  accountName: string;
  tradeCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Supprimer ce compte"
        className="text-subtle hover:text-brand-red transition-colors"
      >
        <Icon name="delete" size={16} />
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-subtle text-[11px]">
        Supprimer {accountName} ?
        {tradeCount > 0 ? ` ${tradeCount} trade(s) conservé(s) dans le journal.` : ""}
      </span>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await deleteTradingAccount(accountId);
            router.refresh();
          })
        }
        disabled={pending}
        className="bg-brand-red/15 text-brand-red rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
      >
        {pending ? "Suppression…" : "Confirmer"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-subtle hover:text-fg text-[11px]"
      >
        Annuler
      </button>
    </span>
  );
}
