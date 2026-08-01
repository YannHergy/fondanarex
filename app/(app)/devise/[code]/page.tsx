import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PendingView } from "@/components/ui/pending-view";
import { getScoredCurrencies } from "@/lib/currencies";
import { requireUserId } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: code.toUpperCase() };
}

/**
 * Currency detail. In the legacy app this was not a route at all — it was
 * `selectedCurrencyCode` state inside App.tsx, so it could not be linked to,
 * bookmarked, or reached with the back button.
 */
export default async function CurrencyDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const userId = await requireUserId();
  const { code } = await params;
  const currencies = await getScoredCurrencies(userId);
  const currency = currencies[code.toUpperCase()];

  if (!currency) notFound();

  return (
    <PendingView
      title={`${currency.code} — ${currency.name}`}
      legacyComponent="CurrencyDetail.tsx (1406 lignes)"
      summary="Détail d'une devise : décomposition du score indicateur par indicateur, données macro, news, contexte de marché et analyse qualitative."
    />
  );
}
