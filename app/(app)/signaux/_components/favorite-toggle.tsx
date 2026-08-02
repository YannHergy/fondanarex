"use client";

import { useOptimistic, useTransition } from "react";

import { toggleFavoritePair } from "@/app/(app)/signaux/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function FavoriteToggle({ pair, favorite }: { pair: string; favorite: boolean }) {
  const [, startTransition] = useTransition();
  // The write is a round trip; the star must feel instant.
  const [optimistic, setOptimistic] = useOptimistic(favorite);

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Retirer ${pair} des favoris` : `Ajouter ${pair} aux favoris`}
      title={optimistic ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFavoritePair(pair);
        })
      }
      className={cn(
        "shrink-0 transition-colors",
        optimistic ? "text-brand-amber" : "text-subtle hover:text-brand-amber",
      )}
    >
      <Icon name="star" size={16} filled={optimistic} />
    </button>
  );
}
