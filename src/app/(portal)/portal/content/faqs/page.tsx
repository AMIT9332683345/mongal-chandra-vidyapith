import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listFaqsForAdmin } from "@/server/content/library";
import { changeFaqPublishedAction, deleteFaqAction, saveFaqAction } from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Questions",
  description: "The questions families actually ask, and the office's answers.",
  path: "/portal/content/faqs",
  noIndex: true,
});

type FaqRow = Awaited<ReturnType<typeof listFaqsForAdmin>>[number];

function FaqFields({ prefix, row }: { prefix: string; row?: FaqRow }) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field uid={prefix} name="question" label="Question" required defaultValue={row?.question} />
      </div>
      <div className="sm:col-span-2">
        <Field uid={prefix} name="answer" label="Answer" as="textarea" rows={4} required defaultValue={row?.answer} />
      </div>
      <Field uid={prefix} name="category" label="Category" defaultValue={row?.category} hint="Shown as a small label, e.g. admissions." />
      <Field uid={prefix} name="sortOrder" label="Order" type="number" min="0" max="9999" defaultValue={row?.sortOrder ?? 100} hint="Lower numbers appear first." />
    </div>
  );
}

export default async function FaqsPanelPage() {
  const actor = await requirePanel("faq.edit", "/portal/content/faqs");
  const rows = await listFaqsForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/faqs"
      eyebrow="Content panel"
      title="Questions"
      intro="Answers written once and shown everywhere they are asked — the homepage, the contact page, and the admissions page. A question stays hidden until someone publishes it."
    >
      <section>
        <h2 className="text-[1.15rem]">Add a question</h2>
        <ActionForm action={saveFaqAction} csrfToken={csrfToken} submitLabel="Save as hidden" resetOnSuccess className="mt-4">
          <FaqFields prefix="new-faq" />
        </ActionForm>
      </section>

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Every question</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No questions yet" note="The public pages then show a link to the office rather than an invented answer." />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--ink)" }}>{row.question}</p>
                    <p className="mt-1 max-w-2xl text-[0.88rem]" style={{ color: "var(--ink-muted)" }}>{row.answer}</p>
                    <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                      <span className="tag" style={row.published ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
                        {row.published ? "Published" : "Hidden"}
                      </span>
                      {row.category && <span className="tag">{row.category}</span>}
                      <span className="tag">order {row.sortOrder}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionForm
                      action={changeFaqPublishedAction}
                      csrfToken={csrfToken}
                      submitLabel={row.published ? "Hide" : "Publish"}
                      variant={row.published ? "secondary" : "gold"}
                      small
                      inline
                      hidden={{ id: row.id, intent: row.published ? "unpublish" : "publish" }}
                    />
                    <ActionForm
                      action={deleteFaqAction}
                      csrfToken={csrfToken}
                      submitLabel="Delete"
                      variant="danger"
                      small
                      inline
                      confirm={`Delete “${row.question}”?`}
                      hidden={{ id: row.id, confirm: "true" }}
                    />
                  </div>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                    Edit
                  </summary>
                  <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    <ActionForm action={saveFaqAction} csrfToken={csrfToken} submitLabel="Save changes" hidden={{ id: row.id }}>
                      <FaqFields prefix={`row-${row.id}`} row={row} />
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
