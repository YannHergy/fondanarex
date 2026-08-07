import "server-only";

import type { DailyClose, MonthlyReading } from "@/domain/macro/market-series";
import { fetchDailyCloses, fetchMonthlyQuote } from "@/lib/integrations/yahoo-quote";

/**
 * WTI crude front-month future, the CAD's first driver (22% of its profile).
 *
 * WTI rather than Brent on purpose: Canadian crude is priced against it —
 * Western Canadian Select quotes as a discount to WTI — so the WTI is the
 * barrel that actually determines Canada's export revenue. Brent is the
 * global benchmark but a step removed from the CAD.
 */
export function fetchOil(): Promise<MonthlyReading> {
  return fetchMonthlyQuote(WTI);
}

const WTI = "CL=F";

/**
 * The daily WTI series, for the trailing-window move `oilChangePct` scores.
 *
 * Six months rather than the three the monthly reading asks for: a thirty-day
 * trailing window needs a close from thirty days ago to exist, and a shorter
 * range would silently shrink the window every time the series began inside
 * it. The extra months cost nothing — the response is cached for twelve hours
 * and this is the same endpoint the monthly reading already calls.
 */
export function fetchOilDaily(): Promise<DailyClose[]> {
  return fetchDailyCloses(WTI, "6mo");
}
