import Link from "next/link";
import { EventCalendar, monthLabel, monthStart } from "@/components/event-calendar";
import { EventList } from "@/components/event-list";
import { PageHeader } from "@/components/page-header";
import { EmptyState, SectionHeading } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { listEventCategories, listEventsInRange, listUpcomingEvents } from "@/server/content/site";

export const revalidate = 120;

export const metadata = pageMetadata({
  title: "Events and cultural programmes",
  description:
    "The school's event calendar: academic programmes, celebrations, sports meets and competitions, with upcoming and archived listings.",
  path: "/events",
});

function read(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const month = monthStart(read(params.month));
  const category = read(params.category);
  const group = read(params.group);

  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

  const [categories, inMonth, upcoming] = await Promise.all([
    listEventCategories(),
    listEventsInRange(from, to, category),
    listUpcomingEvents(6, category),
  ]);

  const filterSuffix = category ? `&category=${encodeURIComponent(category)}` : "";

  return (
    <>
      <PageHeader
        eyebrow="School diary"
        title="Events and cultural programmes"
        intro="Academic programmes, celebrations, sport and competitions, as published by the school. Selecting a month navigates without JavaScript."
      />

      <section className="shell py-12">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.85rem] font-semibold" style={{ color: "var(--ink-muted)" }}>
            Filter
          </span>
          <Link
            href={`/events${group ? `?group=${encodeURIComponent(group)}` : ""}`}
            className="tag no-underline"
            style={{ borderColor: !category && !group ? "var(--accent)" : "var(--line)", color: !category && !group ? "var(--accent)" : "var(--ink-secondary)" }}
          >
            All
          </Link>
          {categories.map((item) => (
            <Link
              key={item.key}
              href={`/events?category=${encodeURIComponent(item.key)}`}
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

        <div className="mt-9 grid gap-12 lg:grid-cols-[1.7fr_1fr]">
          <EventCalendar events={inMonth} month={month} extraParams={filterSuffix} />

          <div>
            <SectionHeading eyebrow="Ahead" title="Next events" more={{ href: "/events/upcoming", label: "All upcoming" }} />
            <div className="mt-5">
              {upcoming.length > 0 ? (
                <EventList events={upcoming} />
              ) : (
                <EmptyState title="Nothing scheduled ahead" note="Published programmes appear here as they are added to the diary." />
              )}
            </div>
            <p className="mt-6 text-[0.9rem]">
              <Link href="/events/past" className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
                Past events and write-ups →
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-10 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
          Showing {inMonth.length} event{inMonth.length === 1 ? "" : "s"} in {monthLabel(month)}.
        </p>
      </section>
    </>
  );
}
