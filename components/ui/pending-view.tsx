import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/**
 * Placeholder for a legacy screen that has not been ported yet.
 *
 * Deliberately explicit about what is missing rather than rendering an empty
 * page: while the port is in progress it must be obvious at a glance which
 * screens are real and which are not.
 */
export function PendingView({
  title,
  legacyComponent,
  summary,
}: {
  title: string;
  legacyComponent: string;
  summary: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-5 md:p-6">
      <PageHeader title={title} subtitle="Portage en cours" />
      <Card>
        <div className="flex items-start gap-3">
          <Icon name="construction" size={20} className="text-brand-amber mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-fg text-sm font-semibold">Écran pas encore porté</p>
            <p className="text-muted text-sm leading-relaxed">{summary}</p>
            <p className="text-subtle font-mono text-xs">Source héritée : {legacyComponent}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
