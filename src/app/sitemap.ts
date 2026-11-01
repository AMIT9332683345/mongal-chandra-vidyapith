import type { MetadataRoute } from "next";
import { env } from "@/server/config/env";
import { listSitemapEntries } from "@/server/content/site";
import { PRIMARY_NAV } from "@/lib/navigation";

/**
 * Generated from the database, not from a hand-written list.
 *
 * A detail page enters the sitemap at the moment its row is published and
 * leaves it when the row is withdrawn, so a crawler is never pointed at a notice
 * that answers 404. The portal, the sign-in page and every `/api` path are
 * absent here and refused in `robots.txt`, because a private dashboard has
 * nothing to search for.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dynamic = await listSitemapEntries();
  // The sitemap format requires absolute URLs; a bare path is rejected by
  // crawlers that validate it. Everything here is on the public origin.
  const origin = env.APP_URL.replace(/\/$/, "");
  const absolute = (path: string) => (path === "/" ? origin : `${origin}${path}`);

  const fixed: MetadataRoute.Sitemap = [
    ...PRIMARY_NAV.flatMap((item) => [
      { url: absolute(item.href), changeFrequency: "weekly" as const, priority: item.href === "/" ? 1 : 0.7 },
      ...(item.children ?? []).map(
        (child) => ({ url: absolute(child.href), changeFrequency: "weekly" as const, priority: 0.6 }) satisfies MetadataRoute.Sitemap[number],
      ),
    ]),
    { url: absolute("/privacy"), changeFrequency: "yearly", priority: 0.3 },
    { url: absolute("/accessibility"), changeFrequency: "yearly", priority: 0.3 },
  ];

  // Newest first: a crawler has a fetch budget, and this term's notice matters
  // more than last year's.
  const stamps = dynamic.map((entry) => ({
    ...entry,
    updated: entry.updatedAt ? new Date(entry.updatedAt) : null,
  }));
  stamps.sort((a, b) => (b.updated?.getTime() ?? 0) - (a.updated?.getTime() ?? 0));

  const rows: MetadataRoute.Sitemap = stamps.map((entry) => ({
    url: absolute(entry.path),
    lastModified: entry.updated ?? undefined,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...fixed, ...rows];
}
