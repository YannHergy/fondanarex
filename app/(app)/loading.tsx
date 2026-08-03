import { Icon } from "@/components/ui/icon";

/**
 * Instant feedback while a route's server component resolves.
 *
 * Every page here calls `requireUserId()` (one DB round trip) plus its own
 * Prisma queries, against a serverless Postgres (Neon) that can add real
 * latency, especially on a cold start. Without this file, Next.js shows
 * nothing at all until that round trip finishes, so a click looks frozen —
 * this makes the wait visible instead of invisible.
 */
export default function Loading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Icon name="progress_activity" size={28} className="text-brand-blue animate-spin" />
    </div>
  );
}
