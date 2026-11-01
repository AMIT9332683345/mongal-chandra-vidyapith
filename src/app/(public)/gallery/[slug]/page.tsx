import Link from "next/link";
import { notFound } from "next/navigation";
import { GalleryViewer, type GalleryPhoto } from "@/components/gallery-viewer";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { getPublishedAlbumBySlug } from "@/server/content/site";

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const album = await getPublishedAlbumBySlug(slug);
  if (!album) return pageMetadata({ title: "Album not found", path: "/gallery", noIndex: true });
  return pageMetadata({
    title: album.title,
    description: album.description,
    path: `/gallery/${album.slug}`,
  });
}

export default async function AlbumPage({ params }: Params) {
  const { slug } = await params;
  const album = await getPublishedAlbumBySlug(slug);
  if (!album) notFound();

  const photos: GalleryPhoto[] = album.items.map((item, position) => {
    const description = item.altText ?? item.caption ?? `${album.title} — photograph ${position + 1}`;
    return {
      id: item.id,
      src: `/api/images/${item.documentId}`,
      alt: description,
      caption: item.caption ?? description,
      credit: item.credit,
    };
  });

  return (
    <>
      <PageHeader eyebrow="Gallery" title={album.title} intro={album.description} />

      <section className="shell py-12">
        <p className="text-[0.9rem]" style={{ color: "var(--ink-muted)" }}>
          <Link href="/gallery" className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
            ← All albums
          </Link>
          {album.categoryName ? ` · ${album.categoryName}` : ""}
          {album.publishedAt ? ` · published ${formatDate(album.publishedAt)}` : ""}
          {album.eventSlug ? (
            <>
              {" · "}
              <Link href={`/events/${album.eventSlug}`} className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
                Related event: {album.eventTitle ?? "see the diary"}
              </Link>
            </>
          ) : null}
        </p>

        <div className="mt-8">
          {photos.length > 0 ? (
            <>
              <GalleryViewer photos={photos} albumTitle={album.title} />
              <p className="mt-8 text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>
                Use the arrow keys to move between photographs and Escape to close. Every frame in this album has been
                cleared for publication by the school.
              </p>
            </>
          ) : (
            <EmptyState
              title="This album has no published photographs"
              note="The frames were removed or are awaiting their consent records. The album title is kept for reference."
            />
          )}
        </div>
      </section>
    </>
  );
}
