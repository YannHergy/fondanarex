import { cn } from "@/lib/utils";

/**
 * Material Symbols icon.
 *
 * The font is loaded once in the root layout. Using the variable font means any
 * symbol name is available without per-icon imports or bundle cost.
 * See https://fonts.google.com/icons for the full name list.
 *
 * MARKED UNTRANSLATABLE, and this is not a nicety.
 *
 * The font works by LIGATURE: the element's text content is the symbol name,
 * and the font substitutes a glyph for it. So `chevron_left` is real text in
 * the DOM, and a page translator treats it as a word to translate. Chrome
 * turned it into `CHEVRON_GAUCHE`, `trending_up` into `TENDANCE_à_LA_HAUSSE`
 * and `light_mode` into `MODE_CLAIR` — none of which match a ligature, so
 * every icon on the page rendered as its own translated name in full letters,
 * overlapping the layout around it.
 *
 * Both markers are set on purpose: `translate="no"` is the standard HTML
 * attribute, `notranslate` the class Google's translator has honoured the
 * longest. Neither costs anything and only one of them has to be respected.
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
      className={cn("material-symbols-outlined notranslate leading-none select-none", className)}
      translate="no"
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
