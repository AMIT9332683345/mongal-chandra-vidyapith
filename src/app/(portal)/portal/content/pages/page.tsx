import Link from "next/link";
import { ActionForm } from "@/components/cms-form";
import { Field } from "@/components/field";
import { PanelShell } from "@/components/panel-shell";
import { EmptyState } from "@/components/section-heading";
import { pageMetadata } from "@/lib/metadata";
import { makeCsrfToken, principalHas } from "@/server/auth/session";
import { requirePanel } from "@/server/auth/gate";
import { listContentPagesForAdmin } from "@/server/content/library";
import {
  changeContentPageStatusAction,
  deleteContentPageAction,
  saveContentPageAction,
} from "@/server/content/library-actions";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Pages",
  description: "Long-form pages the school writes itself.",
  path: "/portal/content/pages",
  noIndex: true,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Taken down",
  archived: "Archived",
};

type PageRow = Awaited<ReturnType<typeof listContentPagesForAdmin>>[number];

function PageFields({ prefix, row }: { prefix: string; row?: PageRow }) {
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      <Field uid={prefix} name="title" label="Title" required defaultValue={row?.title} />
      <Field
        uid={prefix}
        name="slug"
        label="Web address"
        defaultValue={row?.slug}
        hint="Leave blank to build it from the title. Changing it breaks any link already given out."
      />
      <div className="sm:col-span-2">
        <Field uid={prefix} name="intro" label="Introduction" as="textarea" rows={2} defaultValue={row?.intro} hint="The short paragraph under the title." />
      </div>
      <div className="sm:col-span-2">
        <Field
          uid={prefix}
          name="body"
          label="The page"
          as="textarea"
          rows={12}
          defaultValue={row?.body}
          hint="Plain text. A blank line starts a new paragraph; markup is shown as typed, never interpreted."
        />
      </div>
      <Field uid={prefix} name="seoTitle" label="Search title" defaultValue={row?.seoTitle} hint="Defaults to the page title." />
      <Field uid={prefix} name="seoDescription" label="Search description" defaultValue={row?.seoDescription} />
      <div className="sm:col-span-2">
        <Field
          uid={prefix}
          name="noIndex"
          label="Ask search engines not to list this page."
          as="checkbox"
          defaultChecked={row?.noIndex ?? false}
        />
      </div>
    </div>
  );
}

export default async function ContentPagesPanelPage() {
  const actor = await requirePanel("page.view", "/portal/content/pages");
  const rows = await listContentPagesForAdmin();
  const csrfToken = makeCsrfToken(actor.sessionId);
  const canCreate = principalHas(actor, "page.create");
  const canEdit = principalHas(actor, "page.edit");
  const canPublish = principalHas(actor, "page.publish");

  return (
    <PanelShell
      actor={actor}
      active="/portal/content/pages"
      eyebrow="Content panel"
      title="Pages"
      intro="Anything too long for a notice — the school's history, a uniform policy, a scholarship scheme. A page is drafted here, previewed at its own address, and published only when someone with that right says so."
    >
      {canCreate ? (
        <section>
          <h2 className="text-[1.15rem]">Write a page</h2>
          <ActionForm
            action={saveContentPageAction}
            csrfToken={csrfToken}
            submitLabel="Save as draft"
            resetOnSuccess
            editLinkPrefix="/portal/content/pages/"
            className="mt-4"
          >
            <PageFields prefix="new-page" />
          </ActionForm>
        </section>
      ) : (
        <p className="pending">
          This account may read pages but not write them, so only the list is shown. Ask an administrator if that is
          not what was intended.
        </p>
      )}

      <section className="rule mt-10 pt-8">
        <h2 className="text-[1.15rem]">Every page</h2>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No pages yet" note="Nothing is invented to fill the space; the school's own wording is the only thing that appears here." />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--ink)" }}>{row.title}</p>
                    <p className="mt-1 text-[0.82rem] font-normal" style={{ color: "var(--ink-muted)" }}>
                      /pages/{row.slug}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-2 text-[0.78rem]">
                      <span
                        className="tag"
                        style={row.status === "published" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      {row.noIndex && <span className="tag">not indexed</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.status === "published" ? (
                      <Link href={`/pages/${row.slug}`} className="button button-secondary button-small">
                        View
                      </Link>
                    ) : null}
                    {canPublish ? (
                      <ActionForm
                        action={changeContentPageStatusAction}
                        csrfToken={csrfToken}
                        submitLabel={row.status === "published" ? "Take down" : "Publish"}
                        variant={row.status === "published" ? "secondary" : "gold"}
                        small
                        inline
                        hidden={{ id: row.id, intent: row.status === "published" ? "unpublish" : "publish" }}
                      />
                    ) : null}
                    {canPublish && row.status !== "archived" ? (
                      <ActionForm
                        action={deleteContentPageAction}
                        csrfToken={csrfToken}
                        submitLabel="Archive"
                        variant="danger"
                        small
                        inline
                        confirm={`Archive “${row.title}”? It disappears from the website but the wording is kept in the record.`}
                        hidden={{ id: row.id, confirm: "true" }}
                      />
                    ) : null}
                  </div>
                </div>
                {canEdit ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-[0.88rem] font-semibold" style={{ color: "var(--accent)" }}>
                      Edit
                    </summary>
                    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                      <ActionForm action={saveContentPageAction} csrfToken={csrfToken} submitLabel="Save changes" hidden={{ id: row.id }}>
                        <PageFields prefix={`row-${row.id}`} row={row} />
                      </ActionForm>
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PanelShell>
  );
}
