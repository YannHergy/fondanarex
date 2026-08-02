"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { resetAllManualData } from "@/app/(app)/admin/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const CONFIRMATION = "REINITIALISER";

/**
 * Wipes every manual override, note and market-context value.
 *
 * In the legacy app this sat in the sidebar footer as "Reset Data", one click
 * and a `window.confirm` away from erasing every hand-entered figure — next to
 * the theme toggle, reachable by accident from any screen. It now lives beside
 * the data it destroys, states exactly what will go, and requires typing a word.
 * The server action verifies that word too, so the confirmation is not merely
 * a client-side courtesy.
 */
export function DangerZone({ counts }: { counts: { overrides: number; notes: number; context: number } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const total = counts.overrides + counts.notes + counts.context;
  const armed = typed === CONFIRMATION && total > 0;

  function reset() {
    startTransition(async () => {
      try {
        const result = await resetAllManualData(typed);
        setTyped("");
        setStatus(
          `Supprimé : ${result.overrides} correction(s), ${result.notes} note(s), ${result.context} valeur(s) de contexte.`,
        );
        router.refresh();
      } catch {
        setStatus("Échec de la réinitialisation");
      }
    });
  }

  return (
    <Card className="border-brand-red/30 bg-brand-red/5">
      <CardTitle icon="warning" className="text-brand-red">
        Zone dangereuse
      </CardTitle>

      <p className="text-muted text-sm leading-relaxed">
        Supprime définitivement toutes vos données saisies à la main :{" "}
        <strong>{counts.overrides}</strong> correction(s) d&apos;indicateur,{" "}
        <strong>{counts.notes}</strong> note(s) qualitative(s) et{" "}
        <strong>{counts.context}</strong> valeur(s) de contexte de marché. Les données issues des
        API ne sont pas touchées et resteront affichées.
      </p>

      {total === 0 ? (
        <p className="text-subtle mt-3 text-xs">Aucune donnée manuelle à supprimer.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="reset-confirm" className="sr-only">
            Tapez {CONFIRMATION} pour confirmer
          </label>
          <input
            id="reset-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Tapez ${CONFIRMATION}`}
            className="bg-panel border-border-app text-fg focus:border-brand-red rounded-lg border px-2.5 py-1.5 font-mono text-xs outline-none"
          />
          <button
            type="button"
            onClick={reset}
            disabled={!armed || pending}
            className="bg-brand-red flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Icon name="delete_forever" size={14} /> Tout supprimer
          </button>
          {status ? (
            <span role="status" className="text-muted text-xs">
              {status}
            </span>
          ) : null}
        </div>
      )}
    </Card>
  );
}
