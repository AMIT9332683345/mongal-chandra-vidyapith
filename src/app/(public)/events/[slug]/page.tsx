import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { formatDateTime } from "@/lib/format";
import { getPublicEventBySlug, getSchoolName } from "@/server/content/site";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);
  if (!event) return { title: "Event not found", robots: { index: false, follow: false } };
  const description = event.seoDescription ?? event.summary;
  return {
    title: event.title,
    description: description ?? undefined,
    alternates: { canonical: `/events/${slug}` },
    openGraph: { title: event.title, description: description ?? undefined, type: "website", url: `/events/${slug}` },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [event, schoolName] = await Promise.all([getPublicEventBySlug(slug), getSchoolName()]);
  if (!event) notFound();

  const starts = event.startsAt.toISOString();
  const ends = event.endsAt?.toISOString();

  // Structured data carries only what the school published for this event.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: starts,
    ...(ends ? { endDate: ends } : {}),
    ...(event.summary ? { description: event.summary } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus:
      event.occurrenceState === "cancelled"
        ? "https://schema.org/EventCancelled"
        : event.occurrenceState === "postponed"
          ? "https://schema.org/EventRescheduled"
          : "https://schema.org/EventScheduled",
    organizer: { "@type": "EducationalOrganization", name: schoolName },
    ...(event.venue
      ? { location: { "@type": "Place", name: `${schoolName} — ${event.venue}` } }
      : { location: { "@type": "Place", name: schoolName } }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHeader
        eyebrow={event.categoryName ?? "Event"}
        title={event.title}
        intro={event.summary}
      />

      <section className="shell-narrow py-12">
        <dl className="grid gap-x-8 gap-y-3 border-b pb-6 text-[0.94rem] md:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
            <dt style={{ color: "var(--ink-muted)" }}>When</dt>
            <dd className="text-right" style={{ color: "var(--ink)" }}>
              {formatDateTime(event.startsAt)}
              {event.endsAt ? ` – ${formatDateTime(event.endsAt)}` : ""}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
            <dt style={{ color: "var(--ink-muted)" }}>Where</dt>
            <dd className="text-right" style={{ color: "var(--ink)" }}>
              {event.venue ?? "On the school campus"}
            </dd>
          </div>
          {event.organiserLabel && (
            <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
              <dt style={{ color: "var(--ink-muted)" }}>Organised by</dt>
              <dd className="text-right" style={{ color: "var(--ink)" }}>
                {event.organiserLabel}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
            <dt style={{ color: "var(--ink-muted)" }}>Status</dt>
            <dd className="text-right" style={{ color: "var(--ink)" }}>
              {event.occurrenceState}
            </dd>
          </div>
          {event.registrationRequired && (
            <div className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
              <dt style={{ color: "var(--ink-muted)" }}>Registration</dt>
              <dd className="text-right" style={{ color: "var(--ink)" }}>Required — sign in to the portal</dd>
            </div>
          )}
        </dl>

        <Prose text={event.description} className="mt-6 text-[1rem] leading-[1.8]" />

        {event.participationInstructions && (
          <div className="card mt-8 p-5">
            <h2 className="text-[1.05rem]">Taking part</h2>
            <p className="mt-2 text-[0.94rem]">{event.participationInstructions}</p>
          </div>
        )}

        {event.resultsSummary && (
          <div className="mt-8 border-l-2 pl-5" style={{ borderColor: "var(--accent)" }}>
            <h2 className="text-[1.05rem]">Highlights</h2>
            <Prose text={event.resultsSummary} className="mt-2" />
          </div>
        )}

        <p className="mt-10 text-[0.9rem]">
          <Link href="/events" className="font-semibold no-underline hover:underline" style={{ color: "var(--accent)" }}>
            ← Back to the calendar
          </Link>
        </p>
      </section>
    </>
  );
}
