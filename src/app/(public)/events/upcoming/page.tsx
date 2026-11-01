import { EventList } from "@/components/event-list";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { listEventCategories, listUpcomingEvents } from "@/server/content/site";

export const revalidate = 120;

export const metadata = pageMetadata({
  title: "Upcoming events",
  description: "Events the school has published ahead of their date, in chronological order.",
  path: "/events/upcoming",
});

export default async function UpcomingEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const key = typeof category === "string" && category.trim() ? category.trim() : undefined;
  const [categories, events] = await Promise.all([listEventCategories(), listUpcomingEvents(40, key)]);

  return (
    <>
      <PageHeader eyebrow="Diary" title="Upcoming events" intro="The school's published programme, soonest first." />
      <section className="shell py-12">
        <ul className="mb-8 flex list-none flex-wrap gap-2">
          {categories.map((item) => (
            <li key={item.key}>
              <a
                href={`/events/upcoming?category=${encodeURIComponent(item.key)}`}
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
        {events.length > 0 ? <EventList events={events} /> : <EmptyState title="No events are scheduled ahead" />}
      </section>
    </>
  );
}
