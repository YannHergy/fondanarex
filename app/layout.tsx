import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// Material Symbols is the project's icon set. It is not available through
// next/font/google (that loader only covers text faces), so it is loaded as a
// stylesheet below with the variable axes we actually use.
const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block";

export const metadata: Metadata = {
  title: {
    default: "Fondanarex",
    template: "%s · Fondanarex",
  },
  description:
    "Forex macro analysis workstation — institutional currency scoring, economic calendar, AI briefing and trading journal.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#08090d" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The theme comes from UserSettings, so it survives a reload — the legacy app
  // supported light mode but kept the flag in React state only, which meant it
  // silently reset to dark on every refresh. Signed-out pages get the default.
  const { theme } = await getSettings();

  return (
    <html
      lang="fr"
      className={cn(theme === "dark" && "dark", inter.variable, jetbrainsMono.variable)}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={MATERIAL_SYMBOLS_HREF} />
      </head>
      <body className="bg-bg text-fg min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
