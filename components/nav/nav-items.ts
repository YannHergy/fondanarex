/**
 * Primary navigation.
 *
 * The legacy app held its current view in `useState<ViewType>` and switched on
 * it inside one 324-line `App.tsx`. That meant no URL for any screen: no
 * bookmarking, no back button, no deep link to a currency, and a full remount of
 * every sibling on each navigation. Each entry is a real route here.
 *
 * Labels are French throughout. The legacy set was half-translated — "Vue
 * d'ensemble" next to "Dashboard", "Prévisions" next to "Reports" — which is
 * carried over here as consistent French.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Material Symbols name. */
  icon: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Vue d'ensemble", icon: "grid_view" },
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: "dashboard" },
  { href: "/signaux", label: "Signaux live", icon: "monitoring" },
  { href: "/comparateur", label: "Comparateur", icon: "balance" },
  { href: "/calendrier", label: "Calendrier", icon: "calendar_month" },
  { href: "/briefing", label: "Briefing IA", icon: "smart_toy" },
  { href: "/comptes", label: "Comptes", icon: "account_balance_wallet" },
  { href: "/journal", label: "Journal", icon: "menu_book" },
  { href: "/rapports", label: "Rapports", icon: "bar_chart" },
  { href: "/alertes", label: "Alertes", icon: "notifications" },
  { href: "/previsions", label: "Prévisions", icon: "explore" },
  { href: "/predictions", label: "Prédictions", icon: "lightbulb" },
  { href: "/graphiques", label: "Graphiques", icon: "show_chart" },
  { href: "/simulateur", label: "Simulateur", icon: "calculate" },
  { href: "/correlations", label: "Corrélations", icon: "link" },
  { href: "/indicateurs", label: "Indicateurs", icon: "code" },
  { href: "/profils", label: "Profils pays", icon: "public" },
  { href: "/engrenage", label: "Engrenage", icon: "settings_input_component" },
  { href: "/methodologie", label: "Méthodologie", icon: "info" },
  { href: "/admin", label: "Admin données", icon: "settings" },
] as const;

/**
 * Whether a nav entry should render as the current one.
 *
 * "/" only matches exactly — otherwise it would light up on every route, since
 * every path starts with a slash.
 */
export function isActiveRoute(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
