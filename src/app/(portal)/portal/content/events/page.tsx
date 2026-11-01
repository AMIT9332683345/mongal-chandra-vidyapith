import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { EmptyState } from "@/components/section-heading";
import { PanelShell } from "@/components/panel-shell";
import { listEventsForAdmin } from "@/server/content/admin";
import { changeEventStatusAction, deleteEventAction } from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Events",
  description: "The school calendar, including entries nobody else can see.",
  path: "/portal/content/events",
  noIndex: true,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Taken down",
  archived: "Archived",
  cancelled: "Cancelled",
};

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default async function EventsPanelPage() {
  const actor = await requirePanel("event.view", "/portal/content/events");
  const events = await listEventsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canPublish = principalHas(actor, "event.publish");
  const canDelete = principalHas(actor, "event.delete");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/events"
      eyebrow="Content panel"
      title="Calendar"
      intro="Events are written first and published second, in the same two-permission shape as the notice board. A dated event that has finished is archived rather than deleted, so the past stays on the site."
    >
      <p className="mb-6">
        <Link href="/portal/content/events/new" className="button button-gold">
          Add an event
        </Link>
      </p>

      {events.length === 0 ? (
        <EmptyState
          title="No events recorded"
          note="The public calendar says so plainly instead of showing a season that the school has not held."
        />
      ) : (
        <div className="overflow-x-auto">
          <table>
            <caption className="sr-only">Every event, its state, and what may be done to it</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">State</th>
                <th scope="col">Category</th>
                <th scope="col">Starts</th>
                <th scope="col">Where</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <th scope="row" className="text-left font-semibold">
                    <Link href={`/portal/content/events/${event.id}`}>{event.title}</Link>
                    {event.featured && (
                      <span className="tag ml-2" style={{ borderColor: "var(--gold)", color: "var(--gold-ink)" }}>
                        featured
                      </span>
                    )}
                    <span className="block text-[0.82rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                      /events/{event.slug}
                    </span>
                  </th>
                  <td>
                    <span
                      className="tag"
                      style={
                        event.status === "published"
                          ? { borderColor: "var(--accent)", color: "var(--accent)" }
                          : undefined
                      }
                    >
                      {STATUS_LABEL[event.status] ?? event.status}
                    </span>
                  </td>
                  <td>{event.categoryName ?? "—"}</td>
                  <td>{when.format(event.startsAt)}</td>
                  <td>{event.venue ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {event.status !== "published" && canPublish ? (
                        <ActionForm
                          action={changeEventStatusAction}
                          csrfToken={csrfToken}
                          submitLabel="Publish"
                          variant="secondary"
                          small
                          inline
                          hidden={{ id: event.id, intent: "publish" }}
                        />
                      ) : null}
                      {event.status === "published" && canPublish ? (
                        <ActionForm
                          action={changeEventStatusAction}
                          csrfToken={csrfToken}
                          submitLabel="Take down"
                          variant="secondary"
                          small
                          inline
                          hidden={{ id: event.id, intent: "unpublish" }}
                        />
                      ) : null}
                      {event.status !== "archived" && event.status !== "published" && canPublish ? (
                        <ActionForm
                          action={changeEventStatusAction}
                          csrfToken={csrfToken}
                          submitLabel="Archive"
                          variant="secondary"
                          small
                          inline
                          hidden={{ id: event.id, intent: "archive" }}
                        />
                      ) : null}
                      {canDelete ? (
                        <ActionForm
                          action={deleteEventAction}
                          csrfToken={csrfToken}
                          submitLabel="Delete"
                          variant="danger"
                          small
                          inline
                          confirm={`Delete “${event.title}”? Any registrations for it go too, and this cannot be undone from the panel.`}
                          hidden={{ id: event.id, confirm: "true" }}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
