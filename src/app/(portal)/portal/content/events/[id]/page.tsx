import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/cms-form";
import { EventFields } from "@/components/event-fields";
import { PanelShell } from "@/components/panel-shell";
import { getEventForAdmin } from "@/server/content/admin";
import { listEventCategories } from "@/server/content/site";
import { changeEventStatusAction, deleteEventAction, saveEventAction } from "@/server/content/actions";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Edit an event",
  description: "One calendar entry and its publishing state.",
  path: "/portal/content/events",
  noIndex: true,
});

export default async function EventEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePanel("event.view", "/portal/content/events");
  const { id } = await params;
  const event = await getEventForAdmin(id);
  if (!event) notFound();

  const categories = await listEventCategories();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canEdit = principalHas(actor, "event.edit");
  const canPublish = principalHas(actor, "event.publish");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/events"
      eyebrow="Calendar"
      title={event.title}
      intro={`State: ${event.status}.`}
    >
      <p className="mb-8 text-[0.92rem]">
        <Link href={`/events/${event.slug}`} style={{ color: "var(--accent)" }}>
          /events/{event.slug}
        </Link>{" "}
        <span style={{ color: "var(--ink-muted)" }}>
          {event.publicVisible ? "— what the public calendar shows" : "— not visible on the public calendar"}
        </span>
      </p>

      <section>
        <h2 className="text-[1.15rem]">The entry</h2>
        {canEdit ? (
          <ActionForm
            action={saveEventAction}
            csrfToken={csrfToken}
            submitLabel="Save these changes"
            hidden={{ id: event.id }}
            className="mt-4 max-w-3xl"
          >
            <EventFields uid="event-editor" event={event} categories={categories} />
          </ActionForm>
        ) : (
          <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            This account may read the calendar but not change it; that needs “event.edit”.
          </p>
        )}
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Its state</h2>
        {canPublish ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {event.status !== "published" && (
              <ActionForm
                action={changeEventStatusAction}
                csrfToken={csrfToken}
                submitLabel="Publish to the calendar"
                variant="gold"
                small
                inline
                hidden={{ id: event.id, intent: "publish" }}
              />
            )}
            {event.status === "published" && (
              <ActionForm
                action={changeEventStatusAction}
                csrfToken={csrfToken}
                submitLabel="Take it down"
                variant="secondary"
                small
                inline
                hidden={{ id: event.id, intent: "unpublish" }}
              />
            )}
            {event.status !== "archived" && (
              <ActionForm
                action={changeEventStatusAction}
                csrfToken={csrfToken}
                submitLabel="Archive"
                variant="secondary"
                small
                inline
                note="Past events belong on the archive page, not in the bin."
                hidden={{ id: event.id, intent: "archive" }}
              />
            )}
          </div>
        ) : (
          <p className="mt-3 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            Changing an event&apos;s state needs “event.publish”.
          </p>
        )}
      </section>

      {principalHas(actor, "event.delete") && (
        <section className="rule mt-10 pt-8">
          <h2 className="text-[1.15rem]" style={{ color: "var(--alert)" }}>
            Delete
          </h2>
          <p className="mt-1 max-w-prose text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
            Deleting also removes every registration for the event. If the event happened, archive it instead — the
            school's own record of its year depends on that.
          </p>
          <div className="mt-4">
            <ActionForm
              action={deleteEventAction}
              csrfToken={csrfToken}
              submitLabel="Delete this event"
              variant="danger"
              small
              inline
              confirm={`Delete “${event.title}” and its registrations? This cannot be undone from the panel.`}
              hidden={{ id: event.id, confirm: "true" }}
            />
          </div>
        </section>
      )}
    </PanelShell>
  );
}
