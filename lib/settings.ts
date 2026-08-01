import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";

/**
 * User preferences.
 *
 * In the legacy app these lived in three different places: `sidebar_collapsed`
 * in localStorage, the risk-calculator defaults in three more localStorage keys,
 * and `isDarkMode` in React state that was never persisted at all — so the theme
 * silently reset to dark on every reload. They are one row here.
 */
export interface Settings {
  theme: "dark" | "light";
  sidebarCollapsed: boolean;
  locale: string;
  riskCapital: number;
  riskPct: number;
  riskRR: number;
  alertSoundsEnabled: boolean;
  dndEnabled: boolean;
  dndFrom: string | null;
  dndTo: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  sidebarCollapsed: false,
  locale: "fr",
  riskCapital: 5000,
  riskPct: 0.4,
  riskRR: 2,
  alertSoundsEnabled: false,
  dndEnabled: false,
  dndFrom: null,
  dndTo: null,
};

/**
 * Settings for the signed-in user, or the defaults when signed out.
 *
 * `cache` dedupes this within a single request: the root layout needs the theme
 * and the sidebar needs the collapse state, and that should be one query rather
 * than two.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const userId = await currentUserId();
  if (!userId) return DEFAULT_SETTINGS;

  const row = await prisma.userSettings.findUnique({ where: { userId } });
  if (!row) return DEFAULT_SETTINGS;

  return {
    theme: row.theme === "light" ? "light" : "dark",
    sidebarCollapsed: row.sidebarCollapsed,
    locale: row.locale,
    riskCapital: Number(row.riskCapital),
    riskPct: Number(row.riskPct),
    riskRR: Number(row.riskRR),
    alertSoundsEnabled: row.alertSoundsEnabled,
    dndEnabled: row.dndEnabled,
    dndFrom: row.dndFrom,
    dndTo: row.dndTo,
  };
});
