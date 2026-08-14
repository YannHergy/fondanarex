import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Every publication time in the app is shown in Brazzaville local time
 * (WAT, UTC+1 year-round — Congo observes no daylight saving), not the
 * server's own UTC clock. `Intl` resolves the offset from the IANA zone
 * itself, so this stays correct even though WAT has no DST to get wrong.
 */
const BRAZZAVILLE_HOUR_MINUTE = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Brazzaville",
});

/** "HH:MM" in Brazzaville local time, for any UTC instant. */
export function brazzavilleTime(date: Date): string {
  return BRAZZAVILLE_HOUR_MINUTE.format(date);
}

// en-US, not en-GB: US ordering is month/day, matching what the old
// `toISOString().slice(5, 10)` ("08/14") produced.
const BRAZZAVILLE_MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "Africa/Brazzaville",
});

/**
 * "MM/DD" in Brazzaville local time. Paired with `brazzavilleTime` rather
 * than reading the date from `toISOString()` separately: an instant near
 * midnight UTC falls on the NEXT calendar day once shifted to WAT (UTC+1),
 * and formatting the date and the time in two different zones would show a
 * time that doesn't belong to the date beside it.
 */
export function brazzavilleMonthDay(date: Date): string {
  return BRAZZAVILLE_MONTH_DAY.format(date);
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
