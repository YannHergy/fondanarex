import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Rule confidence, 1–5.
 *
 * Material stars rather than the legacy `'★'.repeat(n)` string: the filled and
 * empty states are distinct glyphs, so the rating stays legible at small sizes
 * and reads correctly to assistive technology through the label.
 */
export function Confidence({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-px", className)}
      title={`Confiance ${value}/5`}
      aria-label={`Confiance ${value} sur 5`}
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <Icon
          key={step}
          name={step <= value ? "star" : "star_outline"}
          size={12}
          className={step <= value ? "text-brand-amber" : "text-subtle/40"}
        />
      ))}
    </span>
  );
}
