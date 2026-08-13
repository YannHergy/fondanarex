"use client";

import { useRef, useState, useTransition } from "react";

import { importMt5 } from "@/app/(app)/journal/actions";
import { Icon } from "@/components/ui/icon";
import type { ImportSummary } from "@/lib/journal-import";
import type { AccountOption } from "@/lib/journal";
import { cn } from "@/lib/utils";

/**
 * Trade history import from a MetaTrader 5 report.
 *
 * This is the route to trade history, not a convenience alongside a live sync:
 * the broker is a prop firm and refuses the third-party terminal connections
 * MetaApi requires. The report carries the same fields, including the position
 * id, so re-importing a wider date range is safe and repeatable.
 *
 * The panel stays open after an import and shows the full outcome — written,
 * already present, skipped instruments, unreadable rows. A history import that
 * silently drops a trade is worse than one that refuses, so nothing is hidden.
 */
export function ImportMt5({
  accounts,
  defaultAccountId,
}: {
  accounts: AccountOption[];
  /**
   * Compte visé, quand on arrive depuis la page Comptes. Importer sur le
   * mauvais compte est difficile à défaire — les trades sont écrits — donc la
   * destination est préremplie plutôt que laissée vide à côté d'un journal
   * déjà filtré sur ce compte.
   */
  defaultAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File) {
    setError(null);
    setSummary(null);

    const formData = new FormData();
    formData.set("file", file);
    if (accountId) formData.set("accountId", accountId);

    startTransition(async () => {
      const result = await importMt5(formData);
      if (result.ok) setSummary(result.summary);
      else setError(result.error);
      // Lets the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="border-border-app bg-panel text-fg hover:border-brand-blue flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
      >
        <Icon name="upload" size={16} />
        Importer MetaTrader
      </button>

      {open ? (
        <div className="border-border-app bg-panel absolute right-0 z-20 mt-2 w-[22rem] rounded-xl border p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="text-fg text-sm font-semibold">Importer un rapport</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-subtle hover:text-fg text-xs"
            >
              Fermer
            </button>
          </div>

          <ol className="text-muted mb-3 space-y-1 text-xs leading-relaxed">
            <li>
              1. Dans MetaTrader 5, onglet <strong className="text-fg">Historique</strong>
            </li>
            <li>
              2. Clic droit → <strong className="text-fg">Rapport</strong> →{" "}
              <strong className="text-fg">HTML</strong>
            </li>
            <li>3. Dépose le fichier ici</li>
          </ol>

          {accounts.length > 0 ? (
            <label className="mb-3 block">
              <span className="text-subtle mb-1 block text-[11px]">Rattacher au compte</span>
              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="border-border-app bg-bg text-fg w-full rounded-lg border px-2 py-1.5 text-xs"
              >
                <option value="">Aucun</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,text/html"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) submit(file);
            }}
            className="text-muted file:bg-brand-blue hover:file:bg-brand-blue/90 w-full text-xs file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />

          {pending ? <p className="text-subtle mt-3 text-xs">Lecture du rapport…</p> : null}

          {error ? (
            <p className="text-brand-red mt-3 flex items-start gap-1.5 text-xs">
              <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}

          {summary ? <Outcome summary={summary} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Outcome({ summary }: { summary: ImportSummary }) {
  const nothing =
    summary.imported === 0 && summary.duplicates === 0 && summary.skippedInstruments.length === 0;

  return (
    <div className="border-border-app mt-3 space-y-2 border-t pt-3 text-xs">
      {nothing ? (
        <p className="text-muted">
          Aucune position clôturée dans ce rapport. Vérifie la période sélectionnée dans
          MetaTrader avant l&apos;export.
        </p>
      ) : (
        <>
          <Line
            ok={summary.imported > 0}
            label={`${summary.imported} trade${summary.imported > 1 ? "s" : ""} importé${summary.imported > 1 ? "s" : ""}`}
          />
          {summary.duplicates > 0 ? (
            <p className="text-subtle">
              {summary.duplicates} déjà au journal, laissé{summary.duplicates > 1 ? "s" : ""}{" "}
              intact{summary.duplicates > 1 ? "s" : ""} avec {summary.duplicates > 1 ? "leurs" : "ses"}{" "}
              annotations.
            </p>
          ) : null}
        </>
      )}

      {summary.skippedInstruments.length > 0 ? (
        <div className="text-brand-amber">
          <p className="font-semibold">Instruments hors journal, non importés :</p>
          <ul className="text-muted mt-0.5 space-y-0.5">
            {summary.skippedInstruments.map((skipped) => (
              <li key={skipped.symbol}>
                {skipped.symbol} — {skipped.count} trade{skipped.count > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.warnings.length > 0 ? (
        <div className="text-brand-amber">
          <p className="font-semibold">Lignes illisibles :</p>
          <ul className="text-muted mt-0.5 space-y-0.5">
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.imported > 0 ? (
        <p className="text-subtle">
          Les heures sont celles du serveur de ton courtier, telles que MetaTrader les écrit.
        </p>
      ) : null}
    </div>
  );
}

function Line({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={cn("flex items-center gap-1.5", ok ? "text-brand-green" : "text-muted")}>
      <Icon name={ok ? "check" : "info"} size={13} />
      {label}
    </p>
  );
}
