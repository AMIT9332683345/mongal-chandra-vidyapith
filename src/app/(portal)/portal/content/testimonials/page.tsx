import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listTestimonialsForAdmin } from "@/server/content/library";
import {
  changeTestimonialStatusAction,
  deleteTestimonialAction,
  saveTestimonialAction,
} from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Testimonials",
  description: "Quotes from families and alumni, published only with consent.",
  path: "/portal/content/testimonials",
  noIndex: true,
});

const ROLE_OPTIONS = [
  { value: "parent", label: "Parent or guardian" },
  { value: "alumnus", label: "Alumnus" },
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
  { value: "wellwisher", label: "Well-wisher" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Taken down",
  archived: "Archived",
};

function Fields({ prefix, row }: { prefix: string; row?: Awaited<ReturnType<typeof listTestimonialsForAdmin>>[number] }) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      <Field uid={prefix} name="authorName" label="Name" required defaultValue={row?.authorName} />
      <Field
        uid={prefix}
        name="authorRole"
        label="Who they are"
        as="select"
        options={ROLE_OPTIONS}
        defaultValue={row?.authorRole ?? "parent"}
      />
      <Field
        uid={prefix}
        name="authorDetail"
        label="Line under the name"
        hint="For example: “Parent of a Class V pupil”."
        defaultValue={row?.authorDetail}
      />
      <Field uid={prefix} name="sortOrder" label="Order" type="number" defaultValue={row?.sortOrder ?? 100} />
      <div className="sm:col-span-2">
        <Field uid={prefix} name="quote" label="The quote" as="textarea" rows={4} required defaultValue={row?.quote} />
      </div>
      <div className="sm:col-span-2">
        <Field
          uid={prefix}
          name="consentRecorded"
          label="The named person has consented to this quote being published."
          as="checkbox"
          defaultChecked={row?.consentRecorded ?? false}
          hint="A quote without consent stays hidden even if someone presses publish."
        />
      </div>
    </div>
  );
}

export default async function TestimonialsPanelPage() {
  const actor = await requirePanel("homepage.edit", "/portal/content/testimonials");
  const rows = await listTestimonialsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canPublish = principalHas(actor, "homepage.publish");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/testimonials"
      eyebrow="Content panel"
      title="Testimonials"
      intro="A testimonial carries a person's name, so it is published only when their consent is recorded here. Without it the quote stays a draft."
    >
      <section>
        <h2 className="text-[1.15rem]">Add a testimonial</h2>
        <ActionForm action={saveTestimonialAction} csrfToken={csrfToken} submitLabel="Save as draft" resetOnSuccess>
          <Fields prefix="new-testimonial" />
        </ActionForm>
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Every testimonial</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No testimonials yet"
              note="The homepage section is hidden until at least one consented testimonial is published."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold" style={{ color: "var(--ink)" }}>
                      {row.authorName}
                      <span className="ml-2 text-[0.82rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                        {row.authorDetail ?? row.authorRole}
                      </span>
                    </p>
                    <p className="mt-1 max-w-prose text-[0.94rem]" style={{ color: "var(--ink-secondary)" }}>
                      “{row.quote}”
                    </p>
                    <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                      <span
                        className="tag"
                        style={row.status === "published" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      <span
                        className="tag"
                        style={row.consentRecorded ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "var(--alert)", color: "var(--alert)" }}
                      >
                        {row.consentRecorded ? "Consent recorded" : "No consent"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canPublish && row.status !== "published" ? (
                      <ActionForm
                        action={changeTestimonialStatusAction}
                        csrfToken={csrfToken}
                        submitLabel="Publish"
                        variant="gold"
                        small
                        inline
                        hidden={{ id: row.id, intent: "publish" }}
                      />
                    ) : null}
                    {canPublish && row.status === "published" ? (
                      <ActionForm
                        action={changeTestimonialStatusAction}
                        csrfToken={csrfToken}
                        submitLabel="Take down"
                        variant="secondary"
                        small
                        inline
                        hidden={{ id: row.id, intent: "unpublish" }}
                      />
                    ) : null}
                    {canPublish ? (
                      <ActionForm
                        action={deleteTestimonialAction}
                        csrfToken={csrfToken}
                        submitLabel="Delete"
                        variant="danger"
                        small
                        inline
                        confirm={`Delete the testimonial from ${row.authorName}?`}
                        hidden={{ id: row.id, confirm: "true" }}
                      />
                    ) : null}
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                    Edit this testimonial
                  </summary>
                  <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    <ActionForm
                      action={saveTestimonialAction}
                      csrfToken={csrfToken}
                      submitLabel="Save changes"
                      hidden={{ id: row.id }}
                    >
                      <Fields prefix={`row-${row.id}`} row={row} />
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelShell>
  );
}
