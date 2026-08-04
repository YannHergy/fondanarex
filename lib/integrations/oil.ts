import "server-only";

import type { MonthlyReading } from "@/domain/macro/market-series";
import { fetchMonthlyQuote } from "@/lib/integrations/yahoo-quote";

/**
 * WTI crude front-month future, the CAD's first driver (22% of its profile).
 *
 * WTI rather than Brent on purpose: Canadian crude is priced against it —
 * Western Canadian Select quotes as a discount to WTI — so the WTI is the
 * barrel that actually determines Canada's export revenue. Brent is the
 * global benchmark but a step removed from the CAD.
 */
export function fetchOil(): Promise<MonthlyReading> {
  return fetchMonthlyQuote("CL=F");
}
