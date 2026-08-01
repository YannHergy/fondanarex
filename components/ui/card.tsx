import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** Panel surface used by every screen. */
export function Card({
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { className?: string }) {
  return (
    <section
      className={cn("bg-surface border-border-app rounded-2xl border p-4", className)}
      {...props}
    >
      {children}
    </section>
  );
}

/**
 * Small uppercase heading with an optional leading icon — the label style used
 * above every panel in the legacy UI.
 */
export function CardTitle({
  icon,
  children,
  className,
  as: Component = "h2",
}: {
  icon?: string;
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("text-muted mb-3 flex items-center gap-2", className)}>
      {icon ? <Icon name={icon} size={16} /> : null}
      <Component className="text-xs font-bold tracking-widest uppercase">{children}</Component>
    </div>
  );
}

/** Page heading with an optional subtitle. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-fg text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-subtle mt-0.5 text-xs">{subtitle}</p> : null}
      </div>
      {children}
    </header>
  );
}

/** Shown in place of a panel whose upstream integration has no API key. */
export function NotConfigured({ what }: { what: string }) {
  return (
    <p className="text-subtle flex items-center gap-2 text-xs">
      <Icon name="key_off" size={14} />
      {what} — clé API non configurée.
    </p>
  );
}
