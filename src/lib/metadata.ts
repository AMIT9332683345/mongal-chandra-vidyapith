import type { Metadata } from "next";

/**
 * Titles and descriptions are assembled from what the school has confirmed.
 * Where a page has no school-supplied summary the fallback says what the page
 * is for; it never states a fact about the institution.
 */
export function pageMetadata({
  title,
  description,
  path,
  noIndex,
}: {
  title: string;
  description?: string | null;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const summary = description?.trim() || `${title} on the official website of Mongal Chandra Vidyapith.`;
  return {
    title,
    description: summary,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: summary,
      url: path,
      type: "website",
      images: [{ url: "/images/campus.webp", width: 228, height: 190, alt: "The Mongal Chandra Vidyapith campus" }],
    },
    twitter: { card: "summary", title, description: summary },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
