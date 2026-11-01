import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { InfoGap } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { getContentPage } from "@/server/content/site";

export const revalidate = 600;

/**
 * A page the school wrote for itself.
 *
 * Only a published page is reachable; a draft has no address here and returns
 * the ordinary not-found page rather than a preview that could be shared by
 * mistake. The body is rendered as text, so nothing typed into the editor can
 * become markup on the site.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getContentPage(slug);
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } };
  return pageMetadata({
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.intro,
    path: `/pages/${page.slug}`,
    noIndex: page.noIndex,
  });
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getContentPage(slug);
  if (!page) notFound();

  return (
    <>
      <PageHeader eyebrow="From the school" title={page.title} intro={page.intro ?? undefined} />

      <section className="shell py-12">
        {page.body ? (
          <Prose text={page.body} className="max-w-3xl" />
        ) : (
          <div className="max-w-3xl">
            <InfoGap
              label="The wording for this page"
              what="The page has been published with a title but no body yet. Its text is written by the school in the content panel; nothing is filled in on its behalf."
            />
          </div>
        )}

        <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
          {page.publishedAt && <span>Published {formatDate(page.publishedAt)}</span>}
          <Link href="/contact" style={{ color: "var(--accent)", fontWeight: 600 }}>
            Ask the office about this page
          </Link>
        </p>
      </section>
    </>
  );
}
