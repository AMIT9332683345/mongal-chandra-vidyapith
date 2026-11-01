import type { Metadata, Viewport } from "next";
import { THEME_PREPAINT_SCRIPT } from "@/lib/theme";
import { env } from "@/server/config/env";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f0c" },
  ],
};

/**
 * Defaults only. Pages that carry a real, confirmed description override the
 * title and description through their own `generateMetadata`; nothing here
 * invents a fact about the school for search engines.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "Mongal Chandra Vidyapith",
    template: "%s · Mongal Chandra Vidyapith",
  },
  description:
    "Official website of Mongal Chandra Vidyapith: notices, events, admissions and the school portal.",
  openGraph: {
    type: "website",
    siteName: "Mongal Chandra Vidyapith",
    title: "Mongal Chandra Vidyapith",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint, so a dark-mode visitor never sees a white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
