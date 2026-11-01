import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { EventFields } from "@/components/event-fields";
import { PanelShell } from "@/components/panel-shell";
import { listEventCategories } from "@/server/content/site";
import { saveEventAction } from "@/server/content/actions";
import { makeCsrfToken } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Add an event",
  description: "Write an entry for the school calendar.",
  path: "/portal/content/events/new",
  noIndex: true,
});

export default async function NewEventPage() {
  const actor = await requirePanel("event.create", "/portal/content/events/new");
  const categories = await listEventCategories();

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/events"
      eyebrow="Calendar"
      title="Add an event"
      intro="A new event is saved as a draft and stays off the public calendar until it is published from its own page."
    >
      <ActionForm
        action={saveEventAction}
        csrfToken={makeCsrfToken(actor.sessionId)}
        submitLabel="Save the draft"
        editLinkPrefix="/portal/content/events/"
        className="max-w-3xl"
      >
        <EventFields uid="new-event" categories={categories} />
      </ActionForm>

      <p className="mt-8 text-[0.92rem]" style={{ color: "var(--ink-muted)" }}>
        <Link href="/portal/content/events" style={{ color: "var(--accent)" }}>
          Back to the calendar
        </Link>
      </p>
    </PanelShell>
  );
}
