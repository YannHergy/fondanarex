"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteScreenshot, uploadScreenshot } from "@/app/(app)/previsions/actions";
import { Icon } from "@/components/ui/icon";
import { MAX_UPLOAD_BYTES } from "@/domain/media/image-type";
import type { AttachmentRow } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/**
 * Screenshot strip with upload, delete and a lightbox.
 *
 * Several images per setup, where the legacy model held exactly one (`screenshot:
 * string`) and a second upload silently replaced the first. Charts are usually
 * read across timeframes, so one slot per setup was the wrong shape.
 */
export function Screenshots({
  setupId,
  target,
  images,
  label,
}: {
  setupId: string;
  target: "setup" | "review";
  images: AttachmentRow[];
  label: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);

    // Checked here as well as on the server so an oversized file is refused
    // before it is uploaded, not after.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Fichier trop volumineux (maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo)`);
      return;
    }

    const body = new FormData();
    body.set("setupId", setupId);
    body.set("target", target);
    body.set("file", file);

    startTransition(async () => {
      const result = await uploadScreenshot(body);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteScreenshot(id);
      setLightbox(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-subtle text-[10px] font-bold tracking-widest uppercase">{label}</span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="text-subtle hover:text-brand-blue flex items-center gap-1 text-[11px] disabled:opacity-40"
        >
          <Icon
            name={pending ? "progress_activity" : "add_photo_alternate"}
            size={13}
            className={pending ? "animate-spin" : undefined}
          />
          Ajouter
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={upload}
        className="hidden"
      />

      {error ? <p className="text-brand-red mb-1.5 text-[11px]">{error}</p> : null}

      {images.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="border-border-app text-subtle hover:border-brand-blue hover:text-brand-blue flex h-20 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs transition-colors disabled:opacity-40"
        >
          <Icon name="image" size={16} />
          Aucune capture
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={image.id} className="group relative">
              <button
                type="button"
                onClick={() => setLightbox(index)}
                className="border-border-app hover:border-brand-blue block overflow-hidden rounded-lg border transition-colors"
              >
                <Image
                  src={image.url}
                  alt={image.caption ?? "Capture d'écran"}
                  width={112}
                  height={80}
                  unoptimized
                  className="h-20 w-28 object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => remove(image.id)}
                disabled={pending}
                title="Supprimer"
                className="bg-surface border-border-app text-subtle hover:text-brand-red absolute -top-1.5 -right-1.5 rounded-full border p-0.5 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && images[lightbox] ? (
        <Lightbox
          images={images}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: AttachmentRow[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const image = images[index]!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Capture agrandie"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowRight") onIndex((index + 1) % images.length);
        if (event.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
      }}
      tabIndex={-1}
      ref={(node) => node?.focus()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 text-white/70 hover:text-white"
      >
        <Icon name="close" size={24} />
      </button>

      {images.length > 1 ? (
        <>
          <NavButton
            side="left"
            onClick={(event) => {
              event.stopPropagation();
              onIndex((index - 1 + images.length) % images.length);
            }}
          />
          <NavButton
            side="right"
            onClick={(event) => {
              event.stopPropagation();
              onIndex((index + 1) % images.length);
            }}
          />
        </>
      ) : null}

      <Image
        src={image.url}
        alt={image.caption ?? "Capture d'écran"}
        width={1600}
        height={1000}
        unoptimized
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-auto max-w-full rounded-lg object-contain"
      />

      {images.length > 1 ? (
        <span className="absolute bottom-4 font-mono text-xs text-white/60">
          {index + 1} / {images.length}
        </span>
      ) : null}
    </div>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Précédente" : "Suivante"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 text-white/60 hover:text-white",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon name={side === "left" ? "chevron_left" : "chevron_right"} size={32} />
    </button>
  );
}
