import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** The eight tracked currencies, in display order. */
export const CURRENCY_CODES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * Fixed per-currency accent colour. A currency keeps the same colour everywhere
 * it appears, including on both sides of a comparison — carried over from the
 * legacy design, which got this right.
 */
export const CURRENCY_COLOR_VAR: Record<CurrencyCode, string> = {
  USD: "var(--color-ccy-usd)",
  EUR: "var(--color-ccy-eur)",
  GBP: "var(--color-ccy-gbp)",
  JPY: "var(--color-ccy-jpy)",
  AUD: "var(--color-ccy-aud)",
  CAD: "var(--color-ccy-cad)",
  NZD: "var(--color-ccy-nzd)",
  CHF: "var(--color-ccy-chf)",
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}
