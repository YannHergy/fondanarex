"use client";

import { useRouter, useSearchParams } from "next/navigation";

const CURRENCIES = ["AUD", "GBP", "NZD", "USD", "EUR", "CAD", "CHF", "JPY"] as const;
const RECOMMENDATIONS = ["ACHETEUR", "VENDEUR", "NEUTRE", "ATTENDRE"] as const;
const GROUPS = ["Majeurs", "EUR", "GBP", "Croix"] as const;

const selectClass =
  "border-border-app bg-surface text-fg rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none";

/**
 * Devise / direction / conviction minimale / groupe — four independent
 * filters on top of the existing "toutes / favoris" toggle. Each one just
 * rewrites the query string; `page.tsx` reads it back with `searchParams`.
 */
export function SignalFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/signaux?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filtrer par devise"
        className={selectClass}
        value={searchParams.get("devise") ?? ""}
        onChange={(e) => setParam("devise", e.target.value)}
      >
        <option value="">Toutes devises</option>
        {CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrer par direction"
        className={selectClass}
        value={searchParams.get("direction") ?? ""}
        onChange={(e) => setParam("direction", e.target.value)}
      >
        <option value="">Toutes directions</option>
        {RECOMMENDATIONS.map((reco) => (
          <option key={reco} value={reco}>
            {reco.charAt(0) + reco.slice(1).toLowerCase()}
          </option>
        ))}
      </select>

      <select
        aria-label="Conviction minimale"
        className={selectClass}
        value={searchParams.get("conviction") ?? ""}
        onChange={(e) => setParam("conviction", e.target.value)}
      >
        <option value="">Min. ★</option>
        {[2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}★+
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrer par groupe"
        className={selectClass}
        value={searchParams.get("groupe") ?? ""}
        onChange={(e) => setParam("groupe", e.target.value)}
      >
        <option value="">Tous groupes</option>
        {GROUPS.map((group) => (
          <option key={group} value={group}>
            {group}
          </option>
        ))}
      </select>
    </div>
  );
}
