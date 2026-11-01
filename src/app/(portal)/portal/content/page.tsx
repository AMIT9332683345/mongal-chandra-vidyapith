import Link from "next/link";
import { PanelShell } from "@/components/panel-shell";
import { ActionForm } from "@/components/cms-form";
import { EmptyState } from "@/components/section-heading";
import { releaseScheduledNoticesAction } from "@/server/content/actions";
import { contentOverview, listNoticesForAdmin } from "@/server/content/admin";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Content panel",
  description: "The publishing desk for the school website.",
  path: "/portal/content",
  noIndex: true,
});

export default async function ContentOverviewPage() {
  const actor = await requirePanel("notice.view", "/portal/content");
  const [overview, scheduled] = await Promise.all([contentOverview(), listNoticesForAdmin({ status: "scheduled" })]);

  const cards = [
    { label: "Live notices", value: overview.liveNotices, href: "/portal/content/notices", note: "on the public board" },
    { label: "Draft notices", value: overview.draftNotices, href: "/portal/content/notices", note: "not visible to anyone else" },
    {
      label: "Scheduled notices",
      value: overview.scheduledNotices,
      href: "/portal/content/notices",
      note: overview.scheduledNotices > 0 ? "waiting for their release time" : "nothing queued",
    },
    { label: "Published events", value: overview.upcomingEvents, href: "/portal/content/events", note: "on the calendar ahead" },
    { label: "Albums", value: overview.albums, href: "/portal/content/gallery", note: "in every state" },
    {
      label: "Published albums",
      value: overview.publishedAlbums,
      href: "/portal/content/gallery",
      note: "consent verified for each frame",
    },
    { label: "Homepage blocks shown", value: overview.visibleSections, href: "/portal/content/homepage", note: "of the ones the school writes" },
    { label: "Published downloads", value: overview.publicDocuments, href: "/portal/content/downloads", note: "files any visitor may open" },
    { label: "Draft pages", value: overview.draftPages, href: "/portal/content/pages", note: "written, not yet live" },
    { label: "Draft achievements", value: overview.draftAchievements, href: "/portal/content/achievements", note: "awaiting a verified result" },
    { label: "Draft testimonials", value: overview.draftTestimonials, href: "/portal/content/testimonials", note: "held until consent is recorded" },
    {
      label: "Applications open",
      value: overview.openApplications,
      href: "/portal/admin/applications",
      note: overview.openApplications > 0 ? "waiting for the admissions desk" : "nothing waiting",
    },
    {
      label: "Enquiries waiting",
      value: overview.openEnquiries,
      href: "/portal/admin/enquiries",
      note: overview.openEnquiries > 0 ? "a family is waiting for an answer" : "the inbox is clear",
    },
    {
      label: "School facts unconfirmed",
      value: overview.unconfirmedSettings,
      href: "/portal/content/settings",
      note: overview.unconfirmedSettings > 0 ? "held back from the public pages" : "the office has signed off everything",
    },
  ];

  return (
    <PanelShell
      actor={actor}
      active="/portal/content"
      eyebrow="Content panel"
      title="What is published, and what is waiting"
      intro="Every number here is read from the database on this request. Nothing is cached, and nothing here is a forecast."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list" style={{ listStyle: "none" }}>
        {cards.map((card) => (
          <li key={card.label} className="card p-4">
            <p className="eyebrow">{card.label}</p>
            <p className="mt-1 text-[1.9rem] font-semibold leading-none">{card.value}</p>
            <p className="mt-1 text-[0.82rem]" style={{ color: "var(--ink-muted)" }}>
              {card.note}
            </p>
            <p className="mt-2 text-[0.85rem]">
              <Link href={card.href} style={{ color: "var(--accent)", fontWeight: 600 }}>
                Open
              </Link>
            </p>
          </li>
        ))}
      </ul>

      {overview.scheduledNotices > 0 && principalHas(actor, "notice.publish") ? (
        <section className="rule mt-10 pt-8">
          <h2 className="text-[1.15rem]">Scheduled notices whose time has come</h2>
          <p className="mt-1 max-w-prose text-[0.93rem]" style={{ color: "var(--ink-muted)" }}>
            This build has no background worker, so a scheduled notice stays unpublished until someone with the
            publishing permission presses the button below. It releases every queued notice whose release time has
            already passed and nothing else.
          </p>
          <ul className="mt-3 space-y-1 text-[0.92rem]">
            {scheduled.map((notice) => (
              <li key={notice.id}>
                {notice.publishAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(notice.publishAt) : "no time recorded"}{" "}
                — <Link href={`/portal/content/notices/${notice.id}`}>{notice.title}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <ActionForm
              action={releaseScheduledNoticesAction}
              csrfToken={makeCsrfToken(actor.sessionId)}
              submitLabel="Release notices that are due"
              variant="gold"
            />
          </div>
        </section>
      ) : null}

      {overview.publishedAlbums === 0 && (
        <div className="mt-10">
          <EmptyState
            title="The homepage slideshow has nothing to show yet"
            note="It fills itself as soon as one album is published, which needs photographs in it and a recorded consent answer for every identifiable pupil in each one. Until then the homepage keeps the campus photograph in its own framed band."
          />
        </div>
      )}
    </PanelShell>
  );
}
