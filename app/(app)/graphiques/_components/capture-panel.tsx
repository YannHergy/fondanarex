"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteCapture,
  saveToForecast,
  setEntryCapture,
  uploadCapture,
} from "@/app/(app)/graphiques/actions";
import { Icon } from "@/components/ui/icon";
import {
  CAPTURE_TIMEFRAMES,
  timeframeLabel,
  type CaptureTimeframe,
} from "@/domain/charts/timeframes";
import { MAX_UPLOAD_BYTES } from "@/domain/media/image-type";
import type { CaptureRow } from "@/lib/chart-captures";
import { cn } from "@/lib/utils";

/**
 * Top-down multi-timeframe capture, promoted into the weekly plan.
 *
 * Captures persist per pair on the server, so an analysis half-finished on one
 * machine is there on the next. The legacy version kept them in IndexedDB,
 * which survived a reload but nothing else.
 */
export function CapturePanel({
  pair,
  pairs,
  captures,
  onPairChange,
  onClose,
}: {
  pair: string;
  pairs: string[];
  captures: CaptureRow[];
  onPairChange: (pair: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Feedback is tagged with the pair it belongs to. Clearing it from an effect
  // on `pair` would work but reads as a second source of truth, and lands one
  // render AFTER the new pair is already on screen — long enough to show the
  // previous pair's success message against the new one.
  const [feedback, setFeedback] = useState<{ pair: string; error?: string; saved?: string } | null>(
    null,
  );

  const message = feedback?.pair === pair ? feedback : null;
  const setError = (error: string | null) =>
    setFeedback(error ? { pair, error } : null);

  const byTimeframe = new Map(captures.map((capture) => [capture.timeframe, capture]));
  const entry = captures.find((capture) => capture.isEntry) ?? null;

  function promote() {
    setError(null);

    if (!entry) {
      setError("Marquez la capture d'entrée avant d'enregistrer.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await saveToForecast({ pair });
        setFeedback({
          pair,
          saved: `${result.captureCount} capture(s) enregistrées dans les prévisions`,
        });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Analyse multi-timeframe"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="bg-surface border-border-app flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
      >
        <div className="border-border-app flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Icon name="layers" size={18} className="text-brand-violet" />
            <div>
              <h2 className="text-fg text-sm font-bold">Multi-timeframe vers Prévisions</h2>
              <p className="text-subtle text-xs">
                Analyse descendante — du mensuel vers l&apos;exécution
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-subtle hover:text-fg"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="border-border-app flex flex-wrap items-center gap-3 border-b px-5 py-2.5">
          <label htmlFor="capture-pair" className="text-subtle text-[10px] font-bold tracking-widest uppercase">
            Paire
          </label>
          <select
            id="capture-pair"
            value={pair}
            onChange={(event) => onPairChange(event.target.value)}
            className="bg-panel border-border-app text-fg focus:border-brand-violet rounded-lg border px-3 py-1.5 font-mono text-sm font-bold focus:outline-none"
          >
            {pairs.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>

          <span className="text-subtle ml-auto font-mono text-xs">
            {captures.length} / {CAPTURE_TIMEFRAMES.length} timeframes
          </span>
        </div>

        <div className="grid flex-1 gap-2.5 overflow-y-auto px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPTURE_TIMEFRAMES.map((timeframe) => (
            <CaptureZone
              key={timeframe.value}
              pair={pair}
              timeframe={timeframe}
              capture={byTimeframe.get(timeframe.value) ?? null}
              onError={setError}
            />
          ))}
        </div>

        <div className="border-border-app flex flex-wrap items-center gap-3 border-t px-5 py-3">
          {message?.error ? (
            <span className="text-brand-amber flex items-center gap-1.5 text-xs">
              <Icon name="warning" size={13} />
              {message.error}
            </span>
          ) : message?.saved ? (
            <span className="text-brand-green flex items-center gap-1.5 text-xs">
              <Icon name="check_circle" size={13} />
              {message.saved}
            </span>
          ) : entry ? (
            <span className="text-subtle text-xs">
              Entrée marquée sur {timeframeLabel(entry.timeframe)}
            </span>
          ) : null}

          <button
            type="button"
            onClick={promote}
            disabled={pending || captures.length === 0}
            className="bg-brand-violet hover:bg-brand-violet/90 ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon
              name={pending ? "progress_activity" : "menu_book"}
              size={14}
              className={pending ? "animate-spin" : undefined}
            />
            {pending ? "Enregistrement…" : "Enregistrer dans Prévisions"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CaptureZone({
  pair,
  timeframe,
  capture,
  onError,
}: {
  pair: string;
  timeframe: CaptureTimeframe;
  capture: CaptureRow | null;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  function upload(file: File) {
    onError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      onError(`Fichier trop volumineux (maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo)`);
      return;
    }

    const body = new FormData();
    body.set("pair", pair);
    body.set("timeframe", timeframe.value);
    body.set("file", file);

    startTransition(async () => {
      const result = await uploadCapture(body);
      if (!result.ok) onError(result.error);
      router.refresh();
    });
  }

  function toggleEntry() {
    if (!capture) return;
    startTransition(async () => {
      await setEntryCapture({ pair, captureId: capture.isEntry ? null : capture.id });
      router.refresh();
    });
  }

  const inputId = `capture-${timeframe.value}`;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) upload(file);
      }}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-2 transition-colors",
        dragging
          ? "border-brand-violet bg-brand-violet/10"
          : capture?.isEntry
            ? "border-brand-amber/70 bg-brand-amber/5"
            : capture
              ? "border-brand-green/50 bg-brand-green/5"
              : "border-border-app bg-panel",
      )}
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <span
          className={cn(
            "font-mono text-xs font-bold",
            capture?.isEntry ? "text-brand-amber" : capture ? "text-brand-green" : "text-muted",
          )}
        >
          {timeframe.label}
        </span>
        <Icon
          name={pending ? "progress_activity" : capture ? "check_circle" : "upload"}
          size={13}
          className={cn(
            pending && "animate-spin",
            capture?.isEntry ? "text-brand-amber" : capture ? "text-brand-green" : "text-subtle",
          )}
        />
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />

      {capture ? (
        <div className="group relative h-20">
          <Image
            src={capture.url}
            alt={`Capture ${timeframe.label}`}
            width={200}
            height={80}
            unoptimized
            className="h-20 w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
            <label
              htmlFor={inputId}
              title="Remplacer"
              className="cursor-pointer text-white/80 hover:text-white"
            >
              <Icon name="upload" size={16} />
            </label>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  await deleteCapture(capture.id);
                  router.refresh();
                })
              }
              title="Supprimer"
              className="text-white/80 hover:text-white"
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="text-subtle hover:text-brand-violet flex h-20 cursor-pointer flex-col items-center justify-center gap-1 px-2 text-center"
        >
          <Icon name="add_photo_alternate" size={18} />
          <span className="text-[10px] leading-tight">
            {dragging ? "Déposer ici" : "Glisser ou cliquer"}
          </span>
        </label>
      )}

      <div className="px-2 pb-2 pt-1.5">
        {capture ? (
          <button
            type="button"
            onClick={toggleEntry}
            disabled={pending}
            className={cn(
              "flex w-full items-center gap-1 text-left text-[10px] font-bold transition-colors disabled:opacity-40",
              capture.isEntry ? "text-brand-amber" : "text-subtle hover:text-muted",
            )}
          >
            <Icon name={capture.isEntry ? "star" : "star_outline"} size={12} />
            {capture.isEntry ? "Capture d'entrée" : "Marquer comme entrée"}
          </button>
        ) : (
          <p className="text-subtle text-[10px] leading-tight">{timeframe.purpose}</p>
        )}
      </div>
    </div>
  );
}
