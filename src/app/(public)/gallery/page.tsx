import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StoredPhoto } from "@/components/stored-photo";
import { EmptyState } from "@/components/section-heading";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { listGalleryCategories, listPublishedAlbums } from "@/server/content/site";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Photo gallery",
  description:
    "Published photographs of school life, campus and events. An album appears here only after consent for every identifiable pupil in it has been recorded.",
  path: "/gallery",
});

function read(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const category = read((await searchParams).category);
  const [categories, albums] = await Promise.all([listGalleryCategories(), listPublishedAlbums(48, category)]);

  return (
    <>
      <PageHeader
        eyebrow="Gallery"
        title="Photographs"
        intro="Albums the school has published. Photographs of pupils are released only with the family's recorded consent, and an album stays unpublished until every identifiable child in it is cleared."
      />

      <section className="shell py-12">
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.85rem] font-semibold" style={{ color: "var(--ink-muted)" }}>
              Albums
            </span>
            <Link
              href="/gallery"
              className="tag no-underline"
              style={{
                borderColor: !category ? "var(--accent)" : "var(--line)",
                color: !category ? "var(--accent)" : "var(--ink-secondary)",
              }}
            >
              All
            </Link>
            {categories.map((item) => (
              <Link
                key={item.key}
                href={`/gallery?category=${encodeURIComponent(item.key)}`}
                className="tag no-underline"
                style={{
                  borderColor: category === item.key ? "var(--accent)" : "var(--line)",
                  color: category === item.key ? "var(--accent)" : "var(--ink-secondary)",
                }}
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}

        {albums.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No albums published yet"
              note="Photographs are added by the school. Until an album is published and its consent records are complete, nothing appears here."
            />
          </div>
        ) : (
          <ul className="mt-8 grid list-none gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <li key={album.id}>
                <Link href={`/gallery/${album.slug}`} className="block no-underline">
                  {album.coverDocumentId ? (
                    <StoredPhoto documentId={album.coverDocumentId} alt={`Cover photograph from ${album.title}`} />
                  ) : (
                    <div
                      className="aspect-[3/2] border"
                      style={{ borderColor: "var(--line)", background: "var(--surface-raised)" }}
                      aria-hidden="true"
                    />
                  )}
                  <h2
                    className="mt-3 text-[1.05rem] font-semibold"
                    style={{ color: "var(--ink)", fontFamily: "var(--font-heading)" }}
                  >
                    {album.title}
                  </h2>
                  <p className="mt-1 text-[0.86rem]" style={{ color: "var(--ink-muted)" }}>
                    {album.categoryName ?? "Album"} · {album.photoCount} photograph{album.photoCount === 1 ? "" : "s"}
                    {album.publishedAt ? ` · published ${formatDate(album.publishedAt)}` : ""}
                  </p>
                  {album.description && (
                    <p className="mt-2 text-[0.92rem]" style={{ color: "var(--ink-secondary)" }}>
                      {album.description}
                    </p>
                  )}
                  {album.eventSlug && (
                    <p className="mt-2 text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                      From {album.eventTitle ?? "an event"} →
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
