import type { Metadata } from "next";

import { NewsFeed } from "@/app/(app)/actualites/_components/news-feed";
import { PageHeader } from "@/components/ui/card";
import { ensureFreshNews, listAllNews } from "@/lib/news";

/**
 * The whole feed, currency-tagged or not.
 *
 * The currency pages answer "what is being said about the euro". This one
 * answers "what is happening", which is a different question and needs the
 * headlines that name no currency at all — oil, indices, risk appetite. They
 * are the reason the others moved.
 */
export const metadata: Metadata = { title: "Actualités" };
export const dynamic = "force-dynamic";

export default async function NewsPage() {
  // Same rule as the currency pages: browsing is the schedule.
  await ensureFreshNews();

  const items = await listAllNews(60);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Actualités"
        subtitle="Tout ce qui sort, avec le drapeau du pays concerné quand il y en a un"
      />

      <NewsFeed items={items} now={new Date().toISOString()} />
    </div>
  );
}
