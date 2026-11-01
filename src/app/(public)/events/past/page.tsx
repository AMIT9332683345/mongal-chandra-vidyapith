import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/section-heading";
import { formatDateTime } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";
import { listEventCategories, listPastEvents } from "@/server/content/site";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Past events and programmes",
  description: "Archived school events with the highlights written up afterwards by the event coordinator.",
  path: "/events/past",
});

export default async function PastEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const key = typeof category === "string" && category.trim() ? category.trim() : undefined;
  const [categories, events] = await Promise.all([listEventCategories(), listPastEvents(48, key)]);

  return (
    <>
      <PageHeader
        eyebrow="Archive"
        title="Past events and programmes"
        intro="Events stay listed after they have finished, with the write-up the school published about them."
      />
      <section className="shell py-12">
        <ul className="mb-8 flex list-none flex-wrap gap-2">
          {categories.map((item) => (
            <li key={item.key}>
              <a
                href={`/events/past?category=${encodeURIComponent(item.key)}`}
                className="tag no-underline"
                style={{
                  borderColor: key === item.key ? "var(--accent)" : "var(--line)",
                  color: key === item.key ? "var(--accent)" : "var(--ink-secondary)",
                }}
              >
                {item.name}
              </a>
            </li>
          ))}
        </ul>

        {events.length > 0 ? (
          <ul className="flex list-none flex-col gap-8">
            {events.map((event) => (
              <li key={event.id} className="border-l-2 pl-5" style={{ borderColor: "var(--line-strong)" }}>
                <p className="text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
                  {formatDateTime(event.startsAt)}
                  {event.categoryName ? ` · ${event.categoryName}` : ""}
                </p>
                <Link
                  href={`/events/${event.slug}`}
                  className="mt-1 block font-[family-name:var(--font-heading)] text-[1.12rem] font-semibold no-underline hover:underline"
                  style={{ color: "var(--ink)" }}
                >
                  {event.title}
                </Link>
                {event.summary && (
                  <p className="mt-1.5 text-[0.95rem]" style={{ color: "var(--ink-secondary)" }}>
                    {event.summary}
                  </p>
                )}
                {event.resultsSummary && (
                  <p className="mt-2 text-[0.93rem]" style={{ color: "var(--ink-secondary)" }}>
                    <span className="font-semibold" style={{ color: "var(--accent)" }}>
                      Highlights:{" "}
                    </span>
                    {event.resultsSummary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No completed events have been published yet" />
        )}
      </section>
    </>
  );
}
