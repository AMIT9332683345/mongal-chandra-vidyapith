import type { MetadataRoute } from "next";
import { env } from "@/server/config/env";

/**
 * Public pages are open to crawlers; the authenticated half of the site is not.
 *
 * `/portal`, `/signin` and `/api` are disallowed here, the portal pages carry a
 * `noindex` directive of their own, and the document and image endpoints answer
 * 404 without a session regardless of what a crawler is told. The sitemap is
 * published so a search engine finds the notice board rather than guessing at a
 * URL.
 */
export default function robots(): MetadataRoute.Robots {
  // A portal deployment serves the same public pages from its own hostname. It
  // is a duplicate of the site that search results should show, so it invites
  // no crawler at all and advertises no sitemap of its own.
  if (env.SITE_ROLE === "portal") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/portal", "/signin", "/api/", "/admissions/applied"],
      },
    ],
    sitemap: `${env.APP_URL}/sitemap.xml`,
    host: new URL(env.APP_URL).origin,
  };
}
