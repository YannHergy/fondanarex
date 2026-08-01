import { cn } from "@/lib/utils";

/**
 * Material Symbols icon.
 *
 * The font is loaded once in the root layout. Using the variable font means any
 * symbol name is available without per-icon imports or bundle cost.
 * See https://fonts.google.com/icons for the full name list.
 */
export function Icon({
  name,
  className,
  filled = false,
  size = 20,
  "aria-hidden": ariaHidden = true,
  label,
}: {
  /** Material Symbols name, e.g. "trending_up", "calendar_month". */
  name: string;
  className?: string;
  /** Use the filled variant rather than outlined. */
  filled?: boolean;
  size?: number;
  "aria-hidden"?: boolean;
  /** Accessible label. When provided the icon is exposed to screen readers. */
  label?: string;
}) {
  return (
    <span
      className={cn("material-symbols-outlined leading-none select-none", className)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
      aria-hidden={label ? undefined : ariaHidden}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {name}
    </span>
  );
}
