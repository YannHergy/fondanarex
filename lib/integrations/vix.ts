import "server-only";

import type { VixReading } from "@/domain/macro/vix";
import { fetchMonthlyQuote } from "@/lib/integrations/yahoo-quote";

/**
 * CBOE Volatility Index.
 *
 * Feeds the `risque` indicator, the heaviest single line of the CHF (28%) and
 * JPY (22%) profiles. See yahoo-quote.ts for why this provider, and
 * domain/macro/vix.ts for what the engine does with the number.
 */
export function fetchVix(): Promise<VixReading> {
  return fetchMonthlyQuote("^VIX");
}
